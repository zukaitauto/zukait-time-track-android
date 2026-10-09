#!/usr/bin/env python3
"""Create a separate, production-disconnected acceptance source tree; never deploy."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

PRODUCTION_REF = "pjknotnjkufadqavcmii"
PRODUCTION_KEY = "sb_publishable_-sg597IpB0MLIHdDoedRIA_MTt0Sa9A"
MIGRATIONS = [
    "20261009074037_reception_preliminary_parts.sql",
    "20261009075901_reception_estimate_approval.sql",
    "20261009084321_reception_job_creation_guards.sql",
    "20261009090923_reception_create_job.sql",
    "20261009094309_reception_vehicle_authority.sql",
    "20261009104912_reception_additional_approvals.sql",
    "20261009111840_reception_job_cancellation.sql",
    "20261009153713_reception_trigger_privileges.sql",
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(source, output, project_ref, publishable_key, source_sha):
    source, output = Path(source).resolve(), Path(output).resolve()
    if not re.fullmatch(r"[a-z]{20}", project_ref) or project_ref == PRODUCTION_REF:
        raise ValueError("A non-production Supabase project reference is required")
    if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", publishable_key) or publishable_key == PRODUCTION_KEY:
        raise ValueError("Use the isolated project's modern publishable key, never a server secret")
    if not re.fullmatch(r"[0-9a-f]{40}", source_sha):
        raise ValueError("A full source commit SHA is required")
    if output == source or source in output.parents or output in source.parents or output.exists():
        raise ValueError("Output must be a new directory outside the source tree")
    required = ["app/build.gradle", "app/src/main/AndroidManifest.xml",
                "app/src/main/assets/offline_test.html",
                "app/src/main/assets/cloud_sync.js", "app/src/main/assets/secure_auth.js",
                "app/src/main/assets/v2/features/insurance/reception.js",
                "app/src/main/java/com/zukait/timetrack/MainActivity.java",
                *["supabase/migrations/" + name for name in MIGRATIONS]]
    for name in required:
        if not (source / name).is_file():
            raise ValueError("Incomplete source tree: " + name)
    # Copy only build inputs. No git metadata, local secrets, fixtures or session files.
    output.mkdir(parents=True)
    try:
        shutil.copytree(source / "app", output / "app",
                        ignore=shutil.ignore_patterns("build", ".gradle"))
        for name in ("build.gradle", "settings.gradle", "gradle.properties"):
            shutil.copy2(source / name, output / name)
        changed = []
        for path in sorted((output / "app/src/main/assets").rglob("*")):
            if not path.is_file() or path.suffix not in (".js", ".html", ".css", ".json"):
                continue
            text = path.read_text()
            replaced = text.replace(PRODUCTION_REF, project_ref).replace(PRODUCTION_KEY, publishable_key)
            # Reject an unexpected second backend or embedded server credential.
            refs = set(re.findall(r"([a-z0-9-]+)\.supabase\.co", replaced))
            if refs - {project_ref} or "sb_secret_" in replaced:
                raise ValueError("Unexpected backend/secret in " + str(path.relative_to(output)))
            path.write_text(replaced)
            if text != replaced:
                changed.append(str(path.relative_to(output)))
        for name in ("cloud_sync.js", "secure_auth.js", "v2/features/insurance/reception.js"):
            if project_ref + ".supabase.co" not in (output / "app/src/main/assets" / name).read_text():
                raise ValueError("Expected backend replacement missing: " + name)
        gradle = output / "app/build.gradle"
        text = gradle.read_text()
        if text.count("applicationId 'com.zukait.timetrack'") != 1:
            raise ValueError("Unexpected Android application ID")
        text = text.replace("applicationId 'com.zukait.timetrack'", "applicationId 'com.zukait.timetrack.acceptance'")
        text, count = re.subn(r'versionName\s+"([^"]+)"', r'versionName "\1-ACCEPTANCE"', text)
        if count != 1:
            raise ValueError("Unexpected Android version metadata")
        gradle.write_text(text)
        manifest = output / "app/src/main/AndroidManifest.xml"
        text = manifest.read_text()
        if text.count('android:label="Zukait Time Track"') != 1:
            raise ValueError("Unexpected Android application label")
        manifest.write_text(text.replace('android:label="Zukait Time Track"', 'android:label="Zukait ACCEPTANCE"'))
        native = output / "app/src/main/java/com/zukait/timetrack/MainActivity.java"
        text = native.read_text()
        for method in ("checkForUpdatesNative", "startUpdateDownloadNative", "installDownloadedUpdateNative"):
            signature = "private void " + method + "() {"
            if text.count(signature) != 1:
                raise ValueError("Unexpected updater implementation: " + method)
            text = text.replace(signature, signature + '\n        if (getPackageName().endsWith(".acceptance")) return;')
        native.write_text(text)
        # A public browser artifact contains assets only, no backend source or fixtures.
        shutil.copytree(output / "app/src/main/assets", output / "web")
        manifest_data = {
            "acceptance_only": True, "backend_acceptance": "NOT_RUN",
            "physical_device_acceptance": "NOT_RUN", "source_sha": source_sha,
            "project_ref": project_ref, "application_id": "com.zukait.timetrack.acceptance",
            "updater_disabled": True, "rewritten_assets": changed,
            "ordered_pending_migrations": [{"file": n, "sha256": digest(source / "supabase/migrations" / n)} for n in MIGRATIONS],
            "api_files": {str(p.relative_to(source)): digest(p) for p in sorted((source / "supabase/functions/workshop-api").rglob("*")) if p.is_file()},
            "client_files": {str(p.relative_to(output)): digest(p) for p in sorted((output / "app").rglob("*")) if p.is_file()},
        }
        (output / "acceptance-manifest.json").write_text(json.dumps(manifest_data, indent=2) + "\n")
        return manifest_data
    except Exception:
        shutil.rmtree(output)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path.cwd())
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = args.source.resolve()
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
    branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=source, text=True).strip()
    if branch != "architecture-v2" and not (not branch and os.environ.get("GITHUB_REF") == "refs/heads/architecture-v2" and os.environ.get("GITHUB_SHA") == sha):
        parser.error("Run only from architecture-v2 or its exact GitHub Actions commit")
    if subprocess.check_output(["git", "status", "--porcelain"], cwd=source, text=True).strip():
        parser.error("Source checkout must be clean")
    try:
        result = prepare(source, args.output, os.environ.get("ZUKAIT_ACCEPTANCE_PROJECT_REF", ""),
                         os.environ.get("ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY", ""), sha)
    except ValueError as error:
        parser.error(str(error))
    print("Prepared acceptance source for " + result["source_sha"] + "; no build, deployment or device acceptance claimed")


if __name__ == "__main__":
    main()
