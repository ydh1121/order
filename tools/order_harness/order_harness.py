#!/usr/bin/env python3
"""Small, local-only checkpoint, source-routing and bounded-search CLI.

Python 3.10+ standard library. No network client, automatic retry, deployment,
upstream installation, or permission-grant mechanism is included.
"""
from __future__ import annotations

import argparse
import contextlib
import copy
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import stat
import subprocess
import sys
import tempfile
import time
import uuid
import zipfile

VERSION = "1.0.0"
STATE_SCHEMA = "order.harness.state/v1"
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$")
MAX_STATE_BYTES = 1_000_000
DEFAULT_EXPORT_BYTES = 50_000_000
SAFETY = {
    "authority": "Latest user instructions and approved project contracts remain authoritative.",
    "automatic_retry": False,
    "upstream_installation": False,
    "network_upload": False,
    "quota_bypass": False,
}


class HarnessError(Exception):
    def __init__(self, message, code="HARNESS_ERROR", details=None):
        super().__init__(message)
        self.code, self.details = code, details


def utcnow():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_hash(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def emit(value):
    print(json.dumps(value, ensure_ascii=False, indent=2))


def atomic_bytes(path, data):
    """Publish one complete file; fsync data before replace, then its directory."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix="." + path.name + ".", dir=path.parent)
    try:
        os.chmod(temporary, 0o600)
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        if os.name == "posix":
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_json(path, value):
    atomic_bytes(path, json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8") + b"\n")


@contextlib.contextmanager
def locked(state_dir):
    """Short state transactions only; never hold the lock while a command runs."""
    state_dir = Path(state_dir)
    state_dir.mkdir(parents=True, exist_ok=True)
    with (state_dir / ".lock").open("a+b") as lock:
        if os.name == "posix":
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        else:
            import msvcrt
            lock.seek(0)
            if not lock.read(1):
                lock.write(b"0")
                lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            if os.name == "posix":
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            else:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def envelope(payload):
    return {"schema": STATE_SCHEMA, "sha256": digest(canonical(payload)), "payload": payload}


def validate_envelope(value):
    if not isinstance(value, dict) or value.get("schema") != STATE_SCHEMA or not isinstance(value.get("payload"), dict):
        raise HarnessError("Unsupported or malformed checkpoint.", "STATE_CORRUPT")
    if value.get("sha256") != digest(canonical(value["payload"])):
        raise HarnessError("Checkpoint checksum mismatch.", "STATE_CORRUPT")
    return value["payload"]


def read_state(state_dir):
    """Read the fsynced journal and atomic current file; never reset silently."""
    state_dir = Path(state_dir)
    journal_path = state_dir / "events.jsonl"
    current_path = state_dir / "current.json"
    if not journal_path.exists():
        raise HarnessError("Initialize a state directory first.", "STATE_NOT_INITIALIZED")
    last, previous_hash, count = None, None, 0
    with journal_path.open("rb") as stream:
        for line in stream:
            count += 1
            if not line.endswith(b"\n"):
                raise HarnessError("Incomplete journal tail; inspect before repairing.", "JOURNAL_CORRUPT", {"line": count})
            try:
                item = json.loads(line)
                if not isinstance(item, dict):
                    raise ValueError("journal entry must be an object")
                expected = item.pop("event_sha256")
                if item.get("previous_event_sha256") != previous_hash or digest(canonical(item)) != expected:
                    raise ValueError("journal hash chain mismatch")
                payload = validate_envelope(item["state"])
                if payload["sequence"] != count:
                    raise ValueError("journal sequence mismatch")
            except (ValueError, KeyError, TypeError, HarnessError) as error:
                raise HarnessError("Journal validation failed; no command will be run.", "JOURNAL_CORRUPT",
                                   {"line": count, "reason": str(error)[:200]})
            previous_hash, last = expected, payload
    if last is None:
        raise HarnessError("Journal is empty.", "JOURNAL_CORRUPT")
    current_error = None
    try:
        if current_path.stat().st_size > MAX_STATE_BYTES:
            raise ValueError("checkpoint too large")
        current = validate_envelope(json.loads(current_path.read_bytes()))
        if current.get("sequence", 0) > last["sequence"]:
            raise HarnessError("Current file is newer than its journal.", "JOURNAL_CORRUPT")
        consistent = canonical(current) == canonical(last)
        if not consistent:
            current_error = "Current file is behind or differs from the latest valid journal entry."
    except HarnessError as error:
        if error.code == "JOURNAL_CORRUPT":
            raise
        current_error = str(error)
    except (OSError, ValueError, TypeError) as error:
        current_error = str(error)[:200]
    return copy.deepcopy(last), {
        "current_consistent": current_error is None,
        "recovery": "NONE" if current_error is None else "VALID_JOURNAL_AVAILABLE",
        "current_error": current_error,
        "last_event_sha256": previous_hash,
        "journal_entries": count,
    }


def require_consistent(info):
    if not info["current_consistent"]:
        raise HarnessError("Use repair-current after reviewing the journal recovery report.",
                           "CURRENT_REPAIR_REQUIRED", info)


def commit_state(state_dir, state, event_type, previous_hash=None):
    """Caller holds .lock. Write-ahead journal preserves a rename interruption."""
    state = copy.deepcopy(state)
    state["sequence"] = int(state.get("sequence", 0)) + 1
    state["updated_at_utc"] = utcnow()
    checkpoint = envelope(state)
    if len(canonical(checkpoint)) > MAX_STATE_BYTES:
        raise HarnessError("Checkpoint is too large; move detail to evidence files.", "CHECKPOINT_TOO_LARGE")
    item = {
        "at_utc": state["updated_at_utc"], "event": event_type,
        "previous_event_sha256": previous_hash, "state": checkpoint,
    }
    item["event_sha256"] = digest(canonical(item))
    path = Path(state_dir) / "events.jsonl"
    with path.open("ab") as output:
        output.write(canonical(item) + b"\n")
        output.flush()
        os.fsync(output.fileno())
    atomic_json(Path(state_dir) / "current.json", checkpoint)
    return state


def git_snapshot(repo, state_dir=None):
    repo = str(Path(repo).resolve())
    env = dict(os.environ, GIT_OPTIONAL_LOCKS="0", GIT_TERMINAL_PROMPT="0")
    def git(*arguments):
        try:
            result = subprocess.run(
                ["git", "-c", "core.fsmonitor=false", "-C", repo, *arguments],
                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=env, timeout=10,
                encoding="utf-8", errors="replace", check=False)
            return result.stdout.strip() if result.returncode == 0 else None
        except (OSError, subprocess.TimeoutExpired):
            return None
    head = git("rev-parse", "HEAD")
    status_text = git("status", "--porcelain", "--untracked-files=normal") if head else None
    dirty = status_text.splitlines() if status_text else []
    changed = []
    fingerprint_complete, hashed_bytes, secret_exclusions = True, 0, 0
    if head:
        tracked = git("diff", "--no-ext-diff", "--no-textconv", "--name-only", "-z", "HEAD")
        untracked = git("ls-files", "--others", "--exclude-standard", "-z")
        if tracked is None or untracked is None:
            fingerprint_complete = False
        root = Path(repo)
        excluded_state = Path(state_dir).resolve() if state_dir else None
        for relative in sorted(set((tracked or "").split("\0") + (untracked or "").split("\0")) - {""}):
            path = root / relative
            resolved = path.resolve()
            if excluded_state and (resolved == excluded_state or excluded_state in resolved.parents):
                continue
            if sensitive_path(path):
                secret_exclusions += 1
                continue
            if path.is_symlink():
                changed.append([relative, "SYMLINK", digest(os.readlink(path).encode())])
            elif not path.exists():
                changed.append([relative, "MISSING", None])
            elif root not in resolved.parents or not path.is_file():
                changed.append([relative, "UNREADABLE_OR_OUTSIDE_ROOT", None])
                fingerprint_complete = False
            elif hashed_bytes + path.stat().st_size > 50_000_000:
                changed.append([relative, "OVER_FINGERPRINT_BYTE_BOUND", None])
                fingerprint_complete = False
            else:
                try:
                    changed.append([relative, "FILE", file_hash(path)])
                    hashed_bytes += path.stat().st_size
                except OSError:
                    changed.append([relative, "UNREADABLE", None])
                    fingerprint_complete = False
    return {
        "repository_path": repo, "is_git_repository": head is not None,
        "head": head, "branch": git("branch", "--show-current") if head else None,
        "dirty_entry_count": len(dirty),
        "dirty_entries_sample": dirty[:20], "dirty_entries_sample_truncated": len(dirty) > 20,
        "worktree_fingerprint": digest(canonical(changed)) if head else None,
        "worktree_fingerprint_complete": fingerprint_complete,
        "worktree_fingerprint_files": len(changed),
        "worktree_fingerprint_scope": "Changed tracked and untracked non-secret files; state directory excluded; 50 MB bound.",
        "secret_named_paths_excluded": secret_exclusions,
        "read_only_observation": True,
    }


def proc_identity(pid, proc_pid_hint=None):
    result = {"pid": pid, "proc_pid": None, "pid_namespace": None,
              "start_token": None, "boot_id": None, "observed": False, "zombie": False}
    try:
        os.kill(pid, 0)
        result["observed"] = True
    except PermissionError:
        result["observed"] = True
    except (OSError, ValueError):
        pass
    # A managed host can expose host /proc while getpid() returns a nested PID.
    # Only inspect our own process, its direct children, or an already recorded
    # host PID. Never enumerate unrelated processes or inspect command lines.
    try:
        own_stat = Path("/proc/self/stat").read_text()
        own_host_pid = int(own_stat.split(" ", 1)[0])
        own_namespace = os.readlink("/proc/self/ns/pid")
        if proc_pid_hint is not None:
            probes = [int(proc_pid_hint)]
        elif pid == os.getpid():
            probes = [own_host_pid]
        else:
            children = Path(f"/proc/self/task/{own_host_pid}/children").read_text().split()
            probes = [pid] + [int(value) for value in children]
        for host_pid in dict.fromkeys(probes):
            proc = Path(f"/proc/{host_pid}")
            try:
                namespace = os.readlink(proc / "ns" / "pid")
                if proc_pid_hint is None:
                    status = (proc / "status").read_text()
                    nspid = next((line.split()[1:] for line in status.splitlines()
                                  if line.startswith("NSpid:")), [str(host_pid)])
                    if namespace != own_namespace or int(nspid[-1]) != pid:
                        continue
                text = (proc / "stat").read_text()
                fields = text[text.rfind(")") + 2:].split()
                result.update({"observed": True, "proc_pid": host_pid,
                               "pid_namespace": namespace, "zombie": fields[0] == "Z",
                               "start_token": fields[19],
                               "boot_id": Path("/proc/sys/kernel/random/boot_id").read_text().strip()})
                return result
            except FileNotFoundError:
                if proc_pid_hint is not None:
                    # The recorded identity is gone even if the numeric namespace
                    # PID now belongs to a different process.
                    result["observed"] = False
            except (OSError, ValueError, IndexError):
                pass
    except (OSError, ValueError):
        pass
    if not Path("/proc/self/status").exists() and result["observed"]:
        # Optional macOS/other POSIX fallback. When unavailable, identity stays
        # unverified and resume reports POSSIBLY_RUNNING, never auto-replays.
        try:
            probe = subprocess.run(["ps", "-p", str(pid), "-o", "lstart=", "-o", "stat="],
                                   capture_output=True, text=True, timeout=3, check=False)
            fields = probe.stdout.split()
            if probe.returncode == 0 and len(fields) >= 6:
                result["start_token"] = "ps:" + " ".join(fields[:5])
                result["zombie"] = "Z" in fields[5]
        except (OSError, subprocess.TimeoutExpired):
            pass
    return result


def process_state(saved):
    if not saved or not saved.get("pid"):
        return "NOT_RECORDED"
    now = proc_identity(saved["pid"], saved.get("proc_pid"))
    if not now["observed"] or now["zombie"]:
        return "STOPPED"
    if saved.get("start_token") and now.get("start_token"):
        if (saved["start_token"], saved.get("boot_id"), saved.get("pid_namespace")) != (now["start_token"], now.get("boot_id"), now.get("pid_namespace")):
            return "STOPPED_PID_REUSED"
        return "LIVE"
    return "POSSIBLY_LIVE_IDENTITY_UNVERIFIED"


def action_observation(action):
    if not action:
        return {"status": "IDLE", "automatic_retry": False}
    wrapper = process_state(action.get("wrapper"))
    child = process_state(action.get("child"))
    if wrapper in ("LIVE", "POSSIBLY_LIVE_IDENTITY_UNVERIFIED"):
        status_value = "RUNNING" if wrapper == "LIVE" else "POSSIBLY_RUNNING"
    elif child in ("LIVE", "POSSIBLY_LIVE_IDENTITY_UNVERIFIED"):
        status_value = "ORPHANED_CHILD_RUNNING"
    else:
        status_value = "UNKNOWN_RECOVERY_REQUIRED"
    return {
        "action_id": action["action_id"], "scope": action["scope"],
        "recorded_status": action["status"], "status": status_value,
        "wrapper": wrapper, "child": child, "automatic_retry": False,
        "next_step": "Observe the process/external result before reconciliation; never replay automatically.",
    }


def blocked_reason(state, scope):
    for hold in state.get("holds", []):
        if hold["scope"] in ("*", scope):
            return hold["reason"]
    if scope not in state.get("allowed_scopes", []):
        return "This scope is not explicitly allowed in this checkpoint."
    return None


def sensitive_path(path):
    parts = [p.casefold() for p in Path(path).parts]
    basename = parts[-1] if parts else ""
    return (any(p in {".ssh", ".aws", ".gnupg"} for p in parts)
            or basename == ".env" or basename.startswith(".env.")
            or basename in {"credentials.json", "credentials", "id_rsa", "id_ed25519", ".netrc"}
            or Path(basename).suffix in {".pem", ".key", ".p12", ".pfx"})


def explicit_file(path):
    original = Path(path)
    if original.is_symlink():
        raise HarnessError("Explicit source must be a regular file, not a symlink.", "UNSAFE_PATH")
    resolved = original.resolve(strict=True)
    if not resolved.is_file() or sensitive_path(original) or sensitive_path(resolved):
        raise HarnessError("Secret-named or non-regular input is excluded.", "EXCLUDED_FILE",
                           {"path": str(original)})
    return resolved


def evidence_record(path, state, state_dir):
    path = explicit_file(path)
    for anchor, base in (("state", Path(state_dir).resolve()), ("repo", Path(state["repo_root"]).resolve())):
        try:
            relative = path.relative_to(base)
        except ValueError:
            continue
        return {
            "anchor": anchor, "relative_path": relative.as_posix(), "sha256": file_hash(path),
            "bytes": path.stat().st_size, "recorded_at_utc": utcnow(),
        }
    raise HarnessError("Evidence must be inside the repo or state directory.", "EVIDENCE_OUTSIDE_ROOT")


def evidence_path(record, state, state_dir):
    rel = PurePosixPath(record["relative_path"])
    if rel.is_absolute() or ".." in rel.parts or "\\" in str(rel):
        raise HarnessError("Unsafe evidence locator.", "UNSAFE_PATH")
    root = Path(state_dir) if record["anchor"] == "state" else Path(state["repo_root"])
    return root / str(rel)


def evidence_observations(state, state_dir):
    result = []
    for record in state.get("evidence", []):
        path = evidence_path(record, state, state_dir)
        status_value = "MISSING"
        if path.is_file() and not path.is_symlink():
            status_value = "MATCH" if file_hash(path) == record["sha256"] else "HASH_CHANGED"
        restored = Path(state_dir) / "restored_evidence" / record["anchor"] / record["relative_path"]
        result.append({
            "anchor": record["anchor"], "path": record["relative_path"], "status": status_value,
            "recorded_sha256": record["sha256"],
            "restored_backup_available": restored.is_file(),
        })
    return result


def get_config_path(arguments, state, name, default_name):
    explicit = getattr(arguments, name, None)
    value = explicit or state.get("config", {}).get(name)
    if not value:
        fallback = Path(__file__).parent / "data" / default_name
        if fallback.is_file():
            return fallback
        return None
    return Path(value).resolve()


def optional_state(state_dir):
    if not (Path(state_dir) / "events.jsonl").exists():
        return {}, None
    return read_state(state_dir)


def load_json_file(path):
    if path is None:
        return {}
    return json.loads(explicit_file(path).read_text(encoding="utf-8"))


def route_data(arguments):
    state, _ = optional_state(arguments.state_dir)
    path = get_config_path(arguments, state, "routes", "skill_routing.json")
    data = load_json_file(path)
    tasks = data.get("tasks", data.get("routes", []))
    if isinstance(tasks, dict):
        tasks = [{"task_id": key, **value} for key, value in tasks.items()]
    bindings = data.get("repository_bindings", {})
    return state, tasks, bindings, data


def catalog_binding(key, arguments, state):
    path = get_config_path(arguments, state, "catalog", "source_catalog.json")
    data = load_json_file(path)
    for row in data.get("repositories", []):
        if row.get("repository_key", row.get("repository", "")).casefold() == key.casefold():
            preservation = row.get("preservation", {})
            return {
                "repository": row["repository"],
                "pinned_commit": row.get("pinned_source_commit"),
                "source_url": row.get("pinned_source_url", row.get("url")),
                "archive": row.get("archive_binding", {}),
                "entrypoints": preservation.get("skill_entrypoints", []),
                "readme_paths": preservation.get("readme_paths") or [],
                "review_status": row.get("review_status"),
                "activation_status": "REFERENCE_ONLY",
                "activation_conditions": [row.get("activate_when", "")],
                "license_status": preservation.get("license", {}),
                "source_coverage": preservation.get("source_scope"),
            }
    return None


def binding_brief(key, binding, role, max_paths):
    paths = binding.get("entrypoints", []) or []
    readmes = binding.get("readme_paths", []) or []
    pin = binding.get("pinned_commit") or binding.get("pinned_source_commit")
    repo = binding.get("repository", key)
    chosen = paths[:max_paths]
    return {
        "repository_key": key, "repository": repo, "role": role,
        "pinned_commit": pin, "review_status": binding.get("review_status"),
        "activation_status": binding.get("activation_status", "REFERENCE_ONLY"),
        "activation_conditions": binding.get("activation_conditions", []),
        "source_coverage": binding.get("source_coverage"),
        "license_status": binding.get("license_status"),
        "native_execution_ready": binding.get("native_execution_ready", False),
        "extraction_ready": binding.get("extraction_ready"),
        "first_use_action": binding.get("first_use_action"),
        "archive": binding.get("archive", {}),
        "entrypoints": chosen, "entrypoints_total": len(paths),
        "entrypoints_omitted": max(0, len(paths) - len(chosen)),
        "readme_paths": readmes[:max_paths],
        "reference_paths": (binding.get("reference_paths") or [])[:max_paths],
        "supplemental_source_locations": binding.get("supplemental_source_locations", []),
        "pinned_urls": [f"https://github.com/{repo}/blob/{pin}/{p}" for p in chosen] if pin else [],
        "applied_to_product": False, "executed": False,
    }


def cmd_init(arguments):
    target = Path(arguments.state_dir)
    repo = Path(arguments.repo).resolve()
    if not repo.is_dir():
        raise HarnessError("Repo directory does not exist.", "REPO_MISSING")
    with locked(target):
        if (target / "current.json").exists() or (target / "events.jsonl").exists():
            raise HarnessError("State already exists; init will not overwrite it.", "ALREADY_INITIALIZED")
        state = {
            "schema": STATE_SCHEMA, "sequence": 0, "project": arguments.project,
            "owner_track": arguments.track, "repo_root": str(repo),
            "next_atomic_action": arguments.next, "work_status": "READY",
            "allowed_scopes": sorted(set(arguments.allow_scope or [])),
            "holds": [{"scope": s, "reason": "Explicit deferred scope at initialization."}
                      for s in sorted(set(arguments.hold or []))],
            "approvals_note": arguments.approvals_note,
            "source_observation": git_snapshot(repo, target),
            "evidence": [], "active_action": None, "last_action": None,
            "selected_sources": [],
            "config": {key: str(Path(getattr(arguments, key)).resolve())
                       for key in ("catalog", "routes") if getattr(arguments, key, None)},
        }
        state = commit_state(target, state, "INITIALIZED")
    return {"status": "INITIALIZED", "sequence": state["sequence"], "allowed_scopes": state["allowed_scopes"],
            "holds": state["holds"], "safety": SAFETY}


def cmd_checkpoint(arguments):
    with locked(arguments.state_dir):
        state, info = read_state(arguments.state_dir)
        require_consistent(info)
        state["next_atomic_action"] = arguments.next
        if arguments.status:
            state["work_status"] = arguments.status
        if arguments.note:
            state["checkpoint_note"] = arguments.note
        state["source_observation"] = git_snapshot(state["repo_root"], arguments.state_dir)
        records = {(r["anchor"], r["relative_path"]): r for r in state.get("evidence", [])}
        for path in arguments.evidence or []:
            record = evidence_record(path, state, arguments.state_dir)
            records[(record["anchor"], record["relative_path"])] = record
        state["evidence"] = list(records.values())
        state = commit_state(arguments.state_dir, state, "CHECKPOINTED", info["last_event_sha256"])
    return {"status": "CHECKPOINTED", "sequence": state["sequence"],
            "head": state["source_observation"]["head"], "evidence_count": len(state["evidence"]),
            "next_atomic_action": state["next_atomic_action"], "holds": state["holds"], "safety": SAFETY}


def cmd_resume(arguments):
    with locked(arguments.state_dir):
        state, info = read_state(arguments.state_dir)
    actual = git_snapshot(arguments.repo or state["repo_root"], arguments.state_dir)
    baseline = state.get("source_observation", {})
    observed_state = dict(state, repo_root=arguments.repo or state["repo_root"])
    evidence = evidence_observations(observed_state, arguments.state_dir)
    action = action_observation(state.get("active_action"))
    return {
        "status": "RESUME_BRIEF", "project": state["project"], "owner_track": state["owner_track"],
        "sequence": state["sequence"], "work_status": state["work_status"],
        "allowed_scopes": state["allowed_scopes"], "holds": state["holds"],
        "approvals_note": state.get("approvals_note"),
        "next_atomic_action": state["next_atomic_action"],
        "recorded_head": baseline.get("head"), "actual_head": actual.get("head"),
        "head_changed": actual.get("head") != baseline.get("head"),
        "recorded_branch": baseline.get("branch"), "actual_branch": actual.get("branch"),
        "branch_changed": actual.get("branch") != baseline.get("branch"),
        "worktree_changed": actual.get("worktree_fingerprint") != baseline.get("worktree_fingerprint"),
        "worktree_fingerprint_complete": actual["worktree_fingerprint_complete"],
        "source_check_scope": actual["worktree_fingerprint_scope"],
        "git_repository_observed": actual["is_git_repository"],
        "dirty_entry_count": actual["dirty_entry_count"],
        "active_action": action, "checkpoint_integrity": info,
        "evidence": evidence, "selected_sources": state.get("selected_sources", [])[-8:],
        "ready_to_continue_without_reconciliation": (
            info["current_consistent"] and action["status"] == "IDLE"
            and actual.get("head") == baseline.get("head")
            and actual.get("branch") == baseline.get("branch")
            and actual.get("worktree_fingerprint") == baseline.get("worktree_fingerprint")
            and actual["worktree_fingerprint_complete"]
            and all(row["status"] == "MATCH" for row in evidence)),
        "scope_permission_still_required": True, "safety": SAFETY,
    }


def cmd_repair(arguments):
    with locked(arguments.state_dir):
        state, info = read_state(arguments.state_dir)
        if info["current_consistent"]:
            return {"status": "ALREADY_CONSISTENT", "safety": SAFETY}
        # read_state only reaches here if the entire journal hash chain is valid.
        atomic_json(Path(arguments.state_dir) / "current.json", envelope(state))
        state = commit_state(arguments.state_dir, state, "CURRENT_REPAIRED_FROM_VALID_JOURNAL",
                             info["last_event_sha256"])
    return {"status": "CURRENT_REPAIRED", "sequence": state["sequence"],
            "active_action": action_observation(state.get("active_action")), "safety": SAFETY}


def cmd_policy(arguments):
    with locked(arguments.state_dir):
        state, info = read_state(arguments.state_dir)
        require_consistent(info)
        if arguments.operation == "hold":
            state["holds"] = [h for h in state["holds"] if h["scope"] != arguments.scope]
            state["holds"].append({"scope": arguments.scope, "reason": arguments.reason})
        elif arguments.operation == "release-hold":
            state["holds"] = [h for h in state["holds"] if h["scope"] != arguments.scope]
        elif arguments.operation == "allow":
            state["allowed_scopes"] = sorted(set(state["allowed_scopes"] + [arguments.scope]))
        else:
            state["allowed_scopes"] = [s for s in state["allowed_scopes"] if s != arguments.scope]
        state["policy_change_note"] = arguments.reason
        state = commit_state(arguments.state_dir, state, "CALLER_RECORDED_POLICY_CHANGE",
                             info["last_event_sha256"])
    return {"status": "POLICY_RECORDED_NOT_PERMISSION_GRANTED", "allowed_scopes": state["allowed_scopes"],
            "holds": state["holds"], "safety": SAFETY}


def cmd_route(arguments):
    state, tasks, bindings, config = route_data(arguments)
    if arguments.list:
        return {"tasks": [{"task_id": t["task_id"], "label": t.get("label"), "mode": t.get("mode")}
                          for t in tasks], "safety": SAFETY}
    selected = next((t for t in tasks if t["task_id"] == arguments.task), None)
    if selected is None:
        raise HarnessError("Unknown task ID.", "TASK_NOT_FOUND",
                           {"available_tasks": [t["task_id"] for t in tasks]})
    task_hold = next((h for h in state.get("holds", []) if h["scope"] in ("*", arguments.task)), None)
    deferred = selected.get("mode") == "DEFERRED" or task_hold is not None
    result = {
        "task_id": arguments.task, "mode": selected.get("mode", "GUIDANCE_ONLY"),
        "selection_status": "DEFERRED" if deferred else "SOURCES_SELECTED_FOR_READING",
        "task_conditions": selected.get("conditions", []),
        "hold": task_hold, "policy": config.get("policy", {}),
        "sources": [], "selection_is_execution": False, "safety": SAFETY,
    }
    if deferred:
        return result
    keys = [("primary", k) for k in selected.get("primary", [])]
    supporting = selected.get("supporting", [])
    keys += [("supporting", k) for k in supporting[:arguments.supporting]]
    result["additional_supporting_available"] = max(0, len(supporting) - arguments.supporting)
    for role, key in keys:
        binding = bindings.get(key) or bindings.get(key.casefold()) or catalog_binding(key, arguments, state)
        if binding is None:
            raise HarnessError("Task points to a missing source binding.", "SOURCE_NOT_FOUND", {"key": key})
        result["sources"].append(binding_brief(key, binding, role, arguments.max_paths))
    if arguments.record:
        with locked(arguments.state_dir):
            current, info = read_state(arguments.state_dir)
            require_consistent(info)
            current["selected_sources"] = [
                {"task_id": arguments.task, "repository_key": row["repository_key"],
                 "pinned_commit": row["pinned_commit"], "entrypoints": row["entrypoints"],
                 "status": "SELECTED_NOT_READ_OR_APPLIED"}
                for row in result["sources"]]
            commit_state(arguments.state_dir, current, "SOURCES_SELECTED", info["last_event_sha256"])
    return result


def cmd_select(arguments):
    state, _, bindings, _ = route_data(arguments)
    key = arguments.repository.casefold()
    binding = bindings.get(key) or catalog_binding(key, arguments, state)
    if binding is None:
        raise HarnessError("Repository is absent from the configured sources.", "SOURCE_NOT_FOUND")
    return {"source": binding_brief(key, binding, "explicit_reference", arguments.max_paths),
            "selection_is_execution": False, "safety": SAFETY}


def safe_id(value):
    if not ID_RE.fullmatch(value):
        raise HarnessError("Action ID must be 1-96 safe letters, digits, dots, dashes or underscores.", "BAD_ACTION_ID")
    return value


def command_display(argv):
    """Do not persist obvious credential arguments. This is not a general DLP filter."""
    redacted, mask_next = [], False
    secret_flag = re.compile(r"(?i)(password|passwd|api[-_]?key|access[-_]?token|secret|authorization)")
    for part in argv:
        if mask_next:
            redacted.append("[REDACTED]")
            mask_next = False
        elif part.startswith("-") and secret_flag.search(part):
            if "=" in part:
                redacted.append(part.split("=", 1)[0] + "=[REDACTED]")
            else:
                redacted.append(part)
                mask_next = True
        else:
            redacted.append(part[:500])
    return redacted


def bounded_tail(path, characters):
    if characters <= 0:
        return ""
    with Path(path).open("rb") as stream:
        stream.seek(max(0, Path(path).stat().st_size - characters * 4))
        text = stream.read().decode("utf-8", "replace")
    return text[-characters:]


def receipt_brief(receipt, state_dir, excerpt_chars, cached=False):
    logs = receipt.get("logs", {})
    summary = {
        "status": receipt["status"], "action_id": receipt["action_id"], "scope": receipt["scope"],
        "exit_code": receipt.get("exit_code"), "cached_result": cached,
        "executed_this_invocation": not cached, "receipt": f"actions/{receipt['action_id']}.json",
        "logs": logs, "safety": SAFETY,
    }
    if excerpt_chars:
        summary["stdout_tail"] = bounded_tail(Path(state_dir) / logs["stdout"]["path"], excerpt_chars)
        summary["stderr_tail"] = bounded_tail(Path(state_dir) / logs["stderr"]["path"], excerpt_chars)
    return summary


def cmd_run(arguments):
    state_dir = Path(arguments.state_dir)
    action_id = safe_id(arguments.action_id)
    argv = list(arguments.command)
    if argv and argv[0] == "--":
        argv.pop(0)
    if not argv:
        raise HarnessError("Supply a command after --. No shell is implied.", "COMMAND_MISSING")
    receipt_path = state_dir / "actions" / f"{action_id}.json"
    argv_hash = digest(canonical(argv))
    with locked(state_dir):
        state, info = read_state(state_dir)
        require_consistent(info)
        reason = blocked_reason(state, arguments.scope)
        if reason:
            raise HarnessError(reason, "SCOPE_BLOCKED", {"scope": arguments.scope, "holds": state["holds"]})
        if receipt_path.exists():
            previous = json.loads(receipt_path.read_text())
            if previous["argv_sha256"] != argv_hash or previous["scope"] != arguments.scope:
                raise HarnessError("Action ID already belongs to a different command/scope.", "ACTION_ID_CONFLICT")
            if previous["status"] in ("SUCCEEDED", "FAILED", "START_FAILED", "RECONCILED"):
                result = receipt_brief(previous, state_dir, arguments.excerpt_chars, cached=True)
                result["_exit"] = 0 if previous.get("exit_code", 0) == 0 else 1
                return result
            raise HarnessError("Previous action has no verified terminal receipt; inspect resume first.",
                               "ACTION_RECOVERY_REQUIRED", action_observation(state.get("active_action")))
        if state.get("active_action"):
            raise HarnessError("Another action is active or needs reconciliation.", "ACTION_RECOVERY_REQUIRED",
                               action_observation(state["active_action"]))
        (state_dir / "actions").mkdir(exist_ok=True)
        (state_dir / "logs").mkdir(exist_ok=True)
        stdout_path = state_dir / "logs" / f"{action_id}.stdout.log"
        stderr_path = state_dir / "logs" / f"{action_id}.stderr.log"
        for path in (stdout_path, stderr_path):
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            os.close(fd)
        action = {
            "action_id": action_id, "scope": arguments.scope, "status": "PREPARED",
            "started_at_utc": utcnow(), "argv_redacted": command_display(argv),
            "argv_sha256": argv_hash, "cwd": str(Path(state["repo_root"]).resolve()),
            "wrapper": proc_identity(os.getpid()), "child": None,
            "logs": {"stdout": {"path": f"logs/{action_id}.stdout.log"},
                     "stderr": {"path": f"logs/{action_id}.stderr.log"}},
        }
        atomic_json(receipt_path, action)
        state["active_action"] = action
        commit_state(state_dir, state, "COMMAND_PREPARED", info["last_event_sha256"])
    started = time.monotonic()
    interrupted = False
    child = None
    with stdout_path.open("ab") as stdout, stderr_path.open("ab") as stderr:
        try:
            try:
                child = subprocess.Popen(argv, cwd=action["cwd"], stdin=subprocess.DEVNULL,
                                         stdout=stdout, stderr=stderr, shell=False,
                                         start_new_session=(os.name == "posix"))
            except OSError as error:
                returncode, status_value = 127, "START_FAILED"
                action["launch_error"] = str(error)[:500]
            else:
                # Failure after spawning must leave PREPARED/RUNNING unresolved.
                # It must never be labelled START_FAILED or authorize a replay.
                with locked(state_dir):
                    state, info = read_state(state_dir)
                    require_consistent(info)
                    action["child"] = proc_identity(child.pid)
                    action["status"] = "RUNNING"
                    atomic_json(receipt_path, action)
                    state["active_action"] = action
                    commit_state(state_dir, state, "COMMAND_STARTED", info["last_event_sha256"])
                returncode = child.wait()
                status_value = "SUCCEEDED" if returncode == 0 else "FAILED"
        except KeyboardInterrupt:
            interrupted = True
            if child is not None:
                child.terminate()
                try:
                    child.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
            returncode, status_value = 130, "INTERRUPTED_NEEDS_RECONCILIATION"
        stdout.flush()
        stderr.flush()
        os.fsync(stdout.fileno())
        os.fsync(stderr.fileno())
    action.update({"status": status_value, "finished_at_utc": utcnow(),
                   "duration_seconds": round(time.monotonic() - started, 3), "exit_code": returncode})
    for stream_name, path in (("stdout", stdout_path), ("stderr", stderr_path)):
        action["logs"][stream_name].update({"bytes": path.stat().st_size, "sha256": file_hash(path)})
    with locked(state_dir):
        state, info = read_state(state_dir)
        require_consistent(info)
        atomic_json(receipt_path, action)
        state["last_action"] = {"action_id": action_id, "scope": arguments.scope, "status": status_value,
                                "receipt_sha256": file_hash(receipt_path)}
        state["active_action"] = action if interrupted else None
        commit_state(state_dir, state, "COMMAND_FINISHED", info["last_event_sha256"])
    result = receipt_brief(action, state_dir, arguments.excerpt_chars)
    result["_exit"] = 0 if returncode == 0 else (returncode if 1 <= returncode <= 125 else 1)
    return result


def cmd_reconcile(arguments):
    if not arguments.external_state_checked:
        raise HarnessError("Inspect actual process/external result and explicitly record that check.",
                           "EXTERNAL_STATE_CHECK_REQUIRED")
    with locked(arguments.state_dir):
        state, info = read_state(arguments.state_dir)
        require_consistent(info)
        action = state.get("active_action")
        if not action or action["action_id"] != arguments.action_id:
            raise HarnessError("No matching active action.", "ACTION_NOT_FOUND")
        observation = action_observation(action)
        if observation["status"] != "UNKNOWN_RECOVERY_REQUIRED":
            raise HarnessError("A recorded process may still be running.", "PROCESS_STILL_RUNNING", observation)
        evidence = [evidence_record(p, state, arguments.state_dir) for p in arguments.evidence]
        action.update({"status": "RECONCILED", "reconciled_at_utc": utcnow(),
                       "caller_reported_outcome": arguments.outcome, "reconciliation_note": arguments.note,
                       "reconciliation_evidence": evidence, "external_state_checked_by_caller": True,
                       "exit_code": 0 if arguments.outcome == "succeeded" else 1})
        atomic_json(Path(arguments.state_dir) / "actions" / f"{safe_id(arguments.action_id)}.json", action)
        state["last_action"] = {"action_id": arguments.action_id, "status": "RECONCILED",
                                "caller_reported_outcome": arguments.outcome}
        state["active_action"] = None
        state["evidence"].extend(evidence)
        state = commit_state(arguments.state_dir, state, "CALLER_RECONCILED_ACTION", info["last_event_sha256"])
    return {"status": "RECONCILED", "outcome": arguments.outcome, "sequence": state["sequence"],
            "automatic_reexecution": False, "safety": SAFETY}


def index_connection(state_dir):
    path = Path(state_dir) / "search.sqlite"
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("""CREATE TABLE IF NOT EXISTS documents
               (doc_id TEXT PRIMARY KEY, path TEXT UNIQUE, sha256 TEXT, size INTEGER,
                mtime_ns INTEGER, indexed_at TEXT, chunk_count INTEGER)""")
    try:
        db.execute("""CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5
                   (text, doc_id UNINDEXED, line_start UNINDEXED, line_end UNINDEXED, tokenize='unicode61')""")
    except sqlite3.OperationalError:
        db.close()
        raise HarnessError("This Python build needs SQLite FTS5.", "FTS5_UNAVAILABLE")
    return db


def text_chunks(path, max_chars=3000):
    buffer, start, last, length = [], 1, 1, 0
    with path.open("r", encoding="utf-8", errors="replace") as stream:
        for number, line in enumerate(stream, 1):
            for offset in range(0, max(1, len(line)), max_chars):
                piece = line[offset:offset + max_chars]
                if buffer and length + len(piece) > max_chars:
                    yield start, last, "".join(buffer)
                    buffer, length = [], 0
                if not buffer:
                    start = number
                buffer.append(piece)
                last, length = number, length + len(piece)
    if buffer:
        yield start, last, "".join(buffer)


def cmd_index(arguments):
    with index_connection(arguments.state_dir) as db:
        if arguments.operation == "stats":
            return {"documents": db.execute("SELECT count(*) FROM documents").fetchone()[0],
                    "chunks": db.execute("SELECT count(*) FROM chunks").fetchone()[0],
                    "index_bytes": (Path(arguments.state_dir) / "search.sqlite").stat().st_size,
                    "network_upload": False, "safety": SAFETY}
        results = []
        for requested in arguments.paths:
            path = explicit_file(requested)
            if path.stat().st_size > arguments.max_file_bytes:
                raise HarnessError("Input exceeds the explicit indexing size bound.", "INDEX_FILE_TOO_LARGE")
            with path.open("rb") as stream:
                if b"\0" in stream.read(4096):
                    raise HarnessError("Binary input is not indexed.", "BINARY_INPUT")
            sha, metadata = file_hash(path), path.stat()
            doc_id = digest(str(path).encode())[:24]
            existing = db.execute("SELECT sha256,chunk_count FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
            if existing and existing[0] == sha:
                results.append({"doc_id": doc_id, "status": "UNCHANGED", "chunks": existing[1]})
                continue
            db.execute("DELETE FROM chunks WHERE doc_id=?", (doc_id,))
            count = 0
            for line_start, line_end, body in text_chunks(path):
                db.execute("INSERT INTO chunks(text,doc_id,line_start,line_end) VALUES(?,?,?,?)",
                           (body, doc_id, line_start, line_end))
                count += 1
            # Detect a changing file; don't pair a stale digest with different indexed bytes.
            if file_hash(path) != sha:
                raise HarnessError("Input changed while indexing; retry only after the writer finishes.",
                                   "SOURCE_CHANGED_DURING_INDEX")
            db.execute("INSERT OR REPLACE INTO documents VALUES(?,?,?,?,?,?,?)",
                       (doc_id, str(path), sha, metadata.st_size, metadata.st_mtime_ns, utcnow(), count))
            results.append({"doc_id": doc_id, "status": "INDEXED", "chunks": count, "source_sha256": sha})
        return {"files": results, "original_files_modified": False, "safety": SAFETY}


def cmd_search(arguments):
    terms = re.findall(r"\w+", arguments.query, flags=re.UNICODE)
    if not terms:
        raise HarnessError("Search needs at least one word.", "EMPTY_QUERY")
    expression = " AND ".join('"' + word.replace('"', '""') + '"*' for word in terms[:20])
    with index_connection(arguments.state_dir) as db:
        rows = db.execute("""SELECT chunks.rowid,chunks.doc_id,chunks.line_start,chunks.line_end,
                            snippet(chunks,0,'[',']',' … ',48),documents.path,documents.sha256,
                            documents.size,documents.mtime_ns
                            FROM chunks JOIN documents ON documents.doc_id=chunks.doc_id
                            WHERE chunks MATCH ? ORDER BY bm25(chunks) LIMIT ?""",
                          (expression, arguments.limit + 1)).fetchall()
    result = {"query": arguments.query[:200], "results": [], "more_matches": len(rows) > arguments.limit,
              "output_truncated": False, "max_output_chars": arguments.max_output_chars,
              "source_verification": "Indexed SHA is a snapshot; freshness check below compares file metadata.",
              "safety": SAFETY}
    for row in rows[:arguments.limit]:
        _, doc_id, start, end, snippet, path, sha, size, mtime_ns = row
        try:
            current = Path(path).stat()
            freshness = "METADATA_UNCHANGED" if (current.st_size, current.st_mtime_ns) == (size, mtime_ns) else "SOURCE_CHANGED"
        except OSError:
            freshness = "SOURCE_MISSING"
        candidate = {"doc_id": doc_id, "source_path": path, "line_start": int(start), "line_end": int(end),
                     "indexed_sha256": sha, "freshness": freshness, "excerpt": snippet[:arguments.excerpt_chars]}
        remaining = arguments.max_output_chars - len(json.dumps(result, ensure_ascii=False, indent=2)) - 101
        if remaining < 250:
            result["output_truncated"] = True
            break
        if len(json.dumps(candidate, ensure_ascii=False, indent=2)) > remaining:
            candidate["excerpt"] = candidate["excerpt"][:max(0, remaining - 400)]
        result["results"].append(candidate)
        if len(json.dumps(result, ensure_ascii=False, indent=2)) + 1 > arguments.max_output_chars:
            result["results"].pop()
            result["output_truncated"] = True
            break
    return result


def safe_member(name):
    path = PurePosixPath(name)
    if (path.is_absolute() or ".." in path.parts or "\\" in name or not path.parts
            or ":" in path.parts[0] or name.startswith("/")):
        raise HarnessError("Unsafe ZIP member.", "UNSAFE_ARCHIVE", {"member": name[:200]})
    return path


def cmd_export(arguments):
    output = Path(arguments.output).resolve()
    state_dir = Path(arguments.state_dir).resolve()
    if output == state_dir or state_dir in output.parents:
        raise HarnessError("Export ZIP must be outside its state directory.", "BAD_EXPORT_DESTINATION")
    with locked(state_dir):
        state, info = read_state(state_dir)
        require_consistent(info)
        observation = action_observation(state.get("active_action"))
        if observation["status"] not in ("IDLE", "UNKNOWN_RECOVERY_REQUIRED"):
            raise HarnessError("A process is still writing; export after it stops.", "PROCESS_STILL_RUNNING", observation)
        files = {
            "state/current.json": state_dir / "current.json",
            "state/events.jsonl": state_dir / "events.jsonl",
        }
        for action_id in arguments.include_action or []:
            action_id = safe_id(action_id)
            for relative in (f"actions/{action_id}.json", f"logs/{action_id}.stdout.log", f"logs/{action_id}.stderr.log"):
                files["state/" + relative] = explicit_file(state_dir / relative)
        for supplied in arguments.evidence or []:
            record = evidence_record(supplied, state, state_dir)
            files[f"evidence/{record['anchor']}/{record['relative_path']}"] = explicit_file(supplied)
        if arguments.include_config:
            for name in ("catalog", "routes"):
                if state.get("config", {}).get(name):
                    files[f"config/{name}.json"] = explicit_file(state["config"][name])
        if sum(p.stat().st_size for p in files.values()) > arguments.max_bytes:
            raise HarnessError("Selected export exceeds the byte bound.", "EXPORT_TOO_LARGE")
        output.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix=".harness-export.", suffix=".zip", dir=output.parent)
        os.close(fd)
        manifest = {"schema": "order.harness.export/v1", "created_at_utc": utcnow(),
                    "project": state["project"], "sequence": state["sequence"], "files": [],
                    "scope": "Explicit state, action logs, evidence and optional routing config only.",
                    "automatic_durable_upload": False}
        try:
            with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
                for member, path in files.items():
                    safe_member(member)
                    path = explicit_file(path)
                    data = path.read_bytes()
                    if len(data) > arguments.max_bytes:
                        raise HarnessError("Selected file grew beyond export bound.", "EXPORT_TOO_LARGE")
                    archive.writestr(member, data)
                    manifest["files"].append({"path": member, "bytes": len(data), "sha256": digest(data)})
                if sum(x["bytes"] for x in manifest["files"]) > arguments.max_bytes:
                    raise HarnessError("Selected export grew beyond byte bound.", "EXPORT_TOO_LARGE")
                archive.writestr("MANIFEST.json", canonical(manifest))
            with open(temporary, "rb") as durable:
                os.fsync(durable.fileno())
            os.replace(temporary, output)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return {"status": "EXPORTED_LOCAL_SNAPSHOT", "path": str(output), "bytes": output.stat().st_size,
            "sha256": file_hash(output), "files": len(manifest["files"]),
            "next_step": "Persist this ZIP and its hash in the approved durable host before discarding the workspace.",
            "safety": SAFETY}


def cmd_restore(arguments):
    target = Path(arguments.state_dir).resolve()
    if target.exists():
        raise HarnessError("Restore destination must not exist; original state is never overwritten.", "RESTORE_DESTINATION_EXISTS")
    source = explicit_file(arguments.archive)
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".harness-restore.", dir=target.parent))
    try:
        with zipfile.ZipFile(source) as archive:
            names = archive.namelist()
            if len(names) != len(set(names)):
                raise HarnessError("Duplicate ZIP members.", "UNSAFE_ARCHIVE")
            for entry in archive.infolist():
                safe_member(entry.filename)
                if stat.S_ISLNK(entry.external_attr >> 16) or entry.is_dir():
                    raise HarnessError("Only explicit regular ZIP files are allowed.", "UNSAFE_ARCHIVE")
            try:
                if archive.getinfo("MANIFEST.json").file_size > 2_000_000:
                    raise HarnessError("Export manifest exceeds its size bound.", "UNSAFE_ARCHIVE")
                manifest = json.loads(archive.read("MANIFEST.json"))
            except (KeyError, ValueError):
                raise HarnessError("Export manifest is missing or malformed.", "UNSAFE_ARCHIVE")
            if manifest.get("schema") != "order.harness.export/v1":
                raise HarnessError("Unsupported export schema.", "UNSAFE_ARCHIVE")
            records = manifest.get("files", [])
            if len({x["path"] for x in records}) != len(records):
                raise HarnessError("Duplicate manifest paths.", "UNSAFE_ARCHIVE")
            if set(names) != {x["path"] for x in records} | {"MANIFEST.json"}:
                raise HarnessError("ZIP and manifest member sets differ.", "UNSAFE_ARCHIVE")
            if sum(x["bytes"] for x in records) > arguments.max_bytes:
                raise HarnessError("Export is over the restore byte bound.", "UNSAFE_ARCHIVE")
            for record in records:
                member = safe_member(record["path"])
                if member.parts[0] not in {"state", "evidence", "config"} or len(member.parts) < 2:
                    raise HarnessError("Unsupported archive namespace.", "UNSAFE_ARCHIVE")
                if sensitive_path(member):
                    raise HarnessError("Secret-named archive member is excluded.", "UNSAFE_ARCHIVE")
                info = archive.getinfo(record["path"])
                if info.file_size != record["bytes"] or info.file_size > arguments.max_bytes:
                    raise HarnessError("Declared file size mismatch.", "UNSAFE_ARCHIVE")
                data = archive.read(record["path"])
                if len(data) != record["bytes"] or digest(data) != record["sha256"]:
                    raise HarnessError("Restored file checksum mismatch.", "UNSAFE_ARCHIVE")
                destination = staging.joinpath(*member.parts)
                atomic_bytes(destination, data)
        extracted = staging / "state"
        state, info = read_state(extracted)
        require_consistent(info)
        if (staging / "evidence").exists():
            shutil.move(str(staging / "evidence"), str(extracted / "restored_evidence"))
        if (staging / "config").exists():
            shutil.move(str(staging / "config"), str(extracted / "restored_config"))
            for name in ("catalog", "routes"):
                if (extracted / "restored_config" / f"{name}.json").is_file():
                    state["config"][name] = str(target / "restored_config" / f"{name}.json")
        state["restored_from"] = {"archive_sha256": file_hash(source), "at_utc": utcnow(),
                                  "previous_repo_root": state["repo_root"]}
        if arguments.repo:
            replacement = Path(arguments.repo).resolve()
            if not replacement.is_dir():
                raise HarnessError("Replacement repo directory does not exist.", "REPO_MISSING")
            state["repo_root"] = str(replacement)
        commit_state(extracted, state, "RESTORED_WITHOUT_APPLYING_EVIDENCE", info["last_event_sha256"])
        os.replace(extracted, target)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    return {"status": "RESTORED_STATE_ONLY", "state_dir": str(target),
            "evidence_applied_to_worktree": False, "commands_executed": 0,
            "next_step": "Run resume; reconcile head/evidence/unknown actions before any further command.",
            "safety": SAFETY}


def positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return number


def parser():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--state-dir", default=".order-harness", help="One state directory per work track.")
    p.add_argument("--version", action="version", version=VERSION)
    commands = p.add_subparsers(dest="subcommand", required=True)
    init = commands.add_parser("init")
    init.add_argument("--project", required=True)
    init.add_argument("--track", required=True)
    init.add_argument("--repo", required=True)
    init.add_argument("--next", required=True)
    init.add_argument("--allow-scope", action="append")
    init.add_argument("--hold", action="append")
    init.add_argument("--approvals-note", default="No approval is granted by this checkpoint.")
    init.add_argument("--catalog")
    init.add_argument("--routes")
    init.set_defaults(handler=cmd_init)
    checkpoint = commands.add_parser("checkpoint")
    checkpoint.add_argument("--next", required=True)
    checkpoint.add_argument("--status")
    checkpoint.add_argument("--note")
    checkpoint.add_argument("--evidence", action="append")
    checkpoint.set_defaults(handler=cmd_checkpoint)
    resume = commands.add_parser("resume")
    resume.add_argument("--repo", help="Read-only observation override; does not rewrite source baseline.")
    resume.set_defaults(handler=cmd_resume)
    repair = commands.add_parser("repair-current")
    repair.set_defaults(handler=cmd_repair)
    policy = commands.add_parser("policy")
    policy.add_argument("operation", choices=["hold", "release-hold", "allow", "disallow"])
    policy.add_argument("--scope", required=True)
    policy.add_argument("--reason", required=True, help="Record the actual upstream instruction; this is not an approval.")
    policy.set_defaults(handler=cmd_policy)
    for name, handler in (("route", cmd_route), ("select", cmd_select)):
        q = commands.add_parser(name)
        q.add_argument("--routes")
        q.add_argument("--catalog")
        q.add_argument("--max-paths", type=positive_int, default=3)
        if name == "route":
            q.add_argument("--task")
            q.add_argument("--list", action="store_true")
            q.add_argument("--supporting", type=int, default=2)
            q.add_argument("--record", action="store_true")
        else:
            q.add_argument("--repository", required=True)
        q.set_defaults(handler=handler)
    run = commands.add_parser("run")
    run.add_argument("--action-id", required=True, help="Stable idempotency key; reuse returns an existing terminal receipt.")
    run.add_argument("--scope", required=True)
    run.add_argument("--excerpt-chars", type=int, default=0, help="Opt in to small stdout/stderr tails; default prints metadata only.")
    run.add_argument("command", nargs=argparse.REMAINDER)
    run.set_defaults(handler=cmd_run)
    reconcile = commands.add_parser("reconcile")
    reconcile.add_argument("--action-id", required=True)
    reconcile.add_argument("--outcome", required=True, choices=["succeeded", "failed", "abandoned"])
    reconcile.add_argument("--note", required=True)
    reconcile.add_argument("--external-state-checked", action="store_true")
    reconcile.add_argument("--evidence", action="append", required=True)
    reconcile.set_defaults(handler=cmd_reconcile)
    index = commands.add_parser("index")
    index.add_argument("operation", choices=["add", "stats"])
    index.add_argument("paths", nargs="*")
    index.add_argument("--max-file-bytes", type=positive_int, default=100_000_000)
    index.set_defaults(handler=cmd_index)
    search = commands.add_parser("search")
    search.add_argument("query")
    search.add_argument("--limit", type=positive_int, default=5)
    search.add_argument("--excerpt-chars", type=positive_int, default=500)
    search.add_argument("--max-output-chars", type=positive_int, default=6000)
    search.set_defaults(handler=cmd_search)
    export = commands.add_parser("export")
    export.add_argument("--output", required=True)
    export.add_argument("--include-action", action="append")
    export.add_argument("--evidence", action="append")
    export.add_argument("--include-config", action="store_true")
    export.add_argument("--max-bytes", type=positive_int, default=DEFAULT_EXPORT_BYTES)
    export.set_defaults(handler=cmd_export)
    restore = commands.add_parser("restore")
    restore.add_argument("--archive", required=True)
    restore.add_argument("--repo", required=True, help="Explicit current project root; never trust an archived absolute root.")
    restore.add_argument("--max-bytes", type=positive_int, default=DEFAULT_EXPORT_BYTES)
    restore.set_defaults(handler=cmd_restore)
    return p


def main(argv=None):
    arguments = parser().parse_args(argv)
    arguments.state_dir = str(Path(arguments.state_dir).resolve())
    # Bound model-visible optional detail, never truncate authority/recovery flags.
    for name, lower, upper in (("excerpt_chars", 0, 2000), ("max_paths", 1, 20),
                               ("supporting", 0, 20), ("limit", 1, 20),
                               ("max_output_chars", 1000, 20000)):
        if hasattr(arguments, name) and not lower <= getattr(arguments, name) <= upper:
            parser().error(f"--{name.replace('_','-')} must be between {lower} and {upper}")
    try:
        result = arguments.handler(arguments)
        exit_code = result.pop("_exit", 0)
        emit(result)
        return exit_code
    except HarnessError as error:
        emit({"error": error.code, "message": str(error), "details": error.details, "safety": SAFETY})
        return 2
    except (OSError, ValueError, KeyError, TypeError, sqlite3.Error, zipfile.BadZipFile) as error:
        emit({"error": "INPUT_OR_RUNTIME_ERROR", "message": str(error)[:500], "safety": SAFETY})
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
