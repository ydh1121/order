import test from 'node:test';
import assert from 'node:assert/strict';
import { exact, rational, add, divide, toJSON, round } from '../../src/engine/calculation/exact.mjs';
import { monthlyDayIntent, periodQuantity } from '../../src/engine/calculation/period.mjs';
import { calculateQuote } from '../../src/engine/calculation/quote.mjs';
import { reviewRequest } from '../fixtures/engine/calculation-review.mjs';

test('E10 independent sign/tie rounding table and exact decimal sum', () => {
  assert.deepEqual(toJSON(add(exact('0.1'), exact('0.2'))), { numerator: '3', denominator: '10' });
  const examples = [
    ['2.5', 'HALF_EVEN', '2'], ['3.5', 'HALF_EVEN', '4'],
    ['-2.5', 'HALF_EVEN', '-2'], ['-3.5', 'HALF_EVEN', '-4'],
    ['-2.5', 'HALF_UP', '-3'], ['-2.1', 'DOWN', '-2'],
    ['-2.1', 'FLOOR', '-3'], ['-2.1', 'CEIL', '-2'],
    ['2.1', 'FLOOR', '2'], ['2.1', 'CEIL', '3']
  ];
  for (const [number, mode, expected] of examples) assert.equal(round(exact(number), { scale: 0, mode }).decimal, expected);
  assert.equal(round(exact('-0.001'), { scale: 2, mode: 'DOWN' }).decimal, '0.00');
});

test('E10 parser/rational/rounding limits reject unsafe implicit precision', () => {
  assert.throws(() => exact(0.1), /EXACT_STRING_REQUIRED/);
  assert.throws(() => exact('1e3'), /INVALID_EXACT_DECIMAL/);
  assert.throws(() => rational(1n, 0n), /DIVISION_BY_ZERO/);
  assert.throws(() => round(exact('9'.repeat(120)), { scale: 1, mode: 'DOWN' }), /ARITHMETIC_RANGE/);
  assert.deepEqual(toJSON(divide(exact('1'), exact('3'))), { numerator: '1', denominator: '3' });
  assert.deepEqual(toJSON(rational(10n ** 120n, 10n ** 120n)), { numerator: '1', denominator: '1' });
});

test('E11 Gregorian century rules and date intent are not delivery approval', () => {
  const examples = [[1900, 28], [2000, 29], [2027, 28], [2028, 29]];
  for (const [year, expected] of examples) {
    const result = monthlyDayIntent({ year, month: 2, day: 'last' });
    assert.equal(result.normalized.resolvedDay, expected);
    assert.equal(result.evidence.deliveryApproval, false);
  }
  const thirtyFirst = monthlyDayIntent({ year: 2026, month: 4, day: 31 });
  assert.equal(thirtyFirst.status, 'POLICY_UNRESOLVED');
  assert.equal(thirtyFirst.normalized.intent.day, 31);
  assert.equal(thirtyFirst.normalized.resolvedDay, null);
  assert.equal(monthlyDayIntent({ year: 2026, month: 4, day: 'last' }).normalized.resolvedDay, 30);
  assert.equal(periodQuantity({ perDelivery: '2', weeklyVisits: '1', period: { kind: 'THIRTY_DAYS' } }).status, 'POLICY_UNRESOLVED');
});

test('E10 total rounding happens once after two independent half-minor-unit lines', () => {
  const result = calculateQuote(structuredClone(reviewRequest));
  assert.equal(result.status, 'VALID');
  // 0.005 + 0.005 = 0.010; rounding individual lines would wrongly yield 0.02.
  assert.equal(result.normalized.total.decimal, '0.01');
  assert.deepEqual(result.normalized.merchandiseSubtotal, { numerator: '1', denominator: '100' });
  assert.deepEqual(result.normalized.siteSubtotals, [
    { siteId: 'testSiteA', amount: { numerator: '1', denominator: '200' } },
    { siteId: 'testSiteB', amount: { numerator: '1', denominator: '200' } }
  ]);
  assert.equal(result.evidence.lineRounding, false);
  assert.equal(result.evidence.realOrderApproval, false);
});

test('E10 captured calculation evidence survives caller mutation', () => {
  const request = structuredClone(reviewRequest);
  const result = calculateQuote(request);
  request.input.lines[0].quantity = '999';
  request.priceBook.offers[0].unitPrice = '999';
  assert.equal(result.evidence.replay.input.lines[0].quantity, '1');
  assert.equal(result.evidence.replay.priceBook.offers[0].unitPrice, '0.005');
  assert.equal(result.normalized.total.decimal, '0.01');
});

test('E11 missing costs retain merchandise evidence without inventing zero final total', () => {
  const request = structuredClone(reviewRequest);
  delete request.rules.costComponents.tax;
  const result = calculateQuote(request);
  assert.equal(result.status, 'POLICY_UNRESOLVED');
  assert.deepEqual(result.reasonCodes, ['TAX_POLICY_REQUIRED']);
  assert.equal(result.normalized.total, null);
  assert.equal(result.normalized.displayedMerchandiseSubtotal.decimal, '0.01');
});

test('E10 approval and quantity boundaries reject before pricing', () => {
  for (const [change, reason] of [
    [request => { request.input.asOf = '2026-12-01T00:00:00.000Z'; }, 'PRICE_NOT_EFFECTIVE'],
    [request => { request.priceBook.offers[0].approvedAt = '2026-11-01T00:00:00.001Z'; }, 'PRICE_NOT_EFFECTIVE'],
    [request => { request.priceBook.offers[0].productId = 'different'; }, 'PRICE_PRODUCT_MISMATCH'],
    [request => { request.priceBook.offers[0].minQuantity = '2'; }, 'QUANTITY_CONSTRAINT_UNSATISFIED'],
    [request => { request.priceBook.offers[0].quantityStep = '2'; }, 'QUANTITY_STEP_UNSATISFIED']
  ]) {
    const request = structuredClone(reviewRequest); change(request);
    const result = calculateQuote(request);
    assert.notEqual(result.status, 'VALID');
    assert.deepEqual(result.reasonCodes, [reason]);
    assert.equal(result.normalized, null);
  }
});
