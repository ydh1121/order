import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateQuote} from '../../src/engine/calculation/quote.mjs';
import {catalog,priceBook,rules,oneSite,asOf} from '../fixtures/engine/calculation-data.mjs';

// Synthetic one-off demand only. These amounts are independent hand oracles,
// not an approved supplier, shipping rule, or monthly conversion policy.
function request() {
  const value = structuredClone({input:oneSite,catalog,priceBook,rules});
  value.input.lines[0].quantity='10';
  value.input.lines[0].region='TEST_REGION';
  value.priceBook.offers[0].unitPrice='4800';
  value.input.comparisonTotal='50000';
  const basis={periodId:'fixture-once-demand',cadenceId:'fixture-once',deliveryTermsId:'fixture-terms',costBasisId:'fixture-tax-shipping-discount-included'};
  value.input.comparisonContext={proposed:{...basis},current:{...basis,currency:'KRW',lines:value.input.lines.map(({productId,siteId,region,quantity,unit})=>({productId,siteId,region,quantity,unit}))},source:{id:'fixture-current-invoice',observedAt:asOf}};
  return value;
}

test('same declared basis: 50,000 vs 48,000; shipping 3,000 makes 51,000 and -1,000',()=>{
  const r=request(), before=structuredClone(r), result=calculateQuote(r);
  assert.equal(result.status,'VALID');
  assert.deepEqual(result.normalized.comparisonEligibility,{status:'ELIGIBLE',reasonCodes:[]});
  assert.equal(result.normalized.total.decimal,'48000.00');
  assert.equal(result.normalized.comparison.current.decimal,'50000.00');
  assert.equal(result.normalized.comparison.current.minorUnits,'5000000');
  assert.equal(result.normalized.comparison.current.scale,2);
  assert.deepEqual(result.normalized.comparison.previous,{numerator:'50000',denominator:'1'});
  assert.equal(result.normalized.comparison.difference.decimal,'2000.00');
  assert.deepEqual(r,before);
  r.rules.costComponents.shipping.amount='3000';
  const delivered=calculateQuote(r);
  assert.equal(delivered.normalized.total.decimal,'51000.00');
  assert.equal(delivered.normalized.comparison.difference.decimal,'-1000.00');
});

test('current purchase quantities compare by exact catalog units and aggregation',()=>{
  const r=request(), current=r.input.comparisonContext.current;
  current.lines[0].quantity='120';current.lines[0].unit='each';
  current.lines.push({...current.lines[0],quantity:'180'});
  assert.equal(calculateQuote(r).normalized.comparisonEligibility.status,'ELIGIBLE');
  current.lines[1].quantity='179';
  const result=calculateQuote(r);
  assert.equal(result.normalized.comparisonEligibility.status,'INELIGIBLE');
  assert.equal(result.normalized.comparison,null);
  assert.equal(result.normalized.total.decimal,'48000.00');
});

test('period/cadence/terms/cost basis/currency/product/site/region mismatches block comparison only',()=>{
  const cases=[
    r=>r.input.comparisonContext.current.periodId='fixture-month',
    r=>r.input.comparisonContext.current.cadenceId='fixture-weekly',
    r=>r.input.comparisonContext.current.deliveryTermsId='other-terms',
    r=>r.input.comparisonContext.current.costBasisId='merchandise-only',
    r=>r.input.comparisonContext.current.currency='USD',
    r=>r.input.comparisonContext.current.lines[0].productId='fixture-flour',
    r=>r.input.comparisonContext.current.lines[0].siteId='other-site',
    r=>r.input.comparisonContext.current.lines[0].region='other-region',
    r=>r.input.lines[0].cadenceId='fixture-weekly',
    r=>r.input.comparisonContext.current.lines[0].periodId='different-period',
    r=>r.input.comparisonContext.current.lines[0].cadenceId='different-cadence',
    r=>r.input.comparisonContext.current.lines[0].deliveryTermsId='different-terms',
    r=>r.input.comparisonContext.current.lines[0].costBasisId='different-costs'
  ];
  for(const change of cases) {
    const r=request();change(r);
    // The other catalog product uses kg rather than trays.
    if(r.input.comparisonContext.current.lines[0].productId==='fixture-flour') r.input.comparisonContext.current.lines[0].unit='kg';
    const result=calculateQuote(r);
    assert.equal(result.status,'VALID');
    assert.equal(result.normalized.comparisonEligibility.status,'INELIGIBLE');
    assert.equal(result.normalized.comparison,null);
  }
});

test('missing or invalid declared comparison basis stays unresolved without monthly conversion',()=>{
  const cases=[
    r=>r.input.comparisonContext.proposed.periodId=null,
    r=>r.input.comparisonContext.current.periodId=' ',
    r=>r.input.comparisonContext.current.cadenceId='x'.repeat(201),
    r=>delete r.input.comparisonContext.current.deliveryTermsId,
    r=>r.input.comparisonContext.current.currency='krw',
    r=>r.input.comparisonContext.current.lines[0].unit='pack',
    r=>r.input.comparisonContext.current.lines[0].quantity=0.1,
    r=>r.input.comparisonContext.current.lines[0].region=null,
    r=>r.input.comparisonContext.source.observedAt='2026-02-31T00:00:00.000Z',
    r=>r.input.comparisonContext.source.observedAt='2027-01-01T00:00:00.000Z',
    r=>r.input.comparisonContext.source.id=' '
  ];
  for(const change of cases) {
    const r=request();change(r);const result=calculateQuote(r);
    assert.equal(result.status,'VALID');
    assert.equal(result.normalized.comparisonEligibility.status,'POLICY_UNRESOLVED');
    assert.equal(result.normalized.comparison,null);
    assert.equal(Object.hasOwn(result.normalized,'monthlySavings'),false);
  }
});

test('legacy arithmetic remains private and explicit current price absence is not zero savings',()=>{
  const r=request();delete r.input.comparisonContext;
  const legacy=calculateQuote(r);
  assert.equal(legacy.normalized.comparison.difference.decimal,'2000.00');
  assert.deepEqual(legacy.normalized.comparisonEligibility,{status:'POLICY_UNRESOLVED',reasonCodes:['COMPARISON_BASIS_REQUIRED']});
  r.input.comparisonTotal=null;
  const noCurrent=calculateQuote(r);
  assert.equal(noCurrent.normalized.total.decimal,'48000.00');
  assert.equal(noCurrent.normalized.comparison,null);
  assert.equal(noCurrent.normalized.comparisonEligibility.status,'CURRENT_PRICE_MISSING');
});

test('unknown component amounts and rule IDs preserve subtotal while blocking total',()=>{
  for(const amount of [null,undefined]) {
    const r=request();r.rules.costComponents.shipping.amount=amount;
    const result=calculateQuote(r);
    assert.equal(result.status,'POLICY_UNRESOLVED');
    assert.deepEqual(result.reasonCodes,['SHIPPING_POLICY_REQUIRED']);
    assert.equal(result.normalized.displayedMerchandiseSubtotal.decimal,'48000.00');
    assert.equal(result.normalized.total,null);assert.equal(result.normalized.comparison,null);
    assert.deepEqual(calculateQuote(result.evidence.replay),result);
  }
  const r=request();r.rules.costComponents.shipping.ruleId='';
  const result=calculateQuote(r);
  assert.equal(result.status,'POLICY_UNRESOLVED');assert.equal(result.normalized.total,null);
  assert.equal(result.normalized.displayedMerchandiseSubtotal.decimal,'48000.00');
});

test('declared period/cadence/delivery restrictions cannot be silently filled or ignored',()=>{
  for(const [key,field,label] of [['periodIds','periodId','PERIOD'],['cadenceIds','cadenceId','CADENCE'],['deliveryTermsIds','deliveryTermsId','DELIVERY_TERMS']]) {
    const r=request();r.priceBook.offers[0][key]=[r.input.comparisonContext.proposed[field]];
    assert.equal(calculateQuote(r).status,'VALID');
    delete r.input.comparisonContext.proposed[field];
    assert.deepEqual(calculateQuote(r).reasonCodes,[`${label}_CONDITION_REQUIRED`]);
    r.input.lines[0][field]='different';
    assert.deepEqual(calculateQuote(r).reasonCodes,[`${label}_CONSTRAINT_UNSATISFIED`]);
    r.priceBook.offers[0][key]=[];
    assert.deepEqual(calculateQuote(r).reasonCodes,[`${label}_CONSTRAINT_INVALID`]);
  }
});

test('effectiveTo remains excluded and is distinguishable from a future offer',()=>{
  const r=request();r.priceBook.offers[0].effectiveTo=asOf;
  const expired=calculateQuote(r);
  assert.deepEqual(expired.reasonCodes,['PRICE_NOT_EFFECTIVE']);
  assert.equal(expired.evidence.validity.status,'EXPIRED');
  delete r.priceBook.offers[0].effectiveTo;r.priceBook.offers[0].effectiveFrom='2027-01-01T00:00:00.000Z';
  assert.equal(calculateQuote(r).evidence.validity.status,'NOT_YET_EFFECTIVE');
  r.priceBook.offers[0].effectiveFrom='2026-10-01T00:00:00.000Z';r.priceBook.offers[0].effectiveTo='2027-01-01T00:00:00.000Z';
  assert.equal(calculateQuote(r).normalized.validUntil,'2027-01-01T00:00:00.000Z');
});

test('stock provenance and caller selection never become reservation or global optimum',()=>{
  const r=request();r.priceBook.offers[0].availableQuantity='100';
  r.priceBook.offers[0].inventorySource={id:'fixture-stock-report',observedAt:asOf};
  r.priceBook.offers.push({...r.priceBook.offers[0],id:'fixture-cheaper-unselected',unitPrice:'1'});
  const result=calculateQuote(r);
  assert.equal(result.normalized.total.decimal,'48000.00');
  assert.deepEqual(result.normalized.lines[0].inventory,{status:'DECLARED_NOT_RESERVED',availableQuantity:{numerator:'100',denominator:'1'},sourceId:'fixture-stock-report',observedAt:asOf});
  assert.equal(result.evidence.optimization,'NOT_PERFORMED');
  assert.equal(result.evidence.stockReservation,'NOT_PERFORMED');
  assert.equal(result.evidence.fulfillmentStatus,'NOT_VERIFIED');
  assert.equal(result.evidence.realOrderApproval,false);
  assert.deepEqual(calculateQuote(result.evidence.replay),result);
});
