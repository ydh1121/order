import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {blankSimpleQuote,projectSimpleQuote,projectLegacySimpleQuote,upgradeSimpleQuote,projectSimpleInput,inspectSimpleQuote,createSimpleAuthHandoff} from '../../web/simple-quote-contract.mjs';
import {regionSelection} from '../../web/region-reference.mjs';
import {buildQuoteDocumentModel} from '../../web/quote-document.mjs';
import {createBrowserStorage,emptyStoredPayload} from '../../web/storage.mjs';
const line=()=>({id:'stable-sku',housing:'4',size:'특란',pack:'30',qty:'10',qtyUnit:'tray',qtyDisplayUnit:'tray',price:'8000'});
const legacy=()=>({version:'provisional-0581-1',snapshotId:'ORDER-PARTIAL-20261112-063305-R1',specUnknown:false,consultationInterest:false,monthlyScope:'UNCONFIRMED',siteCount:'2',regionsDiffer:true,sharedRegion:'서울특별시 관악구 봉천동',sites:[{id:'site-b',region:'서울특별시 강남구 역삼동'},{id:'site-a',region:'서울특별시 관악구 신림동'}],orderKind:'FIXED',flexBasis:'WEEK',preferredDate:'2026-12-04'});
const current=()=>({...emptyStoredPayload(),lines:[line()],current:'stable-sku',simpleQuote:{...blankSimpleQuote(),sharedRegion:'서울특별시 강남구',sharedRegionSelection:regionSelection('1100000000','1168000000'),orderKind:'FIXED'}});
const historic=()=>({...emptyStoredPayload(),lines:[line()],current:'stable-sku',simpleQuote:legacy()});
const KEY='simple-schema10-test';
class Store{constructor(raw=null){this.raw=raw;this.writes=0;this.fail=false;}getItem(){return this.raw;}setItem(key,value){assert.equal(key,KEY);if(this.fail)throw Error('quota');this.raw=value;this.writes++;}}
function locks(){let tail=Promise.resolve();return {request(name,options,fn){const result=tail.then(()=>fn({name}));tail=result.catch(()=>{});return result;}};}
const adapter=(local,manager=locks())=>createBrowserStorage({localStorage:local,sessionStorage:null,locks:manager,crypto:webcrypto,key:KEY,lockName:KEY,migrateLegacy:false,now:()=>1794510000000});
const record=data=>JSON.stringify({schemaVersion:9,generation:'legacy-generation',revision:2,state:'data',data,receipts:[],migration:null,updatedAt:1794400000000});
const opts=(loaded,transactionId='explicit-0583',extra={})=>({expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId,...extra});

test('0583 v2 default and numeric contracts keep monthly budget independent and optional',()=>{
 const value=blankSimpleQuote();assert.deepEqual(value.unknownMonthly,{qty:'',unit:'each',budget:''});assert.equal(value.siteCount,'1');assert.equal(value.siteCountConfirmed,true);assert.equal(value.legacySiteCount,null);assert.equal(value.sharedRegionSelection,null);
 for(const patch of [{qty:'605/3'},{qty:'1,200'},{qty:'-1'},{unit:'30eggs'},{budget:200000},{budget:'2e5'}])assert.throws(()=>projectSimpleQuote({...value,unknownMonthly:{...value.unknownMonthly,...patch}}));
 assert.equal(projectSimpleQuote({...value,unknownMonthly:{qty:'17',unit:'pack',budget:''}}).unknownMonthly.budget,'');
});
test('0583 strict v1 reader preserves raw dates, regions, IDs and refuses v2 fields',()=>{
 const old=legacy(),before=structuredClone(old);assert.deepEqual(projectLegacySimpleQuote(old),before);assert.throws(()=>projectLegacySimpleQuote({...old,unknownMonthly:{qty:'',unit:'each',budget:''}}));assert.throws(()=>projectSimpleQuote(old));
 const next=upgradeSimpleQuote(old,{line:line()});assert.equal(next.version,'provisional-0583-1');assert.equal(next.snapshotId,'MASTER-UI-MOTION-FEEDBACK-20261112-R1');assert.deepEqual(old,before);
 assert.equal(next.sharedRegion,old.sharedRegion);assert.equal(next.sharedRegionSelection,null);assert.deepEqual(next.sites,old.sites.map(site=>({...site,regionSelection:null})));assert.equal(next.preferredDate,old.preferredDate);assert.equal(next.flexBasis,'WEEK');assert.deepEqual(next.unknownMonthly,{qty:'',unit:'each',budget:''});
});
test('0583 migration retains invalid historical count without claiming default1 confirmed',()=>{
 for(const raw of ['', '0', '0002', '501', '999999999999']){const old={...legacy(),siteCount:raw},next=upgradeSimpleQuote(old);assert.deepEqual([next.siteCount,next.siteCountConfirmed,next.legacySiteCount],['1',false,raw]);assert.deepEqual(next.sites.map(x=>x.id),['site-b','site-a']);const state={...current(),simpleQuote:{...next,regionsDiffer:false,sharedRegionSelection:regionSelection('1100000000','1168000000')}};assert.equal(inspectSimpleQuote(state).stages.q3.ready,false);state.simpleQuote.siteCountConfirmed=true;assert.equal(inspectSimpleQuote(state).stages.q3.ready,true);assert.equal(state.simpleQuote.legacySiteCount,raw);}
 for(const raw of ['1','12','500']){const next=upgradeSimpleQuote({...legacy(),siteCount:raw});assert.deepEqual([next.siteCount,next.siteCountConfirmed,next.legacySiteCount],[raw,true,null]);}
});
test('0583 current count cannot persist blank zero negative or overlimit transient raw',()=>{
 for(const siteCount of ['', '0', '-1', '01', '501'])assert.throws(()=>projectSimpleQuote({...blankSimpleQuote(),siteCount}),/SITE_COUNT_RANGE/);
 assert.equal(projectSimpleQuote({...blankSimpleQuote(),siteCount:'500'}).siteCount,'500');
});
test('0583 legacy raw region text is preserved but cannot auto-select an official code',()=>{
 const state={...historic(),simpleQuote:upgradeSimpleQuote(legacy())};assert.equal(inspectSimpleQuote(state).stages.q3.ready,false);assert.equal(state.simpleQuote.sites[0].regionSelection,null);
 state.simpleQuote.sites[0].regionSelection=regionSelection('1100000000','1168000000');state.simpleQuote.sites[1].regionSelection=regionSelection('1100000000','1162000000');assert.equal(inspectSimpleQuote(state).stages.q3.ready,true);
 state.simpleQuote.sites.reverse();assert.deepEqual(projectSimpleInput(state).regions.sites.map(x=>x.id),['site-a','site-b']);assert.equal(state.simpleQuote.sites[1].region,'서울특별시 강남구 역삼동');
 state.simpleQuote.sites[0].regionSelection={...state.simpleQuote.sites[0].regionSelection,referenceVersion:'historical'};assert.equal(inspectSimpleQuote(state).stages.q3.ready,false);assert.equal(projectSimpleQuote(state.simpleQuote).sites[0].regionSelection.referenceVersion,'historical');
});
test('0583 official direct region and shared/per-site memories remain separate',()=>{
 const state=current();state.simpleQuote.sharedRegionSelection=regionSelection('3611000000','3611000000');state.simpleQuote.sharedRegion='세종특별자치시';state.simpleQuote.sites=[{id:'stable-hidden',region:'이전 원문 동',regionSelection:regionSelection('5000000000','5011000000')}];
 assert.equal(inspectSimpleQuote(state).stages.q3.ready,true);state.simpleQuote.regionsDiffer=true;assert.equal(inspectSimpleQuote(state).stages.q3.ready,true);assert.equal(projectSimpleInput(state).regions.sharedRegion,'세종특별자치시');assert.equal(state.simpleQuote.sites[0].region,'이전 원문 동');
});
test('0583 unknown each tray pack keep raw17 without guessing package conversion or price',()=>{
 const state=current(),original=structuredClone(state.lines[0]);state.simpleQuote.specUnknown=true;
 for(const unit of ['each','tray','pack']){state.simpleQuote.unknownMonthly={qty:'17',unit,budget:'200000'};const input=projectSimpleInput(state);assert.deepEqual([input.monthly.quantity,input.monthly.unit,input.monthly.budget,input.monthly.price,input.monthly.unitConversion],['17',unit,'200000','','UNCONFIRMED']);assert.deepEqual(input.product.line,{id:'stable-sku',housing:'',size:'',pack:'',qty:'17',price:'',qtyUnit:unit,qtyDisplayUnit:unit});assert.equal(inspectSimpleQuote(state).stages.q2.ready,true);assert.deepEqual(state.lines[0],original);}
 assert.equal(inspectSimpleQuote(state).proofBlocked,true);assert.equal('baseQuantity' in projectSimpleInput(state).monthly,false);
});
test('0583 known unknown roundtrip preserves separate raw price budget and units',()=>{
 const state=current(),original=structuredClone(state.lines[0]);state.simpleQuote.unknownMonthly={qty:'17',unit:'pack',budget:'200000'};
 assert.deepEqual([projectSimpleInput(state).monthly.price,projectSimpleInput(state).monthly.budget],['8000',null]);state.simpleQuote.specUnknown=true;
 assert.deepEqual([projectSimpleInput(state).monthly.price,projectSimpleInput(state).monthly.budget],['','200000']);state.simpleQuote.specUnknown=false;
 assert.deepEqual(state.lines[0],original);assert.deepEqual([projectSimpleInput(state).monthly.quantity,projectSimpleInput(state).monthly.unit,projectSimpleInput(state).monthly.price],['10','tray','8000']);assert.equal(state.simpleQuote.unknownMonthly.budget,'200000');
});
test('0583 unknown optional budget absence does not block quantity intent or become zero',()=>{
 const state=current();state.simpleQuote.specUnknown=true;state.simpleQuote.unknownMonthly={qty:'1200',unit:'each',budget:''};assert.equal(inspectSimpleQuote(state).stages.q2.ready,true);assert.equal(projectSimpleInput(state).monthly.budget,'');
 for(const qty of ['','0']){state.simpleQuote.unknownMonthly.qty=qty;assert.equal(inspectSimpleQuote(state).stages.q2.ready,false);}state.simpleQuote.unknownMonthly.qty='17';state.simpleQuote.unknownMonthly.unit='';assert.equal(inspectSimpleQuote(state).stages.q2.ready,false);
});
test('0583 old unknown qty migrates as raw only, never copies price into budget',()=>{
 const original=line(),old={...legacy(),specUnknown:true};original.qty='1200';original.qtyUnit='each';const next=upgradeSimpleQuote(old,{line:original});assert.deepEqual(next.unknownMonthly,{qty:'1200',unit:'each',budget:''});assert.equal(original.price,'8000');assert.equal(original.qty,'1200');
 const noUnit={...original};delete noUnit.qtyUnit;assert.equal(upgradeSimpleQuote(old,{line:noUnit}).unknownMonthly.unit,'');
});
test('0583 legacy rational is retained exactly and review-blocked, never6053 or implicit conversion',()=>{
 const source={...line(),qty:'605/3',qtyUnit:'tray',qtyExact:{representation:'rational',conversionReviewed:true,numerator:'605',denominator:'3'}},before=structuredClone(source),next=upgradeSimpleQuote({...legacy(),specUnknown:true},{line:source});
 assert.deepEqual(next.unknownMonthly,{qty:'',unit:'tray',budget:''});assert.deepEqual(source,before);
 const state={...current(),lines:[source],simpleQuote:next};assert.ok(inspectSimpleQuote(state).stages.q2.issues.includes('UNKNOWN_QUANTITY_REVIEW_REQUIRED'));assert.equal(projectSimpleInput(state).monthly.quantity,'');assert.equal('qtyExact' in projectSimpleInput(state).product.line,false);
 state.simpleQuote.unknownMonthly.qty='17';assert.equal(inspectSimpleQuote(state).stages.q2.ready,true);assert.deepEqual(state.lines[0],before);
});
test('0583 document and handoff cannot consume dormant known price as current cost',()=>{
 const state=current(),known=buildQuoteDocumentModel({state});assert.deepEqual(known.groups[0].currentPurchaseTotal,{numerator:'80000',denominator:'1'});state.simpleQuote.specUnknown=true;state.simpleQuote.unknownMonthly={qty:'17',unit:'pack',budget:'200000'};
 const document=buildQuoteDocumentModel({state}),purchase=document.groups[0],comparison=document.groups[3];assert.equal(purchase.currentPurchaseTotal,null);assert.equal(purchase.rows[0].price,'');assert.equal(purchase.rows[0].currentPurchaseCost,null);assert.equal(purchase.monthlyBudget,'200000');assert.equal(purchase.unitConversion,'UNCONFIRMED');assert.deepEqual([comparison.currentCost,comparison.quoteCost,comparison.difference],[null,null,null]);
 const handoff=createSimpleAuthHandoff(state,{requestId:'intent-0583',inputRevision:4});assert.equal(handoff.input.monthly.price,'');assert.doesNotMatch(JSON.stringify(handoff),/"8000"|"80000"/);assert.equal(handoff.input.monthly.budget,'200000');assert.equal(state.lines[0].price,'8000');
});
test('0583 schema9 decode and pure upgrade write0; success1 failure/cancel/duplicate0 and restore',async()=>{
 const old=historic(),raw=record(old),store=new Store(raw),api=adapter(store),loaded=await api.load();assert.equal(loaded.status,'LOADED');assert.deepEqual(loaded.data,old);assert.equal(store.raw,raw);assert.equal(store.writes,0);
 const draft={...loaded.data,simpleQuote:upgradeSimpleQuote(loaded.data.simpleQuote,{line:loaded.data.lines[0]})};assert.equal(store.writes,0);assert.equal((await adapter(store).load()).data.simpleQuote.version,'provisional-0581-1');
 assert.equal((await api.commit(draft,opts(loaded,'cancel',{canCommit:()=>false}))).status,'CANCELLED');assert.equal(store.writes,0);store.fail=true;assert.equal((await api.commit(draft,opts(loaded,'commit'))).status,'WRITE_FAILED');assert.equal(store.raw,raw);store.fail=false;
 const saved=await api.commit(draft,opts(loaded,'commit'));assert.equal(saved.status,'COMMITTED');assert.equal(store.writes,1);assert.equal(JSON.parse(store.raw).schemaVersion,10);assert.equal((await api.commit(draft,opts(loaded,'commit'))).status,'IDEMPOTENT');assert.equal(store.writes,1);
 assert.deepEqual((await adapter(store).load()).data,draft);assert.equal(store.writes,1);assert.equal(loaded.data.simpleQuote.version,'provisional-0581-1');
});
test('0583 schema version boundaries reject v2-in9 and v1-in10 without fallback writes',async()=>{
 const old=historic(),raw=record(old),store=new Store(raw),api=adapter(store);assert.equal((await api.load()).status,'LOADED');
 for(const [version,simpleQuote]of [[9,blankSimpleQuote()],[10,legacy()]]){const recordValue=JSON.parse(raw);recordValue.schemaVersion=version;recordValue.data.simpleQuote=simpleQuote;store.raw=JSON.stringify(recordValue);const before=store.raw;assert.equal((await api.load()).status,'CORRUPT');assert.equal(store.raw,before);assert.equal(store.writes,0);}
});
test('0583 migration uses existing CAS so two old tabs cannot overwrite each other',async()=>{
 const store=new Store(record(historic())),manager=locks(),a=adapter(store,manager),b=adapter(store,manager),[oldA,oldB]=await Promise.all([a.load(),b.load()]);
 const one={...oldA.data,simpleQuote:upgradeSimpleQuote(oldA.data.simpleQuote,{line:oldA.data.lines[0]})},two=structuredClone(one);two.simpleQuote.unknownMonthly.budget='300000';
 const saved=await a.commit(one,opts(oldA,'one')),conflict=await b.commit(two,opts(oldB,'two'));assert.equal(saved.status,'COMMITTED');assert.equal(conflict.status,'CONFLICT');assert.equal(store.writes,1);assert.equal(two.simpleQuote.unknownMonthly.budget,'300000');assert.equal((await b.load()).data.simpleQuote.unknownMonthly.budget,'');
});
test('0583 invalid transient count write preserves last confirmed data and raw caller draft',async()=>{
 const store=new Store(),api=adapter(store),first=await api.load(),saved=await api.commit(current(),opts(first)),original=store.raw,draft={...current(),simpleQuote:{...current().simpleQuote,siteCount:''}};
 assert.equal((await api.commit(draft,opts(saved,'blank-count'))).status,'INVALID_DATA');assert.equal(store.raw,original);assert.equal(store.writes,1);assert.equal(draft.simpleQuote.siteCount,'');
});
