import {calendarForecast,demandFrequency,fixedQuantityPlan} from '../src/browser/engine.mjs';
import {fromRatio,round,exact,multiply,add,toJSON} from '../src/engine/calculation/exact.mjs';
const integer=value=>/^[1-9]\d*$/.test(String(value??''));
const days=['월','화','수','목','금','토','일'];
export function frequencyText({monthlyPlan,quantity,variable=false,min='',max=''}){
 const result=demandFrequency({monthlyPlan,quantity,...(variable?{range:{min,max}}:{})});
 if(result.status!=='VALID')return '—';
 const decimal=value=>round(fromRatio(value),{scale:1,mode:'HALF_UP'}).decimal.replace(/\.0$/,'');
 const n=result.normalized;return `월 약 ${variable?decimal(n.low)+'~'+decimal(n.high):decimal(n.average)}회`;
}
/** A nominal planning projection; never writes calendarPolicy or invents holidays. */
export function repeatVisitPlan(repeat,reference,count=''){
 if(!reference||!Number.isInteger(Number(reference.year))||!Number.isInteger(Number(reference.month))||Number(reference.year)<2000||Number(reference.year)>2100||Number(reference.month)<1||Number(reference.month)>12)return {resolved:false,message:'참조월을 확인해 주세요.'};
 const common={year:Number(reference.year),month:Number(reference.month),mode:'FIXED',quantity:'1',calendarPolicy:{kind:'UNADJUSTED'}};
 let schedule;
 if(repeat.period==='매월')schedule={kind:'MONTHLY',day:repeat.date==='말일'?'last':Number(String(repeat.date??'').replace(/일$/,''))};
 else if(!repeat.weeklyCheck){
  if(!integer(count)||!Number.isSafeInteger(Number(count))||Number(count)>366)return {resolved:false,message:'월 예상 횟수를 입력하면 회당 수량을 계산할 수 있습니다.'};
  return {resolved:true,visits:Number(count),dates:[],basis:'count',message:'입력 횟수 기준 예상 · 휴무 조정 전'};
 }else{
  const weeks=repeat.period==='매주'?1:Number.parseInt(repeat.period,10);
  const frequency=Number.parseInt(repeat.frequency,10);
  if(![1,2,3,4].includes(weeks)||!Number.isInteger(frequency))return {resolved:false,message:'주기와 횟수를 확인해 주세요.'};
  const plans=Array.from({length:weeks},(_,i)=>days.flatMap((day,d)=>repeat.weekdays?.[`${i+1}:${day}`]?[d+1]:[]));
  if(plans.some(plan=>plan.length!==frequency))return {resolved:false,message:'희망 요일을 확인해 주세요.'};
  if(weeks>1&&!reference.anchorDate)return {resolved:false,message:'주차 기준을 정하려면 시작 주를 선택해 주세요.'};
  schedule=weeks===1?{kind:'WEEKLY',weekdays:plans[0]}:{kind:'CYCLE',weekPlans:plans,anchorDate:reference.anchorDate};
 }
 const result=calendarForecast({...common,schedule});
 if(result.status!=='VALID')return {resolved:false,message:result.reasonCodes?.includes('CYCLE_MONDAY_ANCHOR_REQUIRED')?'시작 주의 월요일을 선택해 주세요.':'선택한 날짜의 예상 횟수를 확인해 주세요.',result};
 return {resolved:true,visits:result.normalized.visits,dates:result.normalized.dates,basis:'calendar',message:'참조월 달력 기준 예상 · 휴무 조정 전',result};
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
/** A total has one reference month. Other months remain separate projections. */
export function sumNominalByReference(entries){
 const groups=new Map();let invalidReference=false;
 for(const entry of entries){
  const {year,month}=entry.reference||{};
  if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12){invalidReference=true;continue;}
  const key=`${year}-${month}`;if(!groups.has(key))groups.set(key,{year,month,entries:[],values:[]});
  const group=groups.get(key);group.entries.push(entry);if(entry.value)group.values.push(entry.value);
 }
 const projected=[...groups.values()].map(group=>({year:group.year,month:group.month,siteCount:group.entries.length,resolvedCount:group.values.length,total:group.values.length?sumNominalQuantities(group.values):null}));
 const sameReference=!invalidReference&&projected.length===1;
 return {groups:projected,sameReference,total:sameReference?projected[0].total:null,complete:sameReference&&projected[0].resolvedCount===entries.length};
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
 const active=site=>({contact:site.contact,...(site.mode==='ONCE'?{quality:site.quality}:{holiday:site.holiday}),...(site.mode==='FIXED'?{repeat:site.repeat,process:site.process}:{})});
 let profile=modeState.profile;
 if(allocations.length>1&&profile!=='MIXED'){
  const reference=active(first),signature=comparable(reference),hint=allocations[0]?.q4Review?.common||{};
  const commonActive={...copy(reference),...Object.fromEntries(Object.keys(reference).filter(key=>hint[key]!==undefined).map(key=>[key,copy(hint[key])]))};
  if(sites.some(site=>comparable(active(site))!==signature)||comparable(commonActive)!==signature)profile='MIXED';
 }
 const dormantCommon=allocations[0]?.q4Review?.common||{};
 return {profile,modes:modeState.modes,sites,common:{contact:copy(first.contact),quality:first.quality,holiday:copy(first.mode==='ONCE'?dormantCommon.holiday||first.holiday:first.holiday),repeat:copy(first.mode==='FIXED'?first.repeat:dormantCommon.repeat||first.repeat),process:first.mode==='FIXED'?first.process:dormantCommon.process||first.process}};
}
