import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {webcrypto} from 'node:crypto';
import {createBrowserStorage,STORAGE_SCHEMA_VERSION,projectStoredPayload,emptyStoredPayload} from '../../web/storage.mjs';
import {createCadence,createApprovedCadence,inspectCadence} from '../../web/cadence-contract.mjs';

class Store{constructor(raw=null){this.raw=raw;this.writes=0;this.fail=false;}getItem(){return this.raw;}setItem(key,value){if(this.fail)throw Object.assign(Error('quota'),{name:'QuotaExceededError'});this.raw=value;this.writes++;}}
const locks=()=>{let queue=Promise.resolve();return {request(name,options,callback){const next=queue.then(()=>callback({name}));queue=next.catch(()=>{});return next;}};};
const setup=(local=new Store(),lock=locks())=>({local,lock,api:createBrowserStorage({localStorage:local,sessionStorage:new Store(),locks:lock,crypto:webcrypto,now:()=>1})});
const settings=(read,transactionId='confirmed')=>({expectedRevision:read.revision,expectedToken:read.versionToken,transactionId});
const envelope=(schemaVersion,data)=>JSON.stringify({schemaVersion,generation:'historical',revision:7,state:'data',data,receipts:[],migration:null,updatedAt:1});
const body=()=>({...emptyStoredPayload(),lines:[{id:'sku',housing:'4',size:'특란',pack:'30',qty:'600',price:'10000'}],locations:[{id:'site',name:'합성 사업장',postal:'08843'}],allocations:[{id:'allocation',lineId:'sku',locationId:'site',qty:'40',mode:'FIXED',advanced:{fixedOrderProcess:'auto'}}]});
const selected=(period='매주',date='2026-11-05')=>({...createApprovedCadence(period),preferredDate:date,nominalAnchor:date});
const approvedRepeat=()=>({period:'매주',frequency:'약4회',date:'',dateMode:'custom',weeklyCheck:true,weekdays:{'1:화':true,'1:월':true},weekdayOrder:['1:화','1:월'],weekOpen:0,semantics:'cadence-v3',legacyReviewRequired:false,cadence:selected(),monthlyMemory:{quantity:'100',period:'협의',frequency:'',preferredDate:'2026-11-06'},quantityEditVersion:'0540'});
const plain=value=>JSON.parse(JSON.stringify(value));
const source=await readFile(new URL('../../web/common-ui.mjs',import.meta.url),'utf8');
const expression=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(node=>node.type==='ExpressionStatement'&&node.expression.type==='AssignmentExpression'&&node.expression.left.property?.name==='OrderRepeatContract');
function owner(){const context=vm.createContext({window:{},createCadence,createApprovedCadence,inspectCadence,structuredClone});vm.runInContext(source.slice(expression.start,expression.end),context);return context.window.OrderRepeatContract;}

test('C54-22 schema7 keeps approved cadence, selection order, monthly restoration memory and twelve digits exactly',async()=>{
 assert.equal(STORAGE_SCHEMA_VERSION,7);const data=body(),repeat=approvedRepeat();repeat.monthlyMemory.quantity='999999999999';data.allocations[0].qty='999999999999';data.allocations[0].cadence=repeat.cadence;data.allocations[0].q4Review={version:'0460',activeRepeat:repeat,draft:{mode:'FIXED',repeat:structuredClone(repeat)},common:{repeat:structuredClone(repeat)}};
 const env=setup(),read=await env.api.load(),saved=await env.api.commit(data,settings(read));assert.equal(saved.status,'COMMITTED');assert.equal(env.local.writes,1);assert.equal((await env.api.commit(data,settings(read))).status,'IDEMPOTENT');assert.equal(env.local.writes,1);assert.deepEqual((await setup(env.local,env.lock).api.load()).data,data);assert.deepEqual(projectStoredPayload(JSON.parse(JSON.stringify(saved.data))),data);
});
test('C54-22 schema6 and historical cadence read unchanged, upgrade only on successful explicit commit',async()=>{
 for(const version of ['2.0.0','2.1.0']){
  const data=body();data.allocations[0].cadence={version,kind:'INTERVAL_DAYS',intervalDays:21,preferredDate:'2025-01-01',...(version==='2.1.0'?{nominalAnchor:'2025-01-01'}:{})};const raw=envelope(6,data),env=setup(new Store(raw)),read=await env.api.load();assert.equal(read.status,'LOADED');assert.deepEqual(read.data,data);assert.equal(env.local.writes,0);assert.equal(env.local.raw,raw);
  const draft=structuredClone(read.data);draft.locations[0].name='수정';env.local.fail=true;assert.equal((await env.api.commit(draft,settings(read))).status,'WRITE_FAILED');assert.equal(env.local.raw,raw);env.local.fail=false;const saved=await env.api.commit(draft,settings(read));assert.equal(saved.status,'COMMITTED');assert.equal(JSON.parse(env.local.raw).schemaVersion,7);assert.deepEqual(saved.data.allocations[0].cadence,data.allocations[0].cadence);assert.equal(saved.data.allocations[0].advanced.fixedOrderProcess,'auto');
 }
});
test('C54-22 old envelopes cannot smuggle new cadence, memory, weekday order or Kakao provenance',async()=>{
 for(const mutate of [p=>p.allocations[0].cadence=selected(),p=>p.allocations[0].q4Review={version:'0460',activeRepeat:{monthlyMemory:null}},p=>p.allocations[0].q4Review={version:'0460',common:{repeat:{weekdayOrder:[]}}},p=>p.allocations[0].q4Review={version:'0460',draft:{repeat:{quantityEditVersion:'0540'}}},p=>p.locations[0].addressProvider='KAKAO']){
  const data=body();mutate(data);const raw=envelope(6,data),env=setup(new Store(raw));assert.equal((await env.api.load()).status,'CORRUPT');assert.equal(env.local.raw,raw);assert.equal(env.local.writes,0);
 }
});
test('C54-02/22 Kakao selection restores postal leading zero and optional details without changing legacy JUSO identity',async()=>{
 for(const [addressProvider,providerId] of [['KAKAO','KAKAO:v1:'+'a'.repeat(64)],['JUSO','1'.repeat(25)]]){
  const data=body();Object.assign(data.locations[0],{road:'합성시 가상로 10',postal:'08843',jibun:'합성동 1',region:'합성시',detail:'2층',dropoff:'문 앞',addressProvider,providerId});const env=setup(),read=await env.api.load(),saved=await env.api.commit(data,settings(read));assert.equal(saved.status,'COMMITTED');assert.equal(saved.data.locations[0].postal,'08843');assert.deepEqual((await setup(env.local,env.lock).api.load()).data.locations[0],data.locations[0]);
 }
});
test('C54-22 strict approved contract rejects unknown fields, repeated weekday order and malformed restoration memory',()=>{
 for(const mutate of [r=>r.weekdayOrder.push('1:화'),r=>r.weekdayOrder=['2:월'],r=>r.monthlyMemory.quantity='1,000',r=>r.monthlyMemory.quantity='1000000000000',r=>r.monthlyMemory.period='매월',r=>r.monthlyMemory.preferredDate='2026-02-30',r=>r.monthlyMemory.preferredDate=20261106,r=>r.quantityEditVersion='unknown',r=>r.cadence.intervalDays=14,r=>r.cadence.nominalAnchor='2026-11-06',r=>r.cadence.preferredDate='2026-20-30']){
  const data=body(),repeat=approvedRepeat();mutate(repeat);data.allocations[0].q4Review={version:'0460',activeRepeat:repeat};assert.throws(()=>projectStoredPayload(data));
 }
 assert.equal(inspectCadence({...selected('2주'),intervalDays:21}).valid,false);assert.equal(inspectCadence({...selected('협의',''),arbitrary:true}).valid,false);
 for(const value of ['1,000','1000000000000','10가20','1/2']){const data=body();data.allocations[0].cadence=selected();data.allocations[0].qty=value;assert.throws(()=>projectStoredPayload(data));}
});
test('C54-13/14/22 v3 weekly allows fewer than N selected days, consult frequency and explicit start date',()=>{
 const contract=owner(),repeat=approvedRepeat();assert.equal(contract.inspect(repeat).valid,true);assert.equal(contract.inspect(repeat).perWeek,4);repeat.weekdays={'1:월':true,'1:화':true,'1:수':true,'1:목':true,'1:금':true};assert.equal(contract.inspect(repeat).issue.kind,'weekdays');repeat.frequency='협의';assert.equal(contract.inspect(repeat).valid,true);assert.equal(contract.inspect(repeat).perWeek,null);assert.equal(contract.serialize(repeat).value.frequencyPerWeek,null);assert.equal(contract.serialize(repeat).value.freq,0);
 repeat.frequency='';assert.equal(contract.inspect(repeat).issue.kind,'frequency');repeat.frequency='약 4회';repeat.weekdays={};repeat.cadence=selected('매주','');assert.equal(contract.inspect(repeat).issue.kind,'preferred-date');assert.equal(contract.serialize(repeat).ok,false);
});
test('C54-20/22 consultation hides date requirement; fortnight and monthly completion require their single date',()=>{
 const contract=owner();for(const period of ['협의','2주']){const repeat={...approvedRepeat(),period,cadence:selected(period,'')};assert.equal(contract.inspect(repeat).valid,period==='협의');if(period==='협의'){const packed=contract.serialize(repeat);assert.equal(packed.ok,true);assert.equal(packed.value.freq,0);assert.equal(contract.fromAllocation(packed.value).period,'협의');}}
 for(const dayRule of [31,'last']){const repeat={...approvedRepeat(),period:'매월',cadence:{...selected('매월','2027-02-28'),dayRule}};assert.equal(contract.inspect(repeat).valid,true);assert.equal(contract.serialize(repeat).value.monthDay,String(dayRule));repeat.cadence.preferredDate='';repeat.cadence.nominalAnchor='';assert.equal(contract.inspect(repeat).issue.kind,'preferred-date');}
});
test('C54-22 snapshot and allocation restoration preserve memory without changing original state',()=>{
 const contract=owner(),repeat=approvedRepeat(),before=structuredClone(repeat),snapshot=plain(contract.snapshot(repeat)),packed=plain(contract.serialize(repeat).value);assert.deepEqual(snapshot,repeat);const restored=plain(contract.fromAllocation({...packed,q4Review:{activeRepeat:snapshot}}));assert.deepEqual(restored.monthlyMemory,repeat.monthlyMemory);assert.deepEqual(restored.weekdayOrder,['1:화','1:월']);assert.equal(restored.quantityEditVersion,'0540');assert.equal(contract.inspect(restored).valid,true);assert.deepEqual(repeat,before);
 assert.equal(Object.hasOwn(contract.snapshot({...repeat,monthlyMemory:undefined}),'monthlyMemory'),false);
});
test('C54-22 approved transactions retain cancel0, confirm1, duplicate0 and cross-tab conflict protection',async()=>{
 const env=setup(),tab=setup(env.local,env.lock).api,[first,second]=await Promise.all([env.api.load(),tab.load()]),data=body();data.allocations[0].cadence=selected('협의','');assert.equal(env.local.writes,0);
 assert.equal((await env.api.commit(data,{...settings(first,'cancel'),canCommit:()=>false})).status,'CANCELLED');assert.equal(env.local.writes,0);const outcomes=await Promise.all([env.api.commit(data,settings(first,'A')),tab.commit(data,settings(second,'B'))]);assert.deepEqual(outcomes.map(item=>item.status).sort(),['COMMITTED','CONFLICT']);assert.equal(env.local.writes,1);const winner=outcomes[0].status==='COMMITTED'?{api:env.api,read:first,id:'A'}:{api:tab,read:second,id:'B'};assert.equal((await winner.api.commit(data,settings(winner.read,winner.id))).status,'IDEMPOTENT');assert.equal(env.local.writes,1);const read=await env.api.load();assert.equal((await env.api.reset(settings(read,'reset'))).status,'RESET');assert.equal((await tab.commit(data,settings(second,'stale'))).status,'CONFLICT');assert.equal((await env.api.load()).status,'RESET');
});
