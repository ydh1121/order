import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runAndCheckpoint } from '../codex-bridge.js';
import { runCodexDriveCheckpoint } from '../codex-drive-hooks.js';

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

function localBindingFixture(t, fileCount) {
  const base = mkdtempSync(join(tmpdir(), 'order-codex-binding-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const repo = join(base, 'repo'), area = join(base, 'state'), toolDir = join(repo, 'tools/order_harness');
  mkdirSync(toolDir, { recursive: true }); mkdirSync(area);
  copyFileSync(new URL('../codex-bridge.js', import.meta.url), join(toolDir, 'codex-bridge.js'));
  // Only the host command is a fixture. The binding's Python read/write/projection commands really run.
  writeFileSync(join(toolDir, 'host.py'), `import json,pathlib,sys
root=pathlib.Path(__file__).parents[2]
args=sys.argv
if 'run' in args:
 p=root/'run-count';p.write_text(str(int(p.read_text())+1) if p.exists() else '1')
 print(json.dumps({'status':'SUCCEEDED','exit_code':0,'receipt_sha256':'c'*64,'fixture_note':'한글\\nsecond line'}))
else:
 out=pathlib.Path(args[args.index('--output')+1]);action=args[args.index('--require-action')+1]
 envelope={'schema':'order.harness.host/v1','status':'DURABLE_UPLOAD_PENDING','path':str(out),'sha256':'a'*64,'bytes':123,'source_head':'fixture-head','target_folder_id':'12c3k0H1C-PUaLqcMakRBlxComO8zvEB2','target_current_id':'1p6b303fVYmHH7ekyyVaJE7zK-iaDq8D7','required_action_receipt':{'action_id':action,'sha256':'c'*64,'status':'SUCCEEDED','exit_code':0},'files':[{'path':'evidence/repo/test/fixture-'+str(i)+'.mjs','sha256':'b'*64,'bytes':900} for i in range(${fileCount})],'source_allowlist':['test/fixture-'+str(i)+'.mjs' for i in range(${fileCount})]}
 out.with_suffix('.envelope.json').write_text(json.dumps(envelope,indent=2))
 print(json.dumps({'status':'DURABLE_UPLOAD_PENDING','path':str(out),'sha256':'a'*64,'bytes':123}))
`);
  const outputs = [], budgets = [];
  const tools = {
    exec_command: async ({ cmd, workdir, max_output_tokens }) => {
      const result = spawnSync('bash', ['-c', cmd], { cwd: workdir, encoding: 'utf8', maxBuffer: 4_000_000 });
      if (result.error) throw result.error;
      const output = result.stdout + result.stderr;
      budgets.push(max_output_tokens); outputs.push(output.length);
      return { exit_code: result.status, output: output.length > max_output_tokens * 4
        ? 'Warning: truncated output\n' + output.slice(0, max_output_tokens * 4) : output };
    },
    // Stop before any remote write. No actual connector is injected into this test.
    mcp__codex_apps__google_drive_get_file_metadata: async () => { throw new Error('FIXTURE_METADATA_STOP'); },
  };
  const actionId = 'binding-fixture';
  const config = { base, repo, area, state: area, actionId, allowlist: join(area, 'allowlist.json') };
  return { invoke: () => runCodexDriveCheckpoint({ tools, config }), repo, area, actionId, outputs, budgets };
}

test('actual binding keeps a large manifest on disk and sends only small envelope metadata', async t => {
  const f = localBindingFixture(t, 2000);
  await assert.rejects(f.invoke(), /TARGET_METADATA_READ_FAILED/);
  const full = readFileSync(join(f.area, f.actionId + '.envelope.json'), 'utf8');
  assert.ok(full.length > 300_000);
  assert.equal(JSON.parse(full).files.length, 2000);
  const intent = JSON.parse(readFileSync(join(f.area, 'bridge-intents', f.actionId + '.json'), 'utf8'));
  assert.equal(intent.phase, 'EXPORT_READY');
  assert.equal(intent.envelope.files, undefined);
  assert.equal(intent.envelope.source_allowlist, undefined);
  assert.equal(intent.envelope.required_action_receipt.action_id, f.actionId);
  assert.ok(JSON.stringify(intent.envelope).length < 2000);
  assert.ok(f.outputs.every(size => size < 16_000));
  assert.ok(f.budgets.every(budget => budget === 4000));
});

test('actual binding writes valid JSON and resumes it without rerunning the command', async t => {
  const f = localBindingFixture(t, 1);
  await assert.rejects(f.invoke(), /TARGET_METADATA_READ_FAILED/);
  const path = join(f.area, 'bridge-intents', f.actionId + '.json');
  const text = readFileSync(path, 'utf8');
  assert.equal(text.at(-1), '\n');
  assert.equal(JSON.parse(text).command.fixture_note, '한글\nsecond line');
  await assert.rejects(f.invoke(), /TARGET_METADATA_READ_FAILED/);
  assert.equal(readFileSync(join(f.repo, 'run-count'), 'utf8'), '1');
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).phase, 'EXPORT_READY');
});
