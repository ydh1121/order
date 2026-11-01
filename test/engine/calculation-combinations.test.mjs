import test from 'node:test';
import assert from 'node:assert/strict';
import { enumerateCombinations } from '../../src/engine/calculation/combinations.mjs';
import { smallCombinationFixture as fixture, smallAccepted, smallExcluded } from '../fixtures/engine/calculation-combinations.mjs';

test('E08 hand-listed complete 2×2×2 combinations and all exclusion reasons', () => {
  const result = enumerateCombinations(fixture);
  assert.equal(result.status, 'VALID');
  assert.deepEqual(result.accepted, smallAccepted);
  assert.deepEqual(result.excluded.map(row => [row.candidate, row.reasonCodes]), smallExcluded);
  assert.equal(result.evidence.totalCandidates, '8');
  assert.equal(result.evidence.unexploredCandidates, '0');
  assert.equal(result.evidence.globalOptimumClaimed, false);
});

test('E08 budget stops without claiming exhaustion, optimum, or hiding omissions', () => {
  const result = enumerateCombinations({ ...fixture, maxCandidates: 3 });
  assert.equal(result.status, 'UNKNOWN');
  assert.deepEqual(result.reasonCodes, ['SEARCH_BUDGET_EXHAUSTED']);
  assert.equal(result.evidence.totalCandidates, '8');
  assert.equal(result.evidence.visitedCandidates, '3');
  assert.equal(result.evidence.unexploredCandidates, '5');
  assert.deepEqual(result.accepted, [smallAccepted[0]]);
  assert.equal(result.evidence.complete, false);
  assert.equal(enumerateCombinations({ ...fixture, maxCandidates: 0 }).evidence.visitedCandidates, '0');
});

test('E08 seed produces identical replay with no mutation or duplicate candidates', () => {
  const input = { ...fixture, order: 'seeded', maxCandidates: 3 };
  const before = JSON.stringify(input);
  const result = enumerateCombinations(input);
  assert.deepEqual(enumerateCombinations(input), result);
  assert.equal(JSON.stringify(input), before);
  const all = enumerateCombinations({ ...input, maxCandidates: 8 });
  assert.deepEqual(all.accepted.map(JSON.stringify).sort(), smallAccepted.map(JSON.stringify).sort());
  assert.equal(new Set([...all.accepted, ...all.excluded.map(x => x.candidate)].map(JSON.stringify)).size, 8);
});

test('E08 unavailable axes remain unavailable and malformed constraints never silently pass', () => {
  assert.equal(enumerateCombinations({ ...fixture, axes: [] }).status, 'UNAVAILABLE');
  assert.equal(enumerateCombinations({ ...fixture, axes: [{ id: 'group', dataVersion: 'v1', values: [] }] }).status, 'UNAVAILABLE');
  for (const constraints of [[{ id: 'bad', reasonCode: 'BAD', type: 'mystery', axis: 'group' }],
    [{ id: 'bad', reasonCode: 'BAD', type: 'eq', axis: 'notPresent', value: 'x' }],
    [{ id: 'bad', reasonCode: 'BAD', type: 'gte', axis: 'group', value: 3 }]]) {
    assert.equal(enumerateCombinations({ ...fixture, constraints }).status, 'INVALID');
  }
});

test('E08 malformed axes and limits are rejected, missing versions cannot claim replay', () => {
  assert.equal(enumerateCombinations({ ...fixture, ruleVersion: '' }).status, 'INVALID');
  assert.equal(enumerateCombinations({ ...fixture, maxCandidates: 100001 }).status, 'INVALID');
  assert.equal(enumerateCombinations({ ...fixture, seed: -1 }).status, 'INVALID');
  assert.equal(enumerateCombinations({ ...fixture, axes: [{ id: 'x', dataVersion: 'v1', values: [1, 1] }] }).status, 'INVALID');
  assert.equal(enumerateCombinations({ ...fixture, axes: [{ id: 'x', dataVersion: 'v1', values: [0.1] }] }).status, 'INVALID');
  assert.equal(enumerateCombinations({ ...fixture, axes: [{ id: 'x', dataVersion: 'v1', values: 'not an array' }] }).status, 'INVALID');
});

test('E08 large theoretical cardinality is exact before bounded traversal', () => {
  const axes = Array.from({ length: 20 }, (_, n) => ({ id: `axis${n}`, dataVersion: 'v1', values: Array.from({ length: 10 }, (_, i) => i) }));
  const result = enumerateCombinations({ ...fixture, axes, constraints: [], maxCandidates: 2 });
  assert.equal(result.evidence.totalCandidates, '100000000000000000000');
  assert.equal(result.evidence.unexploredCandidates, '99999999999999999998');
  assert.equal(result.accepted.length, 2);
});

test('E08 every supported scalar constraint has independent boundary expectations', () => {
  const axes = [{ id: 'qty', dataVersion: 'v1', values: [1, 2, 3, 4] }];
  const constraints = [
    { id: 'min', reasonCode: 'MIN', type: 'gte', axis: 'qty', value: 2 },
    { id: 'max', reasonCode: 'MAX', type: 'lte', axis: 'qty', value: 3 },
    { id: 'except', reasonCode: 'EXCEPT', type: 'neq', axis: 'qty', value: 3 },
    { id: 'listed', reasonCode: 'LISTED', type: 'in', axis: 'qty', values: [1, 2, 3] }
  ];
  const result = enumerateCombinations({ ...fixture, axes, constraints });
  assert.deepEqual(result.accepted, [{ qty: 2 }]);
  assert.deepEqual(result.excluded.map(x => x.reasonCodes), [['MIN'], ['EXCEPT'], ['MAX', 'LISTED']]);
});
test('E08 exhaustive but fully excluded search is unavailable, not a successful zero result',()=>{
  const result=enumerateCombinations({...fixture,constraints:[{id:'deny',reasonCode:'NO_SELECTED_SITE',type:'eq',axis:'site',value:'siteC'}]});
  assert.equal(result.status,'UNAVAILABLE');assert.deepEqual(result.reasonCodes,['NO_FEASIBLE_COMBINATIONS']);
  assert.equal(result.evidence.complete,true);assert.equal(result.accepted.length,0);assert.equal(result.excluded.length,8);
});
