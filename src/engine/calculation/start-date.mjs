import {KR_HOLIDAY_SNAPSHOT} from '../reference/kr-holidays.mjs';
import {parseDate,monthDays,isoDate,weekday,addDays,nextMonth} from './civil-date.mjs';

export const START_DATE_POLICY_VERSION='start-date-1.0.0';
export const START_DATE_MESSAGES=Object.freeze({PEAK:'납품이 지연될 수 있는 기간입니다.',CLOSED:'주말·공휴일은 선택할 수 없습니다.',INVALID:'날짜를 확인해 주세요.',NO_DATE:'선택 가능한 시작일이 없습니다.',UNAVAILABLE:'날짜를 확인할 수 없습니다. 다시 시도해 주세요.'});
/** Product holiday selections are preferences, never permission to invent a shift. */
export function holidayPolicyFromSelection(selection={}){
 const movement=value=>({PREV:'PREV',previous:'PREV','휴무 전일 희망':'PREV',NEXT:'NEXT',next:'NEXT','휴무 다음날 희망':'NEXT',KEEP:'KEEP',allow:'KEEP',deliver:'KEEP','휴무일에도 납품':'KEEP','토·일 납품 가능':'KEEP','공휴일에도 납품':'KEEP','대체공휴일에도 납품':'KEEP'})[value]||'SKIP';
 const weekdays={월:1,화:2,수:3,목:4,금:5,토:6,일:7};
 return {weekend:movement(selection.weekend),holiday:movement(selection.holiday),substitute:movement(selection.subholiday??selection.substituteHoliday),closed:movement(selection.conflict??selection.storeOffPolicy),unavailable:movement(selection.unavailable),closedWeekdays:selection.none||selection.storeOffNone?[]:[...new Set((selection.days||selection.storeOffDays||[]).map(day=>Number.isInteger(day)?day:weekdays[day]).filter(day=>day>=1&&day<=7))]};
}
const clone=value=>structuredClone(value);
const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fmt=value=>{const p=parseDate(value);return p?`${p.year}년 ${p.month}월 ${p.day}일`:'';};
const rangeMessage=range=>`입력 가능한 범위는 ${fmt(range.min)} ~ ${fmt(range.max)}입니다.`;
const emptyPolicies=Object.freeze({version:'NONE',records:[]});
const policyKinds=['processingClosed','deliveryUnavailable','newStartUnavailable','warningOnly'];
const holidays=new WeakMap();
function holidayMap(snapshot){let map=holidays.get(snapshot);if(!map){map=new Map(snapshot.records.map(item=>[item.date,item]));holidays.set(snapshot,map);}return map;}
export function holidaySnapshotState(snapshot,{years=[],checkedAt=new Date().toISOString()}={}){
 if(!record(snapshot)||snapshot.status!=='verified'||typeof snapshot.version!=='string'||!snapshot.version||!Array.isArray(snapshot.coverage)||!Array.isArray(snapshot.records)||!Number.isFinite(Date.parse(snapshot.verifiedAt)))return {valid:false,code:'UNAVAILABLE',reason:'UNVERIFIED_SNAPSHOT'};
 if(snapshot.expiresAt!==null&&snapshot.expiresAt!==undefined&&(!Number.isFinite(Date.parse(checkedAt))||!Number.isFinite(Date.parse(snapshot.expiresAt))||Date.parse(checkedAt)>=Date.parse(snapshot.expiresAt)))return {valid:false,code:'UNAVAILABLE',reason:'EXPIRED_SNAPSHOT'};
 if(years.some(year=>!snapshot.coverage.includes(year)))return {valid:false,code:'UNAVAILABLE',reason:'UNCOVERED_YEAR'};
 if(snapshot.records.some(item=>!record(item)||!parseDate(item.date)||item.isHoliday!==true)||new Set(snapshot.records.map(item=>item.date)).size!==snapshot.records.length)return {valid:false,code:'UNAVAILABLE',reason:'INVALID_SNAPSHOT'};
 return {valid:true,code:'VALID',version:snapshot.version,verifiedAt:snapshot.verifiedAt,dataHash:snapshot.dataHash||null};
}
function normalizePolicies(value=emptyPolicies){
 if(!record(value)||typeof value.version!=='string'||!Array.isArray(value.records))return null;
 if(value.records.some(item=>!record(item)||!policyKinds.includes(item.kind)||!parseDate(item.start)||!parseDate(item.end)||item.start>item.end||!['id','version','reason','source'].every(key=>typeof item[key]==='string'&&item[key])||!record(item.scope)||!Object.keys(item.scope).length||Object.keys(item.scope).some(key=>!['supplierId','routeId','regionId','platform'].includes(key))))return null;
 return value;
}
const scoped=(policy,scope)=>Object.entries(policy.scope).every(([key,value])=>key==='platform'?value===true:scope[key]===value);
const applies=(policy,date,scope)=>date>=policy.start&&date<=policy.end&&scoped(policy,scope);
function environment(options={}){
 const snapshot=options.holidaySnapshot===undefined?KR_HOLIDAY_SNAPSHOT:options.holidaySnapshot,policies=normalizePolicies(options.policies),scope=options.scope||{},policy=options.holidayPolicy||{},checkedAt=options.checkedAt||new Date().toISOString();
 if(!policies||!record(scope)||!record(policy)||!holidaySnapshotState(snapshot,{checkedAt}).valid)return null;
 return {snapshot,policies,scope,policy,checkedAt};
}
function dateStatus(date,env,{preparation=false,first=false}={}){
 const p=parseDate(date);if(!p||!holidaySnapshotState(env.snapshot,{years:[p.year],checkedAt:env.checkedAt}).valid)return {available:false,closed:true,reasons:['UNAVAILABLE'],warnings:[]};
 const holiday=holidayMap(env.snapshot).get(date),reasons=[];
 if(weekday(p.ordinal)>5)reasons.push('weekend');
 if(holiday)reasons.push(holiday.type==='substitute'?'substitute':'holiday');
 if(!preparation&&env.policy.closedWeekdays?.includes(weekday(p.ordinal)))reasons.push('closed');
 const matching=env.policies.records.filter(item=>applies(item,date,env.scope));
 for(const item of matching)if(preparation?item.kind==='processingClosed':item.kind==='deliveryUnavailable'||first&&item.kind==='newStartUnavailable')reasons.push(item.kind);
 return {available:true,closed:reasons.length>0,reasons,holiday:holiday||null,warnings:matching.filter(item=>item.kind==='warningOnly').map(item=>item.id)};
}
function shift(date,env,{from,to}={}){
 const initial=dateStatus(date,env),actions=initial.reasons.map(reason=>env.policy[reason==='deliveryUnavailable'?'unavailable':reason]||'SKIP');
 if(!initial.available)return {valid:false,code:'UNAVAILABLE',nominal:date,actual:null};
 if(actions.some(action=>!['KEEP','PREV','NEXT','SKIP'].includes(action)))return {valid:false,code:'NO_DATE',nominal:date,actual:null};
 const moving=actions.filter(action=>action!=='KEEP');
 if(!moving.length)return {valid:true,code:'VALID',nominal:date,actual:date};
 if(moving.includes('SKIP')||new Set(moving).size>1)return {valid:false,code:'NO_DATE',nominal:date,actual:null};
 const direction=moving[0]==='PREV'?-1:1;let actual=date;
 // A finite caller window bounds the search; never expand a start range to fit.
 for(let count=0;count<366;count++){
  actual=addDays(actual,direction);if(!actual||from&&actual<from||to&&actual>to)return {valid:false,code:'NO_DATE',nominal:date,actual:null};
  const state=dateStatus(actual,env);if(!state.available)return {valid:false,code:'UNAVAILABLE',nominal:date,actual:null};
  const blocked=state.reasons.filter(reason=>(env.policy[reason==='deliveryUnavailable'?'unavailable':reason]||'SKIP')!=='KEEP');
  if(!blocked.length)return {valid:true,code:'VALID',nominal:date,actual};
 }
 return {valid:false,code:'NO_DATE',nominal:date,actual:null,reason:'ADJUSTMENT_SEARCH_LIMIT'};
}
function monthlyNominal(cadence,year,month){const day=cadence.dayRule==='last'?monthDays(year,month):Math.min(Number(cadence.dayRule),monthDays(year,month));return Number.isInteger(day)&&day>=1&&day<=31?isoDate(year,month,day):null;}
function validCadence(cadence){return !cadence||record(cadence)&&['WEEKLY','INTERVAL_DAYS','MONTHLY'].includes(cadence.kind)&&(cadence.kind!=='MONTHLY'||cadence.dayRule==='last'||Number.isInteger(cadence.dayRule)&&cadence.dayRule>=1&&cadence.dayRule<=31)&&(cadence.kind!=='INTERVAL_DAYS'||[14,21].includes(cadence.intervalDays));}
function versions(env,asOfLocalDate){return {policyVersion:START_DATE_POLICY_VERSION,holidayVersion:env?.snapshot.version||null,holidayDataHash:env?.snapshot.dataHash||null,operatingPolicyVersion:env?.policies.version||null,asOfLocalDate};}
/** New-start eligibility only. Existing delivery recurrence is a separate projection. */
export function startDateRange(options={}){
 const {asOfLocalDate,cadence}=options,asOf=parseDate(asOfLocalDate),env=environment(options);
 const result={valid:false,code:'UNAVAILABLE',min:null,max:null,candidates:[],occurrences:[],preparationDates:[],versions:versions(env,asOfLocalDate),message:START_DATE_MESSAGES.UNAVAILABLE};
 if(!asOf||!validCadence(cadence))return {...result,code:'INVALID',message:START_DATE_MESSAGES.INVALID};
 if(!env)return result;
 const next=nextMonth(asOf.year,asOf.month),end=isoDate(next.year,next.month,monthDays(next.year,next.month));let cursor=asOfLocalDate;
 // Count complete preparation business days strictly after the application day.
 while(result.preparationDates.length<3&&cursor<end){cursor=addDays(cursor,1);const state=dateStatus(cursor,env,{preparation:true});if(!state.available)return result;if(!state.closed)result.preparationDates.push(cursor);}
 if(result.preparationDates.length<3)return {...result,code:'NO_DATE',message:START_DATE_MESSAGES.NO_DATE};
 const preparationEnd=cursor,eligible=[];
 for(cursor=addDays(preparationEnd,1);cursor&&cursor<=end;cursor=addDays(cursor,1)){
  const state=dateStatus(cursor,env,{first:true});if(!state.available)return {...result,min:eligible[0]||null};if(!state.closed)eligible.push(cursor);
 }
 result.min=eligible[0]||null;result.max=eligible.at(-1)||null;
 if(!eligible.length)return {...result,code:'NO_DATE',message:START_DATE_MESSAGES.NO_DATE};
 let occurrences;
 if(cadence?.kind==='MONTHLY'){
  occurrences=[];let month={year:asOf.year,month:asOf.month};
  for(let n=0;n<2;n++,month=nextMonth(month.year,month.month)){
   const nominal=monthlyNominal(cadence,month.year,month.month),candidate=nominal&&shift(nominal,env,{from:asOfLocalDate,to:end});
   if(candidate?.code==='UNAVAILABLE')return result;
   if(candidate?.valid&&eligible.includes(candidate.actual))occurrences.push(candidate);
  }
 }else if(cadence?.kind==='INTERVAL_DAYS'&&(cadence.nominalAnchor||cadence.preferredDate)){
  // Restored interval intent keeps its original cadence phase. Rechecking a
  // shifted first delivery must not turn the actual date into a new anchor.
  const recurring=recurringDeliveryDates({...options,from:asOfLocalDate,to:end,cadence,includeBeforeFirstDelivery:true});
  if(!recurring.valid)return {...result,code:recurring.code,message:START_DATE_MESSAGES[recurring.code]||START_DATE_MESSAGES.INVALID};
  occurrences=recurring.occurrences.filter(item=>eligible.includes(item.actual)).map(item=>({...item,valid:true,code:'VALID'}));
 }else occurrences=eligible.map(date=>({valid:true,code:'VALID',nominal:date,actual:date}));
 const candidates=[...new Set(occurrences.map(item=>item.actual))].sort();
 if(!candidates.length)return {...result,code:'NO_DATE',message:START_DATE_MESSAGES.NO_DATE};
 return {...result,valid:true,code:'VALID',candidates,occurrences,message:''};
}
function normalizeInput(value){
 if(value===''||value===null||value===undefined)return {empty:true};
 const p=typeof value==='string'?/^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value):null;
 const parts=p?{year:p[1],month:p[2],day:p[3]}:record(value)?value:null;
 if(!parts)return {valid:false};
 const y=String(parts.year??''),m=String(parts.month??''),d=String(parts.day??'');
 if(y===''&&m===''&&d==='')return {empty:true};
 if(/^\d{4}$/.test(y)&&/^\d{1,2}$/.test(m)&&Number(m)>=1&&Number(m)<=12&&d==='')return {empty:true};
 if(!/^\d{4}$/.test(y)||!/^\d{1,2}$/.test(m)||!/^\d{1,2}$/.test(d))return {valid:false,incomplete:true};
 const year=Number(y),month=Number(m),day=Number(d),last=monthDays(year,month);if(!last||day<1||day>31)return {valid:false};
 return {valid:true,parts:{year,month,day:Math.min(day,last)},requestedDay:day,value:isoDate(year,month,Math.min(day,last)),clamped:day>last};
}
/** A completed explicit edit may be corrected, while typing is never rewritten.
 * Returned cadence is authoritative: the raw day is never stored before range checks. */
export function inspectStartDate(value,options={}){
 const parsed=normalizeInput(value),cadence=options.cadence?clone(options.cadence):null;
 const base={valid:false,empty:false,value:null,parts:null,adjusted:false,cadence,code:'INVALID',message:START_DATE_MESSAGES.INVALID,range:null};
 if(parsed.empty)return {...base,valid:true,empty:true,value:'',code:'EMPTY',message:'',cadence:cadence?{...cadence,preferredDate:'',...(cadence.version==='2.1.0'?{nominalAnchor:''}:{})}:null};
 if(!parsed.valid)return options.completed===false?{...base,code:'EDITING',message:''}:base;
 if(options.completed===false)return {...base,code:'EDITING',message:'',parts:parsed.parts};
 const preserve=options.lifecycle==='STARTED'||options.lifecycle==='LEGACY'&&parsed.value<options.asOfLocalDate;
 if(preserve&&!options.edited&&options.savedAnchor===parsed.value&&!parsed.clamped)return {...base,valid:true,value:parsed.value,parts:parsed.parts,code:'PRESERVED',message:'',preserved:true};
 let range=startDateRange(options),activeCadence=cadence;
 const env=environment(options);if(!env)return {...base,code:'UNAVAILABLE',message:START_DATE_MESSAGES.UNAVAILABLE,range};
 // An explicitly chosen, in-range eligible calendar date may change a monthly
 // rule. Out-of-range raw dates must retain the prior nominal dayRule.
 const generic=startDateRange({...options,cadence:null});
 const interval=cadence?.kind==='INTERVAL_DAYS',sameIntervalInput=interval&&parsed.value===cadence.preferredDate;
 const newIntervalIntent=interval&&(options.selectDayRule||options.edited&&!sameIntervalInput||!cadence.nominalAnchor&&!cadence.preferredDate);
 if(newIntervalIntent&&generic.valid&&parsed.value>=generic.min&&parsed.value<=generic.max){
  activeCadence={...cadence,version:'2.1.0',preferredDate:parsed.value,nominalAnchor:parsed.value};
  range=startDateRange({...options,cadence:activeCadence});
 }
 if(options.selectDayRule&&cadence?.kind==='MONTHLY'&&generic.valid&&generic.candidates.includes(parsed.value)){
  const last=monthDays(parsed.parts.year,parsed.parts.month),dayRule=cadence.dayRule==='last'&&parsed.parts.day===last?'last':parsed.requestedDay;
  activeCadence={...cadence,dayRule};range=startDateRange({...options,cadence:activeCadence});
 }
 if(!range.valid)return {...base,code:range.code,message:range.message,range};
 let selected=parsed.value,code='VALID';
 // A holiday-policy refresh can move the same nominal first occurrence in
 // either direction. Validate that occurrence, not a second shift from the
 // previously displayed actual delivery date.
 const sameOccurrence=interval&&sameIntervalInput&&!newIntervalIntent?range.occurrences.find(item=>item.nominal===(cadence.nominalAnchor||cadence.preferredDate)):null;
 if(sameOccurrence&&sameOccurrence.actual!==selected){selected=sameOccurrence.actual;code='CLOSED';}
 if(selected<range.min||selected>range.max){code='RANGE';selected=selected<range.min?range.candidates[0]:range.candidates.at(-1);}
 else if(!range.candidates.includes(selected)){
  code='CLOSED';const shifted=shift(selected,env,{from:range.min,to:range.max});
  if(!shifted.valid||!range.candidates.includes(shifted.actual))return {...base,code:'NO_DATE',message:START_DATE_MESSAGES.NO_DATE,range};selected=shifted.actual;
 }
 if(options.adjust===false&&(selected!==parsed.value||parsed.clamped))return {...base,code,message:code==='RANGE'?rangeMessage(range):START_DATE_MESSAGES[code]||START_DATE_MESSAGES.INVALID,range};
 const occurrence=range.occurrences.find(item=>item.actual===selected),nominal=interval&&sameIntervalInput&&!newIntervalIntent?(cadence.nominalAnchor||cadence.preferredDate):occurrence?.nominal||selected;
 if(activeCadence)activeCadence={...activeCadence,version:'2.1.0',preferredDate:selected,nominalAnchor:nominal};
 const state=dateStatus(selected,env,{first:true}),warning=state.warnings.length?'PEAK':null;
 const finalCode=code==='VALID'&&warning?warning:code,parts=parseDate(selected);
 return {...base,valid:true,value:selected,parts:{year:parts.year,month:parts.month,day:parts.day},adjusted:selected!==parsed.value||!!parsed.clamped,cadence:activeCadence,code:finalCode,message:finalCode==='RANGE'?rangeMessage(range):START_DATE_MESSAGES[finalCode]||'',range,nominalAnchor:nominal,warnings:warning?[warning]:[]};
}
/** Nominal + n*interval first, then per-occurrence policy. Actual dates never seed the next recurrence. */
export function recurringDeliveryDates({from,to,cadence,includeBeforeFirstDelivery=false,...options}={}){
 const start=parseDate(from),end=parseDate(to),env=environment(options);
 if(!start||!end||from>to||!cadence||!validCadence(cadence))return {valid:false,code:'INVALID',occurrences:[]};
 if(!env)return {valid:false,code:'UNAVAILABLE',occurrences:[]};
 const nominal=[],anchor=cadence.nominalAnchor||cadence.preferredDate||'';
 if(cadence.kind==='INTERVAL_DAYS'){
  const first=parseDate(anchor);if(!first)return {valid:false,code:'INVALID',occurrences:[]};
  const n=Math.max(0,Math.floor((start.ordinal-first.ordinal)/cadence.intervalDays)-1);
  for(let date=addDays(anchor,n*cadence.intervalDays);date&&date<=addDays(to,cadence.intervalDays);date=addDays(date,cadence.intervalDays))nominal.push(date);
 }else if(cadence.kind==='MONTHLY'){
  let month=start.month===1?{year:start.year-1,month:12}:{year:start.year,month:start.month-1};
  const limit=nextMonth(end.year,end.month);
  for(let n=0;n<240&&month.year<=limit.year;n++,month=nextMonth(month.year,month.month)){if(month.year===limit.year&&month.month>limit.month)break;const date=monthlyNominal(cadence,month.year,month.month);if(date&&(!anchor||date>=anchor))nominal.push(date);}
 }else return {valid:false,code:'INVALID',occurrences:[]};
 const occurrences=[];
 for(const date of nominal){const shifted=shift(date,env,{from:addDays(from,-366),to:addDays(to,366)});if(shifted.code==='UNAVAILABLE'&&date>=from&&date<=to)return {valid:false,code:'UNAVAILABLE',occurrences:[]};if(shifted.valid&&shifted.actual>=from&&shifted.actual<=to&&(includeBeforeFirstDelivery||!cadence.preferredDate||shifted.actual>=cadence.preferredDate))occurrences.push({nominal:date,actual:shifted.actual,adjusted:date!==shifted.actual});}
 return {valid:true,code:'VALID',occurrences,versions:versions(env,options.asOfLocalDate||null)};
}
