import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createBrowserStorage,STORAGE_KEY,STORAGE_SCHEMA_VERSION,emptyStoredPayload,projectStoredPayload} from '../../web/storage.mjs';
import {frequencyText,repeatVisitPlan,sumNominalByReference,nominalQuantity,restoredDeliverySettings,activeHolidayFields} from '../../web/q4-planning.mjs';
class MemoryStorage{
 constructor(entries={}){this.values=new Map(Object.entries(entries));this.writes=0;this.fail=false;}
 getItem(key){return this.values.get(key)??null;}
 setItem(key,value){if(this.fail)throw Error('quota');this.values.set(key,String(value));this.writes++;}
}
const locks=()=>{let queue=Promise.resolve();return {request(name,opts,fn){const next=queue.then(()=>fn({name}));queue=next.catch(()=>{});return next;}};};
const setup=(local=new MemoryStorage(),lock=locks())=>({local,lock,api:createBrowserStorage({localStorage:local,sessionStorage:new MemoryStorage(),locks:lock,crypto:webcrypto,now:()=>1})});
const options=(read,id='confirm')=>({expectedRevision:read.revision,expectedToken:read.versionToken,transactionId:id});
const legacy=(weeks=2)=>({...emptyStoredPayload(),lines:[{id:'sku',housing:'4',size:'특란',pack:'30',qty:'5000',qtyUnit:'each',price:'10000'}],locations:[{id:'a',name:'합성 A',postal:'08843'}],allocations:[{id:'aa',lineId:'sku',locationId:'a',mode:'FIXED',qty:'15',freq:2,frequencyPerWeek:2,intervalWeeks:weeks,cycleCount:2*weeks,repeatSemantics:'per-week-v1',scheduleDetail:'days',weekPlans:Array.from({length:weeks},()=>({weekdays:['월','목']})),advanced:{fixedOrderProcess:'auto'}}]});
const envelope=(schemaVersion,data)=>JSON.stringify({schemaVersion,generation:'historical',revision:7,state:'data',data,receipts:[],migration:null,updatedAt:1});
const interval=(preferredDate='')=>({version:'2.0.0',kind:'INTERVAL_DAYS',intervalDays:14,preferredDate});
const monthly=(dayRule,preferredDate='')=>({version:'2.0.0',kind:'MONTHLY',dayRule,preferredDate});

test('C26 legacy schemas1–4 preserve2/3/4-week patterns byte-for-byte; explicit commit alone upgrades current schema',async()=>{
 assert.equal(STORAGE_SCHEMA_VERSION,10);
 for(const schema of [1,2,3,4])for(const weeks of [2,3,4]){
  const source=legacy(weeks),raw=envelope(schema,source),env=setup(new MemoryStorage({[STORAGE_KEY]:raw})),read=await env.api.load();
  assert.equal(read.status,'LOADED');assert.deepEqual(read.data,source);assert.equal(env.local.writes,0);assert.equal(env.local.getItem(STORAGE_KEY),raw);
  const unrelated=structuredClone(read.data);unrelated.locations[0].name='합성 A 수정';
  const saved=await env.api.commit(unrelated,options(read));assert.equal(saved.status,'COMMITTED');assert.equal(env.local.writes,1);
  assert.equal(JSON.parse(env.local.getItem(STORAGE_KEY)).schemaVersion,10);assert.equal(saved.data.allocations[0].cadence,undefined);assert.equal(saved.data.allocations[0].intervalWeeks,weeks);assert.equal(saved.data.allocations[0].cycleCount,weeks*2);assert.equal(saved.data.allocations[0].advanced.fixedOrderProcess,'auto');assert.equal(saved.data.locations[0].postal,'08843');
 }
});
test('C26 explicit new cadence keeps legacy fields recoverable and commits once, without touching source on failure',async()=>{
 const data=legacy(3),raw=envelope(4,data),env=setup(new MemoryStorage({[STORAGE_KEY]:raw})),read=await env.api.load(),draft=structuredClone(read.data);
 draft.allocations[0].cadence=interval('2026-11-03');assert.equal(env.local.writes,0);assert.equal(read.data.allocations[0].cadence,undefined);
 env.local.fail=true;assert.equal((await env.api.commit(draft,options(read))).status,'WRITE_FAILED');assert.equal(env.local.getItem(STORAGE_KEY),raw);assert.equal(draft.allocations[0].cadence.intervalDays,14);
 env.local.fail=false;const saved=await env.api.commit(draft,options(read));assert.equal(saved.status,'COMMITTED');assert.equal((await env.api.commit(draft,options(read))).status,'IDEMPOTENT');assert.equal(env.local.writes,1);
 assert.equal(saved.data.allocations[0].qty,'15');assert.equal(saved.data.allocations[0].intervalWeeks,3);assert.equal(saved.data.allocations[0].advanced.fixedOrderProcess,'auto');
 const imported=projectStoredPayload(JSON.parse(JSON.stringify(saved.data)));assert.deepEqual((await setup(env.local,env.lock).api.load()).data,imported);
});
test('C26 old schemas reject cadence smuggling at every durable repeat owner',async()=>{
 for(const schema of [1,2,3,4])for(const owner of ['allocation','activeRepeat','common','draft']){
  const data=legacy();if(owner==='allocation')data.allocations[0].cadence=interval();else data.allocations[0].q4Review={version:'0460',...(owner==='activeRepeat'?{activeRepeat:{cadence:interval()}}:{[owner]:{repeat:{cadence:interval()}}})};
  const raw=envelope(schema,data),env=setup(new MemoryStorage({[STORAGE_KEY]:raw}));assert.equal((await env.api.load()).status,'CORRUPT');assert.equal(env.local.writes,0);assert.equal(env.local.getItem(STORAGE_KEY),raw);
 }
});
test('C26 strict cadence rejects mixed kinds, invalid dates, duplicate date meanings and active-owner mismatch',()=>{
 const valid=[interval(),{...interval('2026-11-03'),intervalDays:21},monthly(31,'2026-02-28'),monthly('last','2028-02-29'),monthly(15),{version:'2.0.0',kind:'WEEKLY',preferredDate:''}];
 for(const cadence of valid){const data=legacy();data.allocations[0].cadence=cadence;assert.deepEqual(projectStoredPayload(data).allocations[0].cadence,cadence);}
 const invalid=[{...interval(),version:'1'}, {...interval(),intervalDays:7},{...interval(),dayRule:1},{...interval(),preferredDate:'2026-20-01'},{...interval(),preferredDate:'2026-02-29'},{...monthly(31),dayRule:32},monthly(31,'2026-02-27'),monthly('last','2028-02-28'),{version:'2.0.0',kind:'WEEKLY',preferredDate:'',intervalDays:14},{...monthly(1),preferredDateSelected:true}];
 for(const cadence of invalid){const data=legacy();data.allocations[0].cadence=cadence;assert.throws(()=>projectStoredPayload(data));}
 const mismatch=legacy();mismatch.allocations[0].cadence=interval();mismatch.allocations[0].q4Review={version:'0460',activeRepeat:{cadence:{...interval(),intervalDays:21}}};assert.throws(()=>projectStoredPayload(mismatch));
});
test('C26 already-confirmed past anchors restore without clock-driven invalidation or silent writes',async()=>{
 const data=legacy();data.allocations[0].cadence=interval('2020-01-01');const raw=envelope(5,data),env=setup(new MemoryStorage({[STORAGE_KEY]:raw}));assert.deepEqual((await env.api.load()).data,data);assert.equal(env.local.writes,0);assert.equal(env.local.getItem(STORAGE_KEY),raw);
});
test('C26 new cadence concurrent edits conflict, reset blocks resurrection, cancel performs zero writes',async()=>{
 const env=setup(),tabB=setup(env.local,env.lock).api,[a,b]=await Promise.all([env.api.load(),tabB.load()]),one=legacy(),two=legacy();one.allocations[0].cadence=interval();two.allocations[0].cadence=monthly('last');
 assert.equal(env.local.writes,0);const results=await Promise.all([env.api.commit(one,options(a,'a')),tabB.commit(two,options(b,'b'))]);assert.deepEqual(results.map(r=>r.status).sort(),['COMMITTED','CONFLICT']);assert.equal(env.local.writes,1);
 const current=await env.api.load();await env.api.reset(options(current,'reset'));assert.equal((await tabB.commit(two,options(b,'late'))).status,'CONFLICT');assert.equal((await env.api.load()).status,'RESET');
});
test('C28 representative display supersedes C26 range wording while preserving stored quantities',()=>{
 for(const [m,q,a,b,expected] of [['67','15','12','20','월 약4회'],['67','15','12','200','월 약4회'],['60','15','15','20','월 약4회'],['5','15','12','20','월 약1회'],['60','15','15','15','월 4회']])assert.equal(frequencyText({monthlyPlan:m,quantity:q,variable:true,min:a,max:b}),expected);
 for(const [m,q,expected]of [['60','15','월 4회'],['67','15','월 약4회'],['50','20','월 약3회'],['5','15','월 약1회']])assert.equal(frequencyText({monthlyPlan:m,quantity:q}),expected);
 for(const patch of [{monthlyPlan:''},{quantity:'0'},{quantity:'10가20'},{variable:true,min:'16',max:'20'},{variable:true,min:'12',max:'14'}])assert.equal(frequencyText({monthlyPlan:'67',quantity:'15',...patch}),'—');
});
test('C26 optional absent anchor is unresolved projection, never a fabricated fixed calendar',()=>{
 assert.deepEqual(repeatVisitPlan({cadence:interval()},{year:2026,month:11}),{resolved:false,reason:'OPTIONAL_ANCHOR_UNSELECTED',message:''});
 assert.equal(repeatVisitPlan({cadence:interval('2026-11-03')},null).reason,'PROJECTION_MONTH_UNSPECIFIED');
});
test('C55 replaces C26 mixed-month sum with separate monthly totals without a save equality blocker',()=>{
 const rows=[{reference:{year:2026,month:11},value:nominalQuantity({quantity:'10',visits:3})},{reference:{year:2027,month:1},value:nominalQuantity({quantity:'20',visits:2})}];
 const all=sumNominalByReference(rows);assert.equal(all.complete,false);assert.equal(all.sameReference,false);assert.equal(all.total,null);assert.equal(all.resolvedCount,2);assert.deepEqual(all.groups.map(group=>[group.year,group.month,group.total.low.n]),[[2026,11,30n],[2027,1,40n]]);
 const partial=sumNominalByReference([...rows,{reference:{year:2026,month:12},value:null}]);assert.equal(partial.complete,false);assert.equal(partial.resolvedCount,2);assert.equal(partial.total,null);assert.equal(partial.groups[2].total,null);
});
test('C26 FLEX active holiday comparison/copy excludes dormant FIXED policies while retaining source values',()=>{
 const holiday={days:['월'],none:false,irregular:false,request:'문 앞',conflict:'조정',weekend:'휴무',holiday:'휴무',subholiday:'휴무'},a={mode:'FLEX',advanced:{contactChannels:['phone'],fixedOrderProcess:'auto'},q4Review:{profile:'FLEX',activeHoliday:holiday}},b=structuredClone(a);b.q4Review.activeHoliday.conflict='다른 값';b.q4Review.activeHoliday.weekend='미정';
 const before=structuredClone([a,b]),restored=restoredDeliverySettings([a,b],{holidayFromAllocation:x=>x.q4Review.activeHoliday,repeatFromAllocation:()=>({period:'2주',frequency:'2회',semantics:'per-week-v1'})});assert.equal(restored.profile,'FLEX');assert.deepEqual(activeHolidayFields(holiday,'FLEX'),{days:['월'],none:false,irregular:false,request:'문 앞'});assert.deepEqual(activeHolidayFields(holiday,'FIXED'),holiday);assert.deepEqual([a,b],before);
});
test('C26 explicit14/21-day and monthly31/last projections use actual calendar and preserve intent',()=>{
 const reference={year:2026,month:11};
 assert.deepEqual(repeatVisitPlan({cadence:interval('2026-11-03')},reference).dates,['2026-11-03','2026-11-17']);
 assert.deepEqual(repeatVisitPlan({cadence:{...interval('2026-11-03'),intervalDays:21}},reference).dates,['2026-11-03','2026-11-24']);
 for(const dayRule of [31,'last']){const cadence=monthly(dayRule,'2028-02-29'),before=structuredClone(cadence),plan=repeatVisitPlan({cadence},{year:2028,month:2});assert.deepEqual(plan.dates,['2028-02-29']);assert.deepEqual(cadence,before);}
 assert.equal(repeatVisitPlan({cadence:monthly(31,'2026-11-30')},{year:2026,month:10}).visits,0);
});
test('C26 inactive incomplete monthly choice survives FLEX save without becoming a completed cadence',async()=>{
 const data=legacy(),draft=monthly('');data.allocations[0].mode='FLEX';data.allocations[0].q4Review={version:'0460',draft:{mode:'FIXED',repeat:{period:'매월',date:'',cadence:draft}},common:{repeat:{period:'매월',date:'',cadence:draft}}};
 const env=setup(),read=await env.api.load(),saved=await env.api.commit(data,options(read));assert.equal(saved.status,'COMMITTED');assert.deepEqual(saved.data.allocations[0].q4Review.draft.repeat.cadence,draft);assert.equal(saved.data.allocations[0].cadence,undefined);
 const invalid=structuredClone(data);invalid.allocations[0].cadence=draft;assert.throws(()=>projectStoredPayload(invalid));
});
test('C26 dormant cadence metadata cannot block FLEX, while each original owner remains recoverable',()=>{
 const data=legacy();Object.assign(data.allocations[0],{mode:'FLEX',cadence:interval(),q4Review:{version:'0460',activeRepeat:{cadence:{...interval(),intervalDays:21}}}});
 const projected=projectStoredPayload(data);assert.equal(projected.allocations[0].cadence.intervalDays,14);assert.equal(projected.allocations[0].q4Review.activeRepeat.cadence.intervalDays,21);
 data.allocations[0].mode='FIXED';assert.throws(()=>projectStoredPayload(data));
});
test('C26 clearing monthly rule retains chosen anchor in inactive FLEX/ONCE drafts without blocking save',async()=>{
 for(const mode of ['FLEX','ONCE']){
  const data=legacy(),cadence=monthly('','2026-11-30');data.allocations[0].mode=mode;data.allocations[0].q4Review={version:'0460',draft:{mode:'FIXED',repeat:{period:'매월',date:'',cadence}},common:{repeat:{period:'매월',date:'',cadence}}};
  const original=structuredClone(data),projected=projectStoredPayload(data);assert.deepEqual(projected,data);assert.deepEqual(data,original);
  const env=setup(),saved=await env.api.commit(projected,options(await env.api.load()));assert.equal(saved.status,'COMMITTED');assert.equal(env.local.writes,1);assert.deepEqual((await setup(env.local,env.lock).api.load()).data,projected);
  assert.equal(saved.data.allocations[0].q4Review.draft.repeat.cadence.dayRule,'');assert.equal(saved.data.allocations[0].q4Review.draft.repeat.cadence.preferredDate,'2026-11-30');
  const active=structuredClone(data);active.allocations[0].mode='FIXED';active.allocations[0].cadence=cadence;assert.throws(()=>projectStoredPayload(active));
  for(const invalidDate of ['2026-02-30','2026-20-01','not-a-date',20261130]){const invalid=structuredClone(data);invalid.allocations[0].q4Review.draft.repeat.cadence.preferredDate=invalidDate;assert.throws(()=>projectStoredPayload(invalid));}
 }
});
