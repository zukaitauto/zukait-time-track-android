"""Offline isolation checks. These do not count as backend or device acceptance."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import sys
import os
import subprocess

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location("prepare", Path(__file__).resolve().parents[1] / "scripts/prepare-insurance-acceptance.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class AcceptancePreparation(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        self.output = self.root / "candidate"
        self.ref = "abcdefghijklmnopqrst"
        self.key = "sb_publishable_isolated_qa"
        self.sha = "a" * 40
        files = {
            "app/build.gradle": "applicationId 'com.zukait.timetrack'\nversionCode 267\nversionName \"V304\"\n",
            "app/src/main/AndroidManifest.xml": 'android:label="Zukait Time Track"',
            "app/src/main/java/com/zukait/timetrack/MainActivity.java": "\n".join("private void " + method + "() {\n doUpdate();\n}" for method in ("checkForUpdatesNative", "startUpdateDownloadNative", "installDownloadedUpdateNative")),
            "app/src/main/assets/offline_test.html": "<html>acceptance fixture</html>",
            "build.gradle": "build", "settings.gradle": "settings", "gradle.properties": "properties",
            "supabase/functions/workshop-api/index.ts": "// source digest fixture",
        }
        for name in ("cloud_sync.js", "secure_auth.js", "v2/features/insurance/reception.js", "nested/other.json"):
            files["app/src/main/assets/" + name] = "https://" + module.PRODUCTION_REF + ".supabase.co " + module.PRODUCTION_KEY
        for name in module.MIGRATIONS:
            files["supabase/migrations/" + name] = "-- " + name
        for name, text in files.items():
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
        (self.source / "app/src/main/assets/icon.png").write_bytes(bytes([0, 255, 42]))
        (self.source / "qa-sessions.json").write_text("must not copy")
        (self.source / ".env").write_text("must not copy")

    def run_prepare(self, **kwargs):
        return module.prepare(self.source, kwargs.get("output", self.output), kwargs.get("ref", self.ref), kwargs.get("key", self.key), self.sha)

    def test_isolated_artifacts_and_immutable_source(self):
        before = {str(p.relative_to(self.source)): p.read_bytes() for p in self.source.rglob("*") if p.is_file()}
        result = self.run_prepare()
        self.assertEqual(before, {str(p.relative_to(self.source)): p.read_bytes() for p in self.source.rglob("*") if p.is_file()})
        self.assertIn("com.zukait.timetrack.acceptance", (self.output / "app/build.gradle").read_text())
        self.assertIn('V304-ACCEPTANCE', (self.output / "app/build.gradle").read_text())
        self.assertIn('versionCode 267', (self.output / "app/build.gradle").read_text())
        for tree in ("app/src/main/assets", "web"):
            for path in (self.output / tree).rglob("*"):
                if path.is_file():
                    self.assertNotIn(module.PRODUCTION_REF.encode(), path.read_bytes())
                    self.assertNotIn(module.PRODUCTION_KEY.encode(), path.read_bytes())
        native = (self.output / "app/src/main/java/com/zukait/timetrack/MainActivity.java").read_text()
        self.assertEqual(native.count('if (getPackageName().endsWith(".acceptance")) return;'), 3)
        self.assertEqual((self.output / "web/icon.png").read_bytes(), bytes([0, 255, 42]))
        self.assertFalse((self.output / "qa-sessions.json").exists())
        self.assertFalse((self.output / ".env").exists())
        self.assertFalse((self.output / "web/index.ts").exists())
        self.assertEqual([m["file"] for m in result["ordered_pending_migrations"]], module.MIGRATIONS)
        self.assertEqual(result["backend_acceptance"], "NOT_RUN")
        self.assertEqual(result["physical_device_acceptance"], "NOT_RUN")
        self.assertEqual(json.loads((self.output / "acceptance-manifest.json").read_text()), result)

    def test_reject_production_and_server_keys(self):
        for ref, key in ((module.PRODUCTION_REF, self.key), (self.ref, module.PRODUCTION_KEY),
                         (self.ref, "sb_secret_qa"), (self.ref, "eyJlegacyJWT"), ("", self.key)):
            with self.subTest(ref=ref, key_type=key.split("_")[0]):
                with self.assertRaises(ValueError):
                    self.run_prepare(ref=ref, key=key)
                self.assertFalse(self.output.exists())

    def test_reject_missing_migration(self):
        (self.source / "supabase/migrations" / module.MIGRATIONS[7]).unlink()
        with self.assertRaisesRegex(ValueError, "Incomplete source tree"):
            self.run_prepare()
        self.assertFalse(self.output.exists())

    def test_reject_unknown_backend_and_cleanup(self):
        (self.source / "app/src/main/assets/unknown.js").write_text("https://anotherproject.supabase.co")
        with self.assertRaisesRegex(ValueError, "Unexpected backend"):
            self.run_prepare()
        self.assertFalse(self.output.exists())

    def test_reject_changed_updater_and_cleanup(self):
        (self.source / "app/src/main/java/com/zukait/timetrack/MainActivity.java").write_text("changed native source")
        with self.assertRaisesRegex(ValueError, "Unexpected updater"):
            self.run_prepare()
        self.assertFalse(self.output.exists())

    def test_reject_unsafe_output_without_removing_it(self):
        for output in (self.source, self.source / "candidate", self.root):
            with self.subTest(output=output):
                with self.assertRaises(ValueError):
                    self.run_prepare(output=output)
        self.assertTrue(self.source.exists())
        self.output.mkdir()
        (self.output / "keep").write_text("preserve")
        with self.assertRaises(ValueError):
            self.run_prepare()
        self.assertEqual((self.output / "keep").read_text(), "preserve")

    def test_cli_branch_cleanliness_and_source_sha(self):
        def git(*args):
            return subprocess.check_output(['git', *args], cwd=self.source, text=True, stderr=subprocess.DEVNULL).strip()
        git('init', '-b', 'architecture-v2')
        git('add', '.')
        git('-c', 'user.name=Acceptance QA', '-c', 'user.email=qa@example.invalid', 'commit', '-m', 'synthetic source fixture')
        env = {**os.environ, 'ZUKAIT_ACCEPTANCE_PROJECT_REF': self.ref,
               'ZUKAIT_ACCEPTANCE_PUBLISHABLE_KEY': self.key}
        command = [sys.executable, str(Path(module.__file__).resolve()), '--source', str(self.source), '--output', str(self.output)]
        git('checkout', '-b', 'qa-forbidden-branch')
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('architecture-v2', result.stderr)
        self.assertFalse(self.output.exists())
        git('checkout', 'architecture-v2')
        dirty = self.source / 'untracked.txt'
        dirty.write_text('pending change')
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('must be clean', result.stderr)
        dirty.unlink()
        result = subprocess.run(command, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        manifest = json.loads((self.output / 'acceptance-manifest.json').read_text())
        self.assertEqual(manifest['source_sha'], git('rev-parse', 'HEAD'))


if __name__ == "__main__":
    unittest.main(verbosity=2)
