import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {validMonthlyQuantity,convertMonthlyUnit} from '../../web/quantity-contract.mjs';
import {inspectMonthlyAllocations,inspectOnceAllocations} from '../../web/allocation-ui.mjs';

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
