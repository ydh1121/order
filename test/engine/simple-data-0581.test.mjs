import {regionSelection} from '../../web/region-reference.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readSupplierShippingBundle,projectShippingBundleQuantity,SHIPPING_BUNDLE_VERSION} from '../../src/engine/contracts/shipping-bundle.mjs';
import {buildQuoteDocumentModel} from '../../web/quote-document.mjs';
import {calculateQuote} from '../../src/engine/calculation/quote.mjs';
import {customerQuoteResponse} from '../../src/engine/contracts/quote-response.mjs';
import {createQuoteRequestService} from '../../src/engine/adapters/quote-request.mjs';
import {researchCase,fixtureTime} from '../fixtures/qa-price-comparison-0579.mjs';
import {blankSimpleQuote} from '../../web/simple-quote-contract.mjs';

// Synthetic data only. The product ships no supplier or price example.
const configuration=()=>({version:SHIPPING_BUNDLE_VERSION,id:'research-box',revision:'r1',supplierId:'research-supplier',productId:'research-egg',productUnit:'tray',bundleUnit:'box',bundleLabel:'상자',productUnitsPerBundle:'5',source:{id:'research-source',observedAt:fixtureTime},private:'DO_NOT_COPY'});
const product=()=>({id:'research-egg',baseUnit:'each',units:{each:'1',tray:'30',pack:'10'}});
const projection=changes=>projectShippingBundleQuantity({configuration:configuration(),product:product(),supplierId:'research-supplier',quantity:'300',unit:'each',...changes});
const state=()=>({lines:[{id:'ui-egg',housing:'4',size:'특란',pack:'30',qty:'10',qtyUnit:'tray',price:'5000',private:'DO_NOT_COPY'}],locations:[{id:'site-a',region:'서울 관악구 신원동',addressState:'UNVERIFIED',email:'DO_NOT_COPY',detail:'DO_NOT_COPY',documents:'DO_NOT_COPY'},{id:'site-b',region:'서울 강남구 역삼동',contactPhone:'DO_NOT_COPY'}],allocations:[{id:'a1',lineId:'ui-egg',locationId:'site-a',mode:'FLEX',qty:'2',monthlyDemandQty:'6',monthlyDemandUnit:'tray',monthlyDemandSource:'manual',advanced:{memo:'DO_NOT_COPY'}},{id:'a2',lineId:'ui-egg',locationId:'site-b',mode:'ONCE',qty:'3',oneTimeDeliveryQty:'3'}],editing:{secret:'DO_NOT_COPY'}});
function completed(id='PC-01'){
  return {status:'COMPLETE',requestId:'request-1',inputRevision:1,startedAt:Date.parse(fixtureTime),response:customerQuoteResponse({requestId:'request-1',inputRevision:1,results:[calculateQuote(researchCase(id).request)]})};
}
const model=changes=>buildQuoteDocumentModel({state:state(),snapshot:completed(),inputRevision:1,observedAt:Date.parse(fixtureTime),...changes});
const comparison=m=>m.groups.find(g=>g.id==='comparison');

test('shipping config validates supplier provenance and strips private fields without granting authority',()=>{
  const value=configuration(),before=structuredClone(value),r=readSupplierShippingBundle(value);
  assert.equal(r.status,'VALID');assert.deepEqual(r.normalized.productUnitsPerBundle,{numerator:'5',denominator:'1'});
  assert.equal(r.evidence.authorityVerified,false);assert.equal(r.evidence.documentPublicationPolicy,'UNRESOLVED');
  assert.equal(r.evidence.minimumOrderPolicy,'NOT_DEFINED');assert.equal(JSON.stringify(r).includes('DO_NOT_COPY'),false);
  assert.deepEqual(value,before);delete value.source;assert.equal(readSupplierShippingBundle(value).status,'INVALID');
  assert.equal(readSupplierShippingBundle(null).status,'UNAVAILABLE');
});

test('shipping bundle uses existing exact catalog conversion, retaining product and demand basis',()=>{
  const p=product(),c=configuration(),before=structuredClone({p,c});
  const r=projection({product:p,configuration:c});
  assert.equal(r.status,'VALID');assert.deepEqual(r.normalized.original,{quantity:{numerator:'300',denominator:'1'},unit:'each'});
  assert.deepEqual(r.normalized.documentUnit,{quantity:{numerator:'2',denominator:'1'},unit:'box',label:'상자',wholeUnits:true});
  assert.deepEqual(projection({quantity:'30',unit:'pack'}).normalized.documentUnit.quantity,{numerator:'2',denominator:'1'});
  assert.deepEqual({p,c},before);assert.equal(r.evidence.productQuantityChanged,false);
});

test('nonmultiple shipping quantities stay exact, never add an MOQ or round purchase units',()=>{
  const r=projection({quantity:'200'});
  assert.deepEqual(r.normalized.documentUnit.quantity,{numerator:'4',denominator:'3'});
  assert.equal(r.normalized.documentUnit.wholeUnits,false);
  assert.deepEqual(r.normalized.base.quantity,{numerator:'200',denominator:'1'});
  assert.equal(JSON.stringify(r.normalized).includes('price'),false);
});

test('shipping units enforce supplier/product identity and explicit conversion instead of guessing',()=>{
  assert.deepEqual(projection({supplierId:'other'}).reasonCodes,['SHIPPING_BUNDLE_SUPPLIER_MISMATCH']);
  assert.deepEqual(projection({product:{...product(),id:'other'}}).reasonCodes,['SHIPPING_BUNDLE_PRODUCT_MISMATCH']);
  assert.equal(projection({unit:'unknown'}).status,'UNAVAILABLE');
  assert.equal(projection({product:{...product(),units:{each:'2',tray:'30'}}}).status,'INVALID');
  for(const factor of ['0','-1','1/0',Infinity,{numerator:'1',denominator:'0'}])assert.equal(readSupplierShippingBundle({...configuration(),productUnitsPerBundle:factor}).status,'INVALID');
  assert.equal(projection({quantity:'0'}).status,'INVALID');
});

test('shipping source timestamps and labels are validated but are not operational authorization',()=>{
  for(const source of [null,{id:'x',observedAt:'not-time'},{id:'',observedAt:fixtureTime}])assert.equal(readSupplierShippingBundle({...configuration(),source}).status,'INVALID');
  assert.equal(readSupplierShippingBundle({...configuration(),bundleLabel:'\n상자'}).status,'INVALID');
  assert.equal(readSupplierShippingBundle({...configuration(),approved:true,admin:true}).evidence.authorityVerified,false);
});

test('four document groups retain existing data meanings and distinct same-city regions',()=>{
  const s=state(),before=structuredClone(s),m=model({state:s});
  assert.deepEqual(m.groups.map(g=>[g.id,g.title]),[['purchase','구매 내역'],['assignment','납품지별 배정'],['terms','납품 조건'],['comparison','비용 비교']]);
  assert.equal(m.groups[0].rows[0].qty,'10');assert.equal(m.groups[0].rows[0].quantityPeriod,'MONTH');
  assert.equal(m.groups[1].rows[0].qty,'2');assert.equal(m.groups[1].rows[0].monthlyDemandQty,'6');
  assert.deepEqual(m.groups[1].sites.map(s=>s.region),['서울 관악구 신원동','서울 강남구 역삼동']);
  assert.equal(m.groups[1].sites[0].addressState,'UNVERIFIED');assert.equal(m.groups[0].totalScope,null);
  assert.equal(m.groups[2].rows[1].mode,'ONCE');assert.deepEqual(s,before);
  assert.equal(JSON.stringify(m).includes('DO_NOT_COPY'),false);
});

test('document amounts use actual calculator and public DTO, preserving independent expected values',()=>{
  const m=model(),c=comparison(m);
  assert.equal(c.currentCost.decimal,'50000');assert.equal(c.quoteCost.decimal,'48000');assert.equal(c.difference.decimal,'2000');
  assert.equal(c.currency,'KRW');assert.equal(c.basis.period,'UNRESOLVED');assert.equal(c.proof.savingsAllowed,true);
  assert.equal(m.request.providerCalculatedAt,null);assert.equal(m.request.requestedAt,fixtureTime);
  assert.equal(m.designSelected,false);assert.equal(m.provisional,true);
  assert.ok(Object.values(m.grants).every(value=>value===false));
});

test('unknown shipping/current price never becomes zero or successful savings',()=>{
  const missingShipping=model({snapshot:completed('PC-03')}),a=comparison(missingShipping);
  assert.equal(a.quoteCost,null);assert.equal(a.currentCost,null);assert.equal(a.difference,null);
  assert.ok(a.reasonCodes.includes('CONDITIONS_UNRESOLVED'));
  const missingCurrent=comparison(model({snapshot:completed('PC-04')}));
  assert.equal(missingCurrent.quoteCost.decimal,'48000');assert.equal(missingCurrent.currentCost,null);assert.equal(missingCurrent.difference,null);
  assert.equal(missingCurrent.comparisonEligibility,'CURRENT_PRICE_MISSING');
});

test('same request revision is mandatory; stale response and forged proof reveal no amounts',()=>{
  const old=completed();old.proof={amountAllowed:true,comparisonAllowed:true,savingsAllowed:true};
  const m=model({snapshot:old,inputRevision:2});assert.equal(m.request.status,'STALE');assert.equal(comparison(m).quoteCost,null);
  old.response.requestId='wrong-request';const bad=model({snapshot:old});assert.equal(comparison(bad).currentCost,null);assert.ok(bad.uncertainties.includes('RESPONSE_REQUEST_MISMATCH'));
  assert.equal(comparison(model({inputRevision:null})).difference,null);
});

test('explicit observation time and expiry prevent a frozen successful response being reused',()=>{
  assert.equal(comparison(model({observedAt:null})).quoteCost,null);
  const expired=model({observedAt:Date.parse('2026-11-07T09:00:00.000Z')});
  assert.equal(expired.request.status,'EXPIRED');assert.equal(comparison(expired).quoteCost,null);
  assert.equal(comparison(expired).proof.expiredAllowed,true);
});

test('partial0/1, empty, failure, detached and multiple quotes never become completed comparison',()=>{
  for(const status of ['PARTIAL','EMPTY','FAILED','DETACHED','CANCELLED','PENDING','LONG_PENDING']){
    const s=completed();s.status=status;if(status==='PARTIAL'){s.response.completion='PARTIAL';}
    const c=comparison(model({snapshot:s}));assert.equal(c.quoteCost,null);assert.equal(c.difference,null);
  }
  const multiple=completed();multiple.response.quotes.push(structuredClone(multiple.response.quotes[0]));
  const m=model({snapshot:multiple});assert.equal(comparison(m).quoteCost,null);assert.ok(m.uncertainties.includes('QUOTE_SELECTION_REQUIRED'));
});

test('document response validation strips private replay and never mutates inputs or persists proof',()=>{
  const s=completed();s.response.replay={secret:'DO_NOT_COPY'};s.response.quotes[0].priceBook={key:'DO_NOT_COPY'};
  const input=state(),before=structuredClone(s),m=model({state:input,snapshot:s});
  assert.deepEqual(s,before);assert.equal(JSON.stringify(m).includes('DO_NOT_COPY'),false);
  m.groups[1].sites[0].region='edited-copy';assert.equal(input.locations[0].region,'서울 관악구 신원동');
});

test('existing weekly/day conditions survive the terms projection without adding defaults',()=>{
  const s=state();Object.assign(s.allocations[0],{mode:'FIXED',frequencyPerWeek:'2',scheduleDetail:'days',days:['월','목'],weekPlans:[{weekdays:['수']}],cycleAnchorDate:'2026-11-12',repeatSemantics:'per-week-v1'});
  const t=model({state:s}).groups[2].rows[0];
  assert.equal(t.frequencyPerWeek,'2');assert.deepEqual(t.days,['월','목']);assert.deepEqual(t.weekPlans,[{weekdays:['수']}]);
  assert.equal(t.cycleAnchorDate,'2026-11-12');assert.equal(t.repeatSemantics,'per-week-v1');assert.equal(t.monthDay,null);
});

test('actual request lifecycle snapshots bind the model and invalidate it when input changes',async()=>{
  const service=createQuoteRequestService({clock:()=>Date.parse(fixtureTime),requestId:()=> 'actual-request',provider:{query:({requestId,inputRevision})=>customerQuoteResponse({requestId,inputRevision,results:[calculateQuote(researchCase('PC-02').request)]})}});
  await service.start({input:{quantity:'10'},inputRevision:1}).settled;
  const c=comparison(model({snapshot:service.snapshot()}));assert.equal(c.quoteCost.decimal,'51000');assert.equal(c.difference.decimal,'-1000');assert.equal(c.proof.increaseAllowed,true);
  service.reconcileRevision(2);
  const after=comparison(model({snapshot:service.snapshot(),inputRevision:2}));assert.equal(after.quoteCost,null);assert.equal(after.difference,null);
});

test('simple unconfirmed monthly scope blocks even a valid old detailed quote and never fabricates allocation',()=>{
  const input={...state(),simpleQuote:{...blankSimpleQuote(),siteCount:'2',sharedRegion:'서울 관악구',sharedRegionSelection:regionSelection('1100000000','1162000000'),orderKind:'FLEX',flexBasis:'MONTH'}};
  const before=structuredClone(input),m=model({state:input}),c=comparison(m);
  assert.equal(m.inputScope.mode,'SIMPLE');assert.equal(m.inputScope.assessment.readyToAdvance,true);
  assert.equal(m.inputScope.assessment.proofBlocked,true);assert.ok(m.uncertainties.includes('MONTHLY_SCOPE_UNCONFIRMED'));
  assert.equal(c.quoteCost,null);assert.equal(c.currentCost,null);assert.equal(c.difference,null);assert.equal(c.proof.amountAllowed,false);
  assert.equal(m.groups[0].totalScope,'UNCONFIRMED');assert.equal(m.groups[0].rows[0].qty,'10');
  assert.deepEqual(m.groups[1].sites,[]);assert.deepEqual(m.groups[1].rows,[]);assert.deepEqual(m.groups[2].rows,[]);
  assert.equal(m.groups[1].regionIntent.siteCount,'2');assert.equal(m.groups[1].regionIntent.sharedRegion,'서울 관악구');
  assert.equal(m.groups[1].regionCode,null);assert.equal(m.groups[2].orderIntent.flexBasis,'MONTH');
  assert.equal('frequency' in m.groups[2].orderIntent,false);assert.deepEqual(input,before);
});

test('simple district/dong IDs, optional interest and unknown spec remain raw unverified intentions',()=>{
  const input={...state(),simpleQuote:{...blankSimpleQuote(),specUnknown:true,unknownMonthly:{qty:'1200',unit:'each',budget:''},siteCount:'2',regionsDiffer:true,sharedRegion:'부산 남구',sites:[{id:'simple-b',region:'서울 관악구 신림동',regionSelection:null},{id:'simple-a',region:'서울 관악구 봉천동',regionSelection:null}],orderKind:'FIXED',flexBasis:'WEEK',preferredDate:'2026-11-24'}};
  Object.assign(input.lines[0],{housing:'',size:'',pack:'',price:'',qty:'1200',qtyUnit:'each'});
  const m=model({state:input});assert.equal(m.groups[0].specUnknown,true);assert.equal(m.groups[0].currentPurchaseTotal,null);
  assert.deepEqual(m.groups[1].regionIntent.sites,input.simpleQuote.sites);assert.equal(m.groups[1].regionIntent.sharedRegion,'부산 남구');
  assert.equal(m.groups[2].orderIntent.kind,'FIXED');assert.equal(m.groups[2].orderIntent.flexBasis,'WEEK');assert.equal(m.groups[2].orderIntent.preferredDate,'2026-11-24');
  assert.equal(m.inputScope.consultationInterest,false);assert.equal(m.inputScope.authentication,'UNKNOWN');assert.equal(m.inputScope.businessVerification,'UNKNOWN');
  assert.ok(m.uncertainties.includes('SPEC_UNKNOWN'));assert.ok(Object.values(m.grants).every(value=>value===false));
  m.groups[1].regionIntent.sites[0].region='changed';assert.equal(input.simpleQuote.sites[0].region,'서울 관악구 신림동');
});

test('malformed simple envelope cannot fall back to detailed pricing or private addresses',()=>{
  const input={...state(),simpleQuote:{...blankSimpleQuote(),monthlyScope:'ALL_SITES'}};
  const m=model({state:input});assert.equal(m.inputScope.mode,'SIMPLE');assert.ok(m.uncertainties.includes('SIMPLE_INPUT_INVALID'));
  assert.equal(comparison(m).quoteCost,null);assert.deepEqual(m.groups[1].sites,[]);assert.deepEqual(m.groups[0].rows,[]);
});
