import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {createApprovedCadence,createCadence,inspectCadence} from '../../web/cadence-contract.mjs';
import {cadenceForPeriod,selectCadence,quantityIssue,fixedFrequencyPresentation} from '../../web/approved-schedule.mjs';
import {repeatVisitPlan,nominalQuantity,sumNominalByReference,restoredDeliverySettings,frequencyPresentation} from '../../web/q4-planning.mjs';
import {fromRatio,toJSON,compare} from '../../src/engine/calculation/exact.mjs';
import {inspectQ4Allocation} from '../../web/q4-validation.mjs';
import {exactDisplay} from '../../web/quantity-contract.mjs';
const source=readFileSync(process.env.C55_Q4_SOURCE||new URL('../../web/q4-review.mjs',import.meta.url),'utf8');
const common=readFileSync(new URL('../../web/common-ui.mjs',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const freeze=value=>{if(value&&typeof value==='object'){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
const functions=new Map();
function scan(node){if(!node||typeof node!=='object')return;if(node.type==='FunctionDeclaration')functions.set(node.id.name,source.slice(node.start,node.end));for(const [key,child] of Object.entries(node))if(key!=='parent')Array.isArray(child)?child.forEach(scan):scan(child);}
scan(parse(source,{ecmaVersion:'latest',sourceType:'module'}));
const commonContext=vm.createContext({window:{},structuredClone,createCadence,createApprovedCadence,inspectCadence});
vm.runInContext(common.slice(common.indexOf('window.OrderRepeatContract='),common.indexOf('/* MSG0485.')),commonContext);
const contract=commonContext.window.OrderRepeatContract;
function harness(){
 const repeat={period:'협의',frequency:'협의',date:'말일',dateMode:'preset',cadence:cadenceForPeriod('협의'),weeklyCheck:false,weekdays:{},weekOpen:0};
 const holiday={days:[],none:true,irregular:false,conflict:'협의 후 조정',weekend:'협의 후 조정',holiday:'협의 후 조정',subholiday:'협의 후 조정',request:''};
 const state={count:2,mode:'FIXED',pack:'30',asOfLocalDate:'2026-11-05',...structuredClone(repeat),values:[{monthly:'100',base:'14'},{monthly:'67',base:'15'}],quantityAdjusted:[false,false],variable:[false,false],qtySources:['user','user'],siteModes:['FIXED','FIXED'],siteRepeat:[structuredClone(repeat),structuredClone(repeat)],siteQuality:[false,false],siteProcess:['contact','contact'],siteContacts:[{phone:true,sms:false,kakao:false,email:false},{phone:true,sms:false,kakao:false,email:false}],siteHolidays:[structuredClone(holiday),structuredClone(holiday)],contact:{phone:true,sms:false,kakao:false,email:false},process:'contact',quality:false,holidayDays:[],holidayNone:true,holidayIrregular:false,holiday,request:'',deliveryPlans:[null,null],datesByAllocation:{A0:{},A1:{}},preferredDates:{},approvedDateParts:{},preferredTouched:new Set(),startDateReviews:{},startDateResults:{},planningReferences:[{year:2026,month:11},{year:2026,month:12}],nominalVisitCounts:['',''],commonMonthlyMemories:[null,null]};
 const q={state,regularContext:{line:{id:'L',pack:'30',qty:'167',qtyUnit:'tray'},allocations:[0,1].map(i=>({id:'A'+i,lineId:'L',locationId:'S'+i}))},names:['가게 A','가게 B'],monthlyEditor:null,numericComposing:new Set(),approvedDateBindings:new Map(),quantityCadenceHistory:new WeakMap(),monthEditing:new Set(),q4ValidationEpoch:0,OrderRepeatContract:contract,selectCadence,cadenceForPeriod,quantityIssue,clone:structuredClone,structuredClone,repeatVisitPlan,nominalQuantity,sumNominalByReference,fromRatio,toJSON,compare,exactDisplay,validMonthlyQuantity:()=>true,monthlyQuantityText:()=> '167',q4Numeric:{inspect:()=>({valid:true})},document:{querySelector:()=>null},closeQ4Dropdown(){},render(){},renderRepeatOnly(){},refreshStatus(){},refreshResultsOnly(){},preferredKey:i=>'site:'+i,dateKey:i=>'A'+i,approvedDateId:i=>'date'+i,approvedDateValue:()=> '2026-11-30',legacyPolicy:()=> 'ask',startDateReview:()=>({version:'1.0.0',lifecycle:'NEW'}),isIndividual:()=>state.mode==='MIXED',siteMode:i=>state.mode==='MIXED'?state.siteModes[i]:state.mode,activeRepeat:i=>state.mode==='MIXED'?state.siteRepeat[i]:state,repeatDraft:site=>site===null?state:state.siteRepeat[site],monthlyRow:i=>({quantity:{raw:state.values[i].monthly}}),bridge:{inspect:()=>[]}};
 vm.createContext(q);
 for(const name of ['repeatForSite','materializeCommonSettings','quantityCadenceSnapshot','syncPreferredRule','selectedOption','serializedAllocations','dirtyFingerprint','supportInput','monthlyResultData','status'])if(functions.has(name))vm.runInContext("'use strict';\n"+functions.get(name),q);
 return q;
}
test('C55-07/17 actual bulk monthly selection updates every site, preserves bulk mode and restores per-site Q',()=>{
 const q=harness();q.selectedOption('period','매월');assert.deepEqual(q.state.values.map(v=>v.base),['100','67']);assert.equal(q.state.mode,'FIXED');
 const saved=plain(q.serializedAllocations(true));assert.deepEqual(saved.map(a=>a.q4Review.activeRepeat.monthlyMemory.quantity),['14','15']);assert.deepEqual(saved.map(a=>a.q4Review.activeRepeat.monthlyMemory.period),['협의','협의']);
 const restored=restoredDeliverySettings(saved,{repeatFromAllocation:a=>a.q4Review.activeRepeat,holidayFromAllocation:a=>a.q4Review.activeHoliday});assert.equal(restored.profile,'FIXED');assert.deepEqual(restored.sites.map(s=>s.repeat.monthlyMemory.quantity),['14','15']);
 q.selectedOption('period','협의');assert.deepEqual(q.state.values.map(v=>v.base),['14','15']);assert.equal(q.state.mode,'FIXED');
});
test('STRUCT-READ-PURITY serialized, dirty and completion reads are stable on a deeply frozen monthly draft',()=>{
 const q=harness();q.selectedOption('period','매월');q.state.cadence.preferredDate='2026-12-31';q.state.cadence.nominalAnchor='2026-12-31';
 q.fields=()=>['monthly','base'];q.q4QuantityInvalid=()=>false;q.monthlyPending=()=>false;q.dateIssue=()=>({valid:true});
 const before=plain(q.state);freeze(q.state);freeze(q.regularContext);const first=q.serializedAllocations(true),fingerprint=q.dirtyFingerprint();
 for(let i=0;i<3;i++){assert.deepEqual(plain(q.serializedAllocations(true)),plain(first));assert.equal(q.dirtyFingerprint(),fingerprint);assert.equal(q.status(0),'complete');}assert.deepEqual(plain(q.state),before);assert.equal(first[0].cadence.preferredDate,'2026-11-30','derived serialization result must not mutate stored draft anchor');
});
test('C55-08/12/16 actual summary uses one displayed reference month, explicit omitted name/reason and wide range',()=>{
 const q=harness();q.state.mode='MIXED';q.state.siteRepeat[1]={period:'2주',frequency:'1회',cadence:{...cadenceForPeriod('2주'),preferredDate:'2026-11-30',nominalAnchor:'2026-11-30'}};q.state.values[1]={monthly:'67',base:'28',min:'10',max:'60'};q.state.variable[1]=true;
 const result=q.monthlyResultData();assert.equal(result.value,'10 ~ 60');assert.equal(result.periodLabel,'2026년 11월 납품 예상');assert.match(result.status,/반복 주문 2곳 중 1곳 반영/);assert.match(result.status,/가게 A 일정 협의 중/);assert.doesNotMatch(result.status,/수량 확인 전/);assert.equal(result.complete,false);
});
test('C55-11 actual partial weekday summary explains unresolved visits without treating valid input as complete schedule',()=>{
 const q=harness();q.state.mode='MIXED';q.state.siteRepeat[0]={period:'매주',frequency:'4회',weeklyCheck:true,weekdays:{'1:월':true,'1:화':true,'1:목':true},cadence:{...cadenceForPeriod('매주'),preferredDate:'2026-11-05',nominalAnchor:'2026-11-05'}};
 assert.equal(contract.inspect(q.state.siteRepeat[0]).valid,true);const result=q.monthlyResultData();assert.equal(result.value,'—');assert.match(result.status,/희망 요일 3개, 나머지 일정 미정/);assert.match(result.status,/0곳 반영/);
});

test('STRUCT-GATE completion reads the same scoped allocation issues as badges and saving',()=>{const q=harness();q.fields=()=>['monthly','base'];q.q4QuantityInvalid=()=>false;q.dateIssue=()=>({valid:true});q.monthlyPending=()=>false;q.state.attempted=true;q.bridge.inspect=()=>[{stage:'q4',lineId:'L',siteId:'S1',fieldKey:'desired-date'}];assert.equal(q.status(0),'complete');assert.equal(q.status(1),'error');q.bridge.inspect=()=>[{stage:'q4',lineId:'L',fieldKey:'monthly'}];assert.equal(q.status(0),'error');assert.equal(q.status(1),'error');});

test('C55-05 selecting an already automatic Consult explicitly records retention in the actual site handler',()=>{const q=harness();q.state.mode='MIXED';q.selectedOption('site-repeat-0-period','협의');assert.equal(q.state.siteRepeat[0].cadenceSelection,'manual');});
test('C55-06/17 monthly to weekly restores each site frequency and individual materialization keeps per-site memories',()=>{const q=harness();q.selectedOption('period','매월');q.selectedOption('period','매주');assert.equal(q.state.mode,'MIXED');assert.deepEqual(q.state.siteRepeat.map(r=>r.frequency),['약 2회','약 1회']);assert.deepEqual(q.state.values.map(v=>v.base),['14','15']);const other=harness();other.selectedOption('period','매월');other.materializeCommonSettings();assert.equal(other.state.mode,'MIXED');assert.deepEqual(other.state.siteRepeat.map(r=>r.monthlyMemory.quantity),['14','15']);});
test('STRUCT-GATE invalid draft cadence replaces saved valid cadence in review and blocks completion',()=>{const q=harness();q.state.mode='MIXED';q.state.attempted=true;q.state.siteRepeat[0].date='';q.regularContext.allocations[0].cadence={...cadenceForPeriod('매주'),preferredDate:'2026-11-05',nominalAnchor:'2026-11-05'};q.selectedOption('site-repeat-0-period','매월');q.state.attempted=true;q.fields=()=>['monthly','base'];q.monthlyPending=()=>false;q.bridge.inspect=patches=>patches.flatMap(a=>inspectQ4Allocation(a,{line:q.regularContext.line,repeatContract:contract,now:new Date('2026-11-05T01:00:00Z')})||[]);const patch=q.serializedAllocations(true)[0];assert.equal(patch.cadence.kind,'MONTHLY');assert.equal(patch.cadence.dayRule,'');assert.equal(q.status(0),'error');assert.ok(q.bridge.inspect([patch]).some(issue=>issue.fieldKey==='date'));});

test('STRUCT-READ-PURITY saved stale monthly anchors normalize consistently in cloned active and common payloads',()=>{const q=harness();q.selectedOption('period','매월');q.state.cadence.preferredDate='2026-10-31';q.state.cadence.nominalAnchor='2026-10-31';const before=plain(q.state);const saved=plain(q.serializedAllocations(true));assert.equal(saved[0].cadence.preferredDate,'2026-11-30');assert.equal(saved[0].q4Review.common.repeat.cadence.preferredDate,'2026-11-30');const restored=restoredDeliverySettings(saved,{repeatFromAllocation:a=>a.q4Review.activeRepeat,holidayFromAllocation:a=>a.q4Review.activeHoliday});assert.equal(restored.profile,'FIXED');assert.deepEqual(plain(q.state),before);});

test('C55-17 fresh and existing recurring fields survive ONCE mode before the old DOM is replaced',()=>{for(const individual of [false,true])for(const quantity of ['', '14']){const q=harness();q.state.mode=individual?'MIXED':'FLEX';q.state.siteModes=['FLEX','FLEX'];q.state.values[0].base=quantity;q.state.values[0].once='41';Object.assign(q,{fixedFrequencyPresentation,frequencyPresentation,unit:()=> '판',escapeHTML:String});for(const name of ['frequencyMarkup','refreshQuantitySupport'])vm.runInContext("'use strict';\n"+functions.get(name),q);const output={innerHTML:q.frequencyMarkup(0)};q.document.querySelector=selector=>selector==='[data-frequency-output="0"]'?output:null;assert.match(output.innerHTML,/data-frequency-value/);const before=plain(q.state.values);for(const mode of ['ONCE','FIXED','FLEX','ONCE']){if(individual)q.state.siteModes[0]=mode;else q.state.mode=mode;assert.doesNotThrow(()=>q.refreshQuantitySupport());if(mode==='ONCE')assert.equal(output.innerHTML,'','ONCE has no recurring frequency, even while the previous DOM is being replaced');else assert.match(output.innerHTML,/data-frequency-value/);assert.deepEqual(plain(q.state.values),before);}}});
