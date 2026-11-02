// Pure calendar intent. Storage owns persistence; consumers own explicit edits.
export const CADENCE_VERSION='2.0.0';
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
 const today=seoulDate(now),years=today.month<10?[today.year]:[today.year,today.year+1];
 return {zone:'Asia/Seoul',today,years,minYear:years[0],maxYear:years.at(-1),yearLocked:years.length===1};
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
 if(value===''||value==null||typeof value==='object'&&value.day==='')return {valid:true,empty:true,code:'EMPTY',value:'',parts:null,clamped:false,message:''};
 const checked=clampPreferredDate(value);
 const fail=(code,message)=>({...checked,valid:false,empty:false,code,message});
 if(!checked.valid||checked.clamped&&!clamp)return fail('INVALID','해당 월에 존재하는 날짜를 입력해 주세요.');
 if(!edited&&savedAnchor===checked.value)return {...checked,empty:false,restored:true,message:''};
 const policy=preferredYearPolicy(now);
 if(!policy.years.includes(checked.parts.year))return fail('YEAR_RANGE','선택 가능한 연도를 확인해 주세요.');
 if(checked.value<iso(policy.today))return fail('PAST','오늘 이후의 납품 희망일을 선택해 주세요.');
 return {...checked,empty:false,restored:false,message:''};
}
export const validDayRule=value=>value==='last'||Number.isInteger(value)&&value>=1&&value<=31;
export function inspectCadence(cadence){
 const failure=code=>({valid:false,code,value:null});
 if(!cadence||typeof cadence!=='object'||Array.isArray(cadence)||cadence.version!==CADENCE_VERSION||!kinds.includes(cadence.kind))return failure('CADENCE_INVALID');
 const allowed=['version','kind','preferredDate',...(cadence.kind==='INTERVAL_DAYS'?['intervalDays']:cadence.kind==='MONTHLY'?['dayRule']:[])];
 if(Object.keys(cadence).some(key=>!allowed.includes(key))||typeof cadence.preferredDate!=='string')return failure('CADENCE_FIELDS_INVALID');
 if(cadence.kind==='INTERVAL_DAYS'&&![14,21].includes(cadence.intervalDays))return failure('CADENCE_INTERVAL_INVALID');
 if(cadence.kind==='MONTHLY'&&!validDayRule(cadence.dayRule))return failure('CADENCE_DAY_RULE_INVALID');
 if(cadence.kind==='WEEKLY'&&cadence.preferredDate!=='')return failure('CADENCE_WEEKLY_DATE_INVALID');
 if(cadence.preferredDate!==''){
  const checked=clampPreferredDate(cadence.preferredDate);
  if(!checked.valid||checked.clamped||checked.value!==cadence.preferredDate)return failure('CADENCE_DATE_INVALID');
  if(cadence.kind==='MONTHLY'){
   const limit=daysInMonth(checked.parts.year,checked.parts.month),day=cadence.dayRule==='last'?limit:Math.min(cadence.dayRule,limit);
   if(checked.parts.day!==day)return failure('CADENCE_MONTHLY_DATE_MISMATCH');
  }
 }
 return {valid:true,code:'VALID',value:clone(cadence)};
}
/** Called only by an explicit choice. Absence of cadence must remain legacy. */
export function createCadence(period,previous=null){
 const base={version:CADENCE_VERSION,preferredDate:previous?.preferredDate||''};
 if(period==='매주')return {...base,kind:'WEEKLY',preferredDate:''};
 if(period==='2주'||period==='3주')return {...base,kind:'INTERVAL_DAYS',intervalDays:period==='2주'?14:21};
 if(period==='매월')return {...base,kind:'MONTHLY',dayRule:previous?.kind==='MONTHLY'?previous.dayRule:''};
 return null;
}
/** One monthly rule plus optional selected start month, updated as one draft transaction. */
export function syncMonthlyPreferredDate(cadence,action){
 const next=clone(cadence);
 const failure=code=>({valid:false,code,value:clone(cadence)});
 if(next?.kind!=='MONTHLY'||next.version!==CADENCE_VERSION)return failure('CADENCE_MONTHLY_REQUIRED');
 if(action?.kind==='clear'){next.preferredDate='';return {valid:true,code:'VALID',value:next};}
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
  const end=daysInMonth(selected.parts.year,selected.parts.month);
  // Directly typing 31 in February expresses a 31st-of-month rule even
  // though the first visible date clamps to 28/29. A calendar click passes
  // its actual valid day, so choosing another day still changes the rule.
  next.dayRule=next.dayRule==='last'&&selected.parts.day===end?'last':Number(requested.day);
  return {valid:true,code:'VALID',value:next};
 }else if(action?.kind==='month'){
  if(!next.preferredDate)return {valid:true,code:'VALID',value:next};
  const previous=preferredDateParts(next.preferredDate);
  if(!previous||!daysInMonth(action.year,action.month))return failure('CADENCE_DATE_INVALID');
  next.preferredDate=iso({year:Number(action.year),month:Number(action.month),day:1});
 }else return failure('CADENCE_ACTION_INVALID');
 if(!validDayRule(next.dayRule))return failure('CADENCE_DAY_RULE_INVALID');
 const parts=preferredDateParts(next.preferredDate),limit=parts&&daysInMonth(parts.year,parts.month);
 if(!limit)return failure('CADENCE_DATE_INVALID');
 next.preferredDate=iso({...parts,day:next.dayRule==='last'?limit:Math.min(next.dayRule,limit)});
 return {valid:true,code:'VALID',value:next};
}
