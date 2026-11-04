/* MSG0540 approved D1R6 policy. Pure, clock-injected; ONCE does not consume it.
 * Holiday observations describe notices, not supplier availability or acceptance. */
import {KR_HOLIDAY_SNAPSHOT} from '../src/engine/reference/kr-holidays.mjs';
export function createDatePolicy(rows,coverage=KR_HOLIDAY_SNAPSHOT.coverage){
 const DAY=86400000,KST=9*3600000,holidayMap=new Map(rows.map(row=>[row.date,row]));
 const baseNotice='납품사 사정에 따라 납품일이 바뀔 수 있습니다.';
 const pad=n=>String(n).padStart(2,'0');
 const dateKey=(y,m,d)=>`${y}-${pad(m)}-${pad(d)}`;
 function validDate(key){
  if(typeof key!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(key))return false;
  const [y,m,d]=key.split('-').map(Number);if(y<1000||y>9999||m<1||m>12||d<1)return false;
  return d<=new Date(Date.UTC(y,m,0)).getUTCDate();
 }
 function utcDate(key){if(!validDate(key))return null;const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));}
 function kstParts(now){const t=now instanceof Date?now.getTime():Date.parse(now);if(!Number.isFinite(t))return null;const d=new Date(t+KST);return {date:dateKey(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate()),hour:d.getUTCHours(),minute:d.getUTCMinutes()};}
 const todayKST=now=>kstParts(now)?.date||null;
 function dateBounds(now){
  const minimum=todayKST(now);if(!minimum)return null;
  const [year,month]=minimum.split('-').map(Number),next=new Date(Date.UTC(year,month,1));
  const maximum=dateKey(next.getUTCFullYear(),next.getUTCMonth()+1,new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate());
  return {minimum,maximum,minimumMonth:minimum.slice(0,7),maximumMonth:maximum.slice(0,7)};
 }
 function normalizeDateParts(parts,now){
  const bounds=dateBounds(now),raw=['year','month','day'].map(key=>String(parts?.[key]??'').trim());
  if(!bounds)return {status:'invalid',date:null,changed:false,code:'INVALID_NOW'};
  if(raw.every(x=>x===''))return {status:'empty',date:null,changed:false,bounds};
  if(raw.some(x=>x===''))return {status:'incomplete',date:null,changed:false,bounds};
  if(raw.some(x=>!/^\d+$/.test(x))||raw.some(x=>!Number.isSafeInteger(Number(x))))return {status:'invalid',date:null,changed:false,bounds};
  const [rawYear,rawMonth,rawDay]=raw.map(Number),minYear=Number(bounds.minimum.slice(0,4)),maxYear=Number(bounds.maximum.slice(0,4));
  let result,code='UNCHANGED';
  if(rawYear<minYear){result=bounds.minimum;code='MINIMUM';}
  else if(rawYear>maxYear){result=bounds.maximum;code='MAXIMUM';}
  else{
   const month=Math.max(1,Math.min(12,rawMonth)),last=new Date(Date.UTC(rawYear,month,0)).getUTCDate(),day=Math.max(1,Math.min(last,rawDay));
   result=dateKey(rawYear,month,day);
   if(result<bounds.minimum){result=bounds.minimum;code='MINIMUM';}
   else if(result>bounds.maximum){result=bounds.maximum;code='MAXIMUM';}
   else if(month!==rawMonth||day!==rawDay)code='CALENDAR_DAY';
  }
  return {status:'valid',date:result,changed:code!=='UNCHANGED',code,bounds};
 }
 // Date drafts are normalized on every input, independently of DOM events.
 // A prefix is permitted only while at least one selectable date can complete it.
 // For example, November's month "1" can still become 11 or 12; "22" cannot.
 function normalizeDateDraft(parts,now,{final=false,editingPart=null}={}){
  const bounds=dateBounds(now),keys=['year','month','day'],raw=Object.fromEntries(keys.map(key=>[key,String(parts?.[key]??'')]));
  if(!bounds)return {status:'invalid',date:null,parts:raw,changed:false,code:'INVALID_NOW'};
  if(keys.some(key=>!/^\d*$/.test(raw[key])))return {status:'invalid',date:null,parts:raw,changed:false,code:'NON_NUMERIC',bounds};
  let candidates=[];
  for(let key=bounds.minimum;key<=bounds.maximum;key=addDays(key,1)){
   const [year,month,day]=key.split('-').map(Number);candidates.push({date:key,year,month,day});
  }
  const normalized={...raw},states={},corrections=[];
  for(const part of keys){
   const text=raw[part],width=part==='year'?4:2,values=[...new Set(candidates.map(item=>item[part]))].sort((a,b)=>a-b);
   if(text===''){states[part]='empty';continue;}
   const n=Number(text),exact=text.length<=width&&Number.isSafeInteger(n)&&values.includes(n);
   const prefix=values.filter(value=>[String(value),String(value).padStart(width,'0')].some(valueText=>valueText.startsWith(text)));
   if(exact){normalized[part]=String(n);states[part]='valid';candidates=candidates.filter(item=>item[part]===n);continue;}
   if(!final&&(!editingPart||editingPart===part)&&text.length<width&&prefix.length){states[part]='prefix';candidates=candidates.filter(item=>prefix.includes(item[part]));continue;}
   // A short impossible year such as "3" cannot become an allowed 202x year.
   // Compare its full-width lower bound so it clamps toward the correct edge.
   const comparable=part==='year'&&text.length<width?Number(text.padEnd(width,'0')):n;
   const corrected=comparable<=values[0]?values[0]:comparable>=values.at(-1)?values.at(-1):values.reduce((best,value)=>Math.abs(value-comparable)<Math.abs(best-comparable)?value:best,values[0]);
   normalized[part]=String(corrected);states[part]='valid';corrections.push({part,from:text,to:String(corrected),code:comparable<values[0]?'MINIMUM':'MAXIMUM'});candidates=candidates.filter(item=>item[part]===corrected);
  }
  const complete=keys.every(key=>states[key]==='valid'),date=complete?dateKey(Number(normalized.year),Number(normalized.month),Number(normalized.day)):null;
  return {status:complete?'valid':keys.every(key=>raw[key]==='')?'empty':'incomplete',date,parts:normalized,states,changed:keys.some(key=>normalized[key]!==raw[key]),code:corrections[0]?.code||'UNCHANGED',corrections,bounds};
 }
 function addDays(key,days){const d=utcDate(key);if(!d||!Number.isInteger(days))return null;d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
 function daysBetween(a,b){const x=utcDate(a),y=utcDate(b);return x&&y?Math.round((y-x)/DAY):NaN;}
 function dayInfo(key){const d=utcDate(key);if(!d)return {valid:false,weekday:null,holiday:null,covered:false};return {valid:true,weekday:d.getUTCDay(),holiday:holidayMap.get(key)||null,covered:coverage.includes(d.getUTCFullYear())};}
 function isUnavailable(key,items){return (items||[]).some(x=>typeof x==='string'?x===key:x&&x.date===key&&x.available!==true);}
 function evaluateDate({date,now,unavailable=[],serviceKind='undecided'}={}){
  const k=kstParts(now),info=dayInfo(date);if(!k||!info.valid)return {selectable:false,code:'INVALID_DATE',codes:['INVALID_DATE'],messages:['날짜를 다시 선택해 주세요.'],notice:baseNotice,daysAhead:null,today:k?.date||null};
  const bounds=dateBounds(now),daysAhead=daysBetween(k.date,date),base={daysAhead,today:k.date,weekday:info.weekday,holiday:info.holiday,covered:info.covered,notice:baseNotice,bounds};
  if(daysAhead<0)return {...base,selectable:false,code:'PAST',codes:['PAST'],messages:['오늘 이후 날짜를 선택해 주세요.']};
  if(date>bounds.maximum)return {...base,selectable:false,code:'AFTER_RANGE',codes:['AFTER_RANGE'],messages:['다음 달 말일까지 선택할 수 있습니다.']};
  if(isUnavailable(date,unavailable))return {...base,selectable:false,code:'PROVIDER_UNAVAILABLE',codes:['PROVIDER_UNAVAILABLE'],messages:['납품사가 지정한 휴무일입니다.']};
  const messages=[],codes=[];
  if(daysAhead===0){codes.push(k.hour<12?'SAME_DAY_MORNING':'SAME_DAY_AFTERNOON');messages.push(k.hour<12?'당일 납품은 납품사 확인이 필요합니다.':'당일 납품은 시간이 촉박해 어려울 수 있습니다.');}
  else if(daysAhead===1){codes.push('NEXT_DAY');messages.push('내일 납품은 준비 일정 확인이 필요합니다.');}
  else if(daysAhead<=3){codes.push('NEAR_TERM');messages.push('납품일까지 여유가 짧아 일정 확인이 필요합니다.');}
  if(info.holiday){
   const name=info.holiday.name;
   if(date.endsWith('-01-01')){codes.push('NEW_YEAR');messages.push('신정에는 납품이 쉬거나 늦어질 수 있습니다.');}
   else if(/설날|설 연휴/.test(name)){codes.push('SEOLLAL');messages.push('설 연휴에는 납품이 쉬거나 늦어질 수 있습니다.');}
   else if(/추석/.test(name)){codes.push('CHUSEOK');messages.push('추석 연휴에는 납품이 쉬거나 늦어질 수 있습니다.');}
   else {codes.push('PUBLIC_HOLIDAY');messages.push('공휴일 납품은 납품사 일정 확인이 필요합니다.');}
  }else if(info.weekday===0){codes.push('SUNDAY');messages.push('일요일 납품은 납품사 일정 확인이 필요합니다.');}
  else if(info.weekday===6){codes.push('SATURDAY');messages.push('토요일 납품은 납품사 일정 확인이 필요합니다.');}
  if(serviceKind==='parcel'&&date.endsWith('-08-14')){codes.push('PARCEL_REST_DAY');messages.push('택배 이용 시 휴무 일정을 확인해 주세요.');}
  if(!info.covered){codes.push('HOLIDAY_DATA_OUTSIDE_SNAPSHOT');messages.push('해당 연도 휴일 일정은 추가 확인이 필요합니다.');}
  return {...base,selectable:true,code:codes[0]||'ORDINARY',codes,messages:!info.covered&&messages.length>2?[messages[0],messages.at(-1)]:messages.slice(0,2)};
 }
 function nearestMonthly(dayRule,now,{unavailable=[]}={}){
  const today=todayKST(now);if(!today)return null;const isLast=dayRule==='last';const day=isLast?31:Number(dayRule);if(!Number.isInteger(day)||day<1||day>31)return null;
  const [y,m]=today.split('-').map(Number);
  for(let i=0;i<2;i++){const cursor=new Date(Date.UTC(y,m-1+i,1)),year=cursor.getUTCFullYear(),month=cursor.getUTCMonth()+1,last=new Date(Date.UTC(year,month,0)).getUTCDate(),candidate=dateKey(year,month,isLast?last:Math.min(day,last));if(candidate>=today)return candidate;}
  return null;
 }
 /** The v3 editor, durable completion projection and final gate consume one
  * judgment. Validation never writes a date back to a restored allocation. */
 function validateApprovedStart(cadence,now,{unavailable=[]}={}){
  if(cadence?.version!=='3.0.0')return {valid:true,empty:!cadence?.preferredDate,code:'NOT_APPLICABLE',message:'',value:cadence?.preferredDate||'',derived:false};
  if(cadence.kind==='CONSULT')return {valid:true,empty:true,code:'CONSULT',message:'',value:'',derived:false};
  const monthly=cadence.kind==='MONTHLY';
  if(!monthly&&cadence.kind!=='WEEKLY'&&!(cadence.kind==='INTERVAL_DAYS'&&cadence.intervalDays===14))return {valid:false,empty:false,code:'CADENCE_INVALID',message:'주문 주기를 확인해 주세요.',value:'',derived:false};
  const value=monthly?nearestMonthly(cadence.dayRule,now)||'':cadence.preferredDate||'';
  if(!value)return {valid:false,empty:true,code:monthly?'DAY_RULE_REQUIRED':'START_DATE_REQUIRED',message:monthly?'희망 납품일을 선택해 주세요.':'시작 예상일을 선택해 주세요.',value:'',derived:monthly};
  const evaluation=evaluateDate({date:value,now,unavailable});
  return {valid:evaluation.selectable,empty:false,code:evaluation.selectable?'VALID':evaluation.code,message:evaluation.selectable?'':'시작 예상일을 다시 선택해 주세요.',value,derived:monthly,evaluation};
 }
 function formatDate(key){if(!validDate(key))return '—';const [y,m,d]=key.split('-').map(Number);return `${y}년 ${m}월 ${d}일`;}
 return {version:'ORDER-DATE-D1R6-20261105',baseNotice,validDate,dateKey,utcDate,kstParts,todayKST,dateBounds,normalizeDateParts,normalizeDateDraft,addDays,daysBetween,dayInfo,evaluateDate,nearestMonthly,validateApprovedStart,formatDate};
}
const policy=createDatePolicy(KR_HOLIDAY_SNAPSHOT.records.filter(row=>row.isHoliday).map(row=>({...row,kind:row.type})));
export const {version,baseNotice,validDate,dateKey,utcDate,kstParts,todayKST,dateBounds,normalizeDateParts,normalizeDateDraft,addDays,daysBetween,dayInfo,evaluateDate,nearestMonthly,validateApprovedStart,formatDate}=policy;
export const holidayVersion=KR_HOLIDAY_SNAPSHOT.version;
export default policy;
