import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {researchCase,caseOracles,fixtureTime} from '../fixtures/qa-price-comparison-0579.mjs';
import {executeResearchCalculation,createResearchRequestSession} from '../qa-adapters/price-comparison-0579.mjs';

// Node/product-module + synthetic transport evidence only. Never actual API or
// browser evidence; source policy remains unresolved where the oracle says so.
for(const oracle of caseOracles.filter(item=>item.kind!=='request')) {
  test(`${oracle.id}: fixed independent ${oracle.kind} oracle`,()=>{
    const before=researchCase(oracle.id), result=executeResearchCalculation(oracle.id),e=oracle.expected;
    assert.equal(result.status,e.status);
    if(e.reason)assert.deepEqual(result.reasonCodes,[e.reason]);
    if(Object.hasOwn(e,'total'))assert.equal(result.normalized?.total?.decimal??null,e.total);
    if(Object.hasOwn(e,'difference'))assert.equal(result.normalized?.comparison?.difference?.decimal??null,e.difference);
    if(Object.hasOwn(e,'comparison'))assert.equal(result.normalized?.comparison??null,e.comparison);
    if(e.currentTotal)assert.deepEqual(result.normalized.comparison.previous,{numerator:e.currentTotal,denominator:'1'});
    if(e.eligibility)assert.equal(result.normalized.comparisonEligibility.status,e.eligibility);
    if(e.subtotal)assert.equal(result.normalized.displayedMerchandiseSubtotal.decimal,e.subtotal);
    if(e.quantity)assert.equal(result.raw.lines[0].quantity,e.quantity);
    if(e.fulfillmentStatus) {
      assert.equal(result.evidence.fulfillmentStatus,e.fulfillmentStatus);
      assert.equal(result.evidence.stockReservation,e.stockReservation);
      assert.equal(result.evidence.realOrderApproval,e.realOrderApproval);
    }
    if(oracle.id==='PC-16') {
      assert.equal(result.normalized,null);
      assert.equal(Object.hasOwn(result,'monthlySavings'),false);
      assert.equal(Object.hasOwn(result,'monthly_savings'),false);
    }
    assert.deepEqual(researchCase(oracle.id),before,'one run cannot mutate the next initial fixture');
  });
}

async function begin(id) {
  const session=createResearchRequestSession({caseId:id});
  const started=session.start();
  await Promise.resolve(); // Let the actual service call the injected transport.
  assert.equal(session.calls.length,1);
  return {session,started};
}

test('PC-05: complete successful empty differs from unavailable source and zero-valued quote',async()=>{
  const {session,started}=await begin('PC-05');
  session.finish(started.requestId,{empty:true});const state=await started.settled;
  assert.equal(state.status,'EMPTY');assert.equal(state.response.status,'OK');
  assert.deepEqual(state.response.quotes,[]);assert.equal(state.response.coverage.complete,true);
  assert.equal(state.proof.emptyAllowed,true);assert.equal(state.proof.amountAllowed,false);
});
test('PC-06: transport failure cannot become successful empty; retry uses new identity',async()=>{
  const {session,started}=await begin('PC-06');
  session.fail(started.requestId);const failed=await started.settled;
  assert.equal(failed.status,'FAILED');assert.deepEqual(failed.response.reasonCodes,['NETWORK_FAILURE']);
  assert.equal(failed.proof.emptyAllowed,false);assert.equal(failed.proof.errorAllowed,true);
  const retry=session.service.retry();assert.notEqual(retry.requestId,started.requestId);
  await Promise.resolve();session.finish(retry.requestId,{empty:true});
  assert.equal((await retry.settled).status,'EMPTY');
});
test('PC-07: one partial quote retains literal delta and never permits full-completion claims',async()=>{
  const {session,started}=await begin('PC-07');
  const state=session.partial(started.requestId);
  assert.equal(state.status,'PARTIAL');assert.equal(state.response.coverage.complete,false);
  assert.equal(state.response.coverage.validQuoteCount,1);
  assert.equal(state.response.quotes[0].comparison.difference.decimal,'2000');
  assert.equal(state.proof.viewPartialAllowed,true);assert.equal(state.proof.comparisonAllowed,false);
  assert.equal(state.proof.globalMinimum,false);
  session.finish(started.requestId);await started.settled;
});
test('PC-08: partial zero has no amount and no view-partial permission',async()=>{
  const {session,started}=await begin('PC-08');
  const state=session.partial(started.requestId,{empty:true});
  assert.equal(state.status,'PARTIAL');assert.equal(state.response.coverage.validQuoteCount,0);
  assert.equal(state.response.coverage.complete,false);assert.deepEqual(state.response.quotes,[]);
  assert.equal(state.proof.amountAllowed,false);assert.equal(state.proof.viewPartialAllowed,false);
  assert.equal(state.proof.emptyAllowed,false);
  session.finish(started.requestId,{empty:true});await started.settled;
});
test('PC-12: old revision response cannot mutate the new request or its displayed result',async()=>{
  const {session,started:old}=await begin('PC-12');
  assert.equal(session.service.reconcileRevision(2).status,'STALE');
  const current=session.start(2);await Promise.resolve();
  session.finish(current.requestId,{resultCase:'PC-02'});await current.settled;
  const before=session.service.snapshot();
  assert.equal(before.inputRevision,2);assert.equal(before.response.quotes[0].total.decimal,'51000');
  session.finish(old.requestId,{resultCase:'PC-01'});await old.settled;
  assert.deepEqual(session.service.snapshot(),before);
});
test('PC-13: local cancel stops accepting results without asserting server cancellation',async()=>{
  const {session,started}=await begin('PC-13');
  const cancelled=await session.service.cancel();
  assert.equal(cancelled.status,'DETACHED');assert.equal(cancelled.backendCancellation,'UNKNOWN');
  assert.equal(session.calls[0].signal.aborted,true);assert.equal(cancelled.response,null);
  session.finish(started.requestId);await started.settled;
  assert.deepEqual(session.service.snapshot(),cancelled);
});
test('independent mobile/PC instances start identically and reset without sharing drafts or request state',async()=>{
  const mobile=createResearchRequestSession(),desktop=createResearchRequestSession();
  assert.deepEqual(mobile.fixture,desktop.fixture);assert.notEqual(mobile.fixture,desktop.fixture);
  mobile.fixture.request.input.lines[0].quantity='9';
  assert.equal(desktop.fixture.request.input.lines[0].quantity,'10');
  const active=mobile.start();await Promise.resolve();mobile.finish(active.requestId);await active.settled;
  assert.equal(mobile.service.snapshot().status,'COMPLETE');assert.equal(desktop.service.snapshot().status,'IDLE');
  const reset=createResearchRequestSession();assert.deepEqual(reset.fixture,desktop.fixture);
  assert.equal(reset.service.snapshot().status,'IDLE');assert.equal(mobile.service.snapshot().status,'COMPLETE');
});
test('actual product request owner applies fixed expiration and has no artificial minimum wait',async()=>{
  const {session,started}=await begin('PC-01');session.finish(started.requestId);
  const complete=await started.settled;
  assert.equal(complete.status,'COMPLETE');assert.equal(complete.elapsedMs,0);
  session.setClock(Date.parse(fixtureTime)+86400000);
  const expired=session.service.snapshot();assert.equal(expired.status,'EXPIRED');
  assert.equal(expired.proof.amountAllowed,false);assert.equal(expired.proof.savingsAllowed,false);
});
test('research fixture is outside both customer build entrypoints and retains all sixteen IDs',async()=>{
  assert.deepEqual(caseOracles.map(x=>x.id),Array.from({length:16},(_,i)=>`PC-${String(i+1).padStart(2,'0')}`));
  const [main,app,pages]=await Promise.all(['../../web/main.mjs','../../web/app.mjs','../../scripts/build-pages.mjs'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
  for(const source of [main,app,pages])assert.doesNotMatch(source,/qa-price-comparison-0579|qa-adapters\/price-comparison-0579|RESEARCH_ONLY_NOT_REAL_SELLER/);
});
