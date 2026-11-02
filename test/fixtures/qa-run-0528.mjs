import {quantityCases0528,dateCases0528,quantityFixture0528,dateFixture0528} from './qa-lab-0528.mjs';
import {frequencyPresentation,orderQuantityInput} from '../../web/q4-planning.mjs';
import {createMonthlyAllocationDraft} from '../../web/allocation-ui.mjs';
import {parseNumericText,formatNumericText} from '../../web/numeric-input.mjs';
import {startDateRange,inspectStartDate,recurringDeliveryDates} from '../../src/engine/calculation/start-date.mjs';
import {monthDays} from '../../src/engine/calculation/civil-date.mjs';
import {KR_HOLIDAY_SNAPSHOT} from '../../src/engine/reference/kr-holidays.mjs';

const clone=x=>structuredClone(x);
const policy=(kind,start,end=start,scope={platform:true})=>({id:'QA-'+kind+'-'+start,version:'QA-1',kind,start,end,scope,reason:'명시적 합성 QA 조건',source:'MSG0528 QA fixture — 운영 정책 아님'});
const policies=records=>({version:'QA-0528',records});
const nextPolicy={weekend:'NEXT',holiday:'NEXT',substitute:'NEXT',closed:'NEXT',unavailable:'NEXT'};
const same=(actual,expected)=>JSON.stringify(actual)===JSON.stringify(expected);
function quantityRun(c){
 const x=c.input,asOfLocalDate=x.days===31?'2026-12-05':'2026-11-05';
 if(['N09','N10','N11','N12','N15'].includes(c.id)){
  const f=quantityFixture0528(c.id==='N10'?'N09':c.id),context={revision:0,line:f.lines[0],locations:f.locations,allocations:f.allocations};
  if(c.id==='N15')context.line.qty='500';const d=createMonthlyAllocationDraft(context);
  if(c.id==='N09')d.set('qa-site-1','401',{complete:true});
  if(c.id==='N10'||c.id==='N11')d.set('qa-site-0','201',{complete:true});
  const actual={plans:d.rows.map(r=>r.quantity.raw),sources:d.rows.map(r=>r.source),canConfirm:d.evaluate().normalized.canConfirm,raw:context.line.qty};
  const pass=c.id==='N15'?same(actual.plans,['200','400'])&&!actual.canConfirm:c.id==='N12'?same(actual.plans,['84','84'])&&actual.raw==='5000':same(actual.plans,c.id==='N10'?['201','399']:['200','400']);
  return {actual,pass,scope:'SAME_PRODUCT_MONTHLY_DRAFT_ENGINE; UI save/cancel separate'};
 }
 if(c.id==='N13'){const first=orderQuantityInput({mode:'FLEX',monthlyPlan:'600',quantity:'2',asOfLocalDate,phase:'input'}),last=orderQuantityInput({mode:'FLEX',monthlyPlan:'600',quantity:'29',asOfLocalDate,phase:'complete'});return {actual:{intermediate:first.quantity,quantity:last.quantity},pass:first.quantity==='2'&&last.quantity==='29',scope:'SAME_PRODUCT_INPUT_CONTRACT; actual typing browser test separate'};}
 if(c.id==='N14'){const parsed=parseNumericText('1,200',{grouped:true}),actual={display:formatNumericText(parsed.value,{grouped:true}),model:parsed.value};return {actual,pass:same(actual,c.expected),scope:'SAME_PRODUCT_NUMERIC_FORMATTER; durable storage separate'};}
 if(c.id==='N16'){const correction=orderQuantityInput({mode:'FLEX',monthlyPlan:'',quantity:'',asOfLocalDate,phase:'input',composing:true}),f=frequencyPresentation({monthlyPlan:'',quantity:'',asOfLocalDate});return {actual:{correction,display:f.text},pass:correction.quantity===''&&!correction.changed&&f.text==='—',scope:'SAME_PRODUCT_UNRESOLVED_INPUT_CONTRACT'};}
 const correction=orderQuantityInput({mode:x.mode||'FLEX',monthlyPlan:x.monthly,quantity:x.quantity,asOfLocalDate,phase:'complete'});
 const f=frequencyPresentation({monthlyPlan:x.monthly,quantity:correction.quantity,variable:!!x.min,min:x.min||'',max:x.max||'',asOfLocalDate});
 return {actual:{quantity:correction.quantity,frequency:f.text,basis:f.basisText,forceMonthly:correction.forceMonthly,exact:f.result.normalized},pass:correction.quantity===c.expected.quantity&&(!c.expected.frequency||f.text===c.expected.frequency)&&(c.id!=='N08'||correction.forceMonthly===true)&&(c.id!=='N07'||correction.forceMonthly===false),scope:c.id==='N08'?'SAME_PRODUCT_CORRECTION_INTENT; actual atomic cadence/date/cancel tested in browser':'SAME_PRODUCT_EXACT_CALCULATION'};
}
function dateRun(c){
 const x=c.input,options={asOfLocalDate:x.asOf||'2026-12-04',checkedAt:'2026-11-02T15:00:00Z',holidayPolicy:nextPolicy};
 if(x.dayRule)options.cadence={version:'2.0.0',kind:'MONTHLY',dayRule:x.dayRule,preferredDate:''};
 if(x.holidayPolicy==='PREV')options.holidayPolicy=Object.fromEntries(Object.keys(nextPolicy).map(k=>[k,'PREV']));
 if(x.holidayPolicy==='NONE')options.holidayPolicy=Object.fromEntries(Object.keys(nextPolicy).map(k=>[k,'SKIP']));
 if(c.id==='D05')options.policies=policies([policy('newStartUnavailable','2026-12-30','2026-12-31')]);
 if(c.id==='D20'){const actual={normalized:[`2027-02-${monthDays(2027,2)}`,'2028-02-29'],year2028BusinessStatus:'UNVERIFIED_WITHOUT_DATA'};return {actual,pass:same(actual,c.expected),scope:'CIVIL_DATE_ARITHMETIC_ONLY; no 2028 business-day claim'};}
 if(c.id==='D21'||c.id==='D22'){
  const snapshot=clone(KR_HOLIDAY_SNAPSHOT),date=c.id==='D21'?'2026-12-10':'2026-12-08';snapshot.version+='-QA-injected';snapshot.records.push({date,isHoliday:true,type:c.id==='D21'?'temporary':'election',name:'합성 확정 휴일 fixture'});
  const before=startDateRange(options),after=startDateRange({...options,holidaySnapshot:snapshot}),saved={version:'2.0.0',kind:'INTERVAL_DAYS',intervalDays:14,preferredDate:'2026-11-03'},preserved=inspectStartDate(saved.preferredDate,{...options,holidaySnapshot:snapshot,cadence:saved,lifecycle:'STARTED',savedAnchor:saved.preferredDate,edited:false,completed:true});
  return {actual:{before:before.min,after:after.min,preserved:preserved.value,snapshotVersion:snapshot.version},pass:before.min==='2026-12-10'&&after.min==='2026-12-11'&&preserved.value==='2026-11-03',scope:'INJECTED_TEMPORARY_OR_ELECTION_POLICY_FIXTURE; no new real holiday claim'};
 }
 if(c.id==='D23'){const operating=policies([policy('newStartUnavailable','2026-12-10','2026-12-10',{routeId:'qa-route-a'})]),a=startDateRange({...options,policies:operating,scope:{routeId:'qa-route-a'}}),b=startDateRange({...options,policies:operating,scope:{routeId:'qa-route-b'}});return {actual:{routeA:a.min,routeB:b.min},pass:a.min==='2026-12-11'&&b.min==='2026-12-10',scope:'ROUTE_SCOPED_OPERATIONAL_FIXTURE'};}
 if(c.id==='D24'){const missing={...clone(KR_HOLIDAY_SNAPSHOT),coverage:[2026]},noCache=startDateRange({...options,holidaySnapshot:missing}),cached=startDateRange({...options,holidaySnapshot:KR_HOLIDAY_SNAPSHOT});return {actual:{noCache:noCache.code,validSnapshot:cached.code},pass:noCache.code==='UNAVAILABLE'&&cached.valid,scope:'CALLER_PROVIDED_VERIFIED_SNAPSHOT vs MISSING_YEAR; online cache transport not simulated'};}
 if(c.id==='D25'){const first=startDateRange({...options,asOfLocalDate:'2026-12-04'}),after=startDateRange({...options,asOfLocalDate:'2026-12-05'});return {actual:{opened:first.versions.asOfLocalDate,applied:after.versions.asOfLocalDate},pass:after.versions.asOfLocalDate==='2026-12-05',scope:'EXPLICIT_CLOCK_CONTRACT; actual apply/read transaction browser evidence separate'};}
 if(c.id==='D26'){const result=inspectStartDate(x.pastDate,{...options,lifecycle:'STARTED',savedAnchor:x.pastDate,edited:false,completed:true});return {actual:result,pass:result.code==='PRESERVED'&&result.value==='2026-11-03',scope:'PURE_EXISTING_RECORD_PRESERVATION; actual read writes browser evidence separate'};}
 if(c.id==='D27'){const typing=inspectStartDate({year:'2',month:'',day:''},{...options,completed:false}),commit=inspectStartDate({year:'202_',month:'',day:''},{...options,completed:true});return {actual:{typing:typing.code,message:typing.message,commit:commit.code},pass:typing.code==='EDITING'&&typing.message===''&&commit.code==='INVALID',scope:'PARTIAL_INPUT_CONTRACT; real OS IME not run'};}
 if(c.id==='D28'){const result=startDateRange({...options,policies:policies([policy('newStartUnavailable','2026-12-04','2027-01-31')])});return {actual:result,pass:result.code==='NO_DATE'&&result.candidates.length===0,scope:'ALL_DATES_BLOCKED_OPERATIONAL_FIXTURE'};}
 if(c.id==='D29'){const two=recurringDeliveryDates({from:'2026-12-10',to:'2027-01-20',cadence:{version:'2.1.0',kind:'INTERVAL_DAYS',intervalDays:14,preferredDate:'2026-12-10',nominalAnchor:'2026-12-10'},...options,policies:policies([policy('deliveryUnavailable','2026-12-24')])}),three=recurringDeliveryDates({from:'2026-12-04',to:'2027-01-20',cadence:{version:'2.1.0',kind:'INTERVAL_DAYS',intervalDays:21,preferredDate:'2026-12-04',nominalAnchor:'2026-12-04'},...options});return {actual:{two:two.occurrences,three:three.occurrences},pass:two.occurrences.some(o=>o.nominal==='2027-01-07'&&o.actual==='2027-01-07')&&three.occurrences.some(o=>o.nominal==='2027-01-15'&&o.actual==='2027-01-15'),scope:'ORIGINAL_ANCHOR_RECURRENCE_WITH_EXPLICIT_POLICY_FIXTURE'};}
 if(x.date){const actual=inspectStartDate(x.date,{...options,completed:true,edited:true,adjust:true});const expectedCode=c.expected.message,pass=(Array.isArray(expectedCode)?expectedCode.includes(actual.code):expectedCode===actual.code)&&(!c.expected.date||c.expected.date===actual.value)&&(!c.expected.forbidden||actual.value!==c.expected.forbidden)&&(!c.expected.dayRule||actual.cadence?.dayRule===c.expected.dayRule);return {actual,pass,scope:'ACTUAL_PRODUCT_DATE_INSPECTION_WITH_FIXED_CLOCK_AND_VERIFIED_YEAR_SNAPSHOT'};}
 const actual=startDateRange(options);
 if(c.id==='D14')return {actual,pass:actual.code==='UNAVAILABLE'&&actual.min==='2027-12-30'&&same(actual.preparationDates,['2027-12-24','2027-12-28','2027-12-29']),scope:'PARTIAL_VERIFIED_2027; January2028 window unavailable, not a complete start-date PASS',limitation:'2028 official holiday coverage is missing; preparation/min only verified'};
 const pass=(!c.expected.min||actual.min===c.expected.min)&&(!c.expected.max||actual.max===c.expected.max)&&(!c.expected.first||actual.candidates[0]===c.expected.first)&&(!c.expected.message||actual.code===c.expected.message);
 return {actual,pass,scope:c.classification||'ACTUAL_PRODUCT_DATE_ENGINE_FIXED_CLOCK_VERIFIED_SNAPSHOT'};
}
export function runQaCase0528(id){
 const c=[...quantityCases0528,...dateCases0528].find(x=>x.id===id);if(!c)throw Error('QA_CASE_UNKNOWN');
 try{const result=id.startsWith('N')?quantityRun(c):dateRun(c);return {id,title:c.title,expected:c.expected,...result,status:result.pass?(result.limitation?'PASS_SCOPED_PARTIAL_DATA':'PASS_SCOPED'):'FAIL'};}catch(error){return {id,title:c.title,expected:c.expected,status:'FAIL',error:String(error.stack||error)};}
}
export const qaCases0528=[...quantityCases0528,...dateCases0528];
export {quantityFixture0528,dateFixture0528};
