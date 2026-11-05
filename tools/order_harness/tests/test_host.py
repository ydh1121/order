"""Adapter regressions; local clones preserve the real repository base without new commits."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
import zipfile

TOOLS = Path(__file__).resolve().parents[1]
REPO = TOOLS.parents[1]
KIT = TOOLS / "order_harness.py"
HOST = TOOLS / "host.py"


class HostTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / "repo"
        subprocess.run(["git", "clone", "--quiet", "--shared", str(REPO), str(self.repo)], check=True,
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.state = self.root / "state"
        self.call(KIT, "init", "--project", "order.ooo", "--track", "TEST",
                  "--repo", str(self.repo), "--allow-scope", "harness_integration",
                  "--hold", "design_fitting", "--next", "Review next independent unit")

    def call(self, script, *args, state=None, expected=0):
        result = subprocess.run([sys.executable, str(script), "--state-dir", str(state or self.state), *args],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return json.loads(result.stdout)

    def run_args(self, action="ONE"):
        return ("run", "--action-id", action, "--scope", "harness_integration", "--", "git", "rev-parse", "HEAD")

    def test_automatic_receipts_and_cached_no_replay(self):
        result = self.call(HOST, *self.run_args())
        self.assertFalse(result["cached_result"])
        self.assertEqual(result["source_before_head"], result["source_after_head"])
        cached = self.call(HOST, *self.run_args())
        self.assertTrue(cached["cached_result"])
        resumed = self.call(KIT, "resume")
        self.assertTrue(resumed["ready_to_continue_without_reconciliation"])
        self.assertTrue(all(x["status"] == "MATCH" for x in resumed["evidence"]))

    def test_source_evidence_and_receipt_tampering_never_replay(self):
        self.call(HOST, *self.run_args())
        (self.repo / "change.md").write_text("source changed")
        stale = self.call(HOST, *self.run_args(), expected=2)
        self.assertEqual(stale["code"], "STALE_ACTION_RESULT")
        (self.repo / "change.md").unlink()
        log = self.state / "logs/ONE.stdout.log"
        old = log.read_bytes()
        log.write_text("changed evidence")
        stale = self.call(HOST, *self.run_args(), expected=2)
        self.assertEqual(stale["code"], "STALE_ACTION_RESULT")
        log.write_bytes(old)
        receipt = self.state / "actions/ONE.json"
        row = json.loads(receipt.read_bytes())
        row["exit_code"] = 99
        receipt.write_text(json.dumps(row))
        stale = self.call(HOST, *self.run_args(), expected=2)
        self.assertIn("receipt hash changed", stale["details"])

    def test_export_is_explicit_and_restored_known_ids_do_not_replay(self):
        self.call(HOST, *self.run_args())
        allowlist = self.root / "allowlist.json"
        allowlist.write_text('["README.md"]')
        output = self.root / "checkpoint.zip"
        result = self.call(HOST, "prepare-durable", "--allowlist", str(allowlist), "--output", str(output))
        self.assertEqual(result["status"], "DURABLE_UPLOAD_PENDING")
        with zipfile.ZipFile(output) as archive:
            names = archive.namelist()
            self.assertIn("state/actions/ONE.json", names)
            self.assertIn("evidence/repo/README.md", names)
            self.assertFalse(any(".log" in n or "search.sqlite" in n for n in names))
            self.assertNotIn("argv_redacted", archive.read("state/actions/ONE.json").decode())
        restored = self.root / "restored"
        self.call(KIT, "restore", "--archive", str(output), "--repo", str(self.repo), state=restored)
        result = self.call(HOST, *self.run_args(), state=restored, expected=2)
        self.assertEqual(result["code"], "STALE_ACTION_RESULT")
        # The preserved upstream CLI also sees the known terminal tombstone; it cannot rerun the ID.
        result = self.call(KIT, *self.run_args(), state=restored)
        self.assertTrue(result["cached_result"])

    def test_secret_and_runtime_exports_rejected(self):
        allowlist = self.root / "allowlist.json"
        output = self.root / "checkpoint.zip"
        private_key_header = "-----BEGIN " + "PRIVATE KEY-----"
        for relative, content, code in [("secret.md", private_key_header, "EXPORT_SECRET_REJECTED"),
                                         ("logs/runtime.md", "runtime", "EXPORT_SOURCE_REJECTED")]:
            path = self.repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
            allowlist.write_text(json.dumps([relative]))
            result = self.call(HOST, "prepare-durable", "--allowlist", str(allowlist), "--output", str(output), expected=2)
            self.assertEqual(result["code"], code)
            self.assertFalse(output.exists())

    def test_readback_requires_matching_hash_and_folder(self):
        allowlist = self.root / "allowlist.json"
        allowlist.write_text('["README.md"]')
        output = self.root / "checkpoint.zip"
        result = self.call(HOST, "prepare-durable", "--allowlist", str(allowlist), "--output", str(output))
        metadata = self.root / "metadata.json"
        metadata.write_text(json.dumps({"id": "fixture-only", "parents": ["12c3k0H1C-PUaLqcMakRBlxComO8zvEB2"]}))
        args = ("verify-durable", "--envelope", result["envelope"], "--downloaded", str(output),
                "--remote-metadata", str(metadata), "--receipt", str(self.root / "receipt.json"))
        self.assertEqual(self.call(HOST, *args)["status"], "DURABLE_READBACK_VERIFIED")
        metadata.write_text('{"id":"fixture-only", "parents":["wrong"]}')
        self.assertEqual(self.call(HOST, *args, expected=2)["code"], "DURABLE_TARGET_MISMATCH")

    def test_terminal_persistence_guard_rejects_receipt_or_log_regression(self):
        command = self.call(HOST, *self.run_args())
        allowlist = self.root / "allowlist.json"
        allowlist.write_text('["README.md"]')
        args = ("prepare-durable", "--allowlist", str(allowlist), "--output", str(self.root / "checkpoint.zip"),
                "--require-action", "ONE", "--receipt-sha256", command["receipt_sha256"])
        self.assertEqual(self.call(HOST, *args)["status"], "DURABLE_UPLOAD_PENDING")
        log = self.state / "logs/ONE.stdout.log"
        original = log.read_bytes()
        log.write_bytes(original[:3])
        self.assertEqual(self.call(HOST, *args, expected=2)["code"], "TERMINAL_RECEIPT_PERSISTENCE_CONFLICT")
        log.write_bytes(original)
        receipt = self.state / "actions/ONE.json"
        row = json.loads(receipt.read_bytes()); row["status"] = "RUNNING"
        receipt.write_text(json.dumps(row))
        self.assertEqual(self.call(HOST, *args, expected=2)["code"], "TERMINAL_RECEIPT_PERSISTENCE_CONFLICT")

    @unittest.skipUnless(hasattr(os, "pidfd_open"), "Linux pidfd host identity integration")
    def test_child_identity_is_recorded_when_proc_children_is_hidden(self):
        self.call(HOST, "run", "--action-id", "IDENTITY", "--scope", "harness_integration", "--",
                  sys.executable, "-c", "import time; time.sleep(0.1)")
        receipt = json.loads((self.state / "actions/IDENTITY.json").read_bytes())
        self.assertIsNotNone(receipt["child"]["proc_pid"])
        self.assertIsNotNone(receipt["child"]["start_token"])
        self.assertIsNotNone(receipt["child"]["pid_namespace"])


if __name__ == "__main__":
    unittest.main()
