import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createBrowserStorage,STORAGE_KEY,STORAGE_SCHEMA_VERSION,LEGACY_KEYS,emptyStoredPayload,projectStoredPayload} from '../../web/storage.mjs';
import {addressStatus,selectAddress} from '../../web/address-contract.mjs';

class MemoryStorage{
 constructor(entries={}){this.entries=new Map(Object.entries(entries));this.writes=0;this.fail=false;}
 getItem(key){return this.entries.get(key)??null;}
 setItem(key,value){if(this.fail)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});this.entries.set(key,value);this.writes++;}
}
function locks(){let queue=Promise.resolve();return {request(name,options,fn){const next=queue.then(()=>fn({name,mode:options.mode}));queue=next.catch(()=>{});return next;}};}
function setup({local=new MemoryStorage(),session=new MemoryStorage(),lock=locks()}={}){return {local,session,lock,api:createBrowserStorage({localStorage:local,sessionStorage:session,locks:lock,crypto:webcrypto,now:()=>1})};}
const opts=(loaded,transactionId='address-save')=>({expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId});
const candidate=()=>({road:'합성시 가상로 10',postal:'08843',jibun:'합성시 가상동 1',region:'합성시',providerId:'1111111111111111111111111',addressProvider:'JUSO'});
const payload=()=>({...emptyStoredPayload(),locations:[{id:'a',name:'합성 A',road:'합성시 가상로 10',postal:'08843',detail:'2층',contactPhone:'010-2345-6789',email:'QA@example.com',storePhone:''}]});
const oldEnvelope=(version,data=payload())=>JSON.stringify({schemaVersion:version,generation:'existing-generation',revision:4,state:'data',data,receipts:[],migration:null,updatedAt:1});

test('schema1/2 restore remains byte-identical and unverified; successful explicit commit alone writes current schema',async()=>{
 for(const version of [1,2]){
  const before=oldEnvelope(version),env=setup({local:new MemoryStorage({[STORAGE_KEY]:before})}),loaded=await env.api.load();
  assert.equal(loaded.ok,true);assert.equal(env.local.writes,0);assert.equal(env.local.getItem(STORAGE_KEY),before);assert.equal(addressStatus(loaded.data.locations[0]).valid,false);
  const draft=structuredClone(loaded.data);Object.assign(draft.locations[0],selectAddress(draft.locations[0],candidate()),{dropoff:'문 앞'});
  env.local.fail=true;const failed=await env.api.commit(draft,opts(loaded));assert.equal(failed.status,'WRITE_FAILED');assert.equal(env.local.getItem(STORAGE_KEY),before);assert.equal(draft.locations[0].dropoff,'문 앞');
  env.local.fail=false;const saved=await env.api.commit(draft,opts(loaded));assert.equal(saved.status,'COMMITTED');assert.equal(saved.revision,5);assert.equal(env.local.writes,1);
  const record=JSON.parse(env.local.getItem(STORAGE_KEY));assert.equal(record.schemaVersion,STORAGE_SCHEMA_VERSION);assert.equal(record.generation,'existing-generation');assert.equal(record.data.locations[0].postal,'08843');assert.equal(record.data.locations[0].detail,'2층');assert.equal(record.data.locations[0].dropoff,'문 앞');
  const restored=await setup(env).api.load();assert.deepEqual(restored.data,draft);assert.equal(addressStatus(restored.data.locations[0]).valid,true);
 }
});
test('old schema/session cannot smuggle provider provenance or new placement fields',async()=>{
 for(const field of ['addressProvider','dropoff'])for(const version of [1,2]){
  const data=payload();data.locations[0][field]=field==='addressProvider'?'JUSO':'문 앞';const before=oldEnvelope(version,data),env=setup({local:new MemoryStorage({[STORAGE_KEY]:before})});
  assert.equal((await env.api.load()).status,'CORRUPT');assert.equal(env.local.writes,0);assert.equal(env.local.getItem(STORAGE_KEY),before);
 }
 const data=payload();Object.assign(data.locations[0],candidate());const raw=JSON.stringify(data),env=setup({session:new MemoryStorage({[LEGACY_KEYS[0]]:raw})});assert.equal((await env.api.load()).status,'CORRUPT');assert.equal(env.session.getItem(LEGACY_KEYS[0]),raw);assert.equal(env.local.writes,0);
});
test('legacy session migrates to current schema without turning old providerId or status into verified evidence',async()=>{
 const data=payload();Object.assign(data.locations[0],{providerId:candidate().providerId,status:'PROVIDER_CHECKED',addressState:'PRESENT_REQUIRES_PROVIDER_POLICY'});
 const original=JSON.stringify(data),env=setup({session:new MemoryStorage({[LEGACY_KEYS[0]]:original})}),loaded=await env.api.load();
 assert.equal(loaded.status,'MIGRATED');assert.equal(JSON.parse(env.local.getItem(STORAGE_KEY)).schemaVersion,STORAGE_SCHEMA_VERSION);assert.equal(addressStatus(loaded.data.locations[0]).valid,false);assert.equal(loaded.data.locations[0].postal,'08843');assert.equal(env.session.getItem(LEGACY_KEYS[0]),original);
});
test('strict new provider selections and placement limits reject malformed data without any write',async()=>{
 for(const patch of [{addressProvider:'OTHER'},{addressProvider:'JUSO'}, {...candidate(),postal:8843}, {...candidate(),providerId:'old'}, {dropoff:'x'.repeat(4097)}, {dropoff:12}, {location:{dropoff:'nested wrong field'}}]){
  const env=setup(),initial=await env.api.load(),data=payload();Object.assign(data.locations[0],patch);assert.equal((await env.api.commit(data,opts(initial))).status,'INVALID_DATA');assert.equal(env.local.writes,0);
 }
 const data=payload();Object.assign(data.locations[0],candidate(),{detail:'',dropoff:''});assert.equal(projectStoredPayload(data).locations[0].dropoff,'');
 data.locations[0].detail='  2층  ';data.locations[0].dropoff='문 앞\n  보관함  ';
 const projected=projectStoredPayload(data);assert.equal(projected.locations[0].detail,'  2층  ');assert.equal(projected.locations[0].dropoff,'문 앞\n  보관함  ');
});
test('address-only patch preserves latest contacts; cancellation zero, save once and duplicate zero extra writes',async()=>{
 const env=setup(),initial=await env.api.load(),data=payload(),parent=structuredClone(data.locations[0]);
 const child=selectAddress(parent,candidate());child.dropoff='문 앞';parent.email='edited@example.com';parent.contactPhone='+82 10 9876 5432';
 Object.assign(parent,child);assert.equal(parent.email,'edited@example.com');assert.equal(parent.contactPhone,'+82 10 9876 5432');assert.equal(env.local.writes,0);
 assert.equal(data.locations[0].dropoff,undefined,'parent cancel can discard clone without mutating stored data');
 data.locations[0]=parent;const saved=await env.api.commit(data,opts(initial));assert.equal(saved.ok,true);assert.equal(env.local.writes,1);assert.equal((await env.api.commit(data,opts(initial))).status,'IDEMPOTENT');assert.equal(env.local.writes,1);
});
test('two-tab address writes conflict without merge; reset cannot resurrect old address drafts',async()=>{
 const env=setup(),tabB=setup(env).api,[a,b]=await Promise.all([env.api.load(),tabB.load()]),one=payload(),two=payload();
 Object.assign(one.locations[0],candidate(),{dropoff:'A'});Object.assign(two.locations[0],candidate(),{dropoff:'B'});
 const result=await Promise.all([env.api.commit(one,opts(a,'tab-a')),tabB.commit(two,opts(b,'tab-b'))]);assert.equal(result.filter(x=>x.ok).length,1);assert.equal(result.filter(x=>x.status==='CONFLICT').length,1);assert.equal(env.local.writes,1);
 const current=await env.api.load(),reset=await env.api.reset(opts(current,'reset'));assert.equal(reset.status,'RESET');assert.equal((await tabB.commit(two,opts(b,'late-address'))).status,'CONFLICT');assert.equal((await env.api.load()).status,'RESET');
});
