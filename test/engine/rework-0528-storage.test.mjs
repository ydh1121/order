import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {createBrowserStorage,STORAGE_KEY,STORAGE_SCHEMA_VERSION,emptyStoredPayload,projectStoredPayload} from '../../web/storage.mjs';
class Store{constructor(raw=null){this.raw=raw;this.writes=0;this.fail=false;}getItem(){return this.raw;}setItem(k,v){if(this.fail)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});this.raw=v;this.writes++;}}
const locks=()=>{let tail=Promise.resolve();return {request(name,opts,fn){const next=tail.then(()=>fn({name}));tail=next.catch(()=>{});return next;}};};
const setup=(local=new Store(),lock=locks())=>({local,lock,api:createBrowserStorage({localStorage:local,sessionStorage:new Store(),locks:lock,crypto:webcrypto,now:()=>1})});
const opts=(loaded,transactionId='checkpoint',more={})=>({expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId,...more});
const checkpoint=()=>({...emptyStoredPayload(),bodyCheckpoint:{version:'1.0.0',q1Selection:{id:'initial-sku',housing:'4',size:'',pack:''}}});
const body=()=>({...emptyStoredPayload(),lines:[{id:'sku',housing:'4',size:'특란',pack:'30',qty:'',price:''}],locations:[{id:'site',name:'',road:'',contactPhone:'',email:''}],allocations:[{id:'a',lineId:'sku',locationId:'site',qty:'',mode:'FLEX',modeExplicit:false}]});
const envelope=(schemaVersion,data)=>JSON.stringify({schemaVersion,generation:'old',revision:7,state:'data',data,receipts:[],migration:null,updatedAt:1});
test('C28 checkpoint keeps initial body selection apart from valid entities and writes only after a durable receipt',async()=>{
 assert.equal(STORAGE_SCHEMA_VERSION,9);const env=setup(),data=checkpoint(),loaded=await env.api.load();assert.equal(env.local.writes,0);
 const saved=await env.api.commit(data,opts(loaded));assert.equal(saved.status,'COMMITTED');assert.equal(env.local.writes,1);assert.deepEqual(saved.data.lines,[]);assert.deepEqual((await setup(env.local,env.lock).api.load()).data,data);
 assert.equal((await env.api.commit(data,opts(loaded))).status,'IDEMPOTENT');assert.equal(env.local.writes,1);
 const confirmed=body();const next=await env.api.commit(confirmed,opts(saved,'confirm-sku'));assert.equal(next.ok,true);assert.equal(next.data.bodyCheckpoint,undefined);assert.equal(next.data.allocations[0].qty,'');assert.equal(next.data.locations[0].road,'');
});
test('C28 incomplete Q1–Q4 progress does not require DNS/address success or weaken entity shapes',()=>{
 assert.deepEqual(projectStoredPayload(body()),body());
 for(const mutate of [p=>p.bodyCheckpoint.privatePopup={email:'private'},p=>p.bodyCheckpoint.q1Selection.housing='5',p=>p.bodyCheckpoint.q1Selection.dns={state:'PASS'},p=>p.bodyCheckpoint.version='2',p=>p.lines.push(body().lines[0]),p=>p.bodyCheckpoint.q1Selection.id='']){const p=checkpoint();mutate(p);assert.throws(()=>projectStoredPayload(p));}
 const broken=body();broken.allocations[0].locationId='not-present';assert.throws(()=>projectStoredPayload(broken));
});
test('C28 failed checkpoint preserves input and durable source, concurrent saves conflict, reset blocks delayed prior writes',async()=>{
 const env=setup(),initial=await env.api.load(),data=checkpoint(),before=structuredClone(data);env.local.fail=true;assert.equal((await env.api.commit(data,opts(initial))).status,'WRITE_FAILED');assert.equal(env.local.raw,null);assert.deepEqual(data,before);env.local.fail=false;
 const tab=setup(env.local,env.lock).api,b=await tab.load(),other=checkpoint();other.bodyCheckpoint.q1Selection.pack='30';const outcomes=await Promise.all([env.api.commit(data,opts(initial,'A')),tab.commit(other,opts(b,'B'))]);assert.deepEqual(outcomes.map(r=>r.status).sort(),['COMMITTED','CONFLICT']);assert.equal(env.local.writes,1);
 const current=await env.api.load();assert.equal((await env.api.reset(opts(current,'reset'))).status,'RESET');assert.equal((await tab.commit(other,opts(b,'late'))).status,'CONFLICT');assert.equal((await env.api.load()).data.bodyCheckpoint,undefined);
});
test('C28 reload before write completion sees old state; epoch cancellation prevents late checkpoint resurrection',async()=>{
 let release,entered;const enteredPromise=new Promise(r=>entered=r),gate=new Promise(r=>release=r),local=new Store();let block=false;
 const serial=locks(),lock={request:(name,opts,fn)=>serial.request(name,opts,async value=>{if(block){entered();await gate;}return fn(value);})};
 const env=setup(local,lock),initial=await env.api.load();block=true;let epoch=1;const pending=env.api.commit(checkpoint(),opts(initial,'pending',{canCommit:()=>epoch===1}));await enteredPromise;
 const prior=await setup(local).api.load();assert.equal(prior.status,'EMPTY');assert.equal(local.writes,0,'reload before durable receipt cannot promise the pending data');epoch++;release();assert.equal((await pending).status,'CANCELLED');assert.equal(local.writes,0);
});
test('C28 schema5 original remains byte-identical on read; schema6 metadata records versions without advancing lifecycle',async()=>{
 const data=body(),raw=envelope(5,data),env=setup(new Store(raw)),loaded=await env.api.load();assert.equal(loaded.status,'LOADED');assert.equal(env.local.raw,raw);assert.equal(env.local.writes,0);
 data.allocations[0].q4Review={version:'0460',asOfLocalDate:'2026-12-04',startDateReview:{version:'1.0.0',lifecycle:'NEW',asOfLocalDate:'2026-12-04',holidayVersion:'verified-fixture',policyVersion:'new-start-1'}};
 const saved=await env.api.commit(data,opts(loaded));assert.equal(saved.ok,true);assert.equal(saved.data.allocations[0].q4Review.startDateReview.lifecycle,'NEW');assert.deepEqual((await setup(env.local,env.lock).api.load()).data,data);
 for(const field of ['asOfLocalDate','startDateReview']){const old=body();old.allocations[0].q4Review={version:'0460',[field]:data.allocations[0].q4Review[field]};assert.equal((await setup(new Store(envelope(5,old))).api.load()).status,'CORRUPT');}
 for(const patch of [{asOfLocalDate:'2026-20-01'},{lifecycle:'APPROVED'},{version:'2'},{actualOrderApproved:true},{nominalAnchor:'2026-12-31'}]){const invalid=structuredClone(data);Object.assign(invalid.allocations[0].q4Review.startDateReview,patch);assert.throws(()=>projectStoredPayload(invalid));}
 for(const version of [1,2,3,4,5])assert.equal((await setup(new Store(envelope(version,checkpoint()))).api.load()).status,'CORRUPT');
});
test('C28 cadence2.1 preserves nominal monthly rule apart from actual first delivery and refuses old-schema injection',async()=>{
 const cadence={version:'2.1.0',kind:'MONTHLY',dayRule:31,nominalAnchor:'2027-01-31',preferredDate:'2027-02-01'},data=body(),row=data.allocations[0];row.mode='FIXED';row.cadence=cadence;row.q4Review={version:'0460',activeRepeat:{cadence}};
 const env=setup(),saved=await env.api.commit(data,opts(await env.api.load()));assert.equal(saved.ok,true);assert.deepEqual((await setup(env.local,env.lock).api.load()).data,data);assert.equal(saved.data.allocations[0].cadence.dayRule,31);
 for(const version of [4,5])for(const destination of ['active','activeRepeat','common','draft']){const old=body(),value=old.allocations[0];if(destination==='active')value.cadence=cadence;else if(destination==='activeRepeat')value.q4Review={version:'0460',activeRepeat:{cadence}};else value.q4Review={version:'0460',[destination]:{repeat:{cadence}}};assert.equal((await setup(new Store(envelope(version,old))).api.load()).status,'CORRUPT');}
 for(const patch of [{nominalAnchor:''},{preferredDate:''},{nominalAnchor:'2027-01-30'},{nominalAnchor:'2027-02-30'},{version:'2.0.0'}]){const invalid=body();invalid.allocations[0].cadence={...cadence,...patch};assert.throws(()=>projectStoredPayload(invalid));}
 const legacy=body();legacy.allocations[0].cadence={version:'2.0.0',kind:'MONTHLY',dayRule:31,preferredDate:'2027-01-31'};const raw=envelope(5,legacy),old=setup(new Store(raw));assert.deepEqual((await old.api.load()).data,legacy);assert.equal(old.local.raw,raw);assert.equal(old.local.writes,0);
 const inactive=body();inactive.allocations[0].q4Review={version:'0460',draft:{mode:'FIXED',repeat:{cadence:{...cadence,dayRule:''}}}};assert.deepEqual(projectStoredPayload(inactive),inactive,'inactive empty rule retains both selected dates but is not active recurrence');inactive.allocations[0].cadence={...cadence,dayRule:''};assert.throws(()=>projectStoredPayload(inactive));
});
