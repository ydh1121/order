import test from 'node:test';
import assert from 'node:assert/strict';
import {storageDiagnostics} from '../browser/storage-diagnostics.mjs';

test('F09 diagnostic snapshot reports failure boundary without contact or stable-ID payloads',async()=>{
 const secret='DoNotLogPrivateLocalPart@private-domain.invalid',id='private-stable-id';
 const window={document:{readyState:'complete',visibilityState:'visible',documentElement:{dataset:{storageReady:'true',storagePending:'false',storageStatus:'LOADED'}}},
  localStorage:{getItem:()=>JSON.stringify({schemaVersion:1,revision:7,state:'data',data:{lines:[{id}],locations:[{id,email:secret,contactPhone:'010-1111-2222'}],allocations:[]}})},
  OrderEmailDomain:{inspect:async()=>({reference:{freshness:{state:'STALE'},lastError:'IANA_REFRESH_TIMEOUT'},service:{activeFields:1,inFlightDomains:0,cachedDomains:0},proofStates:{UNKNOWN:1},pendingDomains:1,pendingConsumers:1,startedRequests:1})},
  OrderEmailLifecycle:{inspect:()=>({booted:true,stopped:false,timerScheduled:true,jobCount:1,running:1,attemptCounts:[1]})}};
 const value=await storageDiagnostics({window});assert.equal(value.storage.status,'LOADED');assert.deepEqual(value.storage.counts,{lines:1,locations:1,allocations:0});assert.equal(value.iana.lastError,'IANA_REFRESH_TIMEOUT');assert.equal(value.email.startedRequests,1);assert.equal(value.lifecycle.booted,true);
 assert.doesNotMatch(JSON.stringify(value),new RegExp(secret+'|'+id+'|010-1111-2222'));
});

test('F09 absent, corrupt, unavailable and uninitialized are different diagnostic states',async()=>{
 for(const [getItem,expected] of [[()=>null,'ABSENT'],[()=>'{broken','CORRUPT_JSON'],[()=>{throw Error('private exception text');},'UNAVAILABLE']]){
  const result=await storageDiagnostics({window:{localStorage:{getItem}}});assert.equal(result.storage.record,expected);assert.equal(result.email.status,'SERVICE_NOT_INITIALIZED');assert.equal(result.lifecycle.status,'LIFECYCLE_NOT_INITIALIZED');assert.doesNotMatch(JSON.stringify(result),/private exception/);
 }
});
