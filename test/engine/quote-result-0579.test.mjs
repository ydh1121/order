import test from 'node:test';
import assert from 'node:assert/strict';
import {projectQuoteInput,quoteMoney,quoteResultView,patchQuoteResult} from '../../web/quote-result.mjs';
import {createQuoteRequestService} from '../../src/engine/adapters/quote-request.mjs';
import {customerQuoteResponse,quoteProofGate} from '../../src/engine/contracts/quote-response.mjs';

const money=(decimal,minorUnits,scale=0)=>({decimal,minorUnits,scale});
const quote=()=>({currency:'KRW',total:money('48000','48000'),comparison:{current:money('50000','50000'),difference:money('2000','2000')},comparisonEligibility:'ELIGIBLE',validUntil:null,basis:{scope:'DECLARED_LINES',period:'UNRESOLVED'}});
function snapshot(status='COMPLETE',quotes=[quote()]) {
  const state={status,response:{completion:status==='PARTIAL'?'PARTIAL':'COMPLETE',status:'OK',quotes}};
  state.proof=quoteProofGate(state);return state;
}
function mockDocument() {
  const ids=['receipt','result-title','quote-outcome','quote-outcome-value','quote-outcome-label','quote-current-label','quote-current-value','quote-supply-label','quote-supply-value','quote-result-status','quote-detail-current-label','quote-detail-current-value','quote-detail-supply-value','quote-detail-difference-value','quote-detail-status'];
  const nodes=new Map(ids.map(id=>[id,{id,textContent:'',dataset:{},attributes:{},setAttribute(key,value){this.attributes[key]=value;},classList:{toggle(){}},set innerHTML(value){throw Error('RESULT_REMOUNT_FORBIDDEN');}}]));
  return {nodes,getElementById:id=>nodes.get(id)};
}

test('minimal projection preserves raw demand and existing package cost; strips private/modal fields',()=>{
  const state={lines:[{id:'ui-item',housing:'4',size:'특란',pack:'30',qty:'31',qtyUnit:'each',price:'5000',private:'SECRET'}],locations:[{id:'site-a',region:'서울',name:'SECRET',road:'SECRET',contactPhone:'SECRET',email:'SECRET',documents:'SECRET'}],allocations:[{id:'allocation-a',lineId:'ui-item',locationId:'site-a',mode:'ONCE',qty:'1',oneTimeDeliveryQty:'1',advanced:{memo:'SECRET',contactChannels:['SECRET'],weekend:'ask'},q4Review:{draft:{memo:'SECRET',values:{base:'99'}},deliveryDate:{year:2026,month:11,day:20},activeRepeat:{period:'매주',frequency:'1회',memo:'SECRET',weekdays:{'1:월':true,secret:'SECRET'}}}}],editing:{memo:'SECRET'},documents:['SECRET']};
  const before=structuredClone(state),input=projectQuoteInput(state);
  assert.equal(input.version,'order-product-quote-input-1');
  assert.equal(input.purchases[0].qty,'31');
  assert.deepEqual(input.purchases[0].currentPurchaseCost,{numerator:'10000',denominator:'1'});
  assert.deepEqual(input.currentPurchaseTotal,{numerator:'10000',denominator:'1'});
  assert.equal(input.purchases[0].productId,undefined);assert.equal(input.purchases[0].offerId,undefined);
  assert.deepEqual(input.sites,[{id:'site-a',region:'서울'}]);
  assert.deepEqual(input.allocations[0].activeRepeat.weekdays,{'1:월':true});
  assert.equal(JSON.stringify(input).includes('SECRET'),false);
  assert.deepEqual(state,before);
});

test('no connected source preserves unavailable and the quantity owner current input amount',()=>{
  const view=quoteResultView({status:'UNAVAILABLE'},{currentPurchaseTotal:{numerator:'10000',denominator:'1'}});
  assert.equal(view.outcome,'산출 전');assert.equal(view.supply,'비교 조건 확인 필요');
  assert.equal(view.current,'10,000원');assert.equal(view.currentLabel,'입력한 월 구매비용');
  assert.equal(view.title,'비용 비교 결과');assert.equal(view.difference,'비교 조건 확인 필요');
});

test('only linked selected address identity affects quote input; contacts/detail remain private',()=>{
  const state={lines:[],locations:[{id:'linked',region:'서울',addressProvider:'KAKAO',providerId:'address-a',postal:'11111',addressState:'VERIFIED',detail:'SECRET',dropoff:'SECRET',contactPhone:'SECRET'},{id:'unlinked',region:'부산'}],allocations:[{id:'a',locationId:'linked',scheduleDetail:'SECRET'}]};
  const before=projectQuoteInput(state);
  assert.equal(before.sites.length,1);assert.equal(before.allocations[0].scheduleDetail,undefined);
  assert.equal(JSON.stringify(before).includes('SECRET'),false);
  state.locations[0].providerId='address-b';state.locations[0].postal='22222';
  assert.notDeepEqual(projectQuoteInput(state),before);
  const selected=projectQuoteInput(state);state.locations[0].detail='CHANGED_PRIVATE_DETAIL';
  assert.deepEqual(projectQuoteInput(state),selected);
});

test('one complete KRW quote uses trusted current/total/difference and no monthly or percentage claim',()=>{
  const view=quoteResultView(snapshot(),{currentPurchaseTotal:{numerator:'999999',denominator:'1'}});
  assert.equal(view.current,'50,000원');assert.equal(view.supply,'48,000원');assert.equal(view.outcome,'2,000원');
  assert.equal(view.outcomeLabel,'절감 가능');assert.equal(view.title,'예상 절감액');
  assert.equal(JSON.stringify(view).includes('%'),false);assert.equal(JSON.stringify(view).includes('월'),false);
  const higher=quote();higher.total=money('51000','51000');higher.comparison.difference=money('-1000','-1000');
  const loss=quoteResultView(snapshot('COMPLETE',[higher]));
  assert.equal(loss.outcome,'1,000원');assert.equal(loss.loss,true);assert.equal(loss.title,'예상 비용 증가액');
});

test('comparison zero, missing current and unresolved eligibility stay distinct',()=>{
  const same=quote();same.comparison.difference=money('0','0');
  assert.equal(quoteResultView(snapshot('COMPLETE',[same])).outcomeLabel,'차이 없음');
  const noCurrent=quote();delete noCurrent.comparison.current;
  const unresolved=quoteResultView(snapshot('COMPLETE',[noCurrent]));
  assert.equal(unresolved.outcome,'산출 전');assert.equal(unresolved.supply,'48,000원');assert.equal(unresolved.current,'비교 조건 확인 필요');
  noCurrent.comparisonEligibility='POLICY_UNRESOLVED';
  assert.equal(quoteResultView(snapshot('COMPLETE',[noCurrent])).difference,'비교 조건 확인 필요');
});

test('multiple offers/currencies never select a candidate; partial0/1 never claim completed savings',()=>{
  const several=quoteResultView(snapshot('COMPLETE',[quote(),quote()]));
  assert.equal(several.outcome,'산출 전');assert.equal(several.supply,'비교 조건 확인 필요');
  const usd=quote();usd.currency='USD';
  assert.equal(quoteResultView(snapshot('COMPLETE',[usd])).supply,'비교 조건 확인 필요');
  for(const quotes of [[],[quote()]]) {
    const view=quoteResultView(snapshot('PARTIAL',quotes));
    assert.equal(view.outcome,'조회 중');assert.equal(view.supply,'비교 조건 확인 필요');assert.equal(view.busy,true);
  }
});

test('normal empty, failure, pending, expired and stale have distinct truthful views',()=>{
  assert.equal(quoteResultView(snapshot('EMPTY',[])).outcome,'견적 없음');
  assert.equal(quoteResultView(snapshot('FAILED',[])).outcome,'조회 오류');
  assert.equal(quoteResultView(snapshot('PENDING',[])).outcome,'조회 중');
  assert.equal(quoteResultView(snapshot('EXPIRED')).outcome,'견적 만료');
  assert.equal(quoteResultView(snapshot('STALE')).supply,'비교 조건 확인 필요');
  assert.match(quoteResultView(snapshot('DETACHED')).note,/화면을 닫았습니다/);
  assert.doesNotMatch(quoteResultView(snapshot('DETACHED')).note,/취소를 확인/);
});

test('decimal display preserves supplied precision without numeric conversion or rounding',()=>{
  assert.equal(quoteMoney(money('123456789012345678901.125','123456789012345678901125',3)),'123,456,789,012,345,678,901.125원');
  assert.equal(quoteMoney(money('-0.50','-50',2),{absolute:true}),'0.5원');
});

test('async result patch preserves existing nodes and never writes innerHTML',()=>{
  const document=mockDocument(),node=document.getElementById('quote-outcome-value');
  patchQuoteResult(document,quoteResultView(snapshot('PENDING',[])));
  assert.equal(node.textContent,'조회 중');
  patchQuoteResult(document,quoteResultView(snapshot()));
  assert.equal(document.getElementById('quote-outcome-value'),node);assert.equal(node.textContent,'2,000원');
  assert.equal(document.getElementById('receipt').dataset.quoteStatus,'COMPLETE');
  assert.equal(document.getElementById('receipt').attributes['aria-busy'],'false');
  assert.equal(document.getElementById('quote-detail-current-value').textContent,'50,000원');
});

test('actual request owner default, late response and retry notifications patch the same view',async()=>{
  const document=mockDocument(),node=document.getElementById('quote-outcome-value');let sequence=0;
  const onChange=state=>patchQuoteResult(document,quoteResultView(state));
  const missing=createQuoteRequestService({onChange,requestId:()=>`missing-${++sequence}`});
  await missing.start({input:{},inputRevision:1}).settled;
  assert.equal(document.getElementById('receipt').dataset.quoteStatus,'UNAVAILABLE');
  const pending=[];
  const service=createQuoteRequestService({onChange,requestId:()=>`request-${++sequence}`,provider:{query:args=>new Promise(resolve=>pending.push({args,resolve}))}});
  const first=service.start({input:{purchases:[]},inputRevision:1});await Promise.resolve();
  service.reconcileRevision(2);await first.settled;
  pending[0].resolve(customerQuoteResponse({requestId:first.requestId,inputRevision:1}));await Promise.resolve();await Promise.resolve();
  assert.equal(document.getElementById('receipt').dataset.quoteStatus,'STALE');
  const second=service.start({input:{purchases:[]},inputRevision:2});await Promise.resolve();
  service.detach();await second.settled;
  assert.equal(document.getElementById('receipt').dataset.quoteStatus,'DETACHED');
  assert.equal(document.getElementById('quote-outcome-value'),node);
});
