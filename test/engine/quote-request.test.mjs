import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteRequestService} from '../../src/engine/adapters/quote-request.mjs';
import {customerQuoteResponse} from '../../src/engine/contracts/quote-response.mjs';

const startTime=Date.parse('2026-11-06T00:00:00.000Z');
const quote=()=>({status:'VALID',normalized:{currency:'KRW',total:{decimal:'48000',minorUnits:'48000',scale:0},comparisonEligibility:{status:'CURRENT_PRICE_MISSING'},validUntil:'2026-11-07T00:00:00.000Z'}});
const tick=()=>Promise.resolve();
function setup(cancel) {
  let time=startTime,serial=0;const calls=[],events=[];
  const service=createQuoteRequestService({clock:()=>time,requestId:()=>`request-${++serial}`,onChange:x=>events.push(x),longPendingAfterMs:1000,
    provider:{query:args=>new Promise((resolve,reject)=>calls.push({...args,resolve,reject})),...(cancel?{cancel}: {})}});
  const response=(call,results=[],completion='COMPLETE')=>customerQuoteResponse({requestId:call.requestId,inputRevision:call.inputRevision,results,completion});
  return {service,calls,events,response,setTime:value=>{time=value;}};
}
test('absent source is unavailable immediately and never fake network failure or fake completion',async()=>{
  const events=[];const service=createQuoteRequestService({requestId:()=> 'no-source',clock:()=>startTime,onChange:x=>events.push(x.status)});
  await service.start({input:{lines:[]},inputRevision:1}).settled;
  assert.deepEqual(events,['UNAVAILABLE']);assert.deepEqual(service.snapshot().response.reasonCodes,['APPROVED_SOURCE_NOT_CONNECTED']);assert.equal(service.snapshot().proof.emptyAllowed,false);
});
test('real elapsed threshold has no artificial delay or auto-success; zero-time completion resolves immediately',async()=>{
  const h=setup();const request=h.service.start({input:{},inputRevision:1});await tick();
  assert.equal(h.service.snapshot().status,'PENDING');h.setTime(startTime+1001);assert.equal(h.service.snapshot().status,'LONG_PENDING');assert.equal(h.service.snapshot().elapsedMs,1001);
  h.calls[0].resolve(h.response(h.calls[0],[quote()]));await request.settled;assert.equal(h.service.snapshot().status,'COMPLETE');h.setTime(startTime+8000);assert.equal(h.service.snapshot().elapsedMs,1001);
  const fast=setup();const instant=fast.service.start({input:{},inputRevision:1});await tick();fast.calls[0].resolve(fast.response(fast.calls[0],[quote()]));await instant.settled;assert.equal(fast.service.snapshot().elapsedMs,0);assert.equal(fast.service.snapshot().status,'COMPLETE');
});
test('completed zero valid candidates and rejected network are distinct',async()=>{
  const h=setup();let request=h.service.start({input:{},inputRevision:1});await tick();h.calls[0].resolve(h.response(h.calls[0]));await request.settled;
  assert.equal(h.service.snapshot().status,'EMPTY');assert.equal(h.service.snapshot().proof.emptyAllowed,true);
  request=h.service.retry();await tick();h.calls[1].reject(new Error('secret provider key'));await request.settled;
  assert.equal(h.service.snapshot().status,'FAILED');assert.equal(h.service.snapshot().proof.emptyAllowed,false);assert.equal(JSON.stringify(h.service.snapshot()).includes('secret'),false);
});
test('partial zero does not unlock view; partial one does not become global/completed savings',async()=>{
  const h=setup();const request=h.service.start({input:{},inputRevision:1});await tick();const call=h.calls[0];
  call.onPartial(h.response(call,[],'PARTIAL'));assert.equal(h.service.snapshot().status,'PARTIAL');assert.equal(h.service.snapshot().proof.viewPartialAllowed,false);
  call.onPartial(h.response(call,[quote()],'PARTIAL'));assert.equal(h.service.snapshot().proof.viewPartialAllowed,true);assert.equal(h.service.snapshot().proof.amountAllowed,false);
  call.resolve(h.response(call,[quote()]));await request.settled;assert.equal(h.service.snapshot().proof.amountAllowed,true);
});
test('input revision invalidates late result and prevents retrying obsolete input',async()=>{
  const h=setup();const request=h.service.start({input:{condition:'old'},inputRevision:1});await tick();h.service.reconcileRevision(2);
  assert.equal(h.calls[0].signal.aborted,true);h.calls[0].resolve(h.response(h.calls[0],[quote()]));await request.settled;
  assert.equal(h.service.snapshot().status,'STALE');assert.equal(h.service.snapshot().response,null);assert.throws(()=>h.service.retry(),/CURRENT_INPUT_REQUIRED/);
});
test('retry uses new identity and old response cannot overwrite newer successful result',async()=>{
  const h=setup();const old=h.service.start({input:{condition:'same'},inputRevision:1});await tick();const next=h.service.retry();await tick();
  assert.notEqual(old.requestId,next.requestId);h.calls[1].resolve(h.response(h.calls[1]));await next.settled;h.calls[0].resolve(h.response(h.calls[0],[quote()]));await old.settled;
  assert.equal(h.service.snapshot().requestId,next.requestId);assert.equal(h.service.snapshot().status,'EMPTY');
});
test('local cancel cannot claim backend confirmation; late success remains detached',async()=>{
  const h=setup();const request=h.service.start({input:{},inputRevision:1});await tick();await h.service.cancel();
  assert.equal(h.service.snapshot().status,'DETACHED');assert.equal(h.service.snapshot().backendCancellation,'UNKNOWN');h.calls[0].resolve(h.response(h.calls[0],[quote()]));await request.settled;
  assert.equal(h.service.snapshot().status,'DETACHED');assert.equal(h.service.snapshot().proof.amountAllowed,false);
});
test('only matching positive backend ack confirms cancel and cannot overwrite retried request',async()=>{
  let ack;const h=setup(()=>new Promise(resolve=>{ack=resolve;}));const request=h.service.start({input:{},inputRevision:1});await tick();const cancellation=h.service.cancel();ack({requestId:request.requestId,inputRevision:1,cancelled:true});await cancellation;
  assert.equal(h.service.snapshot().status,'CANCELLED');assert.equal(h.service.snapshot().backendCancellation,'CONFIRMED');
  const next=h.service.retry();await tick();const cancelNext=h.service.cancel();const newer=h.service.retry();await tick();ack({requestId:next.requestId,inputRevision:1,cancelled:true});await cancelNext;
  assert.equal(h.service.snapshot().requestId,newer.requestId);assert.equal(h.service.snapshot().status,'PENDING');
});
test('unknown/mismatched backend ack does not confirm and wrong transport identity fails safely',async()=>{
  const h=setup(async()=>({requestId:'wrong-request',cancelled:true}));h.service.start({input:{},inputRevision:1});await tick();await h.service.cancel();assert.equal(h.service.snapshot().backendCancellation,'UNKNOWN');
  const request=h.service.retry();await tick();h.calls[1].resolve({...h.response(h.calls[1],[quote()]),requestId:'wrong-request'});await request.settled;
  assert.equal(h.service.snapshot().status,'FAILED');assert.deepEqual(h.service.snapshot().response.reasonCodes,['INVALID_RESPONSE']);
});
test('expiry closes amount proof at exact exclusive boundary without pretending empty search',async()=>{
  const h=setup();const request=h.service.start({input:{},inputRevision:1});await tick();h.calls[0].resolve(h.response(h.calls[0],[quote()]));await request.settled;
  h.setTime(Date.parse('2026-11-07T00:00:00.000Z'));const snapshot=h.service.snapshot();assert.equal(snapshot.status,'EXPIRED');assert.equal(snapshot.proof.expiredAllowed,true);assert.equal(snapshot.proof.amountAllowed,false);assert.equal(snapshot.proof.emptyAllowed,false);
});
test('reused request identity is rejected before invalidating the current attempt',()=>{
  const service=createQuoteRequestService({requestId:()=> 'fixed',clock:()=>startTime});service.start({input:{},inputRevision:1});assert.throws(()=>service.retry(),/NEW_REQUEST_ID_REQUIRED/);assert.equal(service.snapshot().requestId,'fixed');
});
test('cancellation ack must match input revision as well as request identity',async()=>{
  const h=setup(async({requestId})=>({requestId,inputRevision:999,cancelled:true}));h.service.start({input:{},inputRevision:1});await tick();await h.service.cancel();assert.equal(h.service.snapshot().status,'DETACHED');assert.equal(h.service.snapshot().backendCancellation,'UNKNOWN');
});
test('local terminal settled promise resolves even when transport ignores abort forever',async()=>{
  const h=setup();const request=h.service.start({input:{},inputRevision:1});await tick();h.service.detach();const ended=await request.settled;assert.equal(ended.status,'DETACHED');assert.equal(ended.backendCancellation,'UNKNOWN');
});
test('one actual deadline emits long-pending then expiry, and invalidation removes scheduled callbacks',async()=>{
  let time=startTime,serial=0;const tasks=new Map(),events=[];let query;
  const service=createQuoteRequestService({clock:()=>time,requestId:()=>`deadline-${++serial}`,longPendingAfterMs:1000,onChange:x=>events.push({status:x.status,elapsedMs:x.elapsedMs}),schedule:(fn,delay)=>{const key={};tasks.set(key,{fn,delay});return key;},unschedule:key=>tasks.delete(key),provider:{query:args=>new Promise(resolve=>{query={...args,resolve};})}});
  const first=service.start({input:{},inputRevision:1});await tick();assert.equal(tasks.size,1);assert.equal([...tasks.values()][0].delay,1000);
  time+=1000;const pending=[...tasks.values()][0];tasks.clear();pending.fn();assert.deepEqual(events.at(-1),{status:'LONG_PENDING',elapsedMs:1000});assert.equal(tasks.size,0);
  query.resolve(customerQuoteResponse({requestId:query.requestId,inputRevision:1,results:[quote()]}));await first.settled;assert.equal(tasks.size,1);
  time=Date.parse('2026-11-07T00:00:00.000Z');const expiry=[...tasks.values()][0];tasks.clear();expiry.fn();assert.equal(events.at(-1).status,'EXPIRED');assert.equal(tasks.size,0);assert.equal(service.snapshot().proof.amountAllowed,false);
  service.retry();await tick();assert.equal(tasks.size,1);service.reconcileRevision(2);assert.equal(tasks.size,0);
});
test('rejected candidates in an unfinished batch remain partial zero until final response',async()=>{
  const h=setup();const request=h.service.start({input:{},inputRevision:1});await tick();const call=h.calls[0];
  call.onPartial(h.response(call,[{status:'UNAVAILABLE',reasonCodes:['QUANTITY_CONSTRAINT_UNSATISFIED']}],'PARTIAL'));
  assert.equal(h.service.snapshot().status,'PARTIAL');assert.equal(h.service.snapshot().proof.partialAllowed,true);assert.equal(h.service.snapshot().proof.viewPartialAllowed,false);assert.equal(h.service.snapshot().response.coverage.complete,false);
  call.resolve(h.response(call,[]));await request.settled;assert.equal(h.service.snapshot().status,'EMPTY');
});
test('detach after completed response clears the expiry observer without claiming backend cancellation',async()=>{
  let wake,cleared=false;const service=createQuoteRequestService({clock:()=>startTime,requestId:()=> 'detach-complete',schedule:fn=>{wake=fn;return 1;},unschedule:()=>{cleared=true;},provider:{query:async({requestId,inputRevision})=>customerQuoteResponse({requestId,inputRevision,results:[quote()]})}});
  await service.start({input:{},inputRevision:1}).settled;assert.equal(typeof wake,'function');cleared=false;service.detach();assert.equal(cleared,true);assert.equal(service.snapshot().status,'DETACHED');assert.equal(service.snapshot().backendCancellation,'NONE');
});
test('a subscriber starting a new request during invalidation cannot settle the replacement with old state',async()=>{
  let service,replacement,serial=0,resolved=false;const queries=[];
  service=createQuoteRequestService({clock:()=>startTime,requestId:()=>`reentrant-${++serial}`,onChange:value=>{if(value.status==='DETACHED'){replacement=service.start({input:{},inputRevision:2});replacement.settled.then(()=>{resolved=true;});}},provider:{query:args=>new Promise(resolve=>queries.push({...args,resolve}))}});
  const old=service.start({input:{},inputRevision:1});await tick();service.detach();await old.settled;await tick();
  assert.equal(resolved,false);assert.equal(service.snapshot().requestId,replacement.requestId);assert.equal(service.snapshot().status,'PENDING');
  const latest=queries.at(-1);latest.resolve(customerQuoteResponse({requestId:latest.requestId,inputRevision:2}));const done=await replacement.settled;assert.equal(done.requestId,replacement.requestId);assert.equal(done.status,'EMPTY');
});
