import test from 'node:test';
import assert from 'node:assert/strict';
import { allocationStateFromContext, inspectMonthlyAllocations, createMonthlyAllocationDraft, inspectOnceAllocations } from '../../web/allocation-ui.mjs';

// UI adapter fixtures use synthetic IDs and quantities only.
function context() {
  return { revision: 1, line: { id: 'sku-review', qty: '200', qtyUnit: 'each', pack: '30' },
    locations: [{ id: 'A', name: 'TEST-A' }, { id: 'B', name: 'TEST-B' }],
    allocations: [
      { id: 'allocation-A', lineId: 'sku-review', locationId: 'A', mode: 'FLEX', monthlyDemandQty: '50', monthlyDemandUnit: 'each', monthlyDemandSource: 'manual', qty: '7', advanced: { memo: 'TEST-KEEP' } },
      { id: 'allocation-B', lineId: 'sku-review', locationId: 'B', mode: 'FIXED', monthlyDemandQty: '', monthlyDemandUnit: 'each', qty: '9' }
    ] };
}
const ratio = n => ({ numerator: String(n), denominator: '1' });

test('UI allocation review: proposals stay private, IDs survive permutation, delivery fields unchanged', () => {
  const original = context(), before = structuredClone(original);
  const controller = createMonthlyAllocationDraft(original, { transactionId: 'review-private' });
  assert.deepEqual(controller.rows.map(r => [r.locationId, r.quantity.raw]), [['A', '50'], ['B', '150']]);
  assert.deepEqual(original, before);
  controller.set('A', '60');
  assert.equal(controller.rows.find(r => r.locationId === 'B').quantity.raw, '140');
  const saved = controller.confirm({ allocations: [...original.allocations].reverse() });
  assert.equal(saved.ok, true);
  assert.deepEqual(saved.allocations.map(a => [a.locationId, a.monthlyDemandQty, a.qty]), [['B', '140', '9'], ['A', '60', '7']]);
  assert.equal(saved.allocations.find(a => a.locationId === 'A').advanced.memo, 'TEST-KEEP');
  assert.deepEqual(original, before);
});

test('UI allocation review: equal user-entered derived value becomes manual and cannot be auto-rewritten', () => {
  const controller = createMonthlyAllocationDraft(context(), { transactionId: 'review-manual' });
  controller.set('B', '150'); controller.set('A', '60');
  assert.equal(controller.rows.find(r => r.locationId === 'B').quantity.raw, '150');
  assert.equal(controller.rows.find(r => r.locationId === 'B').source, 'manual');
  assert.deepEqual(controller.evaluate().normalized.excess, ratio(10));
  assert.equal(controller.confirm().ok, false);
});

test('UI allocation review: returned rows/session cannot mutate private draft and IME stays incomplete', () => {
  const controller = createMonthlyAllocationDraft(context(), { transactionId: 'review-isolation' });
  const rows = controller.rows, session = controller.session;
  rows[0].quantity.raw = '999'; session.entries[0].quantity.raw = '888';
  assert.equal(controller.rows[0].quantity.raw, '50');
  controller.set('A', '', { composing: true });
  assert.equal(controller.evaluate().status, 'INCOMPLETE');
  assert.equal(controller.evaluate().normalized.residualBeforeSuggestions, null);
  assert.equal(controller.confirm().ok, false);
});

test('UI allocation review: explicit each is distinct from legacy packaging unit', () => {
  const explicit = context(), legacy = context();
  delete legacy.line.qtyUnit;
  for (const row of legacy.allocations) delete row.monthlyDemandUnit;
  assert.equal(allocationStateFromContext(explicit).lines[0].total.unit, 'each');
  assert.equal(allocationStateFromContext(legacy).lines[0].total.unit, 'tray');
  assert.deepEqual(createMonthlyAllocationDraft(explicit).evaluate().normalized.totalBase, ratio(200));
  assert.deepEqual(createMonthlyAllocationDraft(legacy).evaluate().normalized.totalBase, ratio(6000));
  const mixed = context(); mixed.allocations[0].mode = 'ONCE';
  assert.equal(inspectMonthlyAllocations(mixed).status, 'POLICY_UNRESOLVED');
  assert.equal(createMonthlyAllocationDraft(mixed).confirm().ok, false);
});

test('UI allocation review: external same-revision changes block confirmation even after cached success', () => {
  let current = context();
  const controller = createMonthlyAllocationDraft(current, { readCurrentContext: () => current, transactionId: 'review-cached-stale' });
  assert.equal(controller.confirm().ok, true);
  current = structuredClone(current); current.line.qty = '240';
  const stale = controller.confirm();
  assert.equal(stale.ok, false);
  assert.equal(stale.result.writes ?? 0, 0);
});

test('UI allocation review: cancel closes even a previously confirmed controller', () => {
  const controller = createMonthlyAllocationDraft(context(), { transactionId: 'review-closed' });
  assert.equal(controller.confirm().ok, true);
  controller.cancel();
  assert.equal(controller.closed, true);
  assert.equal(controller.confirm().ok, false);
});

test('UI allocation review: caller cannot remove or replace stable allocation identities at confirm', () => {
  for (const mutate of [
    allocations => allocations.slice(0, 1),
    allocations => [{ ...allocations[0], id: 'different' }, allocations[1]],
    allocations => [{ ...allocations[0], lineId: 'different-sku' }, allocations[1]],
    allocations => [allocations[0], { ...allocations[1], locationId: 'A' }]
  ]) {
    const c = context(), controller = createMonthlyAllocationDraft(c, { transactionId: 'review-invalid-target' });
    const result = controller.confirm({ allocations: mutate(structuredClone(c.allocations)) });
    assert.equal(result.ok, false);
  }
});

test('UI allocation review: confirmed ONCE fingerprint removes both blocking status and confirmation', () => {
  const c = context();
  c.allocations = c.allocations.map((a, i) => ({ ...a, mode: 'ONCE', oneTimeDeliveryQty: i ? '150' : '50', deliveryQtyUnit: 'each' }));
  const pending = inspectOnceAllocations(c);
  assert.equal(pending.status, 'INCOMPLETE');
  assert.ok(pending.confirmation);
  for (const a of c.allocations) a.onceConfirmedFingerprint = pending.normalized.fingerprint;
  const confirmed = inspectOnceAllocations(c);
  assert.equal(confirmed.status, 'VALID');
  assert.equal(confirmed.confirmation, null);
});

test('UI allocation review: reviewed rational Q2 total is preserved across single-site each units', () => {
  for (const savedMonthly of ['', '50']) {
    const c = context();
    c.line.qty = '5/3'; c.line.qtyUnit = 'tray';
    c.line.qtyExact = { representation: 'rational', conversionReviewed: true, numerator: '5', denominator: '3' };
    c.allocations = [c.allocations[0]];
    c.allocations[0].monthlyDemandQty = savedMonthly;
    c.allocations[0].monthlyDemandUnit = 'each';
    const before = structuredClone(c);
    const controller = createMonthlyAllocationDraft(c, { transactionId: 'review-rational-single' });
    assert.deepEqual(controller.evaluate().normalized.totalBase, ratio(50));
    assert.deepEqual(controller.rows.map(r => [r.quantity.raw, r.quantity.unit, r.source]), [['50', 'each', 'derived']]);
    assert.deepEqual(c, before);
    const confirmed = controller.confirm();
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.allocations[0].monthlyDemandQty, '50');
    assert.equal(confirmed.allocations[0].monthlyDemandUnit, 'each');
    assert.equal(c.line.qty, '5/3');
  }
});

test('UI allocation review: two remaining blanks retain whole residual without hidden equal splitting', () => {
  const c = context();
  c.locations.push({ id: 'C', name: 'TEST-C' });
  c.allocations.push({ id: 'allocation-C', lineId: c.line.id, locationId: 'C', mode: 'FLEX', monthlyDemandQty: '', monthlyDemandUnit: 'each', qty: '3' });
  const controller = createMonthlyAllocationDraft(c, { transactionId: 'review-multiple-blanks' });
  const result = controller.evaluate();
  assert.deepEqual(result.normalized.residualBeforeSuggestions, ratio(150));
  assert.deepEqual(result.normalized.proposals, []);
  assert.deepEqual(controller.rows.filter(r => r.locationId !== 'A').map(r => r.quantity.raw), ['', '']);
  assert.deepEqual(result.normalized.sites.filter(r => r.locationId !== 'A').map(r => r.currentMaximum), [ratio(150), ratio(150)]);
  assert.equal(controller.confirm().ok, false);
});

test('UI allocation review: explicit empty raw remains empty until a distinct refresh operation', () => {
  const c = context(), controller = createMonthlyAllocationDraft(c, { transactionId: 'review-empty-raw' });
  controller.set('B', '');
  assert.equal(controller.rows.find(r => r.locationId === 'B').quantity.raw, '');
  assert.equal(controller.rows.find(r => r.locationId === 'B').source, 'manual');
  assert.equal(c.allocations[1].monthlyDemandQty, '');
  assert.equal(controller.evaluate().normalized.proposals[0].quantity.raw, '150');
  controller.refresh();
  assert.equal(controller.rows.find(r => r.locationId === 'B').quantity.raw, '150');
  assert.equal(controller.rows.find(r => r.locationId === 'B').source, 'derived');
  assert.equal(c.allocations[1].monthlyDemandQty, '');
});

test('UI allocation review: unknown ONCE delivery unit yields explicit issues and no confirmation bypass', () => {
  const c = context();
  c.allocations = c.allocations.map(a => ({ ...a, mode: 'ONCE', oneTimeDeliveryQty: '10', deliveryQtyUnit: 'unknown-unit' }));
  const result = inspectOnceAllocations(c);
  assert.equal(result.status, 'INVALID');
  assert.equal(result.confirmation, null);
  assert.deepEqual(result.issues.map(i => [i.locationId, i.fieldKey]), [['A', 'once'], ['B', 'once']]);
  assert.ok(result.issues.every(i => i.code === 'UNIT_CONVERSION_UNAVAILABLE'));
});
