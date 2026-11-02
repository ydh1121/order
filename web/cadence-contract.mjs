// Pure calendar intent. Storage owns persistence; consumers own explicit edits.
import {startDateRange,inspectStartDate} from '../src/engine/calculation/start-date.mjs';
export {startDateRange,inspectStartDate,recurringDeliveryDates,holidayPolicyFromSelection,START_DATE_POLICY_VERSION,START_DATE_MESSAGES} from '../src/engine/calculation/start-date.mjs';
export const CADENCE_VERSION='2.1.0';
const versions=['2.0.0',CADENCE_VERSION];
const kinds=['WEEKLY','INTERVAL_DAYS','MONTHLY'];
const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'});
const clone=value=>structuredClone(value);
const integer=value=>typeof value==='number'?Number.isSafeInteger(value):typeof value==='string'&&/^\d+$/.test(value);
export const seoulDate=(now=new Date())=>Object.fromEntries(dateFormatter.formatToParts(new Date(now)).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value)]));
export function daysInMonth(year,month){
 if(!integer(year)||!integer(month)||Number(year)<1||Number(year)>9999||Number(month)<1||Number(month)>12)return null;
 const y=Number(year);return [31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31][Number(month)-1];
}
const iso=parts=>`${String(parts.year).padStart(4,'0')}-${String(parts.month).padStart(2,'0')}-${String(parts.day).padStart(2,'0')}`;
export function preferredDateParts(value){
 if(typeof value==='string'){const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);return match?{year:Number(match[1]),month:Number(match[2]),day:Number(match[3])}:null;}
 return value&&typeof value==='object'&&!Array.isArray(value)?{year:value.year,month:value.month,day:value.day}:null;
}
export function preferredYearPolicy(now=new Date()){
 const today=seoulDate(now),range=startDateRange({asOfLocalDate:iso(today)}),last=today.month===12?today.year+1:today.year,years=last===today.year?[today.year]:[today.year,last];
 return {zone:'Asia/Seoul',today,years,minYear:years[0],maxYear:years.at(-1),yearLocked:years.length===1,minDate:range.min,maxDate:range.max,range};
}
/** Clamp only a complete day in a valid year/month. Partial typing stays untouched. */
export function clampPreferredDate(value){
 const parts=preferredDateParts(value);
 if(!parts||!['year','month','day'].every(key=>integer(parts[key])))return {valid:false,code:'INCOMPLETE',value:null,parts,clamped:false};
 const limit=daysInMonth(parts.year,parts.month),day=Number(parts.day);
 if(!limit||day<1||day>31)return {valid:false,code:'INVALID',value:null,parts,clamped:false};
 const normalized={year:Number(parts.year),month:Number(parts.month),day:Math.min(day,limit)};
 return {valid:true,code:'VALID',value:iso(normalized),parts:normalized,clamped:day!==normalized.day};
}
/** The unchanged saved anchor stays valid when time advances; new edits obey Seoul bounds. */
export function inspectPreferredDate(value,{now=new Date(),savedAnchor='',edited=false,clamp=false}={}){
 const result=inspectStartDate(value,{asOfLocalDate:iso(seoulDate(now)),savedAnchor,edited,lifecycle:savedAnchor?'LEGACY':'NEW',adjust:clamp});
 return {...result,clamped:!!result.adjusted,restored:!!result.preserved};
}
export const validDayRule=value=>value==='last'||Number.isInteger(value)&&value>=1&&value<=31;
export function inspectCadence(cadence){
 const failure=code=>({valid:false,code,value:null});
 if(!cadence||typeof cadence!=='object'||Array.isArray(cadence)||!versions.includes(cadence.version)||!kinds.includes(cadence.kind))return failure('CADENCE_INVALID');
 const current=cadence.version===CADENCE_VERSION;
 const allowed=['version','kind','preferredDate',...(current?['nominalAnchor']:[]),...(cadence.kind==='INTERVAL_DAYS'?['intervalDays']:cadence.kind==='MONTHLY'?['dayRule']:[])];
 if(Object.keys(cadence).some(key=>!allowed.includes(key))||typeof cadence.preferredDate!=='string')return failure('CADENCE_FIELDS_INVALID');
 if(current&&(typeof cadence.nominalAnchor!=='string'||(cadence.preferredDate==='')!==(cadence.nominalAnchor==='')))return failure('CADENCE_ANCHOR_INVALID');
 if(cadence.kind==='INTERVAL_DAYS'&&![14,21].includes(cadence.intervalDays))return failure('CADENCE_INTERVAL_INVALID');
 if(cadence.kind==='MONTHLY'&&!validDayRule(cadence.dayRule))return failure('CADENCE_DAY_RULE_INVALID');
 if(cadence.kind==='WEEKLY'&&(cadence.preferredDate!==''||current&&cadence.nominalAnchor!==''))return failure('CADENCE_WEEKLY_DATE_INVALID');
 if(cadence.preferredDate!==''){
  const checked=clampPreferredDate(cadence.preferredDate);
  if(!checked.valid||checked.clamped||checked.value!==cadence.preferredDate)return failure('CADENCE_DATE_INVALID');
  const nominal=current?clampPreferredDate(cadence.nominalAnchor):checked;
  if(!nominal.valid||nominal.clamped||current&&nominal.value!==cadence.nominalAnchor)return failure('CADENCE_ANCHOR_INVALID');
  if(cadence.kind==='MONTHLY'){
   const limit=daysInMonth(nominal.parts.year,nominal.parts.month),day=cadence.dayRule==='last'?limit:Math.min(cadence.dayRule,limit);
   if(nominal.parts.day!==day)return failure('CADENCE_MONTHLY_DATE_MISMATCH');
  }
 }
 return {valid:true,code:'VALID',value:clone(cadence)};
}
/** Called only by an explicit choice. Absence of cadence must remain legacy. */
export function createCadence(period,previous=null){
 const base={version:CADENCE_VERSION,preferredDate:previous?.preferredDate||'',nominalAnchor:previous?.nominalAnchor||previous?.preferredDate||''};
 if(period==='매주')return {...base,kind:'WEEKLY',preferredDate:'',nominalAnchor:''};
 if(period==='2주'||period==='3주')return {...base,kind:'INTERVAL_DAYS',intervalDays:period==='2주'?14:21};
 if(period==='매월')return {...base,kind:'MONTHLY',dayRule:previous?.kind==='MONTHLY'?previous.dayRule:''};
 return null;
}
/** One monthly rule plus optional selected start month, updated as one draft transaction. */
export function syncMonthlyPreferredDate(cadence,action){
 const next=clone(cadence);
 const failure=code=>({valid:false,code,value:clone(cadence)});
 if(next?.kind!=='MONTHLY'||!versions.includes(next.version))return failure('CADENCE_MONTHLY_REQUIRED');
 const current=next.version===CADENCE_VERSION;
 if(action?.kind==='clear'){next.preferredDate='';if(current)next.nominalAnchor='';return {valid:true,code:'VALID',value:next};}
 if(action?.kind==='rule'){
  if(!validDayRule(action.dayRule))return failure('CADENCE_DAY_RULE_INVALID');
  next.dayRule=action.dayRule;
  // Merely choosing a required month rule never activates the optional date.
  if(!next.preferredDate)return {valid:true,code:'VALID',value:next};
 }else if(action?.kind==='date'){
  if(action.value==='')return syncMonthlyPreferredDate(next,{kind:'clear'});
  const selected=clampPreferredDate(action.value);
  if(!selected.valid)return failure('CADENCE_DATE_INVALID');
  const requested=preferredDateParts(action.value);
  next.preferredDate=selected.value;
  if(current)next.nominalAnchor=selected.value;
  const end=daysInMonth(selected.parts.year,selected.parts.month);
  // Directly typing 31 in February expresses a 31st-of-month rule even
  // though the first visible date clamps to 28/29. A calendar click passes
  // its actual valid day, so choosing another day still changes the rule.
  next.dayRule=next.dayRule==='last'&&selected.parts.day===end?'last':Number(requested.day);
  return {valid:true,code:'VALID',value:next};
 }else if(action?.kind==='month'){
  if(!next.preferredDate)return {valid:true,code:'VALID',value:next};
  const previous=preferredDateParts(current?next.nominalAnchor:next.preferredDate);
  if(!previous||!daysInMonth(action.year,action.month))return failure('CADENCE_DATE_INVALID');
  next.preferredDate=iso({year:Number(action.year),month:Number(action.month),day:1});
  if(current)next.nominalAnchor=next.preferredDate;
 }else return failure('CADENCE_ACTION_INVALID');
 if(!validDayRule(next.dayRule))return failure('CADENCE_DAY_RULE_INVALID');
 const parts=preferredDateParts(current?next.nominalAnchor:next.preferredDate),limit=parts&&daysInMonth(parts.year,parts.month);
 if(!limit)return failure('CADENCE_DATE_INVALID');
 next.preferredDate=iso({...parts,day:next.dayRule==='last'?limit:Math.min(next.dayRule,limit)});
 if(current)next.nominalAnchor=next.preferredDate;
 return {valid:true,code:'VALID',value:next};
}
