/** Pure allocation verdicts shared by editor, body badges, restore and final gate. */
import {inspectStoredOrderQuantity} from './q4-planning.mjs';
import {monthlyPlanSnapshot} from './quantity-contract.mjs';
import {inspectMonthlyAllocations,inspectOnceAllocations} from './allocation-ui.mjs';
import {inspectStartDate,holidayPolicyFromSelection,seoulDate} from './cadence-contract.mjs';
import {validateApprovedStart} from './order-date.mjs';
import {inspectOneTimeDate} from './q4-date.mjs';

export function q4Issue(a,key,message){return {issueId:`q4:${a.lineId}:${a.locationId}:${key}`,stage:'q4',field:`${a.id}:${key}`,fieldKey:key,lineId:a.lineId,siteId:a.locationId,code:'BLOCK_REQUIRED',errorCode:'BLOCK_REQUIRED',severity:'error',blocking:true,message,humanMessage:message};}
export function quantityBoundIssue(a,line){
 if(a.mode==='ONCE'||!line)return null;const plan=monthlyPlanSnapshot(line,a);if(plan.status!=='VALID')return null;
 const result=inspectStoredOrderQuantity({mode:a.mode,monthlyPlan:plan.qty,quantity:String(a.qty??''),...(a.q4Review?.asOfLocalDate!==undefined?{asOfLocalDate:a.q4Review.asOfLocalDate}:{})});
 return result.valid?null:q4Issue(a,'qty',result.reason==='ORDER_QUANTITY_MAXIMUM'?'회당 예상 주문 수량은 월 주문 수량 이하여야 합니다.':'회당 예상 주문 수량을 확인해 주세요.');
}
export function inspectQ4Allocation(a,{all=[],line=null,repeatContract,now=new Date()}={}){

 if(a.q4Review?.version!=='0460')return null;
 const z=[],put=(k,m)=>z.push(q4Issue(a,k,m)),num=v=>/^[1-9]\d{0,11}$/.test(String(v??''));
 if(!a.modeExplicit||!['FLEX','FIXED','ONCE'].includes(a.mode))put('mode','주문 방식을 선택해 주세요.');
 if(!a.advanced?.contactChannels?.length)put('contact','연락 수단을 하나 이상 선택해 주세요.');
 if(!num(a.qty))put('qty',a.mode==='ONCE'?'1회 주문량을 입력해 주세요.':'회당 예상 주문 수량을 입력해 주세요.');else{const bound=quantityBoundIssue(a,line);if(bound)z.push(bound);}
 if(a.mode==='ONCE'){const result=inspectOneTimeDate(a.q4Review?.deliveryDate,now);if(!result.valid)put('desired-date',result.message);}
 if(a.mode!=='ONCE'){
  // Monthly quantities and explicit units are validated once by the shared allocation contract.
  if(a.variableQty){if(!num(a.qtyMin))put('min','최소 수량을 입력해 주세요.');if(!num(a.qtyMax))put('max','최대 수량을 입력해 주세요.');
   if(num(a.qtyMin)&&num(a.qtyMax)&&+a.qtyMin>+a.qtyMax)put('min','최소 수량이 최대 수량을 초과합니다.');
   if(num(a.qty)&&num(a.qtyMin)&&+a.qty<+a.qtyMin)put('qty','회당 수량이 최소 수량보다 작습니다.');
   if(num(a.qty)&&num(a.qtyMax)&&+a.qty>+a.qtyMax)put('qty','회당 수량이 최대 수량보다 큽니다.');}
  const h=a.q4Review.activeHoliday;if(!h||!(h.days?.length||h.none||h.irregular))put('holiday-days','매장 정기 휴무일 또는 없음·일정하지 않음을 선택해 주세요.');
  if(a.mode==='FIXED'&&(!h||['','선택 안 함',null,undefined].includes(h.conflict)))put('holiday-conflict','휴무일 납품 충돌 시 대응을 선택해 주세요.');
 }
  if(a.mode==='FIXED'){
   const r=repeatContract.fromAllocation(a),contract=repeatContract.inspect(r);if(!contract.valid){if(contract.issue.kind==='weekdays'){for(const week of contract.week.filter(w=>!w.complete))put('weekdays-'+week.number,week.number+'주차 희망요일 개수를 확인해 주세요.');}else put(contract.issue.kind,contract.issue.message);}
   else if(r.semantics==='per-week-v1'){const expected=repeatContract.serialize(r).value;for(const key of ['intervalWeeks','frequencyPerWeek','freq','cycleCount','monthDay','scheduleDetail','weekPlans'])if(JSON.stringify(a[key])!==JSON.stringify(expected[key])){put('repeat-contract','반복 횟수와 저장된 주차 계획이 일치하지 않습니다. 다시 저장해 주세요.');break;}}
   if(contract.valid&&a.cadence?.version==='3.0.0'){
    const start=validateApprovedStart(a.cadence,now);
    if(!start.valid)put('repeat-preferred',start.message);
   }
   if(contract.valid&&a.cadence?.preferredDate&&a.cadence.version!=='3.0.0'){
    const today=seoulDate(now),asOfLocalDate=`${today.year}-${String(today.month).padStart(2,'0')}-${String(today.day).padStart(2,'0')}`;
    const start=inspectStartDate(a.cadence.preferredDate,{asOfLocalDate,cadence:a.cadence,lifecycle:a.q4Review?.startDateReview?.lifecycle||'LEGACY',savedAnchor:a.cadence.preferredDate,edited:false,adjust:false,holidayPolicy:holidayPolicyFromSelection(a.q4Review?.activeHoliday||a.advanced)});
    if(!start.valid)put('repeat-preferred',start.message);
   }
  }

 return z;
}
export function monthlyIssues(source,line,allocations){
 const result=inspectMonthlyAllocations({line,allocations,locations:source.locations,revision:source.allocationRevision||0});
 return (result.issues||[]).map(issue=>{const allocation=allocations.find(a=>a.locationId===issue.locationId);const owner=allocation?q4Issue(allocation,'monthly',issue.message):{...q4Issue({id:'line:'+line.id,lineId:line.id,locationId:null},'monthly',issue.message),issueId:`q4:${line.id}:monthly`};return {...owner,code:issue.code,errorCode:issue.code};});
}

export function inspectQ4Groups(source,allocations=source.allocations,confirmedFingerprint=null){
 const issues=[],confirmations=[];
 for(const line of source.lines){
  const linked=allocations.filter(a=>a.lineId===line.id);if(!linked.length)continue;
  issues.push(...monthlyIssues(source,line,linked));
  const once=inspectOnceAllocations({line,allocations:linked,locations:source.locations,revision:source.allocationRevision||0});
  for(const issue of once.issues||[]){const a=linked.find(a=>a.locationId===issue.locationId)||linked[0];issues.push({...q4Issue(a,'once',issue.message),code:issue.code});}
  if(once.confirmation&&once.confirmation.fingerprint!==confirmedFingerprint)confirmations.push({...once.confirmation,stage:'q4',code:'ONCE_AT_LEAST_MONTH',sites:once.confirmation.sites.map(site=>({...site,name:source.locations.find(l=>l.id===site.locationId)?.name||'사업장'}))});
 }
 return {issues,confirmations};
}
