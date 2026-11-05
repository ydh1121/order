"""Acceptance tests use isolated local fixtures, never the product repository."""
import hashlib
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

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "order_harness.py"
sys.path.insert(0, str(ROOT))
import order_harness as harness


class HarnessAcceptance(unittest.TestCase):
    def setUp(self):
        (ROOT / "test-output").mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="acceptance-", dir=ROOT / "test-output")
        self.base = Path(self.temporary.name)
        self.repo = self.base / "repo"
        self.repo.mkdir()
        self.git("init", "-q")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "user.name", "Harness Fixture")
        (self.repo / "README.md").write_text("Local fixture\n")
        self.git("add", "README.md")
        self.git("commit", "-qm", "fixture baseline")
        self.state = self.base / "state"
        self.routes = self.base / "routes.json"
        self.routes.write_text(json.dumps({
            "schema_version": "order.skill-routing/v1",
            "policy": {"design_fitting": "DEFERRED", "upstream_execution_default": False},
            "tasks": [
                {"task_id": "component_ui", "mode": "GUIDANCE_ONLY",
                 "primary": ["example/layout"], "supporting": ["example/detail"],
                 "conditions": ["Preserve approved UI and project owners."]},
                {"task_id": "design_fitting", "mode": "DEFERRED", "primary": [], "supporting": []},
            ],
            "repository_bindings": {
                "example/layout": {
                    "repository": "example/layout", "pinned_commit": "a" * 40,
                    "entrypoints": ["skills/layout/SKILL.md"], "readme_paths": ["README.md"],
                    "review_status": "SOURCE_TRIAGED", "activation_status": "ACTIVATABLE_FOR_TASK",
                    "activation_conditions": ["Read the pinned guideline before editing."],
                    "source_coverage": "FULL_DECLARED_SCOPE", "license_status": "REFERENCE_FIXTURE",
                    "archive": {"drive_id": "fixture-not-an-upload"},
                },
                "example/detail": {
                    "repository": "example/detail", "pinned_commit": "b" * 40,
                    "entrypoints": ["SKILL.md"], "activation_status": "REFERENCE_ONLY",
                    "review_status": "SOURCE_TRIAGED", "readme_paths": ["README.md"],
                },
            },
        }))
        self.call("init", "--project", "order.ooo", "--track", "FIXTURE",
                  "--repo", str(self.repo), "--next", "Inspect the selected scope",
                  "--allow-scope", "harness_source_ops", "--allow-scope", "harness_integration",
                  "--allow-scope", "c55_product_rework", "--allow-scope", "structure_refactor",
                  "--hold", "design_fitting", "--routes", str(self.routes),
                  "--approvals-note", "Fixture only; project policy is not approved by this test.")

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], check=True,
                              capture_output=True, text=True).stdout.strip()

    def call(self, *args, state=None, expected=0):
        completed = subprocess.run(
            [sys.executable, str(CLI), "--state-dir", str(state or self.state), *args],
            capture_output=True, text=True, timeout=20)
        self.assertEqual(completed.returncode, expected, completed.stdout + completed.stderr)
        value = json.loads(completed.stdout)
        return value, completed

    def wait_until(self, condition, timeout=5):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            if condition():
                return
            time.sleep(0.03)
        self.fail("Timed out waiting for local fixture condition")

    def test_scoped_hold_and_minimum_source_selection(self):
        selected, _ = self.call("route", "--task", "component_ui", "--record")
        self.assertEqual(len(selected["sources"]), 2)
        self.assertEqual(selected["sources"][0]["pinned_commit"], "a" * 40)
        self.assertEqual(selected["sources"][0]["entrypoints"], ["skills/layout/SKILL.md"])
        self.assertFalse(selected["selection_is_execution"])
        deferred, _ = self.call("route", "--task", "design_fitting")
        self.assertEqual(deferred["selection_status"], "DEFERRED")
        self.assertEqual(deferred["sources"], [])
        blocked, _ = self.call("run", "--action-id", "fit-blocked", "--scope", "design_fitting",
                               "--", sys.executable, "-c", "raise RuntimeError('must not run')", expected=2)
        self.assertEqual(blocked["error"], "SCOPE_BLOCKED")
        self.assertFalse((self.state / "actions" / "fit-blocked.json").exists())
        resumed, _ = self.call("resume")
        self.assertEqual(resumed["selected_sources"][0]["status"], "SELECTED_NOT_READ_OR_APPLIED")
        self.assertIn("c55_product_rework", resumed["allowed_scopes"])
        self.assertEqual([h["scope"] for h in resumed["holds"]], ["design_fitting"])

    def test_success_receipt_idempotency_and_large_log_capture(self):
        command = (
            "from pathlib import Path; p=Path('counter.txt');"
            "p.write_text(str(int(p.read_text())+1) if p.exists() else '1');"
            "print('x'*200000)"
        )
        first, process = self.call("run", "--action-id", "unit-1", "--scope", "harness_source_ops",
                                   "--", sys.executable, "-c", command)
        self.assertEqual(first["status"], "SUCCEEDED")
        self.assertLess(len(process.stdout), 2200)
        self.assertNotIn("stdout_tail", first)
        log = self.state / first["logs"]["stdout"]["path"]
        self.assertEqual(log.stat().st_size, 200001)
        self.assertEqual(first["logs"]["stdout"]["sha256"], hashlib.sha256(log.read_bytes()).hexdigest())
        second, _ = self.call("run", "--action-id", "unit-1", "--scope", "harness_source_ops",
                              "--", sys.executable, "-c", command)
        self.assertTrue(second["cached_result"])
        self.assertFalse(second["executed_this_invocation"])
        self.assertEqual((self.repo / "counter.txt").read_text(), "1")
        conflict, _ = self.call("run", "--action-id", "unit-1", "--scope", "harness_source_ops",
                                "--", sys.executable, "-c", "print('different command')", expected=2)
        self.assertEqual(conflict["error"], "ACTION_ID_CONFLICT")

    @unittest.skipUnless(os.name == "posix", "Hard-kill fixture uses POSIX signals")
    def test_live_run_then_hard_interruption_never_replays(self):
        child_program = (
            "from pathlib import Path;import time;"
            "print('READY',flush=True);time.sleep(1.1);"
            "p=Path('effect.txt');p.write_text((p.read_text() if p.exists() else '')+'1')"
        )
        command = [sys.executable, str(CLI), "--state-dir", str(self.state), "run",
                   "--action-id", "interrupted", "--scope", "harness_source_ops",
                   "--", sys.executable, "-c", child_program]
        wrapper = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        child_identity = None
        try:
            log = self.state / "logs" / "interrupted.stdout.log"
            self.wait_until(lambda: log.exists() and "READY" in log.read_text())
            current = json.loads((self.state / "current.json").read_text())["payload"]
            child_identity = current["active_action"]["child"]
            live, _ = self.call("resume")
            self.assertEqual(live["active_action"]["status"], "RUNNING")
            wrapper.kill()
            wrapper.communicate(timeout=3)
            interrupted, _ = self.call("resume")
            self.assertIn(interrupted["active_action"]["status"],
                          ["ORPHANED_CHILD_RUNNING", "UNKNOWN_RECOVERY_REQUIRED"])
            denied, _ = self.call("run", "--action-id", "interrupted", "--scope", "harness_source_ops",
                                  "--", sys.executable, "-c", child_program, expected=2)
            self.assertEqual(denied["error"], "ACTION_RECOVERY_REQUIRED")
            self.wait_until(lambda: (self.repo / "effect.txt").exists()
                            and harness.process_state(child_identity) == "STOPPED")
            unknown, _ = self.call("resume")
            self.assertEqual(unknown["active_action"]["status"], "UNKNOWN_RECOVERY_REQUIRED")
            self.assertEqual((self.repo / "effect.txt").read_text(), "1")
            self.assertFalse(unknown["ready_to_continue_without_reconciliation"])
            reconciled, _ = self.call(
                "reconcile", "--action-id", "interrupted", "--outcome", "succeeded",
                "--note", "Observed one effect and a stopped child in an isolated fixture.",
                "--external-state-checked", "--evidence", str(self.repo / "effect.txt"))
            self.assertEqual(reconciled["status"], "RECONCILED")
            self.assertFalse(reconciled["automatic_reexecution"])
            after, _ = self.call("resume")
            self.assertEqual(after["active_action"]["status"], "IDLE")
        finally:
            if wrapper.poll() is None:
                wrapper.kill()
                wrapper.communicate(timeout=3)
            if child_identity and harness.process_state(child_identity) == "LIVE":
                os.kill(child_identity["pid"], signal.SIGKILL)

    def test_checkpoint_detects_head_and_evidence_drift(self):
        evidence = self.repo / "acceptance.txt"
        evidence.write_text("expected result")
        self.call("checkpoint", "--next", "Review the next independent case", "--evidence", str(evidence))
        fresh, _ = self.call("resume")
        self.assertFalse(fresh["head_changed"])
        self.assertEqual(fresh["evidence"][0]["status"], "MATCH")
        evidence.write_text("changed result")
        (self.repo / "new-source.txt").write_text("source change")
        self.git("add", "new-source.txt")
        self.git("commit", "-qm", "different source")
        drift, _ = self.call("resume")
        self.assertTrue(drift["head_changed"])
        self.assertEqual(drift["evidence"][0]["status"], "HASH_CHANGED")
        self.assertFalse(drift["ready_to_continue_without_reconciliation"])
        self.assertIn("holds", drift)
        self.assertIn("approvals_note", drift)

    def test_same_head_dirty_file_changes_are_detected(self):
        source = self.repo / "README.md"
        source.write_text("first uncommitted version")
        self.call("checkpoint", "--next", "Continue after first source change")
        before, _ = self.call("resume")
        self.assertFalse(before["worktree_changed"])
        source.write_text("second uncommitted version")
        after, _ = self.call("resume")
        self.assertFalse(after["head_changed"])
        self.assertEqual(after["dirty_entry_count"], before["dirty_entry_count"])
        self.assertTrue(after["worktree_changed"])
        self.assertFalse(after["ready_to_continue_without_reconciliation"])

    def test_corrupt_current_recovers_only_from_valid_journal(self):
        (self.state / "current.json").write_bytes(b'{"broken"')
        recovery, _ = self.call("resume")
        self.assertEqual(recovery["checkpoint_integrity"]["recovery"], "VALID_JOURNAL_AVAILABLE")
        self.assertFalse(recovery["ready_to_continue_without_reconciliation"])
        rejected, _ = self.call("run", "--action-id", "must-not-run", "--scope", "harness_source_ops",
                                "--", sys.executable, "-c", "print('no')", expected=2)
        self.assertEqual(rejected["error"], "CURRENT_REPAIR_REQUIRED")
        self.call("repair-current")
        restored, _ = self.call("resume")
        self.assertTrue(restored["checkpoint_integrity"]["current_consistent"])
        with (self.state / "events.jsonl").open("ab") as stream:
            stream.write(b'{"incomplete":')
        corrupt, _ = self.call("resume", expected=2)
        self.assertEqual(corrupt["error"], "JOURNAL_CORRUPT")
        blocked, _ = self.call("repair-current", expected=2)
        self.assertEqual(blocked["error"], "JOURNAL_CORRUPT")

    @unittest.skipUnless(os.name == "posix", "Fault injection uses a hard-killed writer")
    def test_interrupted_atomic_publish_keeps_old_file_and_valid_new_journal(self):
        before = (self.state / "current.json").read_bytes()
        marker = self.base / "before-rename"
        program = (
            "import sys,time;from pathlib import Path;"
            f"sys.path.insert(0,{str(ROOT)!r});import order_harness as h;"
            "original=h.os.replace\n"
            "def pause(source,destination):\n"
            f" Path({str(marker)!r}).write_text('journal already fsynced')\n"
            " time.sleep(10)\n"
            " original(source,destination)\n"
            "h.os.replace=pause\n"
            f"h.main(['--state-dir',{str(self.state)!r},'checkpoint','--next','atomic publication interrupted'])"
        )
        writer = subprocess.Popen([sys.executable, "-c", program], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            self.wait_until(marker.exists)
            writer.kill()
            writer.communicate(timeout=3)
            self.assertEqual((self.state / "current.json").read_bytes(), before)
            resumed, _ = self.call("resume")
            self.assertEqual(resumed["next_atomic_action"], "atomic publication interrupted")
            self.assertEqual(resumed["checkpoint_integrity"]["recovery"], "VALID_JOURNAL_AVAILABLE")
            self.call("repair-current")
            self.assertEqual(self.call("resume")[0]["next_atomic_action"], "atomic publication interrupted")
        finally:
            if writer.poll() is None:
                writer.kill()
                writer.communicate(timeout=3)

    def test_fts_search_is_bounded_and_marks_changed_source(self):
        log = self.repo / "long-log.txt"
        log.write_text("".join(f"{i}: 주문 fixture recovery marker receipt\n" for i in range(12000)))
        indexed, _ = self.call("index", "add", str(log))
        self.assertEqual(indexed["files"][0]["status"], "INDEXED")
        unchanged, _ = self.call("index", "add", str(log))
        self.assertEqual(unchanged["files"][0]["status"], "UNCHANGED")
        found, process = self.call("search", "recovery receipt", "--limit", "10",
                                  "--excerpt-chars", "600", "--max-output-chars", "1600")
        self.assertLessEqual(len(process.stdout), 1600)
        self.assertGreater(len(found["results"]), 0)
        self.assertIn("automatic_retry", found["safety"])
        self.assertIn("indexed_sha256", found["results"][0])
        self.assertEqual(found["results"][0]["freshness"], "METADATA_UNCHANGED")
        log.write_text(log.read_text() + "new line")
        stale, _ = self.call("search", "receipt")
        self.assertEqual(stale["results"][0]["freshness"], "SOURCE_CHANGED")
        secret = self.repo / ".env"
        secret.write_text("TOKEN=fixture-not-a-secret")
        excluded, _ = self.call("index", "add", str(secret), expected=2)
        self.assertEqual(excluded["error"], "EXCLUDED_FILE")

    def test_export_restore_is_portable_and_does_not_apply_evidence(self):
        evidence = self.repo / "result.txt"
        evidence.write_text("preserved evidence")
        self.call("checkpoint", "--next", "Continue from source evidence", "--evidence", str(evidence))
        (self.repo / ".env").write_text("PRIVATE=fixture-only")
        exported = self.base / "checkpoint.zip"
        result, _ = self.call("export", "--output", str(exported), "--evidence", str(evidence), "--include-config")
        self.assertEqual(result["status"], "EXPORTED_LOCAL_SNAPSHOT")
        with zipfile.ZipFile(exported) as archive:
            self.assertNotIn("evidence/repo/.env", archive.namelist())
            self.assertNotIn("state/search.sqlite", archive.namelist())
            manifest = json.loads(archive.read("MANIFEST.json"))
            for record in manifest["files"]:
                self.assertEqual(hashlib.sha256(archive.read(record["path"])).hexdigest(), record["sha256"])
        destination = self.base / "restored-state"
        restored, _ = self.call("restore", "--archive", str(exported), "--repo", str(self.repo), state=destination)
        self.assertFalse(restored["evidence_applied_to_worktree"])
        self.assertEqual(restored["commands_executed"], 0)
        resumed, _ = self.call("resume", state=destination)
        self.assertEqual(resumed["evidence"][0]["status"], "MATCH")
        self.assertTrue(resumed["evidence"][0]["restored_backup_available"])
        selected, _ = self.call("route", "--task", "component_ui", state=destination)
        self.assertEqual(len(selected["sources"]), 2)
        another_repo = self.base / "new-empty-worktree"
        another_repo.mkdir()
        destination2 = self.base / "second-restored-state"
        self.call("restore", "--archive", str(exported), "--repo", str(another_repo), state=destination2)
        new_resume, _ = self.call("resume", state=destination2)
        self.assertTrue(new_resume["head_changed"])
        self.assertEqual(new_resume["evidence"][0]["status"], "MISSING")
        self.assertTrue(new_resume["evidence"][0]["restored_backup_available"])
        self.assertFalse((another_repo / "result.txt").exists())

    def test_archive_traversal_tamper_and_secret_files_are_rejected(self):
        good = self.base / "good.zip"
        self.call("export", "--output", str(good))
        bad = self.base / "traversal.zip"
        with zipfile.ZipFile(good) as source, zipfile.ZipFile(bad, "w") as target:
            for item in source.infolist():
                target.writestr(item, source.read(item.filename))
            target.writestr("../escaped.txt", "must not write")
        rejected, _ = self.call("restore", "--archive", str(bad), "--repo", str(self.repo),
                                state=self.base / "bad-destination", expected=2)
        self.assertEqual(rejected["error"], "UNSAFE_ARCHIVE")
        self.assertFalse((self.base / "escaped.txt").exists())
        tampered = self.base / "tampered.zip"
        with zipfile.ZipFile(good) as source, zipfile.ZipFile(tampered, "w") as target:
            for item in source.infolist():
                data = source.read(item.filename)
                target.writestr(item, data + b"changed" if item.filename == "state/current.json" else data)
        invalid, _ = self.call("restore", "--archive", str(tampered), "--repo", str(self.repo),
                               state=self.base / "tampered-destination", expected=2)
        self.assertEqual(invalid["error"], "UNSAFE_ARCHIVE")
        self.assertFalse((self.base / "tampered-destination").exists())
        secret = self.repo / ".env"
        secret.write_text("TOKEN=fixture")
        excluded, _ = self.call("export", "--output", str(self.base / "secret.zip"),
                                "--evidence", str(secret), expected=2)
        self.assertEqual(excluded["error"], "EXCLUDED_FILE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
