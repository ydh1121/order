#!/usr/bin/env python3
"""Repository host adapter; upstream CLI stays byte-for-byte intact.

No network client, shell command expansion, automatic retry, or lifecycle daemon.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile
import zipfile

import order_harness as kit

SCHEMA = "order.harness.host/v1"
FOLDER = "12c3k0H1C-PUaLqcMakRBlxComO8zvEB2"
CURRENT = "1p6b303fVYmHH7ekyyVaJE7zK-iaDq8D7"
TERMINAL = {"SUCCEEDED", "FAILED", "START_FAILED", "RECONCILED"}
SOURCE_SUFFIXES = {".py", ".js", ".mjs", ".ts", ".json", ".md", ".css", ".html", ".yml", ".yaml"}
EXCLUDED_PARTS = {".git", "node_modules", "dist", "browser-evidence", ".qa-lab", ".order-harness", "logs", "__pycache__", "test-output"}
SECRET = re.compile(rb"-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|(?:AKIA|ASIA)[A-Z0-9]{16}|(?:gh[pousr]_[A-Za-z0-9]{30,})|(?:sk-[A-Za-z0-9]{32,})")

_upstream_identity = kit.proc_identity


def host_process_identity(pid, proc_pid_hint=None):
    """This host exposes host /proc but hides task/children; pidfd identifies our child exactly."""
    if proc_pid_hint is None and pid != os.getpid() and hasattr(os, "pidfd_open"):
        try:
            descriptor = os.pidfd_open(pid)
            try:
                text = Path(f"/proc/self/fdinfo/{descriptor}").read_text()
                host_pid = next(int(line.split()[1]) for line in text.splitlines() if line.startswith("Pid:"))
                if host_pid > 0:
                    return _upstream_identity(pid, host_pid)
            finally:
                os.close(descriptor)
        except (OSError, ValueError, StopIteration):
            pass
    return _upstream_identity(pid, proc_pid_hint)


kit.proc_identity = host_process_identity


def fail(message, code, details=None):
    raise kit.HarnessError(message, code, details)


def source_key(snapshot):
    return [snapshot.get(k) for k in ("head", "branch", "worktree_fingerprint", "worktree_fingerprint_complete")]


def checkpoint(state_dir, next_action, status, evidence=()):
    return kit.cmd_checkpoint(argparse.Namespace(state_dir=state_dir, next=next_action,
        status=status, note=None, evidence=list(evidence)))


def run(args):
    state_dir = Path(args.state_dir).resolve()
    state, integrity = kit.read_state(state_dir)
    kit.require_consistent(integrity)
    action_id = kit.safe_id(args.action_id)
    argv = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not argv:
        fail("Supply an explicit command after --.", "COMMAND_MISSING")
    action_hash = kit.digest(kit.canonical(argv))
    receipt = state_dir / "actions" / (action_id + ".json")
    record_path = state_dir / "host-actions" / (action_id + ".json")
    actual = kit.git_snapshot(state["repo_root"], state_dir)
    if receipt.exists():
        previous = json.loads(receipt.read_bytes())
        if previous.get("argv_sha256") != action_hash or previous.get("scope") != args.scope:
            fail("This action ID belongs to another command/scope.", "ACTION_ID_CONFLICT")
        if previous.get("status") in TERMINAL:
            if not record_path.exists():
                fail("Known action has no verified host source receipt; inspect it; never replay.", "KNOWN_ACTION_REVIEW_REQUIRED")
            record = json.loads(record_path.read_bytes())
            problems = []
            if record.get("receipt_sha256") != kit.file_hash(receipt):
                problems.append("receipt hash changed")
            if source_key(record.get("source_after", {})) != source_key(actual):
                problems.append("source changed")
            if not actual["worktree_fingerprint_complete"]:
                problems.append("source fingerprint incomplete")
            for name, item in previous.get("logs", {}).items():
                path = state_dir / item["path"]
                if not path.is_file() or kit.file_hash(path) != item.get("sha256"):
                    problems.append(name + " log missing or hash changed")
            for item in kit.evidence_observations(state, state_dir):
                if item["status"] != "MATCH":
                    problems.append("checkpoint evidence " + item["status"] + ": " + item["path"])
            if problems:
                fail("Prior result is stale or incomplete; inspect/revalidate with a new justified action ID. No replay.",
                     "STALE_ACTION_RESULT", problems)
            result = kit.cmd_run(args)
            result["receipt_sha256"] = record["receipt_sha256"]
            return result
    if state.get("active_action"):
        fail("An action is alive or unresolved; observe and reconcile before any new command.",
             "ACTION_RECOVERY_REQUIRED", kit.action_observation(state["active_action"]))
    reason = kit.blocked_reason(state, args.scope)
    if reason:
        fail(reason, "SCOPE_BLOCKED")
    if not actual["is_git_repository"] or not actual["worktree_fingerprint_complete"]:
        fail("Cannot capture a complete source fingerprint.", "SOURCE_OBSERVATION_INCOMPLETE")
    for path in (state_dir / "host-actions").glob("*.json"):
        prior = json.loads(path.read_bytes())
        if (prior.get("argv_sha256") == action_hash and prior.get("status") in {"FAILED", "START_FAILED"}
                and source_key(prior.get("source_before", {})) == source_key(actual)
                and not (args.retry_of == prior["action_id"] and args.retry_reason)):
            fail("The same command already failed on this source; supply retry-of and new evidence in retry-reason.",
                 "RETRY_REASON_REQUIRED", {"previous_action": prior["action_id"]})
    record = {"schema": SCHEMA, "action_id": action_id, "argv_sha256": action_hash,
              "scope": args.scope, "status": "PREPARED", "source_before": actual,
              "retry_of": args.retry_of, "retry_reason": args.retry_reason}
    kit.atomic_json(record_path, record)
    checkpoint(state_dir, args.next, "COMMAND_PREPARED")
    result = kit.cmd_run(args)
    record.update(status=result["status"], source_after=kit.git_snapshot(state["repo_root"], state_dir),
                  receipt_sha256=kit.file_hash(receipt), finished_at_utc=kit.utcnow())
    kit.atomic_json(record_path, record)
    evidence = [receipt, record_path] + [state_dir / row["path"] for row in result["logs"].values()]
    post = checkpoint(state_dir, args.next, result["status"], evidence)
    result["host_checkpoint_sequence"] = post["sequence"]
    result["receipt_sha256"] = record["receipt_sha256"]
    result["source_before_head"] = actual["head"]
    result["source_after_head"] = record["source_after"]["head"]
    result["source_changed_during_command"] = source_key(actual) != source_key(record["source_after"])
    return result


def sanitize(value):
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items()
                if k not in {"argv_redacted", "dirty_entries_sample", "launch_error"}}
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    return value


def prepare(args):
    with kit.locked(args.state_dir):
        return prepare_locked(args)


def prepare_locked(args):
    state_dir = Path(args.state_dir).resolve()
    state, integrity = kit.read_state(state_dir)
    kit.require_consistent(integrity)
    observation = kit.action_observation(state.get("active_action"))
    if observation["status"] not in {"IDLE", "UNKNOWN_RECOVERY_REQUIRED"}:
        fail("Do not export a command that is still running.", "PROCESS_STILL_RUNNING", observation)
    root = Path(state["repo_root"]).resolve()
    source = kit.git_snapshot(root, state_dir)
    if not source["is_git_repository"] or not source["worktree_fingerprint_complete"]:
        fail("Source observation is incomplete.", "SOURCE_OBSERVATION_INCOMPLETE")
    required_receipt = None
    if args.require_action:
        receipt_path = state_dir / "actions" / (kit.safe_id(args.require_action) + ".json")
        if not args.receipt_sha256 or not receipt_path.is_file() or kit.file_hash(receipt_path) != args.receipt_sha256:
            fail("Persisted terminal receipt differs from the actual returned command receipt; inspect host persistence before upload.", "TERMINAL_RECEIPT_PERSISTENCE_CONFLICT")
        terminal = json.loads(receipt_path.read_bytes())
        if terminal.get("status") not in TERMINAL or state.get("active_action"):
            fail("The required command is not terminal in persisted state.", "TERMINAL_RECEIPT_PERSISTENCE_CONFLICT")
        for row in terminal.get("logs", {}).values():
            log = state_dir / row["path"]
            if not log.is_file() or kit.file_hash(log) != row.get("sha256"):
                fail("Persisted command log differs from its terminal hash.", "TERMINAL_RECEIPT_PERSISTENCE_CONFLICT")
        required_receipt = {"action_id": args.require_action, "sha256": args.receipt_sha256,
                            "status": terminal["status"], "exit_code": terminal["exit_code"]}
    allowlist = json.loads(Path(args.allowlist).read_bytes())
    if not isinstance(allowlist, list) or not allowlist or any(not isinstance(p, str) for p in allowlist):
        fail("Allowlist must be a nonempty JSON array of exact repository paths.", "BAD_ALLOWLIST")
    files = {}
    for relative in allowlist:
        member = kit.safe_member(relative)
        if member.parts[0] not in {"tools", "docs", "scripts", "functions", "src", "web", "assets", "test", "tests", "data", ".github"} and len(member.parts) > 1:
            fail("Path is outside the allowed source locations.", "EXPORT_SOURCE_REJECTED", relative)
        if set(member.parts) & EXCLUDED_PARTS or (Path(relative).suffix not in SOURCE_SUFFIXES and relative != ".gitignore"):
            fail("Runtime, log, binary or unsupported source path is excluded.", "EXPORT_SOURCE_REJECTED", relative)
        path = root.joinpath(*member.parts)
        if any(p.is_symlink() for p in [path, *path.parents] if p != root.parent):
            fail("Symlink source paths are excluded.", "EXPORT_SOURCE_REJECTED", relative)
        path = kit.explicit_file(path)
        if root not in path.parents:
            fail("Source path escapes the repository.", "EXPORT_SOURCE_REJECTED", relative)
        files["evidence/repo/" + relative] = path.read_bytes()
    safe_state = sanitize(copy.deepcopy(state))
    safe_state["config"] = {}
    safe_state["sequence"] = 0
    safe_state["durable_export"] = {"mode": "sanitized_checkpoint_and_explicit_source", "raw_logs_exported": False,
                                    "source_files": sorted(set(allowlist)), "source_observation_at_export": source}
    # Preserve every known action ID, including old completed IDs, so restore never authorizes replay.
    for path in (state_dir / "actions").glob("*.json"):
        row = sanitize(json.loads(path.read_bytes()))
        files["state/actions/" + path.name] = kit.canonical(row)
    for path in (state_dir / "host-actions").glob("*.json"):
        row = sanitize(json.loads(path.read_bytes()))
        key = "state/actions/" + path.name
        if key in files:
            row["receipt_sha256"] = kit.digest(files[key])
        files["state/host-actions/" + path.name] = kit.canonical(row)
    with tempfile.TemporaryDirectory() as temporary:
        kit.commit_state(temporary, safe_state, "SANITIZED_DURABLE_CHECKPOINT")
        for name in ("current.json", "events.jsonl"):
            files["state/" + name] = (Path(temporary) / name).read_bytes()
    if sum(map(len, files.values())) > 50_000_000:
        fail("Allowlisted export exceeds 50 MB.", "EXPORT_TOO_LARGE")
    for name, data in files.items():
        if kit.sensitive_path(name) or SECRET.search(data):
            fail("A secret signature or secret filename was detected; remove it before export.", "EXPORT_SECRET_REJECTED", name)
    if source_key(kit.git_snapshot(root, state_dir)) != source_key(source):
        fail("Source changed while collecting the allowlisted export; prepare again after the work unit stops.", "SOURCE_CHANGED_DURING_EXPORT")
    output = Path(args.output).resolve()
    if state_dir == output or state_dir in output.parents or root in output.parents:
        fail("Export must be outside the repository and runtime state.", "BAD_EXPORT_DESTINATION")
    manifest = {"schema": "order.harness.export/v1", "created_at_utc": kit.utcnow(), "project": state["project"],
                "files": [{"path": name, "bytes": len(data), "sha256": kit.digest(data)} for name, data in sorted(files.items())],
                "automatic_durable_upload": False, "source_application": "MANUAL_REVIEW_ONLY"}
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryFile() as stream:
        with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, data in sorted(files.items()):
                archive.writestr(name, data)
            archive.writestr("MANIFEST.json", kit.canonical(manifest))
        stream.seek(0)
        kit.atomic_bytes(output, stream.read())
    envelope = {"schema": SCHEMA, "status": "DURABLE_UPLOAD_PENDING", "created_at_utc": kit.utcnow(),
                "owner_track": state["owner_track"], "target_folder_id": FOLDER, "target_current_id": CURRENT,
                "path": str(output), "sha256": kit.file_hash(output), "bytes": output.stat().st_size,
                "source_head": source["head"], "source_worktree_fingerprint": source["worktree_fingerprint"],
                "source_allowlist": sorted(set(allowlist)), "source_checkpoint_sequence": state["sequence"],
                "raw_logs_exported": False, "commands_replayed": 0, "files": manifest["files"]}
    envelope["required_action_receipt"] = required_receipt
    envelope_path = output.with_suffix(".envelope.json")
    kit.atomic_json(envelope_path, envelope)
    return {k: envelope[k] for k in ("status", "path", "sha256", "bytes", "source_head", "target_folder_id", "target_current_id")} | {"envelope": str(envelope_path)}


def verify(args):
    envelope = json.loads(Path(args.envelope).read_bytes())
    metadata = json.loads(Path(args.remote_metadata).read_bytes())
    downloaded = kit.explicit_file(args.downloaded)
    if envelope.get("target_folder_id") != FOLDER or envelope.get("target_current_id") != CURRENT:
        fail("Unexpected durable destination.", "DURABLE_TARGET_MISMATCH")
    parents = metadata.get("parents", metadata.get("parent_ids", []))
    if not metadata.get("id") or FOLDER not in parents or metadata.get("trashed", False):
        fail("Remote metadata does not identify a live file in the approved folder.", "DURABLE_TARGET_MISMATCH")
    if downloaded.stat().st_size != envelope["bytes"] or kit.file_hash(downloaded) != envelope["sha256"]:
        fail("Downloaded durable bytes differ from the prepared artifact.", "DURABLE_READBACK_MISMATCH")
    if metadata.get("size") is not None and int(metadata["size"]) != envelope["bytes"]:
        fail("Remote metadata size differs.", "DURABLE_READBACK_MISMATCH")
    result = {"schema": SCHEMA, "status": "DURABLE_READBACK_VERIFIED", "verified_at_utc": kit.utcnow(),
              "file_id": metadata["id"], "folder_id": FOLDER, "sha256": envelope["sha256"],
              "bytes": envelope["bytes"], "source_head": envelope["source_head"],
              "version": metadata.get("version"), "modified_time": metadata.get("modifiedTime", metadata.get("modified_time")),
              "current_update_verified": False, "network_actions_by_helper": 0}
    kit.atomic_json(args.receipt, result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-dir", default=".order-harness")
    commands = parser.add_subparsers(dest="operation", required=True)
    run_parser = commands.add_parser("run")
    run_parser.add_argument("--action-id", required=True)
    run_parser.add_argument("--scope", required=True)
    run_parser.add_argument("--next", default="Inspect this unit's receipt and continue the authorized work unit.")
    run_parser.add_argument("--retry-of")
    run_parser.add_argument("--retry-reason")
    run_parser.add_argument("--excerpt-chars", type=int, choices=range(0, 2001), default=0, metavar="0..2000")
    run_parser.add_argument("command", nargs=argparse.REMAINDER)
    run_parser.set_defaults(handler=run)
    prepare_parser = commands.add_parser("prepare-durable")
    prepare_parser.add_argument("--allowlist", required=True)
    prepare_parser.add_argument("--output", required=True)
    prepare_parser.add_argument("--require-action")
    prepare_parser.add_argument("--receipt-sha256")
    prepare_parser.set_defaults(handler=prepare)
    verify_parser = commands.add_parser("verify-durable")
    for name in ("envelope", "downloaded", "remote-metadata", "receipt"):
        verify_parser.add_argument("--" + name, required=True)
    verify_parser.set_defaults(handler=verify)
    args = parser.parse_args()
    try:
        result = args.handler(args)
        code = result.pop("_exit", 0)
        kit.emit(result)
        return code
    except kit.HarnessError as error:
        kit.emit({"status": "ERROR", "code": error.code, "message": str(error), "details": error.details,
                  "automatic_reexecution": False})
        return 2


if __name__ == "__main__":
    sys.exit(main())
