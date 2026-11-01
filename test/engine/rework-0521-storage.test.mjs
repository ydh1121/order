import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createBrowserStorage,STORAGE_KEY,STORAGE_SCHEMA_VERSION,LEGACY_KEYS,projectStoredPayload,emptyStoredPayload} from '../../web/storage.mjs';
class MemoryStorage{constructor(entries={}){this.values=new Map(Object.entries(entries));this.writes=0;this.fail=false;}getItem(key){return this.values.get(key)??null;}setItem(key,value){if(this.fail)throw Error('quota');this.values.set(key,String(value));this.writes++;}removeItem(key){this.values.delete(key);}}
const locks=()=>{let queue=Promise.resolve();return {request(name,options,fn){const next=queue.then(()=>fn({name,mode:options.mode}));queue=next.catch(()=>{});return next;}};};
const setup=({local=new MemoryStorage(),session=new MemoryStorage(),lock=locks()}={})=>({local,session,lock,api:createBrowserStorage({localStorage:local,sessionStorage:session,locks:lock,crypto:webcrypto,now:()=>1})});
const opts=(loaded,transactionId='schema4-save')=>({expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId});
const legacy=()=>({...emptyStoredPayload(),lines:[{id:'sku',housing:'4',size:'특란',pack:'30',qty:'5000',qtyUnit:'each',price:'10000'}],locations:[{id:'a',name:'합성 A'},{id:'b',name:'합성 B'}],allocations:[{id:'aa',lineId:'sku',locationId:'a',mode:'FLEX',qty:'25',monthlyDemandQty:'2500',monthlyDemandUnit:'each',monthlyDemandSource:'manual'},{id:'ab',lineId:'sku',locationId:'b',mode:'FLEX',qty:'25',monthlyDemandQty:'2500',monthlyDemandUnit:'each',monthlyDemandSource:'manual'}]});
const current=()=>{const data=legacy();data.allocations.forEach(a=>Object.assign(a,{monthlyPlanQty:'84',monthlyPlanUnit:'tray',monthlyPlanSource:'derived',monthlyDemandBasis:'known',monthlyAllocationContract:'2.0.0',deliveryQtyUnit:'tray',qtySource:'user'}));return data;};
const envelope=(version,data)=>JSON.stringify({schemaVersion:version,generation:'historic-generation',revision:7,state:'data',data,receipts:[],migration:null,updatedAt:0});
const reference={year:2026,month:11,anchorDate:'2026-11-02',nominal:true};
test('R23 schema1/2/3 source bytes and demand meaning survive read; explicit package commit alone upgrades to4',async()=>{
 assert.equal(STORAGE_SCHEMA_VERSION,4);
 for(const version of [1,2,3]){const source=legacy(),raw=envelope(version,source),env=setup({local:new MemoryStorage({[STORAGE_KEY]:raw})}),loaded=await env.api.load();assert.equal(loaded.status,'LOADED');assert.deepEqual(loaded.data,source);assert.equal(env.local.writes,0);assert.equal(env.local.getItem(STORAGE_KEY),raw);
  const next=current();env.local.fail=true;assert.equal((await env.api.commit(next,opts(loaded))).status,'WRITE_FAILED');assert.equal(env.local.getItem(STORAGE_KEY),raw);env.local.fail=false;
  const saved=await env.api.commit(next,opts(loaded));assert.equal(saved.status,'COMMITTED');assert.equal(env.local.writes,1);assert.equal(JSON.parse(env.local.getItem(STORAGE_KEY)).schemaVersion,4);assert.equal(saved.data.allocations[0].monthlyDemandQty,'2500');assert.equal(saved.data.allocations[0].monthlyPlanQty,'84');assert.equal(saved.data.lines[0].qty,'5000');assert.deepEqual((await setup(env).api.load()).data,next);
 }
});
test('R23 schema4 export/import projection keeps known D, residual D and unknown plan as distinct records',()=>{
 const data=current();Object.assign(data.allocations[0],{monthlyDemandQty:'',monthlyDemandBasis:'package-plan',monthlyPlanQty:'50',monthlyPlanSource:'manual'});Object.assign(data.allocations[1],{monthlyDemandQty:'3500',monthlyDemandSource:'derived',monthlyDemandBasis:'residual',monthlyPlanQty:'117'});
 const exported=JSON.stringify(projectStoredPayload(data)),imported=projectStoredPayload(JSON.parse(exported));assert.deepEqual(imported,data);assert.equal(imported.allocations[0].monthlyDemandQty,'');assert.equal(imported.allocations[1].monthlyDemandQty,'3500');assert.equal(imported.allocations[1].monthlyPlanQty,'117');
});
test('R23 single-total derived provenance and accepted plan signature survive projection without promotion',()=>{
 const data=current();Object.assign(data.allocations[0],{monthlyDemandQty:'5000',monthlyDemandSource:'derived',monthlyDemandBasis:'single-total',monthlyPlanQty:'167',monthlyPlanSource:'manual'});assert.deepEqual(projectStoredPayload(data),data);data.allocations[0].monthlyDemandSource='manual';assert.throws(()=>projectStoredPayload(data));
 const simple=current();Object.assign(simple.allocations[0],{planningReference:reference,deliveryPlan:{version:'1.0.0',monthlyPlan:'84',visits:4,unit:'tray',distribution:[{quantity:'21',visits:4}],reference,inputSignature:'{"source":"fixed-source-evidence"}',source:'derived',reviewed:true}});assert.equal(projectStoredPayload(simple).allocations[0].deliveryPlan.inputSignature,'{"source":"fixed-source-evidence"}');simple.allocations[0].deliveryPlan.inputSignature='x'.repeat(32769);assert.throws(()=>projectStoredPayload(simple));
});
test('R23 strict package contract rejects fractions, partial fields, source promotion and wrong SKU unit without write',async()=>{
 const mutations=[a=>a.monthlyPlanQty='250/3',a=>delete a.monthlyPlanSource,a=>a.monthlyAllocationContract='1.0.0',a=>a.monthlyPlanUnit='pack',a=>a.monthlyPlanQty=84,a=>a.monthlyDemandBasis='package-plan',a=>a.monthlyDemandUnit='tray',a=>a.monthlyDemandBasis='residual',a=>a.monthlyPlanSource='observed',a=>a.qtySource='made-up'];
 for(const mutate of mutations){const env=setup(),loaded=await env.api.load(),data=current();mutate(data.allocations[0]);const original=structuredClone(data),result=await env.api.commit(data,opts(loaded));assert.equal(result.status,'INVALID_DATA');assert.deepEqual(data,original);assert.equal(env.local.writes,0);}
});
test('R23 old durable schemas cannot smuggle new plan fields and malformed originals do not fall back to session',async()=>{
 for(const version of [1,2,3]){const raw=envelope(version,current()),env=setup({local:new MemoryStorage({[STORAGE_KEY]:raw}),session:new MemoryStorage({[LEGACY_KEYS[0]]:JSON.stringify(legacy())})});assert.equal((await env.api.load()).status,'CORRUPT');assert.equal(env.local.getItem(STORAGE_KEY),raw);assert.equal(env.local.writes,0);}
});
test('R17/R23 accepted integer distribution preserves nominal reference and rejects silent plan/range changes',async()=>{
 const data=current(),a=data.allocations[0];Object.assign(a,{monthlyDemandQty:'5000',monthlyPlanQty:'167',variableQty:true,qtyMin:'20',qtyMax:'21',qty:'21',qtySource:'auto',planningReference:reference,nominalVisitCount:'8',deliveryPlan:{version:'1.0.0',monthlyPlan:'167',visits:8,unit:'tray',distribution:[{quantity:'21',visits:7},{quantity:'20',visits:1}],range:{min:'20',max:'21'},reference,source:'derived',reviewed:true}});
 assert.deepEqual(projectStoredPayload(data).allocations[0].deliveryPlan,a.deliveryPlan);
 const env=setup(),saved=await env.api.commit(data,opts(await env.api.load()));assert.equal(saved.ok,true);assert.deepEqual((await setup(env).api.load()).data,data);
 for(const mutate of [row=>row.deliveryPlan.distribution[0].visits=8,row=>row.monthlyPlanQty='168',row=>row.variableQty=false,row=>row.deliveryPlan.range.min='21',row=>row.qtyMax='22',row=>row.planningReference={...row.planningReference,month:12},row=>row.deliveryPlan.reference.anchorDate='2026-02-30',row=>row.nominalVisitCount='1.5',row=>row.deliveryPlan.extraPolicy=5]){const invalid=structuredClone(data);mutate(invalid.allocations[0]);assert.throws(()=>projectStoredPayload(invalid));}
});
test('R23 two tabs cannot overwrite another plan or resurrect reset, and duplicate confirmation writes once',async()=>{
 const env=setup(),b=setup(env).api,[first,second]=await Promise.all([env.api.load(),b.load()]),one=current(),two=current();two.allocations[0].monthlyPlanQty='85';two.allocations[0].monthlyPlanSource='manual';
 const results=await Promise.all([env.api.commit(one,opts(first,'a')),b.commit(two,opts(second,'b'))]);assert.equal(results.filter(r=>r.status==='COMMITTED').length,1);assert.equal(results.filter(r=>r.status==='CONFLICT').length,1);assert.equal(env.local.writes,1);assert.equal((await env.api.commit(one,opts(first,'a'))).status,'IDEMPOTENT');assert.equal(env.local.writes,1);
 const latest=await env.api.load();await env.api.reset(opts(latest,'reset'));assert.equal((await b.commit(two,opts(second,'late'))).status,'CONFLICT');assert.equal((await env.api.load()).status,'RESET');
});
