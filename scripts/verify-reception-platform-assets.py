#!/usr/bin/env python3
"""Prove the shared Reception UI will be in the Pages staging and signed Android APK.

No uploads, authentication, production writes, or release approvals. A check does
not mean the PC Pages site is already deployed or the APK is published.
"""
import argparse
import hashlib
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets"
PAGES_WORKFLOW = ROOT / ".github/workflows/pages.yml"
FILES = [
    "offline_test.html",
    "receptionist.html",
    "receptionist_session.js",
    "v2/features/insurance/reception.js",
    "reception_dashboard.js",
]


class HtmlScripts(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() != "script":
            return
        url = dict(attrs).get("src")
        if not url:
            return
        parts = urlsplit(url)
        if parts.scheme or parts.netloc or parts.path.startswith("/"):
            raise AssertionError(f"Unexpected external script dependency: {url}")
        path = Path(parts.path)
        if ".." in path.parts or not parts.path:
            raise AssertionError(f"Unsafe script path: {url}")
        self.paths.append(path.as_posix())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, help="Prepared Pages staging directory (optional)")
    parser.add_argument("--apk", type=Path, help="Signed Android APK file (optional)")
    args = parser.parse_args()
    workflow = PAGES_WORKFLOW.read_text(encoding="utf8")
    assert "workflow_dispatch:" in workflow and "scripts/verify-v305-acceptance.cjs" in workflow
    assert "scripts/verify-pc-pages-publication.cjs" in workflow
    # This must use the real deployed Pages workflow's existing script discovery
    # and explicitly include the standalone Receptionist page/session.
    for line in [
        "cp app/src/main/assets/offline_test.html _site/index.html",
        "cp app/src/main/assets/receptionist.html _site/receptionist.html",
        "cp app/src/main/assets/receptionist_session.js _site/receptionist_session.js",
        "copy2(origin, destination)",
        "python3 scripts/verify-reception-platform-assets.py --site _site",
    ]:
        assert line in workflow, f"Pages workflow omits {line}"

    scripts = {}
    for html in ["offline_test.html", "receptionist.html"]:
        parsed = HtmlScripts()
        parsed.feed((ASSETS / html).read_text(encoding="utf8"))
        scripts[html] = parsed.paths
        assert parsed.paths, f"No JS dependencies in {html}"
        for file in parsed.paths:
            assert (ASSETS / file).is_file(), f"Missing {html} dependency: {file}"
    for file in ["v2/features/insurance/reception.js", "reception_dashboard.js"]:
        assert file in scripts["offline_test.html"], f"Main workshop not loading {file}"
        assert file in scripts["receptionist.html"], f"Receptionist page not loading {file}"
    assert "receptionist_session.js" in scripts["receptionist.html"]
    # Ensure each release refers to a new URL so browsers cannot keep an
    # older cached Reception script after a valid gated Pages publication.
    cache_tags = {
        "v2/features/insurance/reception.js": "v=20261010-a4-print-v308",
        "reception_dashboard.js": "v=305-reception-dashboard-20261010-r2",
        "receptionist_session.js": "v=305-reception-dashboard-20261010-r2",
    }
    for page, targets in {
        "offline_test.html": ["v2/features/insurance/reception.js", "reception_dashboard.js"],
        "receptionist.html": ["receptionist_session.js", "v2/features/insurance/reception.js", "reception_dashboard.js"],
    }.items():
        markup = (ASSETS / page).read_text(encoding="utf8")
        for source in targets:
            assert 'src="' + source + "?" + cache_tags[source] + '"' in markup, (
                "Missing current Reception cache version in " + page + ": " + source
            )


    # Parity focuses on the exact shared UI inputs, never APK metadata/staff data.
    mappings = {
        "offline_test.html": "index.html",
        "receptionist.html": "receptionist.html",
        "receptionist_session.js": "receptionist_session.js",
        "v2/features/insurance/reception.js": "v2/features/insurance/reception.js",
        "reception_dashboard.js": "reception_dashboard.js",
    }
    if args.site:
        for source, deployed in mappings.items():
            actual = (args.site / deployed).read_bytes()
            assert actual == (ASSETS / source).read_bytes(), (
                f"Prepared Pages differs from source: {deployed}"
            )
        for scripts_list in scripts.values():
            for file in scripts_list:
                assert (args.site / file).read_bytes() == (ASSETS / file).read_bytes(), (
                    f"Pages is missing/outdated referenced UI asset: {file}"
                )
    if args.apk:
        with ZipFile(args.apk) as apk:
            members = set(apk.namelist())
            for source in mappings:
                member = "assets/" + source
                assert member in members, f"Android APK missing {member}"
                assert apk.read(member) == (ASSETS / source).read_bytes(), (
                    f"Android APK has outdated Reception file: {member}"
                )

    for source in mappings:
        print(f"PARITY {source}: SHA256 {sha((ASSETS / source).read_bytes())}")
    print("PASS: Receptionist entry page + shared Reception UI source manifest"
          + (" + Pages staged bytes" if args.site else "")
          + (" + signed APK embedded bytes" if args.apk else "")
          + "; publishing remains separately gated.")


if __name__ == "__main__":
    main()
