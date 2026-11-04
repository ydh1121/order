import {calendarForecast,demandFrequency,fixedQuantityPlan} from '../src/browser/engine.mjs';
import {fromRatio,exact,multiply,add,toJSON} from '../src/engine/calculation/exact.mjs';
export {orderQuantityInput,orderQuantityBounds,orderMonthContext,inspectStoredOrderQuantity} from '../src/engine/calculation/period.mjs';
const integer=value=>/^[1-9]\d*$/.test(String(value??''));
const days=['월','화','수','목','금','토','일'];
export function frequencyPresentation({monthlyPlan,quantity,variable=false,min='',max='',asOfLocalDate}){
 const result=demandFrequency({monthlyPlan,quantity,...(variable?{range:{min,max}}:{}),...(asOfLocalDate===undefined?{}:{asOfLocalDate})});
 if(result.status!=='VALID')return {valid:false,text:'—',basisText:'',result};
 const {count,kind,month}=result.normalized.representative;
 const text=kind==='DAILY'?'매일 납품':kind==='APPROX'?`월 약${BigInt(count).toLocaleString('ko-KR')}회`:`월 ${BigInt(count).toLocaleString('ko-KR')}회`;
 const basisText=month?`(${String(month.year).slice(-2)}년 ${month.month}월 기준)`:'';
 return {valid:true,text,basisText,result};
}
export function frequencyText(input){
 const {text,basisText}=frequencyPresentation(input);return basisText?`${text} ${basisText}`:text;
}
/** A nominal planning projection; never writes calendarPolicy or invents holidays. */
export function repeatVisitPlan(repeat,reference,count=''){
 if(!reference||!Number.isInteger(Number(reference.year))||!Number.isInteger(Number(reference.month))||Number(reference.year)<1||Number(reference.year)>9999||Number(reference.month)<1||Number(reference.month)>12)return {resolved:false,reason:'PROJECTION_MONTH_UNSPECIFIED',message:''};
 const common={year:Number(reference.year),month:Number(reference.month),mode:'FIXED',quantity:'1',calendarPolicy:{kind:'UNADJUSTED'}};
 let schedule;
 if(['2.0.0','2.1.0','3.0.0'].includes(repeat.cadence?.version)){
  const cadence=repeat.cadence;
  const anchor=cadence.nominalAnchor||cadence.preferredDate;
  if(cadence.kind==='INTERVAL_DAYS'){
   if(!anchor)return {resolved:false,reason:'OPTIONAL_ANCHOR_UNSELECTED',message:''};
   schedule={kind:'INTERVAL_DAYS',intervalDays:cadence.intervalDays,anchorDate:anchor};
  }else if(cadence.kind==='MONTHLY')schedule={kind:'MONTHLY',day:cadence.dayRule,shortMonthPolicy:'CLAMP',...(anchor?{anchorDate:anchor}:{})};
  else if(cadence.kind==='WEEKLY'){
   if(!repeat.weeklyCheck)return {resolved:false,reason:'WEEKDAYS_UNSELECTED',message:''};
   const selected=days.flatMap((day,d)=>repeat.weekdays?.['1:'+day]?[d+1]:[]),frequency=Number.parseInt(String(repeat.frequency).replace(/^약\s*/,''),10);
   if(selected.length!==frequency)return {resolved:false,reason:cadence.version==='3.0.0'?'PARTIAL_WEEKDAYS':'WEEKDAYS_INCOMPLETE',message:''};
   schedule={kind:'WEEKLY',weekdays:selected};
  }else return {resolved:false,reason:'CADENCE_UNSUPPORTED',message:''};
 }else if(repeat.period==='매월')schedule={kind:'MONTHLY',day:repeat.date==='말일'?'last':Number(String(repeat.date??'').replace(/일$/,''))};
 else if(!repeat.weeklyCheck){
  if(!integer(count)||!Number.isSafeInteger(Number(count))||Number(count)>366)return {resolved:false,reason:'LEGACY_COUNT_UNSPECIFIED',message:''};
  return {resolved:true,visits:Number(count),dates:[],basis:'count',message:''};
 }else{
  const weeks=repeat.period==='매주'?1:Number.parseInt(repeat.period,10);
  const frequency=Number.parseInt(String(repeat.frequency).replace(/^약\s*/,''),10);
  if(![1,2,3,4].includes(weeks)||!Number.isInteger(frequency))return {resolved:false,reason:'LEGACY_CADENCE_INVALID',message:''};
  const plans=Array.from({length:weeks},(_,i)=>days.flatMap((day,d)=>repeat.weekdays?.[`${i+1}:${day}`]?[d+1]:[]));
  if(plans.some(plan=>plan.length!==frequency))return {resolved:false,reason:'LEGACY_WEEKDAYS_INCOMPLETE',message:''};
  if(weeks>1&&!reference.anchorDate)return {resolved:false,reason:'LEGACY_ANCHOR_UNSPECIFIED',message:''};
  schedule=weeks===1?{kind:'WEEKLY',weekdays:plans[0]}:{kind:'CYCLE',weekPlans:plans,anchorDate:reference.anchorDate};
 }
 const result=calendarForecast({...common,schedule});
 if(result.status!=='VALID')return {resolved:false,reason:result.reasonCodes?.[0]||'CALENDAR_UNRESOLVED',message:'',result};
 return {resolved:true,visits:result.normalized.visits,dates:result.normalized.dates,basis:'calendar',message:'',result};
}
export function deliverySuggestion({monthlyPlan,repeat,reference,count='',variable=false,min='',max=''}){
 const visits=repeatVisitPlan(repeat,reference,count);if(!visits.resolved)return {...visits,feasible:false};
 const result=fixedQuantityPlan({monthlyPlan,visits:visits.visits,variable,...(variable?{range:{min,max}}:{})});
 return {...visits,result,feasible:result.status==='VALID'&&!!result.normalized?.feasible,distribution:result.normalized?.distribution||null,constantQuantity:result.normalized?.constantQuantity||null};
}
export function distributionText(plan,label){if(!plan?.feasible)return '—';return plan.distribution.map(row=>`${Number(row.quantity).toLocaleString('ko-KR')}${label} ${row.visits}회`).join(' + ');}
export function nominalQuantity({quantity,variable,min,max,visits}){
 if(!integer(quantity)||!Number.isSafeInteger(visits)||visits<1||variable&&(!integer(min)||!integer(max)||BigInt(min)>BigInt(max)||BigInt(quantity)<BigInt(min)||BigInt(quantity)>BigInt(max)))return null;
 return {low:toJSON(multiply(exact(variable?min:quantity),exact(visits))),high:toJSON(multiply(exact(variable?max:quantity),exact(visits)))};
}
export function sumNominalQuantities(values){return values.reduce((sum,value)=>({low:add(sum.low,fromRatio(value.low)),high:add(sum.high,fromRatio(value.high))}),{low:exact('0'),high:exact('0')});}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])])):value;
export const planningInputSignature=value=>JSON.stringify(canonical(value));
/** Restored metadata is evidence only when its original inputs still match. */
export function deliveryPlanIsCurrent(plan,{signature,monthlyPlan,unit,reference,visits,variable,range,quantity}){
 if(!plan||plan.inputSignature!==signature||plan.version!=='1.0.0'||plan.source!=='derived'||plan.reviewed!==true||plan.monthlyPlan!==monthlyPlan||plan.unit!==unit||plan.visits!==visits||planningInputSignature(plan.reference)!==planningInputSignature(reference))return false;
 if(variable?planningInputSignature(plan.range)!==planningInputSignature(range):plan.range!==undefined)return false;
 const expected=fixedQuantityPlan({monthlyPlan,visits,variable,...(variable?{range}:{})});
 if(expected.status!=='VALID'||!expected.normalized?.feasible||planningInputSignature(plan.distribution)!==planningInputSignature(expected.normalized.distribution))return false;
 return String(quantity)===String(expected.normalized.constantQuantity||expected.normalized.distribution[0]?.quantity);
}
/** Each site's nominal projection retains its own month. The total is a sum
 * of valid per-site values, never an implicit requirement to align anchors. */
export function sumNominalByReference(entries){
 const groups=new Map(),values=[];
 for(const entry of entries){
  const {year,month}=entry.reference||{},validReference=Number.isInteger(year)&&Number.isInteger(month)&&month>=1&&month<=12;
  const key=validReference?`${year}-${month}`:'unspecified';
  if(!groups.has(key))groups.set(key,{year:validReference?year:null,month:validReference?month:null,entries:[],values:[]});
  const group=groups.get(key);group.entries.push(entry);if(entry.value){group.values.push(entry.value);values.push(entry.value);}
 }
 const projected=[...groups.values()].map(group=>({year:group.year,month:group.month,siteCount:group.entries.length,resolvedCount:group.values.length,total:group.values.length?sumNominalQuantities(group.values):null}));
 return {groups:projected,sameReference:projected.length===1&&projected[0].year!==null,total:values.length?sumNominalQuantities(values):null,resolvedCount:values.length,complete:entries.length>0&&values.length===entries.length};
}
/** FLEX owns recurring closures and requests, not FIXED holiday policies. */
export function activeHolidayFields(value={},mode='FIXED'){
 const keys=mode==='FLEX'?['days','none','irregular','request']:Object.keys(value);
 return structuredClone(Object.fromEntries(keys.filter(key=>value[key]!==undefined).map(key=>[key,value[key]])));
}
/** Persisted delivery modes are authoritative; profile/draft are presentation hints. */
export function restoredDeliveryModes(allocations){
 const modes=allocations.map(allocation=>['FLEX','FIXED','ONCE'].includes(allocation.mode)?allocation.mode:'FLEX');
 if(modes.length<=1)return {profile:modes[0]||'FLEX',modes};
 const requested=allocations[0]?.q4Review?.profile;
 return {profile:modes.every(mode=>mode===modes[0])&&requested===modes[0]?modes[0]:'MIXED',modes};
}
/** Restore active persisted settings; use dormant drafts only for inactive modes. */
export function restoredDeliverySettings(allocations,{holidayFromAllocation,repeatFromAllocation}){
 const copy=value=>structuredClone(value),modeState=restoredDeliveryModes(allocations);
 const sites=allocations.map((allocation,index)=>{
  const mode=modeState.modes[index],draft=allocation.q4Review?.draft||{};
  const actual={mode,contact:Object.fromEntries(['phone','sms','kakao','email'].map(key=>[key,(allocation.advanced?.contactChannels||[]).includes(key)])),quality:!!allocation.qualityTest,holiday:holidayFromAllocation(allocation),repeat:repeatFromAllocation(allocation),process:allocation.advanced?.fixedOrderProcess==='auto'?'auto':'contact'};
  return {...actual,holiday:mode==='ONCE'?copy(draft.holiday||actual.holiday):actual.holiday,repeat:mode==='FIXED'?actual.repeat:copy(draft.repeat||actual.repeat),process:mode==='FIXED'?actual.process:draft.process||actual.process};
 });
 const first=sites[0];if(!first)return {...modeState,sites,common:null};
 const comparable=value=>{const result=copy(value);if(result?.repeat){delete result.repeat.weekOpen;delete result.repeat.legacyOriginal;}if(result?.holiday?.days)result.holiday.days.sort();return planningInputSignature(result);};
 const active=site=>({contact:site.contact,...(site.mode==='ONCE'?{quality:site.quality}:{holiday:activeHolidayFields(site.holiday,site.mode)}),...(site.mode==='FIXED'?{repeat:site.repeat}:{})});
 let profile=modeState.profile;
 if(allocations.length>1&&profile!=='MIXED'){
  const reference=active(first),signature=comparable(reference),hint=allocations[0]?.q4Review?.common||{};
  const commonActive={...copy(reference),...Object.fromEntries(Object.keys(reference).filter(key=>hint[key]!==undefined).map(key=>[key,copy(hint[key])]))};
  if(first.mode==='FLEX')commonActive.holiday=activeHolidayFields(commonActive.holiday,'FLEX');
  if(sites.some(site=>comparable(active(site))!==signature)||comparable(commonActive)!==signature)profile='MIXED';
 }
 const dormantCommon=allocations[0]?.q4Review?.common||{};
 return {profile,modes:modeState.modes,sites,common:{contact:copy(first.contact),quality:first.quality,holiday:copy(first.mode==='ONCE'?dormantCommon.holiday||first.holiday:first.holiday),repeat:copy(first.mode==='FIXED'?first.repeat:dormantCommon.repeat||first.repeat),process:first.mode==='FIXED'?first.process:dormantCommon.process||first.process}};
}
