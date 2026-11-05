import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAndCheckpoint } from '../codex-bridge.js';

function fixture(overrides = {}) {
  let intent; const calls = [];
  const envelope = { sha256: 'a'.repeat(64), bytes: 123,
    target_folder_id: '12c3k0H1C-PUaLqcMakRBlxComO8zvEB2', target_current_id: '1p6b303fVYmHH7ekyyVaJE7zK-iaDq8D7',
    required_action_receipt: { action_id: 'fixture-unit', sha256: 'c'.repeat(64), exit_code: 0 } };
  const hooks = {
    loadIntent: async () => intent,
    saveIntent: async (_id, value) => { intent = structuredClone(value); calls.push(value.phase); },
    run: async () => { calls.push('run'); return { status: 'SUCCEEDED', exit_code: 0, receipt_sha256: 'c'.repeat(64) }; },
    prepareExport: async (_id, command) => ({ ...envelope, required_action_receipt: { ...envelope.required_action_receipt, exit_code: command.exit_code } }),
    verifyTargets: async () => ({ verified: true }),
    findUploaded: async () => null,
    upload: async () => { calls.push('upload'); return { id: 'remote-fixture' }; },
    readback: async () => ({ path: '/fixture' }),
    verifyDurable: async () => ({ status: 'DURABLE_READBACK_VERIFIED', sha256: envelope.sha256, bytes: envelope.bytes, file_id: 'remote-fixture' }),
    ...overrides,
  };
  return { hooks, calls, invoke: () => runAndCheckpoint({ actionId: 'fixture-unit', hooks }) };
}

test('one pipeline verifies durable result and never replays a completed unit', async () => {
  const f = fixture();
  assert.equal((await f.invoke()).status, 'COMMAND_AND_DURABLE_VERIFIED');
  assert.equal((await f.invoke()).reusedHistoricalCheckpoint, true);
  assert.equal(f.calls.filter(x => x === 'run').length, 1);
  assert.equal(f.calls.filter(x => x === 'upload').length, 1);
  assert.ok(f.calls.indexOf('UPLOAD_INTENT') < f.calls.indexOf('upload'));
});
test('unknown upload is reconciled by read only lookup, never automatically uploaded twice', async () => {
  let uploads = 0;
  const f = fixture({ upload: async () => { uploads++; throw new Error('connection closed after write'); } });
  await assert.rejects(f.invoke(), /UPLOAD_UNKNOWN_RECONCILE/);
  await assert.rejects(f.invoke(), /UNKNOWN_UPLOAD_REQUIRES_REVIEW_NO_REUPLOAD/);
  f.hooks.findUploaded = async () => ({ id: 'remote-fixture' });
  assert.equal((await f.invoke()).status, 'COMMAND_AND_DURABLE_VERIFIED');
  assert.equal(uploads, 1);
  assert.equal(f.calls.filter(x => x === 'run').length, 1);
});
test('command failure is preserved and durable mismatch cannot be labelled success', async () => {
  const f = fixture({ run: async () => ({ status: 'FAILED', exit_code: 1, receipt_sha256: 'c'.repeat(64) }) });
  assert.equal((await f.invoke()).status, 'COMMAND_FAILED_DURABLE_VERIFIED');
  const broken = fixture({ verifyDurable: async () => ({ status: 'DURABLE_READBACK_VERIFIED', sha256: 'b'.repeat(64) }) });
  await assert.rejects(broken.invoke(), /DURABLE_READBACK_NOT_VERIFIED/);
  assert.ok(!broken.calls.includes('VERIFIED'));
});
test('unknown commands and unverified target stop before a remote write', async () => {
  const unknown = fixture({ run: async () => ({ status: 'RUNNING' }) });
  await assert.rejects(unknown.invoke(), /COMMAND_RESULT_UNKNOWN/);
  const target = fixture({ verifyTargets: async () => ({ verified: false }) });
  await assert.rejects(target.invoke(), /DURABLE_TARGET_NOT_VERIFIED/);
  assert.ok(!target.calls.includes('upload'));
});
test('a rolled back persisted receipt prevents any upload', async () => {
  const f = fixture();
  const prepare = f.hooks.prepareExport;
  f.hooks.prepareExport = async (...args) => ({ ...await prepare(...args), required_action_receipt: null });
  await assert.rejects(f.invoke(), /TERMINAL_RECEIPT_PERSISTENCE_NOT_VERIFIED/);
  assert.ok(!f.calls.includes('upload'));
});
