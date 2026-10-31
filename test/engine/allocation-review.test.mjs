import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAllocation, beginAllocationEdit, editAllocation, confirmAllocation, cancelAllocation, evaluateOnceAllocation } from '../../src/engine/calculation/allocation.mjs';

// Independent synthetic state: no operational catalogue, contacts, or prices.
const q = (raw, unit = 'each') => ({ raw: String(raw), unit });
const rational = (n, d = 1) => ({ numerator: String(n), denominator: String(d) });
function state() {
  return {
    revision: 5,
    lines: [{ lineId: 'sku', specVersion: 'synthetic-spec-1', total: q(200), locationIds: ['A', 'B'], unitTable: { version: 'synthetic-units-1', baseUnit: 'each', factors: { each: '1', tray: '30' } } }],
    locations: [{ locationId: 'A' }, { locationId: 'B' }, { locationId: 'C' }],
    allocations: [{ lineId: 'sku', locationId: 'A', quantity: q(50), source: 'manual' }], receipts: []
  };
}
const start = (s, options = {}) => beginAllocationEdit(s, { lineId: 'sku', scope: ['A', 'B'], transactionId: 'independent-tx', ...options }).session;
const evalDraft = (s, draft) => evaluateAllocation({ state: s, lineId: 'sku', draft });

test('independent I05 baseline, derived replacement and outside-scope fixed value', () => {
  const s = state();
  s.allocations.push({ lineId: 'sku', locationId: 'B', quantity: q(150), source: 'derived' });
  const all = editAllocation(s, start(s), { type: 'set', locationId: 'A', quantity: q(60) }).session;
  const result = evalDraft(s, all);
  assert.deepEqual(result.normalized.fixedSum, rational(60));
  assert.deepEqual(result.normalized.proposals.map(p => [p.locationId, p.quantity.raw]), [['B', '140']]);
  assert.equal(result.normalized.storedComplete, true);
  assert.equal(s.allocations[1].quantity.raw, '150');
  const onlyA = editAllocation(s, start(s, { scope: ['A'] }), { type: 'set', locationId: 'A', quantity: q(60) }).session;
  const restricted = evalDraft(s, onlyA);
  assert.deepEqual(restricted.normalized.excess, rational(10));
  assert.deepEqual(restricted.normalized.proposals, []);
  assert.equal(confirmAllocation(s, onlyA, { expectedDraftRevision: onlyA.revision, acceptProposals: true }).writes, 0);
});

test('independent I06 reserved minimum and residual have different meanings', () => {
  const s = state(); s.lines[0].locationIds.push('C');
  s.lines[0].minimums = [{ locationId: 'C', quantity: q(20) }];
  const result = evalDraft(s, start(s, { scope: ['A', 'B', 'C'] }));
  assert.deepEqual(result.normalized.residualBeforeSuggestions, rational(150));
  assert.deepEqual(result.normalized.sites.map(row => [row.locationId, row.currentMaximum]), [
    ['A', rational(180)], ['B', rational(130)], ['C', rational(150)]
  ]);
  assert.deepEqual(result.normalized.proposals, []);
  assert.equal(result.normalized.projectedComplete, false);
  assert.equal(result.normalized.canConfirm, false);
});

test('independent I06 malformed outside-scope saved data nulls all quantitative claims', () => {
  const s = state(); s.allocations.push({ lineId: 'sku', locationId: 'B', quantity: q('broken'), source: 'derived' });
  const result = evalDraft(s, start(s, { scope: ['A'] }));
  assert.equal(result.status, 'INVALID');
  assert.equal(result.normalized.fixedSum, null);
  assert.equal(result.normalized.residualBeforeSuggestions, null);
  assert.equal(result.normalized.projectedResidual, null);
  assert.ok(result.normalized.sites.every(row => row.currentMaximum === null));
  assert.equal(result.normalized.canConfirm, false);
});

test('independent I07 content changed at same state revision cannot be committed', () => {
  for (const mutate of [
    s => { s.allocations[0].quantity.raw = '55'; },
    s => { s.lines[0].unitTable.factors.tray = '20'; },
    s => { s.lines[0].specVersion = 'synthetic-spec-2'; },
    s => { s.locations[1].minimum = q(160); }
  ]) {
    const original = state(), session = start(original), concurrent = structuredClone(original); mutate(concurrent);
    const result = confirmAllocation(concurrent, session, { expectedDraftRevision: 0, acceptProposals: true });
    assert.deepEqual(result.reasonCodes, ['ALLOCATION_SNAPSHOT_STALE']);
    assert.equal(result.writes, 0); assert.deepEqual(result.state, concurrent);
  }
});

test('independent I07 direct draft mutation and conflicting transaction IDs fail closed', () => {
  const s = state(), session = start(s), tampered = structuredClone(session);
  tampered.entries[0].quantity.raw = '60';
  assert.deepEqual(confirmAllocation(s, tampered, { expectedDraftRevision: 0, acceptProposals: true }).reasonCodes, ['DRAFT_CONTENT_STALE']);
  const saved = confirmAllocation(s, session, { expectedDraftRevision: 0, acceptProposals: true });
  assert.equal(saved.writes, 1);
  const repeated = confirmAllocation(saved.state, session, { expectedDraftRevision: 0, acceptProposals: true });
  assert.equal(repeated.writes, 0); assert.equal(repeated.idempotent, true);
  const newSessionSameId = start(saved.state);
  const conflicted = confirmAllocation(saved.state, newSessionSameId, { expectedDraftRevision: 0, acceptProposals: true });
  assert.deepEqual(conflicted.reasonCodes, ['TRANSACTION_ID_REUSED']); assert.equal(conflicted.writes, 0);
});

test('independent I07 cancel keeps concurrent storage and restores original exposure', () => {
  const s = state(), original = structuredClone(s);
  let session = start(s, { exposure: { sku: { A: true, B: false } } });
  session = editAllocation(s, session, { type: 'set', locationId: 'A', quantity: q(60) }).session;
  session = editAllocation(s, session, { type: 'exposure', value: { sku: { A: false, B: true } } }).session;
  const concurrent = structuredClone(s); concurrent.revision++; concurrent.allocations[0].quantity.raw = '70';
  const cancelled = cancelAllocation(concurrent, session);
  assert.deepEqual(cancelled.state, concurrent); assert.equal(cancelled.writes, 0);
  assert.deepEqual(cancelled.exposure, { sku: { A: true, B: false } });
  assert.deepEqual(s, original);
});

test('independent I07 exact converted unit never changes monthly physical quantity', () => {
  const s = state();
  const changed = editAllocation(s, start(s), { type: 'convertUnit', locationId: 'A', unit: 'tray', reviewed: true });
  assert.equal(changed.session.entries[0].quantity.raw, '5/3');
  assert.deepEqual(changed.evaluation.normalized.fixedSum, rational(50));
  assert.deepEqual(changed.evaluation.normalized.proposals[0].baseQuantity, rational(150));
  const confirmed = confirmAllocation(s, changed.session, { expectedDraftRevision: changed.session.revision, acceptProposals: true });
  assert.equal(confirmed.writes, 1);
  assert.equal(confirmed.state.allocations[0].quantity.unit, 'tray');
  assert.deepEqual(evaluateAllocation({ state: confirmed.state, lineId: 'sku' }).normalized.fixedSum, rational(200));
});

test('independent I06 zero residual never fills a required blank with false completion', () => {
  const s = state(); s.allocations[0].quantity.raw = '200';
  const result = evalDraft(s, start(s));
  assert.deepEqual(result.normalized.residualBeforeSuggestions, rational(0));
  assert.deepEqual(result.normalized.proposals, []);
  assert.equal(result.normalized.projectedComplete, false);
  assert.equal(confirmAllocation(s, start(s), { expectedDraftRevision: 0, acceptProposals: true }).writes, 0);
});

test('independent I08 once boundary equality requires confirmation without monthly hard cap', () => {
  const s = state(); const entries = [{ locationId: 'A', quantity: q(50) }, { locationId: 'B', quantity: q(150) }];
  const first = evaluateOnceAllocation({ state: s, lineId: 'sku', entries });
  assert.equal(first.status, 'INCOMPLETE');
  assert.equal(first.normalized.monthlyHardCapApplied, false);
  const second = evaluateOnceAllocation({ state: s, lineId: 'sku', entries: [...entries].reverse(), confirmedFingerprint: first.normalized.fingerprint });
  assert.equal(second.status, 'VALID');
  assert.deepEqual(second.normalized.sum, rational(200));
  entries[1].quantity = q(151);
  assert.equal(evaluateOnceAllocation({ state: s, lineId: 'sku', entries, confirmedFingerprint: first.normalized.fingerprint }).status, 'INCOMPLETE');
});
