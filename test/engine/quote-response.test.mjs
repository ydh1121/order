import test from 'node:test';
import assert from 'node:assert/strict';
import {customerQuoteResponse,readCustomerQuoteResponse,quoteProofGate} from '../../src/engine/contracts/quote-response.mjs';

const amount=(decimal,minorUnits=decimal)=>({decimal,minorUnits,scale:0,exact:{numerator:minorUnits,denominator:'1'},mode:'HALF_EVEN'});
const result=()=>({status:'VALID',normalized:{currency:'KRW',total:amount('48000'),comparison:{difference:amount('2000'),current:amount('50000')},comparisonEligibility:{status:'ELIGIBLE'},validUntil:'2026-11-07T00:00:00.000Z',lines:[{privateTerms:'PRIVATE'}]},raw:{customer:'PRIVATE'},evidence:{replay:{catalog:{secret:'PRIVATE'},priceBook:{key:'PRIVATE'},rules:{private:'PRIVATE'}}}});
const envelope=results=>customerQuoteResponse({requestId:'public-request',inputRevision:1,results});

test('customer quote is an explicit bounded projection without replay, source, line, key, exception or exact data',()=>{
  const dto=envelope([result()]);
  assert.deepEqual(dto.quotes,[{currency:'KRW',total:{decimal:'48000',minorUnits:'48000',scale:0},comparison:{difference:{decimal:'2000',minorUnits:'2000',scale:0},current:{decimal:'50000',minorUnits:'50000',scale:0}},comparisonEligibility:'ELIGIBLE',validUntil:'2026-11-07T00:00:00.000Z',basis:{scope:'DECLARED_LINES',period:'UNRESOLVED'},grants:{orderConfirmed:false,stockReserved:false,deliveryGuaranteed:false,globalMinimum:false}}]);
  const serialized=JSON.stringify(dto);
  for(const secret of ['PRIVATE','replay','priceBook','catalog','privateTerms','exact','HALF_EVEN'])assert.equal(serialized.includes(secret),false);
});
test('unresolved or absent current price cannot claim zero savings from legacy internal arithmetic',()=>{
  for(const status of ['POLICY_UNRESOLVED','CURRENT_PRICE_MISSING','INELIGIBLE']){
    const value=result();value.normalized.comparisonEligibility.status=status;
    const dto=envelope([value]);assert.equal(dto.quotes[0].comparison,null);
    const proof=quoteProofGate({status:'COMPLETE',response:dto});assert.equal(proof.amountAllowed,true);assert.equal(proof.noSavingsAllowed,false);assert.equal(proof.comparisonAllowed,false);
  }
});
test('positive zero negative differences have distinct proof with no commercial or global-minimum grants',()=>{
  for(const [value,saving,equal,increase] of [['2000',true,false,false],['0',false,true,false],['-1000',false,false,true]]){
    const r=result();r.normalized.comparison.difference=amount(value);
    const proof=quoteProofGate({status:'COMPLETE',response:envelope([r])});
    assert.equal(proof.savingsAllowed,saving);assert.equal(proof.noSavingsAllowed,equal);assert.equal(proof.increaseAllowed,increase);
    for(const key of ['orderConfirmed','stockReserved','deliveryGuaranteed','globalMinimum'])assert.equal(proof[key],false);
  }
});
test('partial one and partial zero cannot claim overall completion or confirmed quote-view when empty',()=>{
  for(const values of [[],[result()]]){
    const dto=customerQuoteResponse({requestId:'partial',inputRevision:1,completion:'PARTIAL',results:values});
    const proof=quoteProofGate({status:'PARTIAL',response:dto});
    assert.equal(proof.amountAllowed,false);assert.equal(proof.comparisonAllowed,false);assert.equal(proof.partialAllowed,true);assert.equal(proof.viewPartialAllowed,values.length===1);
  }
});
test('invalid/unknown costs and expired calculations remain typed unavailable and expired, never an empty successful search',()=>{
  const missing=envelope([{status:'POLICY_UNRESOLVED',normalized:{total:null},reasonCodes:['SHIPPING_POLICY_REQUIRED']}]);
  assert.equal(missing.status,'UNAVAILABLE');assert.deepEqual(missing.reasonCodes,['CONDITIONS_UNRESOLVED']);
  const expired=envelope([{status:'UNAVAILABLE',evidence:{validity:{status:'EXPIRED'}}}]);
  assert.equal(expired.status,'EXPIRED');assert.deepEqual(expired.reasonCodes,['PRICE_EXPIRED']);
  const empty=envelope([]);assert.equal(empty.status,'OK');assert.deepEqual(empty.quotes,[]);
});
test('transport decoder strips arbitrary keys, nonallowed reasons and forged grants',()=>{
  const raw=envelope([result()]);raw.evidence={replay:'PRIVATE'};raw.reasonCodes=['PRIVATE','PRICE_UNAVAILABLE'];raw.quotes[0].grants.orderConfirmed=true;raw.quotes[0].supplierKey='PRIVATE';
  const dto=readCustomerQuoteResponse(raw);
  assert.equal(JSON.stringify(dto).includes('PRIVATE'),false);assert.equal(dto.quotes[0].grants.orderConfirmed,false);assert.deepEqual(dto.reasonCodes,['PRICE_UNAVAILABLE']);
});
test('malformed money, dates, candidate budgets and untrusted comparison claims fail closed',()=>{
  for(const mutate of [x=>x.quotes[0].total.decimal='0',x=>x.quotes[0].validUntil='tomorrow',x=>x.quotes[0].comparisonEligibility='INELIGIBLE',x=>x.quotes[0].total.minorUnits='9'.repeat(101),x=>x.status='FAILED',x=>x.quotes=Array(101).fill(x.quotes[0]),x=>delete x.quotes[0].comparison.current,x=>x.quotes[0].comparison.current={decimal:'50000.0',minorUnits:'500000',scale:1},x=>x.quotes[0].comparison.difference={decimal:'2000.0',minorUnits:'20000',scale:1}]){
    const raw=envelope([result()]);mutate(raw);assert.throws(()=>readCustomerQuoteResponse(raw),/INVALID_QUOTE_RESPONSE/);
  }
});
test('a failure reason cannot masquerade as successful empty search',()=>{
  for(const code of ['NETWORK_FAILURE','SOURCE_UNAVAILABLE','APPROVED_SOURCE_NOT_CONNECTED','SITE_NOT_AUTHORIZED']){
    const dto=envelope([]);dto.reasonCodes=[code];assert.throws(()=>readCustomerQuoteResponse(dto),/INVALID_QUOTE_RESPONSE/);
  }
});
test('current purchase total is projected from the core only and period semantics remain unresolved',()=>{
  const value=result();value.normalized.comparison.current=amount('50000');
  const dto=readCustomerQuoteResponse(envelope([value]));assert.deepEqual(dto.quotes[0].comparison.current,{decimal:'50000',minorUnits:'50000',scale:0});assert.equal(dto.quotes[0].basis.period,'UNRESOLVED');
});
test('missing trusted current total blocks comparison even if internal eligibility claims eligible',()=>{
  const value=result();delete value.normalized.comparison.current;
  const dto=envelope([value]);assert.equal(dto.quotes[0].comparison,null);assert.equal(dto.quotes[0].comparisonEligibility,'POLICY_UNRESOLVED');assert.equal(quoteProofGate({status:'COMPLETE',response:dto}).comparisonAllowed,false);
});
test('independently rounded exact difference is not recomputed from rounded displayed totals',()=>{
  const dto=envelope([result()]);const quote=dto.quotes[0];
  // Existing HALF_EVEN example: round(.015)=.02, round(.005)=.00,
  // round(.015-.005)=.01. Rounded displays do not form a subtraction oracle.
  quote.total={decimal:'0.00',minorUnits:'0',scale:2};quote.comparison.current={decimal:'0.02',minorUnits:'2',scale:2};quote.comparison.difference={decimal:'0.01',minorUnits:'1',scale:2};
  assert.deepEqual(readCustomerQuoteResponse(dto).quotes[0].comparison,quote.comparison);
});
