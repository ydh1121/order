import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {webcrypto} from 'node:crypto';
import {validMonthlyQuantity,convertMonthlyUnit,monthlyPlanSnapshot,quantityDisplayUnit} from '../../web/quantity-contract.mjs';
import {inspectMonthlyAllocations,inspectOnceAllocations} from '../../web/allocation-ui.mjs';
import {inspectStoredOrderQuantity} from '../../web/q4-planning.mjs';
import {q4Issue,quantityBoundIssue,inspectQ4Allocation,inspectQ4Groups,monthlyIssues} from '../../web/q4-validation.mjs';
import {createBrowserStorage,emptyStoredPayload,projectStoredPayload} from '../../web/storage.mjs';
import {projectQuoteInput} from '../../web/quote-result.mjs';

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
const functions = ['q4ReviewIssue', 'q4ReviewAllocationIssues', 'q4ReviewVerdict'].map(name => {
  const node = find(appAst, node => node.type === 'FunctionDeclaration' && node.id.name === name);
  assert.ok(node, `Production ${name} exists`); return app.slice(node.start, node.end);
});
const gate = vm.runInNewContext(common.slice(declaration.start, declaration.end) + '\n' + functions.join('\n') + '\nq4ReviewVerdict', {
  validMonthlyQuantity, inspectMonthlyAllocations, inspectOnceAllocations, monthlyPlanSnapshot, inspectStoredOrderQuantity, q4Issue,quantityBoundIssue,inspectQ4Allocation,inspectQ4Groups,monthlyIssues,
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
function productionVariable(source, ast, name) {
  const node = find(ast, value => value.type === 'VariableDeclaration' && value.declarations.some(row => row.id.name === name));
  assert.ok(node, `Production variable ${name} exists`); return source.slice(node.start, node.end);
}
function productionHandler(source, ast, id) {
  const node = find(ast, value => value.type === 'ExpressionStatement' && value.expression.type === 'AssignmentExpression' && value.expression.left.type === 'MemberExpression' && value.expression.left.property.name === 'onclick' && value.expression.left.object.type === 'CallExpression' && value.expression.left.object.callee.name === '$' && value.expression.left.object.arguments[0]?.value === id);
  assert.ok(node, `Production click handler ${id} exists`); return source.slice(node.start, node.end);
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
    JSON, structuredClone, localDateISO: () => '2026-12-04', dateIssue: () => ({valid: true}),
    validateForSave: () => true,
    showCommitError: result => { errors.push(result); },
    bridge: {commit: (patches, confirmation, canCommit) => {
      const held = deferred();
      pending.push({patches: structuredClone(patches), confirmation, canCommit, held});
      return held.promise.then(result => {
        if (!canCommit()) return {ok: false, status: 'CANCELLED'};
        if (result.ok) writes++;
        return result;
      });
    }},
    recordClose: () => { closes++; }
  });
  vm.runInContext(`
    let committing = false, commitEpoch = 0, commitAttempt = 0, numericValid = true, state = {dialogClosed: false, asOfLocalDate: '2026-12-04', count: 1, preferredDates: {}};
    const q4Numeric = {inspect: () => ({valid: numericValid})}, numericComposing = new Set(), approvedDateBindings = new Map();
    let regularContext = {id: 'original'};
    let patches = [{id: 'A', monthlyDemandQty: '50', qty: '3'}];
    const serializedAllocations = () => structuredClone(patches);
    const monthlyEditor = {confirm: ({allocations}) => ({ok: true, allocations})};
    function disposeProductModal() { state.dialogClosed = true; recordClose(); }
    ${productionFunction(q4Source, q4Ast, 'saveRegularDraft')}
    globalThis.subject = {
      save: saveRegularDraft,
      edit(value) { patches[0].monthlyDemandQty = value; },
      cancel() { state.dialogClosed = true; },
      exitIntent() { commitEpoch++; commitAttempt++; committing = false; },
      numericInvalid() { numericValid = false; },
      dateComposition() { approvedDateBindings.set('date', {inspect: () => ({valid:false, composingCount:1})}); },
      reopen() { commitEpoch++; regularContext = {id: 'new'}; state.dialogClosed = false; },
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

test('R02 continuing after dirty exit can retry while the stale write settles without clearing newer busy state', async () => {
  const h = q4CommitHarness(), first = h.subject.save();
  h.subject.exitIntent();
  assert.equal(h.pending[0].canCommit(), false);
  assert.equal(h.subject.busy, false);
  const retry = h.subject.save();
  assert.equal(h.pending.length, 2);
  assert.equal(h.pending[1].canCommit(), true);
  h.pending[0].held.resolve({ok: true, status: 'COMMITTED'});
  await first;
  assert.equal(h.writes, 0);
  assert.equal(h.closes, 0);
  assert.equal(h.subject.raw, '50');
  assert.equal(h.subject.busy, true, 'The old finally must not unlock a newer in-flight attempt');
  assert.equal(h.errors.length, 0, 'The stale result cannot paint into the continuing editor');
  await h.subject.save();
  assert.equal(h.pending.length, 2, 'The newer pending attempt still blocks duplicates');
  h.pending[1].held.resolve({ok: true, status: 'COMMITTED'});
  await retry;
  assert.equal(h.writes, 1);
  assert.equal(h.closes, 1);
  assert.equal(h.subject.busy, false);
});

test('R16 unresolved invalid numeric text cancels a held Q4 write without replacing the draft', async () => {
  const h = q4CommitHarness(), first = h.subject.save();
  h.subject.numericInvalid();
  assert.equal(h.pending[0].canCommit(), false);
  h.pending[0].held.resolve({ok: true, status: 'COMMITTED'});
  await first;
  assert.equal(h.writes, 0);
  assert.equal(h.closes, 0);
  assert.equal(h.subject.raw, '50');
  assert.equal(h.subject.busy, false);
});

test('R05 current transaction email proof reaches site and final gates without promoting global UNKNOWN', () => {
  const siteNode = commonAst.body.find(node => node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression' && node.expression.left.property?.name === 'OrderSiteContract');
  const proof = {state: 'VALID', ttl: 0}, email = 'local@example.test';
  let active = true;
  const context = vm.createContext({inspectQ4Groups,window: {}, addressStatus: () => ({valid: true}),
    OrderPhone: {parse: () => ({valid: true})}, OrderEmail: {parse: () => ({valid: true})},
    OrderEmailDomain: {status: () => ({state: 'UNKNOWN'}), isCurrent: (p, raw) => active && p === proof && raw === email,
      isHard: () => false, isSuccess: p => p.state === 'VALID'}});
  vm.runInContext(common.slice(siteNode.start, siteNode.end), context);
  context.OrderSiteContract = context.window.OrderSiteContract;
  const validate = vm.runInContext(common.slice(declaration.start, declaration.end) + '\nCODE1_ORDER_VALIDATION.validateOrderDraft', context);
  const site = {id: 'A', name: 'A', email, contactPhone: '01012345678'};
  assert.equal(context.OrderSiteContract.valid(site), false);
  assert.equal(context.OrderSiteContract.valid(site, {emailProof: proof}), true);
  const state = {lines: [], locations: [site], allocations: []};
  const emailIssues = options => validate(state, options).issues.filter(issue => issue.field.endsWith(':email'));
  assert.equal(emailIssues({emailProofs: new Map([['A', proof]])}).length, 0);
  assert.equal(emailIssues({emailProofs: new Map([['B', proof]])}).length, 1, 'Site identity cannot be substituted');
  site.email = 'edited@example.test';
  assert.equal(emailIssues({emailProofs: new Map([['A', proof]])}).length, 1, 'Edited raw input invalidates proof');
  site.email = email;active = false;
  assert.equal(emailIssues({emailProofs: new Map([['A', proof]])}).length, 1, 'Cancelled/expired transaction invalidates proof');
  assert.equal(context.OrderEmailDomain.status(email).state, 'UNKNOWN');
});

async function coordinatorHarness(seed = restored('FLEX')) {
  const records = new Map(), nodes = new Map(), quoteRevisions=[];
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
    const pending = lockTail.then(async () => {if(locks.hold)await locks.hold.promise;return callback({name});});
    lockTail = pending.catch(() => {}); return pending;
  }};
  const storage = createBrowserStorage({localStorage: local, sessionStorage: {getItem: () => null}, locks, crypto: webcrypto});
  const empty = await storage.load();
  const loaded = await storage.commit(seed, {expectedRevision: empty.revision, expectedToken: empty.versionToken, transactionId: 'seed'});
  assert.equal(loaded.ok, true);
  const $ = id => {if (!nodes.has(id)) nodes.set(id, {textContent: '', hidden: true, dataset: {}, attributes:{}, classList: {remove() {},add() {}}, setAttribute(name,value) {this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];}}); return nodes.get(id);};
  const feedbackTimers=new Map();let feedbackSequence=0;
  let nextId = 0;
  const context = vm.createContext({
    // Clone across VM realms so the real storage strict plain-object validator
    // sees the same realm it receives from the actual browser coordinator.
    setTimeout:(callback)=>{const id=++feedbackSequence;feedbackTimers.set(id,callback);return id;},clearTimeout:id=>feedbackTimers.delete(id),
    initial: loaded, storage: {commit: (data, options) => storage.commit(structuredClone(data), options)}, projectStoredPayload: value => projectStoredPayload(structuredClone(value)), structuredClone, JSON, Promise,
    projectQuoteInput,quoteService:{reconcileRevision:revision=>quoteRevisions.push(revision)},
    document: {documentElement: {dataset: {}}, querySelector: () => null}, $, ident: () => 'review-save-' + (++nextId),
    refreshCompletionBadges: () => {},
    window: {OrderEmailLifecycle: {reconcile() {}}},
    err: (id, message) => {$(id).textContent = message;},
    q4ReviewVerdict: () => ({valid: true, confirmations: []}),
    q2Numeric: {inspect: () => ({valid: true})},
    skuDraftActive: () => false, siteFocusDirty: () => false, siteEditingDirty: () => false, q4DraftActive: () => false
  });
  vm.runInContext(`
    const simpleMode = false, simpleUI = null;
    let S = structuredClone(initial.data), lastCommitted = structuredClone(S);
    let storageRevision = initial.revision, storageToken = initial.versionToken;
    let storageReady = true, storagePending = 0, storageFailure = null, storageEpoch = 0;
    let uncertainWrite = null, storageTail = Promise.resolve(), inlineDraft = false, storageMessage = '';
    let quoteInputRevision = 0, quoteInputSignature = null;
    let checkpointAttempt = null, checkpointReceipt = null, checkpointFeedbackTimer = null;
    let siteEditing = null, deliveryDraft = null, q4AssignmentDraft = null;
    let editorMode = S.lines.length ? null : 'initial';
    let editing = {id: 'initial-choice', housing: '', size: '', pack: ''};
    ${productionVariable(app, appAst, 'storageText')}
    ${['reconcileQuoteInput','storagePaint','storageFeedback','bodyCheckpoint','checkpointSignature','paintCheckpointButton','clearCheckpointStatus','showCheckpointReceipt'].map(name => productionFunction(app, appAst, name)).join('\n')}
    ${productionFunction(app, appAst, 'save')}
    ${productionFunction(app, appAst, 'complete')}
    ${productionHandler(app, appAst, 'save-checkpoint')}
    globalThis.subject = {
      save(candidate, options) {return save(candidate ?? S, options);},
      checkpoint() {return $('save-checkpoint').onclick();},
      select(field, value) {editing[field] = value;},
      popup(value) {siteEditing = value;},
      get checkpointStatus() {return structuredClone($('checkpoint-status').dataset);},
      get checkpointButton() {return structuredClone({state:$('save-checkpoint').dataset.state,attributes:$('save-checkpoint').attributes});},
      get checkpointReceipt() {return structuredClone(checkpointReceipt);},
      input(raw) {S.lines[0].qty = raw; inlineDraft = true; return save(S, {publish: false});},
      get state() {return structuredClone(S);},
      get committed() {return structuredClone(lastCommitted);},
      get failure() {return storageFailure;},
      get inline() {return inlineDraft;},
      get revision() {return storageRevision;},
      complete
    };
  `, context);
  return {subject: context.subject, local, storage, locks,quoteRevisions, expireFeedback(){for(const [id,callback]of [...feedbackTimers]){feedbackTimers.delete(id);callback();}}};
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
  assert.deepEqual(h.quoteRevisions,[1,2,3],'Each changed Q2 condition invalidates the prior quote through the production reconciler');
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

test('C28 production checkpoint keeps initial body selection, suppresses pending duplicate and replays receipt with zero extra write', async () => {
  const h = await coordinatorHarness(emptyStoredPayload());
  h.subject.select('housing', '4');
  await Promise.all([h.subject.checkpoint(), h.subject.checkpoint()]);
  const saved = await h.storage.load(), receipt = h.subject.checkpointReceipt;
  assert.equal(h.local.writes, 2, 'Seed and one explicit checkpoint');
  assert.equal(saved.data.lines.length, 0);
  assert.deepEqual(saved.data.bodyCheckpoint, {version: '1.0.0', q1Selection: {id: 'initial-choice', housing: '4', size: '', pack: ''}});
  assert.equal(h.subject.checkpointStatus.state, 'saved');
  assert.equal(h.subject.checkpointStatus.transaction, receipt.transactionId);
  await h.subject.checkpoint();
  assert.equal(h.local.writes, 2, 'Receipt replay verifies under the adapter lock, without incrementing revision');
  assert.equal(h.subject.revision, saved.revision);
  assert.equal(h.subject.checkpointStatus.transaction, receipt.transactionId);
  h.subject.popup({name: 'private unsaved popup'});
  const quoteRevisions=[...h.quoteRevisions];
  await h.subject.checkpoint();
  assert.equal(h.local.writes, 2, 'Private popup cannot enter the body checkpoint');
  assert.equal((await h.storage.load()).data.locations.length, 0);
  assert.deepEqual(h.quoteRevisions,quoteRevisions,'Private popup input cannot change the product quote projection');
});

test('C28 production checkpoint replay observes another tab reset/write and never reuses a stale success', async () => {
  for (const operation of ['reset', 'write']) {
    const h = await coordinatorHarness();
    await h.subject.checkpoint();
    const prior = await h.storage.load(), original = h.subject.state;
    const options = {expectedRevision: prior.revision, expectedToken: prior.versionToken, transactionId: 'other-' + operation};
    const winner = structuredClone(prior.data); winner.locations[0].name = 'other tab confirmed name';
    const external = operation === 'reset' ? await h.storage.reset(options) : await h.storage.commit(winner, options);
    assert.equal(external.ok, true);
    const writes = h.local.writes;
    await h.subject.checkpoint();
    assert.equal(h.subject.checkpointStatus.state, 'conflict');
    assert.equal(h.subject.checkpointStatus.transaction, undefined);
    assert.equal(h.local.writes, writes, 'Stale receipt cannot resurrect or overwrite the winner');
    assert.deepEqual(h.subject.state, original, 'Local body remains available for conflict recovery');
    const restored = await h.storage.load();
    assert.equal(restored.status, operation === 'reset' ? 'RESET' : 'LOADED');
    if (operation === 'write') assert.equal(restored.data.locations[0].name, 'other tab confirmed name');
    assert.equal(h.subject.failure.status, 'CONFLICT');
  }
});

test('C28 production checkpoint uncertain readback retry shows the actual original durable transaction receipt', async () => {
  const h = await coordinatorHarness();
  h.local.loseReadback = true;
  await h.subject.checkpoint();
  assert.equal(h.subject.checkpointStatus.state, 'failed');
  assert.equal(h.subject.failure.uncertain, true);
  assert.equal(h.local.writes, 2);
  const originalTransaction = JSON.parse(h.local.getItem('order_q1_q4_v1')).receipts.at(-1).transactionId;
  await h.subject.checkpoint();
  assert.equal(h.subject.checkpointStatus.state, 'saved');
  assert.equal(h.local.writes, 2, 'Recovery reads the original receipt instead of writing the new attempt');
  assert.equal(originalTransaction, 'review-save-1');
  assert.equal(h.subject.checkpointStatus.transaction, originalTransaction, 'Second attempt ID must not masquerade as the durable transaction');
  assert.equal(h.subject.checkpointReceipt.transactionId, originalTransaction);
  assert.equal(h.subject.failure, null);
  const saved = await h.storage.load();
  assert.equal(h.subject.checkpointStatus.revision, String(saved.revision));
  assert.equal(h.subject.checkpointReceipt.data.allocationRevision, saved.data.allocationRevision);
});


test('C54-21 receipt button stays pending behind actual storage lock; timer cannot create a success',async()=>{
 const h=await coordinatorHarness();h.locks.hold=deferred();
 const pending=h.subject.checkpoint();assert.equal(h.subject.checkpointButton.state,'pending');assert.equal(h.subject.checkpointButton.attributes['aria-busy'],'true');
 h.expireFeedback();assert.equal(h.subject.checkpointButton.state,'pending');assert.equal(h.local.writes,1);
 h.locks.hold.resolve();await pending;
 assert.equal(h.subject.checkpointButton.state,'saved');assert.equal(h.subject.checkpointButton.attributes['aria-busy'],undefined);assert.equal(h.subject.checkpointButton.attributes['aria-label'],'저장됨');
 assert.equal(h.local.writes,2);assert.equal(h.subject.checkpointStatus.transaction,(await h.storage.load()).data? h.subject.checkpointReceipt.transactionId:null);
 h.expireFeedback();assert.equal(h.subject.checkpointButton.state,'idle');assert.equal(h.local.writes,2);
});
test('C54-21 failed durable write never paints a check even after feedback timers run',async()=>{
 const h=await coordinatorHarness();h.local.failWrite=true;await h.subject.checkpoint();
 assert.equal(h.subject.checkpointStatus.state,'failed');assert.equal(h.subject.checkpointButton.state,'idle');assert.equal(h.local.writes,1);
 h.expireFeedback();assert.equal(h.subject.checkpointButton.state,'idle');assert.equal(h.subject.checkpointReceipt,null);
});

test('C54 date composition cancels a held Q4 write without silently committing the prior date', async()=>{
 const h=q4CommitHarness(),pending=h.subject.save();h.subject.dateComposition();assert.equal(h.pending[0].canCommit(),false);h.pending[0].held.resolve({ok:true,status:'COMMITTED'});await pending;assert.equal(h.writes,0);assert.equal(h.closes,0);assert.equal(h.subject.raw,'50');
});


test('C54-06 reset can inspect the old Q2 controls after the durable model cleared their SKU',()=>{
 const lines=new Map([['L',{id:'L',qtyUnit:'each',pack:'30'}]]);
 const options=vm.runInNewContext(productionFunction(app,appAst,'q2NumericOptions')+'\nq2NumericOptions',{quantityDisplayUnit,lineById:id=>lines.get(id)});
 const input={dataset:{lineQty:'L'}};
 assert.equal(options(input).step,'30');assert.equal(options(input).maxDigits,12);
 lines.clear();assert.doesNotThrow(()=>options(input));assert.equal(options(input).step,1);assert.equal(options(input).maxDigits,12);
 assert.equal(options({dataset:{linePrice:'L'}}).step,1);
});

test('C55 shared linewide monthly failure does not blame only the first site or mutate frozen saved input',()=>{
 const state=restored('FLEX');state.lines[0].qty='300';
 const before=structuredClone(state),freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);Object.values(value).forEach(freeze);}return value;};freeze(state);
 const group=inspectQ4Groups(state),monthly=group.issues.filter(issue=>issue.fieldKey==='monthly');
 assert.ok(monthly.length>0);assert.ok(monthly.every(issue=>issue.lineId==='L'&&issue.siteId===null));
 const verdict=gate(state);for(const site of state.locations)assert.ok(verdict.fieldErrors.some(issue=>issue.stage==='q4'&&issue.lineId==='L'&&(!issue.siteId||issue.siteId===site.id)));
 assert.deepEqual(state,before);assert.deepEqual(gate(state),verdict,'Repeated verdict read is stable');
});
