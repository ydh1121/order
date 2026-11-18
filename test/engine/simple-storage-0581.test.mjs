import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {blankSimpleQuote,projectSimpleQuote,projectLegacySimpleQuote,upgradeSimpleQuote,inspectSimpleQuote,projectSimpleInput,createSimpleAuthHandoff,resumeSimpleAuthHandoff} from '../../web/simple-quote-contract.mjs';
import {regionSelection} from '../../web/region-reference.mjs';
import {createBrowserStorage,emptyStoredPayload,projectStoredPayload,STORAGE_SCHEMA_VERSION,STORAGE_KEY,LEGACY_KEYS} from '../../web/storage.mjs';

class MemoryStorage{
 constructor(entries={}){this.entries=new Map(Object.entries(entries));this.writes=0;this.reads=0;this.failWrite=false;}
 getItem(key){this.reads++;return this.entries.get(key)??null;}
 setItem(key,value){if(this.failWrite)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});this.writes++;this.entries.set(key,String(value));}
}
function locks(){const queues=new Map();return {request(name,options,fn){const prior=queues.get(name)??Promise.resolve(),next=prior.then(()=>fn({name}));queues.set(name,next.catch(()=>{}));return next;}};}
const KEY='order_simple_0581_test',LOCK='order-simple-0581-test';
function setup({local=new MemoryStorage(),session=new MemoryStorage(),manager=locks(),...options}={}){return {local,session,manager,api:createBrowserStorage({localStorage:local,sessionStorage:session,locks:manager,crypto:webcrypto,key:KEY,lockName:LOCK,migrateLegacy:false,now:()=>1794430000000,...options})};}
const fixture=()=>({...emptyStoredPayload(),lines:[{id:'sku-stable',housing:'4',size:'대란',pack:'30',qty:'6050',qtyUnit:'each',qtyDisplayUnit:'tray',price:'10000'}],current:'sku-stable',simpleQuote:{...blankSimpleQuote(),siteCount:'2',sharedRegion:'서울특별시 관악구 봉천동',sharedRegionSelection:regionSelection('1100000000','1162000000'),orderKind:'FIXED',flexBasis:'WEEK',preferredDate:'2026-11-24'}});
const options=(loaded,transactionId='txn-1',extra={})=>({expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId,...extra});

test('0583 updates blank defaults to count1 while optional consent, product and date stay unconfirmed',()=>{
 assert.deepEqual(blankSimpleQuote(),{version:'provisional-0583-1',snapshotId:'MASTER-UI-MOTION-FEEDBACK-20261112-R1',specUnknown:false,consultationInterest:false,monthlyScope:'UNCONFIRMED',unknownMonthly:{qty:'',unit:'each',budget:''},siteCount:'1',siteCountConfirmed:true,legacySiteCount:null,regionsDiffer:false,sharedRegion:'',sharedRegionSelection:null,sites:[],orderKind:'',flexBasis:'',preferredDate:''});
 assert.equal(inspectSimpleQuote({...emptyStoredPayload(),simpleQuote:blankSimpleQuote()}).readyToAdvance,false);
});
test('0581 known input can advance while uncertain monthly scope and unverified region prohibit proof',()=>{
 const result=inspectSimpleQuote(fixture());assert.equal(result.readyToAdvance,true);assert.deepEqual(Object.values(result.stages).map(stage=>stage.ready),[true,true,true,true]);assert.equal(result.proofBlocked,true);
 assert.deepEqual(result.proofBlockers,['MONTHLY_SCOPE_UNCONFIRMED','REGION_UNVERIFIED','APPROVED_OFFER_REQUIRED']);assert.equal(result.authentication,'UNKNOWN');assert.equal(result.businessVerification,'UNKNOWN');
});
test('0581 spec unknown and missing price may advance as each demand; neither yields comparison or package conversion',()=>{
 const data=fixture();Object.assign(data.lines[0],{housing:'',size:'',pack:'',price:'',qty:'1200',qtyUnit:'each',qtyDisplayUnit:'each'});data.simpleQuote.specUnknown=true;data.simpleQuote.unknownMonthly={qty:'1200',unit:'each',budget:''};
 const inspected=inspectSimpleQuote(data),input=projectSimpleInput(data);assert.equal(inspected.readyToAdvance,true);assert.ok(inspected.proofBlockers.includes('SPEC_UNKNOWN'));assert.ok(inspected.proofBlockers.includes('CURRENT_PRICE_OR_PACKAGE_REQUIRED'));assert.deepEqual([input.product.line.pack,input.monthly.quantity,input.monthly.unit,input.monthly.price],['','1200','each','']);
 delete data.lines[0].qtyUnit;delete data.lines[0].qtyDisplayUnit;assert.equal(projectSimpleInput(data).monthly.unit,'each');data.simpleQuote.unknownMonthly.unit='';assert.equal(projectSimpleInput(data).monthly.unit,null);assert.equal(inspectSimpleQuote(data).stages.q2.ready,false);
});
test('0581 reversible unknown retains known picks but never restores proof or assumes consultation acceptance',()=>{
 const data=fixture(),lineBefore=structuredClone(data.lines[0]);data.simpleQuote.specUnknown=true;const result=inspectSimpleQuote(data);assert.equal(result.stages.q2.ready,false,'dormant known quantity does not fill unknown demand');assert.ok(result.proofBlockers.includes('SPEC_UNKNOWN'));assert.deepEqual(data.lines[0],lineBefore);assert.equal(projectSimpleInput(data).consultationInterest,false);
});
test('0581 monthly raw quantities and display unit remain separate without per-site allocation',()=>{
 const input=projectSimpleInput(fixture());assert.equal(input.monthly.quantity,'6050');assert.equal(input.monthly.unit,'each');assert.equal(input.product.line.qtyDisplayUnit,'tray');assert.equal(input.regions.siteCount,'2');assert.equal(input.monthly.scope,'UNCONFIRMED');assert.equal(Object.hasOwn(input,'allocations'),false);
});
test('0581 strict envelope rejects coercion, unknown policy, fake approvals, duplicate IDs and invalid dates',()=>{
 const variants=[q=>q.siteCount=2,q=>q.siteCount='1,200',q=>q.monthlyScope='ALL_SITES',q=>q.orderKind='AUTO',q=>q.flexBasis='WEEKLY_VISITS',q=>q.consultationInterest='true',q=>q.authentication='AUTHENTICATED',q=>q.sites=[{id:'same',region:'서울 강남구'},{id:'same',region:'서울 서초구'}],q=>q.preferredDate='2026-02-29',q=>q.preferredDate='2026-20-03',q=>q.preferredDate='0000-01-01'];
 for(const mutate of variants){const value=blankSimpleQuote();mutate(value);assert.throws(()=>projectSimpleQuote(value));}
 assert.equal(projectSimpleQuote({...blankSimpleQuote(),preferredDate:'2028-02-29'}).preferredDate,'2028-02-29');
});
test('0581 different district/dong text and stable region IDs survive reorder and inactive shared region',()=>{
 const data=fixture();Object.assign(data.simpleQuote,{regionsDiffer:true,sharedRegion:'부산광역시 남구',sites:[{id:'site-b',region:'서울특별시 관악구 신림동',regionSelection:regionSelection('1100000000','1162000000')},{id:'site-a',region:'서울특별시 관악구 봉천동',regionSelection:regionSelection('1100000000','1162000000')}]});const output=projectStoredPayload(data);assert.deepEqual(output.simpleQuote.sites,data.simpleQuote.sites);assert.equal(output.simpleQuote.sharedRegion,'부산광역시 남구');assert.equal(inspectSimpleQuote(data).stages.q3.ready,true);
 data.simpleQuote.siteCount='3';assert.equal(inspectSimpleQuote(data).stages.q3.ready,false);data.simpleQuote.siteCount='2';data.simpleQuote.sites[0].regionSelection=null;assert.equal(inspectSimpleQuote(data).stages.q3.ready,false,'raw text does not substitute for explicit catalog choice');
});
test('0581 FLEX requires raw week/month intent; FIXED/ONCE preserve inactive basis and optional date',()=>{
 const data=fixture();data.simpleQuote.orderKind='FLEX';data.simpleQuote.flexBasis='';assert.equal(inspectSimpleQuote(data).stages.q4.ready,false);data.simpleQuote.flexBasis='MONTH';assert.equal(inspectSimpleQuote(data).stages.q4.ready,true);
 for(const kind of ['FIXED','ONCE']){data.simpleQuote.orderKind=kind;data.simpleQuote.preferredDate='';const input=projectSimpleInput(data);assert.deepEqual(input.order,{kind,flexBasis:'MONTH',preferredDate:''});assert.equal(inspectSimpleQuote(data).stages.q4.ready,true);assert.equal(Object.hasOwn(input.order,'frequency'),false);}
});
test('0581 privacy allowlist excludes detailed address, contacts, allocations, documents and ephemeral state',()=>{
 const data=fixture();Object.assign(data,{locations:[{id:'private',name:'sensitive-name',email:'private@example.invalid'}],allocations:[{secret:'private-allocation'}],documents:{businessRegistration:'private-document'},dns:{secret:'private-dns'}});data.lines[0].private='private-line';
 const input=projectSimpleInput(data),serialized=JSON.stringify(input);assert.doesNotMatch(serialized,/private-|sensitive-name|example\.invalid|documents|dns/);assert.equal(input.product.line.id,'sku-stable');
});
test('0581 second SKU cannot leak into handoff or durable simple envelope',()=>{
 const data=fixture();data.lines.push({...data.lines[0],id:'sku-second'});assert.throws(()=>projectSimpleInput(data),/SINGLE_SKU_REQUIRED/);assert.throws(()=>projectStoredPayload(data),/SINGLE_SKU_REQUIRED/);assert.equal(inspectSimpleQuote(data).readyToAdvance,false);
});
test('0581 authentication snapshots are immutable, provider absence and cancel preserve data without business verification',()=>{
 const data=fixture(),handoff=createSimpleAuthHandoff(data,{requestId:'request-1',inputRevision:4});data.lines[0].qty='999';data.simpleQuote.sharedRegion='changed';assert.equal(handoff.input.monthly.quantity,'6050');assert.ok(Object.isFrozen(handoff.input.product.line));assert.throws(()=>handoff.input.regions.sites.push({id:'bad',region:'bad'}));
 const absent=resumeSimpleAuthHandoff(handoff,{requestId:'request-1',inputRevision:4});assert.equal(absent.status,'UNAVAILABLE');assert.equal(absent.ok,false);
 for(const authentication of ['CANCELLED','AUTHENTICATED']){const output=resumeSimpleAuthHandoff(handoff,{requestId:'request-1',inputRevision:4,authentication});assert.equal(output.status,authentication==='AUTHENTICATED'?'RESUMED':'CANCELLED');assert.equal(output.ok,authentication==='AUTHENTICATED');assert.equal(output.input,handoff.input);assert.equal(output.businessVerification,'UNKNOWN');}
});
test('0581 late auth, changed input, wrong request and forged envelopes cannot unlock detail or overwrite input',()=>{
 const handoff=createSimpleAuthHandoff(fixture(),{requestId:'auth-r1',inputRevision:3});for(const meta of [{requestId:'auth-r0',inputRevision:3},{requestId:'auth-r1',inputRevision:4}]){const result=resumeSimpleAuthHandoff(handoff,{...meta,authentication:'AUTHENTICATED'});assert.equal(result.status,'STALE');assert.equal(result.ok,false);assert.equal(result.authentication,'UNKNOWN');assert.equal(result.input,handoff.input);}
 assert.throws(()=>resumeSimpleAuthHandoff(Object.freeze({...handoff}),{requestId:'auth-r1',inputRevision:3,authentication:'AUTHENTICATED'}),/IMMUTABLE_HANDOFF_REQUIRED/);
 assert.throws(()=>createSimpleAuthHandoff(fixture(),{requestId:'a',inputRevision:-1}),/REVISION/);
});
test('0583 schema10 optional envelope round trips; old detailed shape adds no simple fields',async()=>{
 const env=setup(),initial=await env.api.load(),saved=await env.api.commit(fixture(),options(initial));assert.equal(STORAGE_SCHEMA_VERSION,10);assert.equal(saved.status,'COMMITTED');assert.equal(JSON.parse(env.local.getItem(KEY)).schemaVersion,10);assert.deepEqual((await setup(env).api.load()).data,fixture());assert.deepEqual(projectStoredPayload(emptyStoredPayload()),emptyStoredPayload());assert.equal(Object.hasOwn(projectStoredPayload(emptyStoredPayload()),'simpleQuote'),false);
});
test('0583 historical schemas1–9 load byte unchanged and cannot claim new simple semantics',async()=>{
 for(let schemaVersion=1;schemaVersion<=9;schemaVersion++){
  const envelope={schemaVersion,generation:'historic-generation',revision:1,state:'data',data:emptyStoredPayload(),receipts:[],migration:null,updatedAt:1794430000000},raw=JSON.stringify(envelope),env=setup({local:new MemoryStorage({[KEY]:raw})});const loaded=await env.api.load();assert.equal(loaded.status,'LOADED');assert.equal(env.local.getItem(KEY),raw);assert.equal(env.local.writes,0);assert.deepEqual(loaded.data,emptyStoredPayload());
  envelope.data.simpleQuote=blankSimpleQuote();env.local.entries.set(KEY,JSON.stringify(envelope));assert.equal((await env.api.load()).status,'CORRUPT');
 }
});
test('0581 isolated candidate never reads or migrates detailed legacy sessions, even when corrupt',async()=>{
 const original='{corrupt detailed session',session=new MemoryStorage({[LEGACY_KEYS[0]]:original}),local=new MemoryStorage({[STORAGE_KEY]:'detailed-original'}),env=setup({local,session});const loaded=await env.api.load();assert.equal(loaded.status,'EMPTY');assert.equal(session.reads,0);const committed=await env.api.commit(fixture(),options(loaded));assert.equal(committed.status,'COMMITTED');assert.equal(session.reads,0);assert.equal(session.entries.get(LEGACY_KEYS[0]),original);assert.equal(local.entries.get(STORAGE_KEY),'detailed-original');assert.equal(JSON.parse(local.getItem(KEY)).migration,null);
});
test('0581 default detailed adapter still migrates valid historical session rather than ignoring it',async()=>{
 const original=JSON.stringify(emptyStoredPayload()),env=setup({migrateLegacy:true,session:new MemoryStorage({[LEGACY_KEYS[0]]:original})});assert.equal((await env.api.load()).status,'MIGRATED');assert.equal(env.session.entries.get(LEGACY_KEYS[0]),original);assert.throws(()=>setup({migrateLegacy:'false'}),/STORAGE_CONFIG/);
});
test('0581 cancel0 confirm1 duplicate0 and immediate reload preserve raw inactive choices',async()=>{
 const env=setup(),initial=await env.api.load(),data=fixture();assert.equal((await env.api.commit(data,options(initial,'cancel',{canCommit:()=>false}))).status,'CANCELLED');assert.equal(env.local.writes,0);
 const saved=await env.api.commit(data,options(initial));assert.equal(saved.status,'COMMITTED');assert.equal((await env.api.commit(data,options(initial))).status,'IDEMPOTENT');assert.equal(env.local.writes,1);const restored=await setup(env).api.load();assert.equal(restored.data.simpleQuote.flexBasis,'WEEK');assert.equal(restored.data.simpleQuote.preferredDate,'2026-11-24');assert.equal(restored.data.lines[0].qty,'6050');
});
test('0581 concurrent candidate tabs conflict instead of merging; stale reset cannot resurrect input',async()=>{
 const env=setup(),second=setup(env),[a,b]=await Promise.all([env.api.load(),second.api.load()]),one=fixture(),two=fixture();two.simpleQuote.sharedRegion='경기도 성남시 분당구';const results=await Promise.all([env.api.commit(one,options(a,'a')),second.api.commit(two,options(b,'b'))]);assert.equal(results.filter(result=>result.ok).length,1);assert.equal(results.filter(result=>result.status==='CONFLICT').length,1);assert.equal(env.local.writes,1);
 const saved=await env.api.load();assert.equal((await env.api.reset(options(saved,'reset'))).status,'RESET');assert.equal((await second.api.commit(two,options(saved,'old-tab'))).status,'CONFLICT');assert.equal((await setup(env).api.load()).status,'RESET');
});
test('0581 failed save preserves source and caller draft, and malformed candidate never writes',async()=>{
 const env=setup(),saved=await env.api.commit(fixture(),options(await env.api.load())),original=env.local.getItem(KEY),draft=fixture();draft.simpleQuote.sharedRegion='수정 중';env.local.failWrite=true;const failed=await env.api.commit(draft,options(saved,'failure'));assert.equal(failed.status,'WRITE_FAILED');assert.equal(env.local.getItem(KEY),original);assert.equal(draft.simpleQuote.sharedRegion,'수정 중');env.local.failWrite=false;draft.simpleQuote.monthlyScope='ALL_SITES';assert.equal((await env.api.commit(draft,options(saved,'bad'))).status,'INVALID_DATA');assert.equal(env.local.writes,1);
});
