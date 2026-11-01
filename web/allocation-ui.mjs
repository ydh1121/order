import {quantityUnit as monthlyQuantityUnit} from './quantity-contract.mjs';
export {monthlyQuantityUnit};
import {evaluateAllocation,beginAllocationEdit,editAllocation,confirmAllocation,cancelAllocation,evaluateOnceAllocation} from '../src/browser/engine.mjs';

// The UI owns display and persistence. This adapter only projects stable IDs into
// the shared exact engine and returns a private, confirmable working copy.
const clone=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
export const allocationUnitLabel=unit=>({each:'개',tray:'판',pack:'팩'}[unit]||'단위 확인');
export function allocationStateFromContext(context,{monthlyEditing=false}={}){
 const line=context?.line||{},allocations=context?.allocations||[],unit=monthlyQuantityUnit(line);
 const factors={each:'1',tray:'30'};if(/^[1-9]\d*$/.test(String(line.pack??'')))factors.pack=String(line.pack);
 return {revision:context?.revision??0,lines:[{lineId:line.id,specVersion:canonical({housing:line.housing,size:line.size,pack:line.pack,qtyUnit:unit}),total:{...(line.qtyExact||{}),raw:String(line.qty??''),unit},locationIds:allocations.map(a=>a.locationId),unitTable:{version:'order-pack-units-1:'+String(line.pack),baseUnit:'each',factors}}],locations:(context?.locations||[]).map(location=>({locationId:location.id,name:location.name})),allocations:allocations.map(a=>({lineId:line.id,locationId:a.locationId,quantity:{...(a.monthlyDemandExact||{}),raw:String(a.monthlyDemandQty??''),unit:a.monthlyDemandUnit||unit},source:a.monthlyDemandSource||'manual',mode:monthlyEditing?'FLEX':a.mode||'FLEX'})),receipts:[]};
}
function issueMessage(result){
 if(result.reasonCodes?.includes('MIXED_MODE_MONTHLY_POLICY_REQUIRED'))return '1회 납품과 월 사용량 배분을 함께 적용하는 기준을 확인해 주세요.';
 if(result.reasonCodes?.includes('MONTHLY_ALLOCATION_EXCEEDED'))return '사업장별 월 사용량 합계가 전체 월 사용량을 초과했습니다.';
 if(result.reasonCodes?.includes('MONTHLY_ALLOCATION_SHORT'))return '사업장별 월 사용량 합계를 전체 월 사용량에 맞춰 주세요.';
 if(result.reasonCodes?.some(code=>/UNIT|POLICY|RATIONAL/.test(code)))return '월 사용량의 수량과 단위를 확인해 주세요.';
 return '사업장별 월 사용량을 확인해 주세요.';
}
function withIssues(result){
 const complete=!!result.normalized?.canConfirm;
 const invalid=result.normalized?.sites?.filter(site=>!['VALID','EMPTY'].includes(site.status))||[];
 return {...result,issues:complete?[]:(invalid.length?invalid:[{locationId:null}]).map(site=>({locationId:site.locationId,fieldKey:'monthlyDemandQty',message:issueMessage(result),code:result.reasonCodes?.[0]||'MONTHLY_ALLOCATION_INCOMPLETE'}))};
}
export function inspectMonthlyAllocations(context){
 if(context?.allocations?.length&&context.allocations.every(a=>a.mode==='ONCE'))return {status:'VALID',reasonCodes:[],normalized:{notApplicable:true,canConfirm:true,projectedComplete:true},issues:[]};
 const state=allocationStateFromContext(context);
 return withIssues(evaluateAllocation({state,lineId:context?.line?.id}));
}
const rationalText=value=>!value?'미확정':value.denominator==='1'?value.numerator:value.numerator+'/'+value.denominator;
export function inspectOnceAllocations(context){
 const selected=(context?.allocations||[]).filter(a=>a.mode==='ONCE');
 if(!selected.length)return {status:'VALID',reasonCodes:[],confirmation:null,issues:[]};
 const state=allocationStateFromContext({...context,allocations:selected});
 const entries=selected.map(a=>({locationId:a.locationId,quantity:{raw:String(a.oneTimeDeliveryQty??a.qty??''),unit:a.deliveryQtyUnit||(String(context.line.pack)==='30'?'tray':'pack')}}));
 let result=evaluateOnceAllocation({state,lineId:context.line.id,entries});
 const fingerprint=result.normalized?.fingerprint;
 const confirmed=selected.every(a=>a.onceConfirmedFingerprint===fingerprint);
 const required=selected.length>1&&result.normalized?.confirmationRequired&&!confirmed;
 if(confirmed)result=evaluateOnceAllocation({state,lineId:context.line.id,entries,confirmedFingerprint:fingerprint});
 const issues=!result.normalized?selected.map(a=>({locationId:a.locationId,fieldKey:'once',message:'1회 납품 수량과 단위를 확인해 주세요.',code:result.reasonCodes?.[0]||'ONCE_QUANTITY_INVALID'})):[];
 const singleSatisfied=selected.length===1&&result.normalized;
 return {...result,...(singleSatisfied?{status:'VALID',reasonCodes:[],normalized:{...result.normalized,confirmationRequired:false,confirmationSatisfied:true,singleSitePolicyPreserved:true}}:{}),issues,confirmation:required?{lineId:context.line.id,monthly:rationalText(result.normalized.monthlyTotal),total:rationalText(result.normalized.sum),baseUnit:'each',sites:selected.map(a=>({locationId:a.locationId,qty:String(a.oneTimeDeliveryQty??a.qty??'')})),fingerprint}:null};
}
let nextTransaction=0;
export function createMonthlyAllocationDraft(context,{readCurrentContext=()=>context,transactionId='monthly-ui-'+(++nextTransaction)}={}){
 const initial=clone(context),state=allocationStateFromContext(initial,{monthlyEditing:true});
 // A single linked site explicitly reuses Q2 total in the draft. No saved value
 // changes until the normal Q4 confirmation reaches the parent's sole write.
 if(state.allocations.length===1)state.allocations[0].source='derived';
 const baseline=canonical(readCurrentContext()),opened=beginAllocationEdit(state,{lineId:initial.line.id,transactionId});
 let session=opened.session,closed=false,confirmed=null,cachedEvaluation=null;
 const apply=operation=>{if(closed||!session)return {status:'INVALID',reasonCodes:['ALLOCATION_SESSION_INVALID']};const result=editAllocation(state,session,operation);if(result.status==='VALID'){session=result.session;confirmed=null;cachedEvaluation=null;}return result;};
 const evaluate=()=>{if(!cachedEvaluation)cachedEvaluation=session?withIssues(evaluateAllocation({state,lineId:initial.line.id,draft:session})):withIssues(opened);return clone(cachedEvaluation);};
 function refresh(){if(session&&!session.entries.some(entry=>entry.quantity.composing===true))apply({type:'refreshDerived'});return evaluate();}
 function serialize(allocations=initial.allocations){
  return allocations.map(allocation=>{const entry=session?.entries.find(row=>row.locationId===allocation.locationId);if(!entry||allocation.mode==='ONCE')return clone(allocation);
   const quantity=entry.quantity;return {...clone(allocation),monthlyDemandQty:quantity.raw,monthlyDemandUnit:quantity.unit,monthlyDemandSource:entry.source,monthlyDemandExact:quantity.representation==='rational'?clone(quantity):undefined,monthlyAllocationContract:'1.1.0',monthlyAllocationDraftRevision:session.revision,monthlyAllocationComplete:false};});
 }
 function confirm({allocations=initial.allocations}={}){
  if(closed||canonical(readCurrentContext())!==baseline)return {ok:false,message:'편집 중 원본이 변경되었습니다. 다시 열어 확인해 주세요.',result:{status:'INVALID',reasonCodes:['ALLOCATION_SNAPSHOT_STALE']}};
  if(!Array.isArray(allocations)||allocations.length!==initial.allocations.length||new Set(allocations.map(a=>a.id)).size!==allocations.length||allocations.some(a=>!initial.allocations.some(saved=>saved.id===a.id&&saved.locationId===a.locationId&&saved.lineId===a.lineId)))return {ok:false,message:'사업장 연결이 변경되었습니다. 다시 열어 확인해 주세요.',result:{status:'INVALID',reasonCodes:['ALLOCATION_TARGETS_CHANGED']}};
  const payload=canonical(allocations);if(confirmed&&confirmed.payload===payload)return clone({...confirmed,idempotent:true});
  const patches=serialize(allocations),modes=patches.map(a=>a.mode||'FLEX');
  if(modes.every(mode=>mode==='ONCE'))return {ok:true,allocations:patches,result:{status:'VALID',reasonCodes:[],writes:0}};
  if(modes.some(mode=>mode==='ONCE'))return {ok:false,message:'1회 납품과 월 사용량 배분을 함께 적용하는 기준을 확인해 주세요.',result:{status:'POLICY_UNRESOLVED',reasonCodes:['MIXED_MODE_MONTHLY_POLICY_REQUIRED']}};
  const result=confirmAllocation(state,session,{expectedDraftRevision:session?.revision,acceptProposals:true});
  if(!result.committed)return {ok:false,message:issueMessage(result.evaluation||result),result};
  const committed=patches.map(allocation=>{const row=result.state.allocations.find(a=>a.locationId===allocation.locationId);return {...allocation,monthlyDemandQty:row.quantity.raw,monthlyDemandUnit:row.quantity.unit,monthlyDemandSource:row.source,monthlyDemandExact:row.quantity.representation==='rational'?clone(row.quantity):undefined,monthlyAllocationComplete:true};});
  confirmed={ok:true,allocations:committed,result,payload};return clone(confirmed);
 }
 refresh();
 return Object.freeze({evaluate,refresh,serialize,confirm,set(locationId,raw,{composing=false}={}){const entry=session?.entries.find(row=>row.locationId===locationId);const result=apply({type:'set',locationId,quantity:{raw:String(raw),unit:entry?.quantity.unit,composing,phase:'editing'}});if(result.status==='VALID'){refresh();if(String(raw)===''&&!composing)apply({type:'set',locationId,quantity:{raw:'',unit:entry?.quantity.unit,phase:'editing'}});}return evaluate();},clone(from,targets){const result=apply({type:'clone',from,targets});if(result.status==='VALID')refresh();return result;},cancel(){closed=true;return session?cancelAllocation(state,session):opened;},get rows(){return clone(session?.entries||[]);},get session(){return clone(session);},get closed(){return closed;}});
}

// Quantities stay rational strings; display never rounds a monthly obligation.
export function monthlyAllocationDisplay(result,locationId){
 const normalized=result?.normalized,row=normalized?.sites?.find(site=>site.locationId===locationId);
 return {row,remaining:rationalText(normalized?.residualBeforeSuggestions),projectedRemaining:rationalText(normalized?.projectedResidual),maximum:rationalText(row?.currentMaximum),additional:rationalText(row?.additionalCapacity),baseUnit:normalized?.baseUnit||'each',excess:rationalText(normalized?.excess),proposed:!!row?.proposal};
}
