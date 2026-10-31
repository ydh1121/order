import test from 'node:test';
import assert from 'node:assert/strict';
import {enumerateCombinations} from '../../src/engine/calculation/combinations.mjs';
import {calculateQuote} from '../../src/engine/calculation/quote.mjs';
import {periodQuantity} from '../../src/engine/calculation/period.mjs';
import {catalog,priceBook,rules,asOf,fixtureVersion} from '../fixtures/engine/calculation-data.mjs';

// Explicit synthetic assignments. These are not recommendations or offers to customers.
const search={ruleVersion:'TEST_ASSIGNMENT_RULES',dataVersion:fixtureVersion,maxCandidates:32,seed:499,order:'declared',axes:[
  {id:'productId',dataVersion:fixtureVersion,values:['fixture-egg','fixture-flour']},
  {id:'unit',dataVersion:fixtureVersion,values:['tray','bag']},
  {id:'siteId',dataVersion:fixtureVersion,values:['fixture-site-a','fixture-site-b']},
  {id:'perDelivery',dataVersion:fixtureVersion,values:[1,2]}
],constraints:[
  {id:'declaredAssignment',reasonCode:'NOT_ASSIGNED',type:'allowedTuples',axes:['productId','unit','siteId','perDelivery'],tuples:[['fixture-egg','tray','fixture-site-a',2],['fixture-flour','bag','fixture-site-b',1]]}
]};

test('E08-E11 full path: constrained choices -> explicit periods -> two-group/two-site exact quote',()=>{
  const combinations=enumerateCombinations(search);
  assert.equal(combinations.evidence.totalCandidates,'16');
  assert.equal(combinations.accepted.length,2);assert.equal(combinations.excluded.length,14);
  assert.equal(combinations.evidence.complete,true);
  const lines=combinations.accepted.map((candidate,index)=>{
    const period=periodQuantity({perDelivery:String(candidate.perDelivery),weeklyVisits:'1',period:{kind:'FOUR_WEEKS'}});
    assert.equal(period.status,'VALID');
    return {id:`fixture-line-${index}`,siteId:candidate.siteId,productId:candidate.productId,unit:candidate.unit,quantity:period.normalized.expectedQuantity,offerId:candidate.productId==='fixture-egg'?'fixture-egg-price':'fixture-flour-price'};
  });
  const result=calculateQuote({input:{asOf,lines},catalog,priceBook,rules});
  // Independent table: 8 trays × 10.25 = 82; 4 × 2.5kg bags × 3.20 = 32; total 114.
  assert.equal(result.status,'VALID');assert.equal(result.normalized.total.decimal,'114.00');
  assert.deepEqual(result.normalized.siteSubtotals.map(x=>x.amount),[{numerator:'82',denominator:'1'},{numerator:'32',denominator:'1'}]);
  assert.deepEqual(calculateQuote(result.evidence.replay),result);
  const missing=calculateQuote({input:{asOf,lines},catalog,priceBook:{version:'NO_REAL_PRICES',offers:[]},rules});
  assert.equal(missing.status,'UNAVAILABLE');assert.equal(missing.normalized,null);
});
