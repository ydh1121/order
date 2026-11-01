import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {webcrypto} from 'node:crypto';
import {validMonthlyQuantity,convertMonthlyUnit} from '../../web/quantity-contract.mjs';
import {inspectMonthlyAllocations,inspectOnceAllocations} from '../../web/allocation-ui.mjs';
import {createBrowserStorage,projectStoredPayload} from '../../web/storage.mjs';

// Execute the production gate functions, extracted by AST, without booting a DOM.
// Contact/address/date checks are deliberately out of scope and supplied as valid.
// These are synthetic restored-state tests, not browser/OS or online evidence.
const common = await readFile(new URL('../../web/common-ui.mjs', import.meta.url), 'utf8');
const app = await readFile(new URL('../../web/app.mjs', import.meta.url), 'utf8');
const commonAst = parse(common, {ecmaVersion: 'latest', sourceType: 'module'});
const appAst = parse(app, {ecmaVersion: 'latest', sourceType: 'module'});
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    for (const child of Array.isArray(value) ? value : [value]) {
      const found = find(child, predicate); if (found) return found;
    }
  }
  return null;
}
const declaration = find(commonAst, node => node.type === 'VariableDeclaration' && node.declarations.some(row => row.id.name === 'CODE1_ORDER_VALIDATION'));
assert.ok(declaration, 'Production common validation declaration exists');
const functions = ['q4ReviewIssue', 'q4ReviewAllocationIssues', 'monthlyIssues', 'q4ReviewVerdict'].map(name => {
  const node = find(appAst, node => node.type === 'FunctionDeclaration' && node.id.name === name);
  assert.ok(node, `Production ${name} exists`); return app.slice(node.start, node.end);
});
const gate = vm.runInNewContext(common.slice(declaration.start, declaration.end) + '\n' + functions.join('\n') + '\nq4ReviewVerdict', {
  validMonthlyQuantity, inspectMonthlyAllocations, inspectOnceAllocations,
  window: {OrderDatePolicy: {validate: () => ({valid: true})}}, OrderSiteContract: {issues: () => []}
});
function restored(mode = 'ONCE') {
  return {lines: [{id: 'L', housing: '1', size: '대란', pack: '30', qty: '200', qtyUnit: 'each', price: '6600'}],
    locations: [{id: 'A', name: 'A'}, {id: 'B', name: 'B'}],
    allocations: ['A', 'B'].map(id => ({id, lineId: 'L', locationId: id, mode, modeExplicit: true,
      qty: '4', oneTimeDeliveryQty: '4', monthlyDemandQty: '100', monthlyDemandUnit: 'each',
      advanced: {contactChannels: ['phone'], flexOrderProcess: 'store'}}))};
}

test('restored legacy ONCE gate compares 4+4 trays with 200 each and binds confirmation to exact input', () => {
  const state = restored();
  let verdict = gate(state);
  assert.equal(verdict.fieldErrors.length, 0);
  assert.equal(verdict.resultStatus, 'NEED_CONFIRMATION');
  assert.equal(verdict.confirmations.length, 1);
  assert.equal(verdict.confirmations[0].total, '240');
  assert.equal(verdict.confirmations[0].monthly, '200');
  assert.equal(verdict.confirmations[0].baseUnit, 'each');
  state.allocations.forEach(a => { a.onceConfirmedFingerprint = 'L|200|A:4|B:4'; });
  assert.equal(gate(state).confirmations.length, 1, 'Legacy raw-number signature cannot approve different units');
  const fingerprint = verdict.confirmations[0].fingerprint;
  state.allocations.forEach(a => { a.onceConfirmedFingerprint = fingerprint; });
  assert.equal(gate(state).confirmations.length, 0);
  state.allocations[0].oneTimeDeliveryQty = '5';
  verdict = gate(state);
  assert.equal(verdict.confirmations.length, 1);
  assert.notEqual(verdict.confirmations[0].fingerprint, fingerprint);
  assert.equal(verdict.confirmations[0].total, '270');
});

test('restored unknown unit and unreviewed rational metadata block the same Q2/final gate', () => {
  for (const patch of [{qtyUnit: 'bogus'}, {qty: '20/3', qtyUnit: 'tray', qtyExact: {representation: 'rational', numerator: '20', denominator: '3'}}]) {
    const state = restored(); Object.assign(state.lines[0], patch);
    const verdict = gate(state);
    assert.equal(verdict.valid, false);
    assert.ok(verdict.fieldErrors.some(issue => issue.stage === 'q2' && issue.fieldKey === 'qty'));
  }
  const state = restored(); state.lines[0] = convertMonthlyUnit(state.lines[0], 'tray');
  const verdict = gate(state);
  assert.equal(verdict.fieldErrors.some(issue => issue.stage === 'q2'), false);
  assert.equal(verdict.confirmations[0].monthly, '200');
  assert.equal(verdict.confirmations[0].total, '240');
});

test('legacy monthly rows cannot pass by equal raw numbers with unequal units or missing single-site allocation', () => {
  const state = restored('FLEX');
  assert.equal(gate(state).valid, true, '100+100 each equals 200 each');
  state.allocations.forEach(a => { a.monthlyDemandUnit = 'tray'; });
  let verdict = gate(state);
  assert.equal(verdict.valid, false);
  assert.ok(verdict.fieldErrors.some(issue => issue.code === 'MONTHLY_ALLOCATION_EXCEEDED'));
  state.allocations = [state.allocations[0]];
  delete state.allocations[0].monthlyDemandQty;
  verdict = gate(state);
  assert.equal(verdict.valid, false);
  assert.ok(verdict.fieldErrors.some(issue => issue.fieldKey === 'monthly'));
});

const q4Source = await readFile(new URL('../../web/q4-review.mjs', import.meta.url), 'utf8');
const q4Ast = parse(q4Source, {ecmaVersion: 'latest', sourceType: 'module'});
function productionFunction(source, ast, name) {
  const node = find(ast, node => node.type === 'FunctionDeclaration' && node.id.name === name);
  assert.ok(node, `Production ${name} exists`);
  return source.slice(node.start, node.end);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return {promise, resolve};
}
// Execute the real Q4 async consumer. This is a controlled storage/DOM double,
// not proof of browser locks or layout. The fake bridge checks the supplied
// final guard when its held write is released, as the real adapter does.
function q4CommitHarness() {
  const pending = [], errors = [];
  let writes = 0, closes = 0;
  const context = vm.createContext({
    JSON, structuredClone,
    validateForSave: () => true,
    showCommitError: result => { errors.push(result); },
    window: {OrderRegularQ4Bridge: {commit: (patches, confirmation, canCommit) => {
      const held = deferred();
      pending.push({patches: structuredClone(patches), confirmation, canCommit, held});
      return held.promise.then(result => {
        if (!canCommit()) return {ok: false, status: 'CANCELLED'};
        if (result.ok) writes++;
        return result;
      });
    }}},
    recordClose: () => { closes++; }
  });
  vm.runInContext(`
    let committing = false, state = {dialogClosed: false};
    let regularContext = {id: 'original'};
    let patches = [{id: 'A', monthlyDemandQty: '50', qty: '3'}];
    const serializedAllocations = () => structuredClone(patches);
    const monthlyEditor = {confirm: ({allocations}) => ({ok: true, allocations})};
    function closeProductModal() { state.dialogClosed = true; recordClose(); }
    ${productionFunction(q4Source, q4Ast, 'saveRegularDraft')}
    globalThis.subject = {
      save: saveRegularDraft,
      edit(value) { patches[0].monthlyDemandQty = value; },
      cancel() { state.dialogClosed = true; },
      reopen() { regularContext = {id: 'new'}; state.dialogClosed = false; },
      get busy() { return committing; },
      get raw() { return patches[0].monthlyDemandQty; }
    };
  `, context);
  return {subject: context.subject, pending, errors, get writes() {return writes;}, get closes() {return closes;}};
}

test('Q4 awaits durable result and ignores a second confirm while the first is pending', async () => {
  const h = q4CommitHarness(), first = h.subject.save();
  await h.subject.save();
  assert.equal(h.pending.length, 1);
  assert.equal(h.subject.busy, true);
  assert.equal(h.closes, 0);
  h.pending[0].held.resolve({ok: true, status: 'COMMITTED'});
  await first;
  assert.equal(h.writes, 1);
  assert.equal(h.closes, 1);
  assert.equal(h.subject.busy, false);
});

test('Q4 changed input during a held save cancels the old write and preserves the newer draft for retry', async () => {
  const h = q4CommitHarness(), first = h.subject.save();
  h.subject.edit('75');
  assert.equal(h.pending[0].canCommit(), false);
  h.pending[0].held.resolve({ok: true, status: 'COMMITTED'});
  await first;
  assert.equal(h.writes, 0);
  assert.equal(h.closes, 0);
  assert.equal(h.subject.raw, '75');
  assert.match(h.errors[0].message, /다시 저장/);
  const retry = h.subject.save();
  assert.equal(h.pending[1].patches[0].monthlyDemandQty, '75');
  h.pending[1].held.resolve({ok: true, status: 'COMMITTED'});
  await retry;
  assert.equal(h.writes, 1);
  assert.equal(h.closes, 1);
});

test('Q4 cancelled save cannot paint a late error into a closed or newly opened editor', async () => {
  for (const reopen of [false, true]) {
    const h = q4CommitHarness(), pending = h.subject.save();
    h.subject.cancel();
    if (reopen) h.subject.reopen();
    assert.equal(h.pending[0].canCommit(), false);
    h.pending[0].held.resolve({ok: true, status: 'COMMITTED'});
    await pending;
    assert.equal(h.writes, 0);
    assert.equal(h.closes, 0);
    assert.equal(h.errors.length, 0);
    assert.equal(h.subject.busy, false);
  }
});

test('Q4 failed durable save retains its draft, does not close, and accepts a subsequent explicit retry', async () => {
  const h = q4CommitHarness(), first = h.subject.save();
  h.pending[0].held.resolve({ok: false, status: 'WRITE_FAILED', message: '입력을 저장하지 못했습니다.'});
  await first;
  assert.equal(h.subject.raw, '50');
  assert.equal(h.subject.busy, false);
  assert.equal(h.closes, 0);
  assert.equal(h.writes, 0);
  assert.equal(h.errors.length, 1);
  const retry = h.subject.save();
  h.pending[1].held.resolve({ok: true, status: 'COMMITTED'});
  await retry;
  assert.equal(h.closes, 1);
  assert.equal(h.writes, 1);
});

async function coordinatorHarness() {
  const records = new Map(), nodes = new Map();
  const local = {writes: 0, failWrite: false, loseReadback: false, throwRead: false,
    getItem(key) {if (this.throwRead) {this.throwRead = false; throw Error('readback unavailable');} return records.get(key) ?? null;},
    setItem(key, value) {
      if (this.failWrite) throw Error('controlled write failure');
      records.set(key, value); this.writes++;
      if (this.loseReadback) {this.loseReadback = false; this.throwRead = true;}
    }};
  let lockTail = Promise.resolve();
  const locks = {request: (name, _options, callback) => {
    locks.onRequest?.(name);
    const pending = lockTail.then(() => callback({name}));
    lockTail = pending.catch(() => {}); return pending;
  }};
  const storage = createBrowserStorage({localStorage: local, sessionStorage: {getItem: () => null}, locks, crypto: webcrypto});
  const empty = await storage.load();
  const loaded = await storage.commit(restored('FLEX'), {expectedRevision: empty.revision, expectedToken: empty.versionToken, transactionId: 'seed'});
  assert.equal(loaded.ok, true);
  const $ = id => {if (!nodes.has(id)) nodes.set(id, {textContent: '', hidden: true}); return nodes.get(id);};
  let nextId = 0;
  const context = vm.createContext({
    initial: loaded, storage, projectStoredPayload, structuredClone, JSON, Promise,
    document: {documentElement: {dataset: {}}}, $, ident: () => 'review-save-' + (++nextId),
    storagePaint: () => {}, storageFeedback: () => {},
    window: {OrderEmailLifecycle: {reconcile() {}}},
    err: (id, message) => {$(id).textContent = message;},
    orderVerdict: () => ({valid: true, confirmations: []}),
    skuDraftActive: () => false, siteFocusDirty: () => false, siteEditingDirty: () => false, q4DraftActive: () => false
  });
  vm.runInContext(`
    let S = structuredClone(initial.data), lastCommitted = structuredClone(S);
    let storageRevision = initial.revision, storageToken = initial.versionToken;
    let storageReady = true, storagePending = 0, storageFailure = null, storageEpoch = 0;
    let uncertainWrite = null, storageTail = Promise.resolve(), inlineDraft = false, storageMessage = '';
    ${productionFunction(app, appAst, 'save')}
    ${productionFunction(app, appAst, 'complete')}
    globalThis.subject = {
      save(candidate, options) {return save(candidate ?? S, options);},
      input(raw) {S.lines[0].qty = raw; inlineDraft = true; return save(S, {publish: false});},
      get state() {return structuredClone(S);},
      get committed() {return structuredClone(lastCommitted);},
      get failure() {return storageFailure;},
      get inline() {return inlineDraft;},
      get revision() {return storageRevision;},
      complete
    };
  `, context);
  return {subject: context.subject, local, storage, locks};
}

test('production coordinator serializes rapid Q2 input without self-conflicts or stale visible raw', async () => {
  const h = await coordinatorHarness();
  const results = await Promise.all(['2', '20', '200'].map(raw => h.subject.input(raw)));
  assert.ok(results.every(result => result.ok));
  assert.equal(h.subject.state.lines[0].qty, '200');
  assert.equal(h.subject.committed.lines[0].qty, '200');
  assert.equal((await h.storage.load()).data.lines[0].qty, '200');
  assert.equal(h.subject.inline, false);
  assert.equal(h.subject.failure, null);
  assert.equal(h.local.writes, 4, 'Seed plus three accepted input snapshots');
});

test('production coordinator preserves Q2 working raw on failure and succeeds only after explicit retry', async () => {
  const h = await coordinatorHarness();
  h.local.failWrite = true;
  const failed = await h.subject.input('275');
  assert.equal(failed.status, 'WRITE_FAILED');
  assert.equal(h.subject.state.lines[0].qty, '275');
  assert.equal(h.subject.committed.lines[0].qty, '200');
  assert.equal((await h.storage.load()).data.lines[0].qty, '200');
  assert.equal(h.subject.complete(), false);
  h.local.failWrite = false;
  const retried = await h.subject.save(undefined, {publish: false});
  assert.equal(retried.ok, true);
  assert.equal((await h.storage.load()).data.lines[0].qty, '275');
  assert.equal(h.subject.failure, null);
  assert.equal(h.subject.inline, false);
});

test('failed modal candidate does not publish or block the prior confirmed state after its draft is cancelled', async () => {
  const h = await coordinatorHarness(), candidate = h.subject.state;
  candidate.locations[0].name = 'unconfirmed new name';
  h.local.failWrite = true;
  const result = await h.subject.save(candidate);
  assert.equal(result.status, 'WRITE_FAILED');
  assert.equal(h.subject.state.locations[0].name, 'A');
  assert.equal((await h.storage.load()).data.locations[0].name, 'A');
  assert.equal(h.subject.failure, null, 'Recoverable popup failure stays owned by that draft');
  assert.equal(h.subject.complete(), true, 'No active editor remains in this cancelled-owner harness');
});

test('uncertain readback retries the same production transaction id and does not duplicate the write', async () => {
  const h = await coordinatorHarness(), candidate = h.subject.state;
  candidate.locations[0].name = 'confirmed new name';
  h.local.loseReadback = true;
  const failed = await h.subject.save(candidate);
  assert.equal(failed.status, 'WRITE_FAILED');
  assert.equal(failed.uncertain, true);
  assert.equal(h.subject.state.locations[0].name, 'A');
  assert.equal(h.local.writes, 2, 'Seed and a write whose readback was unavailable');
  const retried = await h.subject.save(candidate);
  assert.equal(retried.ok, true);
  assert.equal(retried.status, 'IDEMPOTENT');
  assert.equal(h.local.writes, 2, 'Recovery reads the receipt, without a duplicate revision');
  assert.equal(h.subject.state.locations[0].name, 'confirmed new name');
  assert.equal(h.subject.failure, null);
});

test('production queued modal cancellation is checked after lock wait and never publishes or writes', async () => {
  const h = await coordinatorHarness(), held = deferred(), requested = deferred();
  const lock = h.locks.request('held-by-other-tab', {}, () => held.promise);
  h.locks.onRequest = () => requested.resolve();
  const candidate = h.subject.state;
  candidate.locations[0].name = 'cancelled draft';
  let open = true;
  const pending = h.subject.save(candidate, {canCommit: () => open});
  await requested.promise;
  open = false;
  held.resolve();
  await lock;
  const result = await pending;
  assert.equal(result.status, 'CANCELLED');
  assert.equal(h.local.writes, 1);
  assert.equal(h.subject.state.locations[0].name, 'A');
  assert.equal(h.subject.failure, null);
});

test('production coordinator stops stale-tab confirmation and preserves both durable winner and local draft', async () => {
  const h = await coordinatorHarness(), observed = await h.storage.load();
  const winner = structuredClone(observed.data);
  winner.locations[0].name = 'other tab';
  const accepted = await h.storage.commit(winner, {expectedRevision: observed.revision, expectedToken: observed.versionToken, transactionId: 'other-tab'});
  assert.equal(accepted.ok, true);
  const candidate = h.subject.state;
  candidate.locations[0].name = 'local unsaved draft';
  const result = await h.subject.save(candidate);
  assert.equal(result.status, 'CONFLICT');
  assert.equal(h.subject.state.locations[0].name, 'A');
  assert.equal(candidate.locations[0].name, 'local unsaved draft');
  assert.equal((await h.storage.load()).data.locations[0].name, 'other tab');
  assert.equal(h.local.writes, 2);
  assert.equal(h.subject.failure.status, 'CONFLICT');
  assert.equal(h.subject.complete(), false);
});
