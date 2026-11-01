import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {calculateQuote} from '../../src/engine/calculation/quote.mjs';
import {quote as legacyQuote} from '../../src/quote.mjs';
import {catalog,priceBook,rules,oneSite,twoSites,asOf} from '../fixtures/engine/calculation-data.mjs';
const request = input => structuredClone({input,catalog,priceBook,rules});

test('two groups and multiple sites: hand table 2 trays 20.50 + 3 bags 24.00 = 44.50',()=>{
  const result=calculateQuote(request(twoSites));
  assert.equal(result.status,'VALID');
  assert.equal(result.normalized.total.decimal,'44.50');
  assert.deepEqual(result.normalized.lines.map(l=>l.amount),[{numerator:'41',denominator:'2'},{numerator:'24',denominator:'1'}]);
  assert.deepEqual(result.normalized.lines[1].baseQuantity,{numerator:'7500',denominator:'1'});
  assert.deepEqual(result.normalized.lines[1].pricedQuantity,{numerator:'15',denominator:'2'});
  assert.equal(result.normalized.comparison.difference.decimal,'5.50');
  assert.equal(result.normalized.siteSubtotals.length,2);
  assert.equal(result.evidence.realOrderApproval,false);
  assert.deepEqual(calculateQuote(result.evidence.replay),result);
  assert.doesNotThrow(()=>JSON.stringify(result));
});
test('one site and equivalent units retain quantity and price',()=>{
  const trays=calculateQuote(request(oneSite));
  const eachInput=structuredClone(oneSite);eachInput.lines[0].quantity='60';eachInput.lines[0].unit='each';
  const each=calculateQuote(request(eachInput));
  assert.equal(trays.normalized.total.decimal,'20.50');
  assert.deepEqual(each.normalized.total,trays.normalized.total);
  assert.equal(trays.normalized.comparison,null);
});
test('real empty pricebook never becomes synthetic or zero priced',async()=>{
  const real=JSON.parse(await readFile(new URL('../../data/offers.json',import.meta.url)));
  assert.deepEqual(real.offers,[]);
  const result=calculateQuote({...request(oneSite),priceBook:{version:'main-empty-offers',offers:real.offers}});
  assert.equal(result.status,'UNAVAILABLE');assert.deepEqual(result.reasonCodes,['PRICE_UNAVAILABLE']);assert.equal(result.normalized,null);
});
test('missing cost policy preserves known merchandise, blocks final total',()=>{
  const r=request(oneSite);delete r.rules.costComponents.tax;
  const result=calculateQuote(r);
  assert.equal(result.status,'POLICY_UNRESOLVED');
  assert.equal(result.normalized.displayedMerchandiseSubtotal.decimal,'20.50');
  assert.equal(result.normalized.total,null);assert.deepEqual(result.reasonCodes,['TAX_POLICY_REQUIRED']);
});
test('unapproved, expired and future prices cannot be selected',()=>{
  for (const change of [{status:'DRAFT'},{effectiveTo:asOf},{approvedAt:'2027-01-01T00:00:00.000Z'},{effectiveFrom:'2027-01-01T00:00:00.000Z'}]) {
    const r=request(oneSite);Object.assign(r.priceBook.offers[0],change);assert.equal(calculateQuote(r).status,'UNAVAILABLE');
  }
  const missing=request(oneSite);delete missing.priceBook.offers[0].approvalId;assert.equal(calculateQuote(missing).status,'INVALID');
});
test('selection, identity, constraints and malformed quantities are distinct failures',()=>{
  const cases=[
    [r=>delete r.input.lines[0].offerId,'POLICY_UNRESOLVED','PRICE_SELECTION_REQUIRED'],
    [r=>r.input.lines[0].quantity=0.1,'INVALID','EXACT_STRING_REQUIRED'],
    [r=>r.input.lines[0].quantity='-1','INVALID','QUANTITY_NOT_POSITIVE'],
    [r=>r.input.lines[0].unit='unknown','UNAVAILABLE','UNIT_CONVERSION_UNAVAILABLE'],
    [r=>r.priceBook.offers[0].minQuantity='3','UNAVAILABLE','QUANTITY_CONSTRAINT_UNSATISFIED'],
    [r=>r.priceBook.offers[0].quantityStep='3','UNAVAILABLE','QUANTITY_STEP_UNSATISFIED'],
    [r=>r.priceBook.offers[0].availableQuantity='0','UNAVAILABLE','INSUFFICIENT_DECLARED_STOCK'],
    [r=>Object.assign(r.priceBook.offers[0],{minQuantity:'3',maxQuantity:'2'}),'INVALID','QUANTITY_CONSTRAINT_INVALID'],
    [r=>r.priceBook.offers[0].regions=['fixture-other'],'UNAVAILABLE','REGION_CONSTRAINT_UNSATISFIED'],
    [r=>r.input.lines.push({...r.input.lines[0]}),'INVALID','LINE_IDS_INVALID'],
    [r=>r.input.asOf='2026-02-31T00:00:00.000Z','INVALID','EXPLICIT_CANONICAL_TIME_REQUIRED']
  ];
  for(const [change,status,reason] of cases){const r=request(oneSite);change(r);const result=calculateQuote(r);assert.equal(result.status,status);assert.deepEqual(result.reasonCodes,[reason]);}
});
test('rounding occurs once on total; declared amounts do not imply a tax rate',()=>{
  const r=request(oneSite);r.input.lines[0].quantity='1';r.priceBook.offers[0].unitPrice='0.005';
  r.input.lines.push({...r.input.lines[0],id:'second'});
  assert.equal(calculateQuote(r).normalized.total.decimal,'0.01');
  r.rules.costComponents.tax={amount:'1.125',ruleId:'TEST_FIXED_TAX'};
  r.rules.costComponents.shipping={amount:'2',ruleId:'TEST_SHIPPING'};
  r.rules.costComponents.discount={amount:'0.1',ruleId:'TEST_DISCOUNT'};
  assert.equal(calculateQuote(r).normalized.total.decimal,'3.04');
});
test('declared stock is shared across lines and sites using the same offer',()=>{
  const r=request(oneSite);r.priceBook.offers[0].availableQuantity='3';
  r.input.lines.push({...r.input.lines[0],id:'other-site-line',siteId:'fixture-site-b'});
  assert.deepEqual(calculateQuote(r).reasonCodes,['INSUFFICIENT_DECLARED_STOCK']);
});
test('legacy quote integer-price path agrees while original entrypoint is unchanged',()=>{
  const q={housing:'4',size:'XL',pack:30,region:'TEST_REGION',monthlyTrays:200,dropTrays:50,currentTrayPrice:7000};
  const legacyOffer={id:'fixture-legacy',priceRevision:'fixture-r1',status:'APPROVED',housing:4,size:'XL',pack:30,regions:['TEST_REGION'],minMonthlyTrays:200,minDropTrays:40,pricePerTray:6600,effectiveFrom:'2026-10-01T00:00:00Z'};
  const legacy=legacyQuote([legacyOffer],q,new Date(asOf));
  assert.equal(legacy.monthlyPrice,1320000);assert.equal(legacy.savingPerMonth,80000);
  const r=request(oneSite);r.input.lines[0].quantity='200';r.priceBook.offers[0].unitPrice='6600';r.input.comparisonTotal='1400000';
  assert.equal(calculateQuote(r).normalized.total.decimal,'1320000.00');
  assert.equal(calculateQuote(r).normalized.comparison.difference.decimal,'80000.00');
  assert.equal(legacyQuote([],q,new Date(asOf)).kind,'unavailable');
});
