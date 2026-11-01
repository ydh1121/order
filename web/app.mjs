import {createBrowserStorage,projectStoredPayload} from './storage.mjs';
import {calendarForecast} from '../src/engine/calculation/calendar-forecast.mjs';
import {compare,fromRatio,multiply} from '../src/engine/calculation/exact.mjs';
import {quantityUnit,quantityDisplayUnit,quantityInputText,quantityDisplayNote,numericInput,moneyDisplay,quantityLabel,validMonthlyQuantity,monthlyQuantityText,convertMonthlyUnit,currentPurchaseCost,totalPurchaseCost,exactDisplay,baseQuantity,quantityFactor} from './quantity-contract.mjs';
import {inspectMonthlyAllocations,inspectOnceAllocations} from './allocation-ui.mjs';
import {CODE1_UI,CODE1_ORDER_VALIDATION,CODE1_ORDER_ERRORS} from './common-ui.mjs';
import {addressFields,addressStatus,addressLines} from './address-contract.mjs';
import {createAddressEditor} from './address-ui.mjs';
(()=>{'use strict';
const $=id=>document.getElementById(id),w=n=>moneyDisplay(n)+'원';const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const valid=n=>/^[1-9]\d*$/.test(String(n))&&Number.isSafeInteger(+n); const sum=(a,b)=>{let n=Number(a)*Number(b);return Number.isSafeInteger(n)&&n>=0?n:null};const DAYS=['월','화','수','목','금','토','일'];const H=['1','2','3','4'],SZ=['왕란','특란','대란','중란','소란'],PK=['10','20','30'];const unit=x=>String(x)==='30'?'판':'팩';const selected=l=>l?.housing&&l?.size&&l?.pack;const sku=l=>selected(l)?`${l.housing}번 · ${l.size} · ${l.pack}구`:'';
const empty=()=>({id:'sku-'+(crypto.randomUUID?.()||Math.random().toString(36).slice(2)),housing:'',size:'',pack:'',qty:'',price:''});
const blank=()=>({lines:[],current:null,locations:[],allocations:[],stage:'home',open:'q1'});
let S=blank(),editing=empty(),addingSku=false,editorMode='initial';
// Q2 secondary add action returns focus to the new product's Q2 input after save.
let q2AddOrigin=false;
let skuConfirmationPending=false,skuDialogReturnFocus=null,skuDialogReturnSelector=null,skuDialogScrollY=0,skuRestoreCurrent=null;
let pendingSkuDelete=null,skuEditSnapshot=null;
function showQ1Modal(dialog){
 const restore=dialog.id==='sku-dialog'?()=>skuDialogReturnFocus?.isConnected?skuDialogReturnFocus:skuDialogReturnSelector?document.querySelector(skuDialogReturnSelector):null:document.activeElement;
 return window.OrderModalShell.open(dialog,{variant:'compact',returnFocus:restore});
}
function hideQ1Modal(dialog,complete){window.OrderModalShell.close(dialog,{after:complete});}
function syncQ1ModalScrollLock(){window.OrderModalShell.sync();}
const showComma=n=>{const raw=numericInput(n);return raw===null?String(n??''):raw.replace(/\B(?=(\d{3})+(?!\d))/g,',');};
// v0.15R2 independent delivery domain: quote lines are purchasing items;
// allocations are separate logistics destinations (do not multiply buyer qty).
const ident=(prefix)=>`${prefix}-${crypto.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)}`;
const blankSite=()=>({id:ident('loc'),name:'',...addressFields(),status:'NONE',contactPhone:'',email:'',storePhone:'',addressState:'EMPTY',basicInfoDraft:true});
const blankAllocation=(lineId,locationId)=>({id:ident('alloc'),lineId,locationId,qty:'',mode:'FLEX',modeExplicit:false,freq:1,days:[],intervalWeeks:1,cycleCount:1,scheduleDetail:'count',weekPlans:[],qtySource:'auto',suggestedQty:null,variableQty:false,qtyMin:'',qtyMax:'',qualityTest:false,advanced:{contactChannels:['phone','sms','kakao'],orderProcess:'store',storeOffDays:[],memo:'',flexOrderProcess:'store',fixedOrderProcess:'seller',weekend:'ask',holiday:'ask',substituteHoliday:'ask',storeOffPolicy:'ask'}});
const locationById=id=>S.locations.find(l=>l.id===id);
const allocationById=id=>S.allocations.find(a=>a.id===id);
const siteName=loc=>loc?.name||loc?.road||'사업장';
const deliveryLabel=a=>a.mode==='FIXED'?(()=>{const r=OrderRepeatContract.fromAllocation(a);return r.period==='매월'?'정기 납품 · 매월 '+(OrderRepeatContract.monthValue(r.date).valid?OrderRepeatContract.monthValue(r.date).display:'날짜 미입력'):'정기 납품 · '+r.period+' · 매주 '+r.frequency+(r.legacyReviewRequired?' (횟수 재확인)':'');})():a.mode==='ONCE'?'1회 납품':'소진 시 주문';

// Q3 completeness means every SKU has an assigned, valid site; not merely 1 allocation.
const addressComplete=()=>S.locations.length>0&&S.locations.every(siteValid);
const allocationValid=a=>{
 if(!lineById(a.lineId)||!locationById(a.locationId)||!siteValid(locationById(a.locationId)))return false;
 if(a.q4Review?.version==='0460')return q4ReviewAllocationIssues(a).length===0;
 if(!lineById(a.lineId)||!locationById(a.locationId)||!['FLEX','FIXED','ONCE'].includes(a.mode))return false;
 // Q4-60: base per-delivery quantity is required even when a valid variable range exists.
 if(a.mode==='ONCE'&&S.allocations.filter(x=>x.lineId===a.lineId).length>=2)return S.allocations.filter(x=>x.lineId===a.lineId).every(x=>q4ValidAmount(x.oneTimeDeliveryQty));
 if(!q4ValidAmount(a.qty))return false;
 if(a.mode!=='ONCE'&&a.variableQty){if(!q4ValidAmount(a.qtyMin)||!q4ValidAmount(a.qtyMax)||Number(a.qtyMin)>Number(a.qtyMax))return false;}
 else if(!valid(a.qty))return false;
 if(a.mode!=='FIXED')return true;
  return OrderRepeatContract.inspect(OrderRepeatContract.fromAllocation(a)).valid;
};
const siteValid=site=>window.OrderSiteContract.valid(site);
const deliveryComplete=()=>addressComplete()&&S.allocations.length>0&&!orderVerdict('full').fieldErrors.some(e=>e.stage==='q4');
const shippingRows=()=>S.lines.flatMap(l=>S.allocations.filter(a=>a.lineId===l.id).map(a=>({line:l,allocation:a,site:locationById(a.locationId)})));
function ensureMigration(data){
 const d=blank();d.lines=(data.lines||[]).map((l,i)=>({...l,id:String(l.id||ident('legacy')),qty:String(l.qty||''),qtyUnit:l.qtyUnit||(String(l.pack)==='30'?'tray':'pack'),price:String(l.price||'')}));
 d.locations=Array.isArray(data.locations)?data.locations:[];d.allocations=Array.isArray(data.allocations)?data.allocations:[];
 if(!d.locations.length&&data.address?.road){const l={...blankSite(),...data.address,name:'기본 사업장'};d.locations.push(l);d.allocations=d.lines.map(x=>({...blankAllocation(x.id,l.id),qty:String(x.drop||''),mode:data.delivery?.mode||'FLEX',freq:Number(data.delivery?.freq)||1,days:data.delivery?.days||[]}));}
 d.locations=d.locations.filter(x=>x&&x.id);d.allocations=d.allocations.filter(a=>a&&d.lines.some(l=>l.id===a.lineId)&&d.locations.some(loc=>loc.id===a.locationId));
 d.allocationRevision=Number.isSafeInteger(data.allocationRevision)&&data.allocationRevision>=0?data.allocationRevision:0;d.current=data.current||null;d.open=data.open??'q1';return d;
}

// Visible allocation mapping is derived, never stored as a separate source of truth.
function siteAssignmentSummary(){
 return S.lines.map(l=>`${itemIdentity(l)} → ${S.allocations.filter(a=>a.lineId===l.id).map(a=>siteName(locationById(a.locationId))).join('·')||'납품지 미지정'}`).join('\n');
}

// One durable owner; screen navigation never writes product data.
const storage=createBrowserStorage(),storageHydration=storage.load();
let storageRevision=null,storageToken=null,storageReady=false,storagePending=0,storageFailure=null;
let storageEpoch=0,uncertainWrite=null;
let storageTail=Promise.resolve(),lastCommitted=structuredClone(S),inlineDraft=false,storageMessage='';
$('app').inert=true;
const storageText=result=>result.uncertain?'저장 결과를 확인하지 못했습니다. 다시 저장하거나 새로고침 후 확인해 주세요.':result.status==='CONFLICT'?'다른 탭에서 입력이 변경되었습니다. 새로고침 후 다시 확인해 주세요.':result.status==='CORRUPT'||result.status==='UNSUPPORTED'?'저장된 입력을 불러올 수 없습니다. 입력을 초기화한 후 다시 시도해 주세요.':'입력을 저장하지 못했습니다. 다시 시도해 주세요.';
function storageFeedback(result,id='form-error'){
 if(result.status==='CANCELLED')return;
 const node=$(id)||$('form-error');storageMessage=storageText(result);node.textContent=storageMessage;node.hidden=false;node.classList.remove('ui-feedback-sr');node.setAttribute('role','alert');
 $('retry-input-save').hidden=!inlineDraft||result.status==='CONFLICT';
}
function storagePaint(){document.documentElement.dataset.storagePending=String(storagePending>0);if(storageReady)refreshCompletionBadges();}
function save(candidate=S,{publish=true,canCommit=()=>true,errorId='form-error',transactionId=ident('save')}={}){
 const snapshot=structuredClone(candidate),epoch=storageEpoch,allowed=()=>epoch===storageEpoch&&canCommit();storagePending++;storagePaint();
 const run=async()=>{
  if(!allowed())return {ok:false,status:'CANCELLED'};
  snapshot.allocationRevision=(lastCommitted.allocationRevision||0)+1;
  let result,fingerprint;
  try{fingerprint=JSON.stringify(projectStoredPayload(snapshot));if(uncertainWrite?.fingerprint===fingerprint)transactionId=uncertainWrite.transactionId;result=await storage.commit(snapshot,{expectedRevision:storageRevision,expectedToken:storageToken,transactionId,canCommit:allowed});}
  catch{result={ok:false,status:'WRITE_FAILED'};}
  document.documentElement.dataset.storageStatus=result.status;
  if(result.ok){storageRevision=result.revision;storageToken=result.versionToken;lastCommitted=structuredClone(result.data);
   if(publish)S={...snapshot,allocationRevision:result.data.allocationRevision};else S.allocationRevision=result.data.allocationRevision;
   uncertainWrite=null;storageFailure=null;if($('form-error').textContent===storageMessage)err('form-error','');$('retry-input-save').hidden=true;
   window.OrderEmailLifecycle?.reconcile();
  }else if(result.status!=='CANCELLED'){
   if(result.uncertain)uncertainWrite={fingerprint,transactionId};
   // A failed popup remains a draft. Cancelling it restores the prior confirmed state.
   if(!publish||result.uncertain||['CONFLICT','CORRUPT','UNSUPPORTED','UNAVAILABLE'].includes(result.status))storageFailure=result;
   storageFeedback(result,errorId);if(storageFailure===result&&errorId!=='form-error')storageFeedback(result);
  }
  return result;
 };
 const result=storageTail.then(run,run);storageTail=result.catch(()=>{});
 return result.finally(()=>{storagePending--;if(!storagePending&&!storageFailure)inlineDraft=false;storagePaint();});
}
// Explicit reset is a revisioned tombstone, never removeItem plus legacy fallback.
let resetAttempt=null;
$('retry-input-save').onclick=()=>{if(inlineDraft&&!storagePending)void save(S,{publish:false});};
const resetDialog=$('reset-input-confirm');
function cancelReset(){if(resetAttempt)resetAttempt.cancelled=true;OrderModalShell.close(resetDialog);}
$('reset-input').onclick=()=>{
 if(!storageReady||siteEditing||skuDraftActive()||deliveryDraft||q4AssignmentDraft||document.querySelector('dialog[open]'))return;
 resetAttempt=null;err('reset-input-error','');OrderModalShell.open(resetDialog,{variant:'compact',returnFocus:$('reset-input'),initialFocus:()=>resetDialog.querySelector('[data-reset-cancel]')});
};
resetDialog.querySelector('[data-reset-cancel]').onclick=cancelReset;OrderModalShell.bind(resetDialog,cancelReset);
resetDialog.querySelector('[data-reset-confirm]').onclick=async()=>{
 if(resetAttempt?.pending)return;const attempt={pending:true,cancelled:false,transactionId:resetAttempt?.transactionId||ident('reset')};resetAttempt=attempt;storageEpoch++;storagePending++;storagePaint();
 const run=async()=>{let result;try{result=await storage.reset({expectedRevision:storageRevision,expectedToken:storageToken,transactionId:attempt.transactionId,canCommit:()=>resetAttempt===attempt&&!attempt.cancelled&&resetDialog.open&&!resetDialog.classList.contains('is-closing')});}catch{result={ok:false,status:'WRITE_FAILED'};}
  document.documentElement.dataset.storageStatus=result.status;
  if(result.ok){storageRevision=result.revision;storageToken=result.versionToken;S=blank();lastCommitted=structuredClone(S);editing=empty();editorMode='initial';addingSku=false;inlineDraft=false;uncertainWrite=null;storageFailure=null;err('form-error','');$('retry-input-save').hidden=true;OrderEmailLifecycle.reconcile();OrderModalShell.close(resetDialog,{after:()=>render()});}
  else if(result.status!=='CANCELLED'){if(result.uncertain||['CONFLICT','CORRUPT','UNSUPPORTED','UNAVAILABLE'].includes(result.status))storageFailure=result;storageFeedback(result,'reset-input-error');}return result;
 };
 const result=storageTail.then(run,run);storageTail=result.catch(()=>{});await result;attempt.pending=false;storagePending--;storagePaint();
};
let current='home';
// Field-owned error state, never animate or paint the entire accordion/dialog.
function legacyErrorState(id,message){
 const candidates=id==='err-q1'?[...document.querySelectorAll('#sku-editor .picks')]:id==='err-q2'?[...document.querySelectorAll('#q2-lines input')]:id==='err-q3'?[...document.querySelectorAll('#site-editor input:not([type=hidden]),#q3-address-slot')]:[];
 for(const target of candidates){
  for(const control of [target,...target.querySelectorAll('[data-pick]')]){control.removeAttribute('aria-invalid');control.removeAttribute('aria-describedby');control.classList.remove('legacy-error-shake');}
  if(id==='err-q1')target.previousElementSibling?.removeAttribute('data-order-invalid');
 }
 if(!message)return;
 let invalid=[];
 if(id==='err-q1'&&message.includes('난각번호'))invalid=[!editing.housing?$('picks-housing'):null,!editing.size?$('picks-size'):null,!editing.pack?$('picks-pack'):null].filter(Boolean);
 if(id==='err-q2')invalid=S.lines.flatMap(l=>[!validMonthlyQuantity(l)?document.getElementById('qty-'+l.id):null,!valid(l.price)?document.getElementById('price-'+l.id):null]).filter(Boolean);
 if(id==='err-q3'&&siteEditing){invalid=OrderSiteContract.issues(siteEditing).filter(i=>!OrderSiteContract.isAwaiting(i)).map(i=>$(q3FieldId(i.key))).filter(Boolean);}
 for(const target of invalid){
  if(!target||target.closest('[hidden]'))continue;
  target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby',id);
  const controls=id==='err-q1'?[...target.querySelectorAll('[data-pick]')]:[target];
  if(id==='err-q1')target.previousElementSibling?.setAttribute('data-order-invalid','true');
  for(const control of controls){control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',id);if(!matchMedia('(prefers-reduced-motion: reduce)').matches){control.classList.remove('legacy-error-shake');void control.offsetWidth;control.classList.add('legacy-error-shake');control.addEventListener('animationend',()=>control.classList.remove('legacy-error-shake'),{once:true});}}
 }
}
const err=(id,message)=>{const node=$(id);if(!node)return;node.textContent=message||'';node.hidden=!message;legacyErrorState(id,message)};
const lineById=id=>S.lines.find(x=>String(x.id)===String(id));
const orderVerdict=(scope='full',target=null,confirmation=null)=>q4ReviewVerdict(S,confirmation);
const buyerTotal=()=>totalPurchaseCost(S.lines);

let pageSeq=0;
// MSG0478: a single sequential, opacity-only page transition owner.
let routeAnimation=null;
function show(page,record=true){
 if(page!==current&&!guardPendingEdits('page'))return false;
 if(page==='result'&&!complete()){page='form';err('form-error','구매조건을 먼저 모두 입력해 주세요.');}
 const prior=current,previous=$('page-'+prior),dest=$('page-'+page);
 const seq=++pageSeq,ready=prior!==page&&page!=='qa'&&prior!=='qa';
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 routeAnimation?.cancel();routeAnimation=null;
 const cleanup=node=>{node.classList.remove('active','leaving','entering');node.inert=true;node.setAttribute('aria-hidden','true');node.style.opacity='';};
 for(const p of ['home','form','result']){const n=$('page-'+p);if(n!==previous&&n!==dest)cleanup(n);}
 current=page;$('app').hidden=page==='qa';if($('qa-route'))$('qa-route').hidden=page!=='qa';
 if(page==='result'){if(prior!==page)$('result-details').open=false;renderResult();}
 if(page==='form')render();
 const showDestination=()=>{if(seq!==pageSeq)return;
  if(previous&&previous!==dest)cleanup(previous);
  dest.classList.add('active');dest.classList.remove('leaving');dest.inert=false;dest.removeAttribute('aria-hidden');dest.style.opacity='';
  if(!ready||reduce){dest.classList.remove('entering');return;}
  dest.classList.add('entering');routeAnimation=dest.animate([{opacity:0},{opacity:1}],{duration:135,easing:'ease-out'});
  const mine=routeAnimation;mine.finished.then(()=>{if(seq===pageSeq&&routeAnimation===mine){dest.classList.remove('entering');routeAnimation=null;}},()=>{});
 };
 if(ready&&!reduce){previous.classList.add('leaving');previous.inert=true;previous.setAttribute('aria-hidden','true');
  routeAnimation=previous.animate([{opacity:1},{opacity:0}],{duration:90,easing:'ease-in'});
  const mine=routeAnimation;mine.finished.then(()=>{if(seq===pageSeq&&routeAnimation===mine){routeAnimation=null;showDestination();}},()=>{});
 }else showDestination();
 if(record&&location.hash!==`#/${page}`)history.pushState({},'',`#/${page}`);
 window.scrollTo({top:0,behavior:'instant'});return true;
}
function skuDraftActive(){return editorMode==='edit'||editorMode==='new'}
function complete(){const v=orderVerdict('full');return !storagePending&&!storageFailure&&!inlineDraft&&v.valid&&!v.confirmations.length&&!skuDraftActive()&&!siteFocusDirty()&&!siteEditingDirty()&&!q4DraftActive()}
function changeOpen(target,persist=true){if(target!==S.open&&!guardPendingEdits('step'))return false;S.open=target;render();return true;}
function pickGroup(id,field,values){
 const widths={'왕란':24,'특란':22,'대란':20,'중란':18,'소란':16};
 $(id).innerHTML=values.map(t=>{
  const egg=field==='size'?`<span class="q1-egg-space" aria-hidden="true"><svg class="q1-egg" style="--egg-width:${widths[t]}px" viewBox="0 0 30 36" focusable="false"><path d="M15 3C9 3 4.6 11.5 4.6 20.7C4.6 28.7 9.3 33 15 33S25.4 28.7 25.4 20.7C25.4 11.5 21 3 15 3Z"/></svg></span>`:'';
  return `<button type="button" class="pick ui-choice ${field==='size'?'ui-choice--tile':'ui-choice--pill'}" data-pick="${field}" data-value="${esc(t)}" aria-pressed="${String(editing[field]===t)}">${egg}<span>${esc(t)}${field==='pack'?'구':''}</span></button>`;
 }).join('');
}
function lineSubtotal(l){return currentPurchaseCost(l)}
function itemIdentity(l){return sku(l)}
function labelLine(l,i){return itemIdentity(l)}
function editLine(id){let l=lineById(id);if(!l)return;editing={...l};S.current=l.id;addingSku=false;changeOpen('q1')}
// MSG0303: source-of-truth for *stored* stage completion. Open/closed and unsaved
// editor drafts do not recolor the badge; drafts do independently block result CTA.
function storedStageCompletion(verdict=orderVerdict('full')){
 const errors=verdict.fieldErrors;return {q1:!errors.some(e=>e.stage==='q1')&&S.lines.length>0,
  q2:!errors.some(e=>['q1','q2'].includes(e.stage))&&S.lines.length>0,
  q3:!errors.some(e=>['q1','q2','q3'].includes(e.stage))&&S.lines.length>0,
  q4:!errors.length&&!verdict.confirmations.length&&S.allocations.length>0};
}
function orderIssueLabel(issue){
 const line=lineById(issue.lineId),site=locationById(issue.siteId),number=S.lines.findIndex(l=>l.id===issue.lineId)+1;
 const product=line?`${number}번 · ${line.size} · ${line.pack}구`:issue.stage.toUpperCase();
 const loc=site?` / ${siteName(site)}`:'';
 return `${product}${loc} — ${issue.message}`;
}
// MSG0505: committed validity, active editing, pending proof and exposed errors
// are distinct projections. A draft may block navigation without being an error.
function orderEditingScopes(){
 const scopes=[];
 if(skuDraftActive())scopes.push({owner:'sku',stage:'q1',lineId:editing.id,isNew:editorMode==='new',stages:['q1','q2','q3','q4']});
 if(siteEditing)scopes.push({owner:'site',stage:'q3',siteId:siteEditing.id,isNew:!siteEditOriginal,stages:['q3','q4']});
 if(deliveryDraft||q4AssignmentDraft)scopes.push({owner:'delivery',stage:'q4',lineId:q4ReviewContext?.lineId||q4AssignmentDraft?.lineId||deliveryDraft?.lineId,stages:['q4']});
 return scopes;
}
function orderIssueUnderEdit(issue,scopes=orderEditingScopes()){
 return scopes.some(scope=>scope.owner==='sku'
  ?(['q1','q2','q4'].includes(issue.stage)&&issue.lineId===scope.lineId||scope.isNew&&issue.stage==='q1'&&!issue.lineId&&!S.lines.length)
  :scope.owner==='site'?['q3','q4'].includes(issue.stage)&&issue.siteId===scope.siteId
  :issue.stage==='q4'&&issue.lineId===scope.lineId);
}
function orderPageBlockers(scopes=orderEditingScopes()){
 return scopes.map(scope=>({stage:scope.stage,lineId:scope.lineId,siteId:scope.siteId,issueId:'block:'+scope.stage+':edit',blocker:true,kind:'editing'}));
}
let orderPageIssues=[];
function orderValidationProjection(scope='full'){
 const verdict=orderVerdict(scope),seen=new Set(),issues=[];
 for(const issue of verdict.fieldErrors){const key=[issue.stage,issue.lineId||'',issue.siteId||'',issue.fieldKey||issue.field||issue.issueId].join('|');if(seen.has(key))continue;seen.add(key);issues.push({...issue,groupKey:key});}
 const editingScopes=orderEditingScopes(),editingBlockers=orderPageBlockers(editingScopes);
 const pendingIssues=issues.filter(OrderSiteContract.isAwaiting),actionableErrors=issues.filter(i=>!OrderSiteContract.isAwaiting(i));
 const visibleErrors=actionableErrors.filter(i=>!orderIssueUnderEdit(i,editingScopes)),exposedErrors=orderErrorExposure?visibleErrors:[];
 const stored=storedStageCompletion(verdict),stageStates=Object.fromEntries(['q1','q2','q3','q4'].map(stage=>{
  const editing=editingScopes.some(x=>x.stages.includes(stage)),awaiting=pendingIssues.some(x=>x.stage===stage),confirmation=verdict.confirmations.some(x=>(x.stage||'q4')===stage);
  return [stage,{valid:!issues.some(x=>x.stage===stage),storedComplete:stored[stage],complete:stored[stage]&&!editing&&!awaiting&&!confirmation&&!storagePending&&!storageFailure&&!inlineDraft,editing,awaiting,confirmation,errorExposed:exposedErrors.some(x=>x.stage===stage)}];
 }));
 const counts=Object.fromEntries(['q1','q2','q3','q4'].map(q=>[q,visibleErrors.filter(x=>x.stage===q).length]));
 return {...verdict,fieldErrors:issues,issues,pendingIssues,actionableErrors,visibleErrors,exposedErrors,editingScopes,editingBlockers,stageStates,counts,errorExposure:orderErrorExposure,valid:verdict.valid&&verdict.confirmations.length===0&&editingBlockers.length===0&&!storagePending&&!storageFailure&&!inlineDraft};
}
function openSiteActionConfirm({kind,id,trigger}){
 const lineMode=kind==='line-unlink',assignment=lineMode?q4AssignmentDraft:null;
 if(lineMode){if(!assignment||assignment.lineId!==id||!$('q4-assignment-dialog').open)return;}else if(!guardPendingEdits(kind))return;
 const line=lineMode?lineById(id):null,site=lineMode?null:kind==='site'?locationById(id):locationById(allocationById(id)?.locationId),allocation=kind==='unlink'?allocationById(id):null;
 if(lineMode?!line:!site||kind==='unlink'&&!allocation)return;
 const readTarget=()=>lineMode?JSON.stringify([lineById(id),S.allocations.filter(a=>a.lineId===id)]):JSON.stringify([locationById(site.id),allocation?allocationById(allocation.id):null,S.allocations.filter(a=>a.locationId===site.id)]);
 const snapshot=readTarget(),title=lineMode?'모든 연결을 해제할까요?':kind==='site'?siteName(site)+'을 삭제할까요?':'품목 연결을 해제할까요?',body=lineMode?itemIdentity(line)+'의 사업장 연결과 납품 설정을 모두 해제합니다. 사업장 정보와 다른 품목의 설정은 유지됩니다.':kind==='site'?'이 사업장의 정보와 연결된 납품 설정이 삭제됩니다.':siteName(site)+'에서 '+itemIdentity(lineById(allocation.lineId))+'의 납품 설정을 해제합니다.';
 let d=$('q3-action-confirm');if(!d){d=document.createElement('dialog');d.id='q3-action-confirm';d.className='q1-sku-dialog';d.setAttribute('aria-labelledby','q3-action-confirm-title');d.innerHTML='<div class="q1-confirm"><h2 id="q3-action-confirm-title"></h2><p id="q3-action-confirm-body"></p><p id="q3-action-confirm-failure" role="alert" hidden></p><div class="ui-transaction-group"><button type="button" class="ui-transaction-action" data-q3-confirm-cancel>취소</button><button type="button" class="ui-transaction-action" data-q3-confirm-apply></button></div></div>';document.body.append(d);}
 if(d.open)return;let settled=false,pending=false;
 $('q3-action-confirm-title').textContent=title;$('q3-action-confirm-body').textContent=body;$('q3-action-confirm-failure').hidden=true;const apply=d.querySelector('[data-q3-confirm-apply]');apply.textContent=kind==='site'?'삭제':'해제';apply.classList.toggle('ui-transaction-action--danger',kind==='site');apply.classList.toggle('ui-transaction-action--primary',kind!=='site');apply.disabled=false;
 const close=()=>{settled=true;OrderModalShell.close(d,{after:()=>{renderAddress();renderDelivery();refreshCompletionBadges();if(lineMode&&q4AssignmentDraft===assignment)paintQ4Assignment();}});};
 d.querySelector('[data-q3-confirm-cancel]').onclick=close;apply.onclick=async()=>{if(settled||pending)return;if(readTarget()!==snapshot||lineMode&&(q4AssignmentDraft!==assignment||assignment.lineId!==id)){$('q3-action-confirm-failure').textContent='대상 정보가 변경되었습니다. 취소 후 다시 확인해 주세요.';$('q3-action-confirm-failure').hidden=false;return;}
  pending=true;apply.disabled=true;const candidate=structuredClone(S);
  if(lineMode)candidate.allocations=candidate.allocations.filter(a=>a.lineId!==id);
  else if(kind==='site'){candidate.locations=candidate.locations.filter(x=>x.id!==site.id);candidate.allocations=candidate.allocations.filter(a=>a.locationId!==site.id);}else candidate.allocations=candidate.allocations.filter(a=>a.id!==allocation.id);
  const result=await save(candidate,{errorId:'q3-action-confirm-failure',canCommit:()=>!settled&&d.open&&readTarget()===snapshot&&(!lineMode||q4AssignmentDraft===assignment)});pending=false;
  if(!result.ok){apply.disabled=false;return;}if(lineMode){assignment.selected=[];assignment.originalIds=[];}close();};
 OrderModalShell.bind(d,close);OrderModalShell.open(d,{variant:'compact',returnFocus:()=>trigger?.isConnected?trigger:lineMode?$('q4-assignment-next'):document.querySelector(`#q3-site-${CSS.escape(site.id)} > .accordion-trigger`)||$('add-site'),initialFocus:()=>d.querySelector('[data-q3-confirm-cancel]')});
}
function renderOrderPageFeedback({shake=false}={}){
 const surface=$('allocations-delivery');if(!surface)return;
 surface.querySelectorAll('.order-saved-issue').forEach(n=>n.remove());
 surface.querySelectorAll('.allocation-item[data-order-error-row]').forEach(n=>{n.removeAttribute('data-order-error-row');n.removeAttribute('tabindex');n.classList.remove('code1-validation-shake');});
 $('order-incomplete-list')?.remove();$('review-incomplete')?.remove();
 const projection=orderValidationProjection(),issues=projection.exposedErrors;orderPageIssues=issues;paintPageFieldIssues(issues,{shake,projection});paintStageCompletion(projection);
 for(const row of surface.querySelectorAll('.allocation-item')){const a=allocationById(row.dataset.allocation),issue=issues.find(x=>a&&x.stage==='q4'&&x.lineId===a.lineId&&x.siteId===a.locationId);if(issue)row.dataset.orderErrorRow='true';}
}

function orderShake(target){
 if(!target||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 target.classList.remove('code1-validation-shake');void target.offsetWidth;target.classList.add('code1-validation-shake');
 target.addEventListener('animationend',()=>target.classList.remove('code1-validation-shake'),{once:true});
}
function navigateOrderIssue(issue,{animate=true}={}){
 if(!issue)return false;if(OrderSiteContract.isAwaiting(issue)){window.OrderEmailLifecycle?.retry();return false;}
 if(issue.blocker){const x=issue.stage==='q4'?'q4-regular-dialog':issue.stage==='q1'?'sku-dialog':'site-editor';document.getElementById(x)?.focus?.();return true}
 if(issue.stage==='q4'){
  const saved=S.allocations.find(a=>a.lineId===issue.lineId&&(!issue.siteId||a.locationId===issue.siteId));
  if(!saved){if(issue.lineId){openQ4Assignment(issue.lineId,document.querySelector(`[data-q4-select-sites="${CSS.escape(issue.lineId)}"]`));return true;}return false;}
  if(S.open!=='q4'&&!changeOpen('q4'))return false;
  const edit=document.querySelector(`[data-edit-allocation="${CSS.escape(saved.id)}"]`);
  if(!edit)return false;
  edit.click();
  requestAnimationFrame(()=>window.OrderQ4Review.validate());return true;
 }
 if(S.open!==issue.stage&&!changeOpen(issue.stage))return false;
 requestAnimationFrame(()=>{
  const target=CODE1_ORDER_ERRORS.findTarget(issue,document);
  const action=issue.stage==='q1'?document.querySelector(`[data-edit="${CSS.escape(issue.lineId||'')}"]`):issue.stage==='q3'?document.querySelector(`[data-site-edit="${CSS.escape(issue.siteId||'')}"]`):null;
  if(action)action.click();
  requestAnimationFrame(()=>{CODE1_ORDER_ERRORS.applyAll(orderValidationProjection().actionableErrors.filter(x=>x.stage===issue.stage),document,{persist:false});CODE1_ORDER_ERRORS.navigateTo(issue,document,{animate})});
 });return true;
}
function requestValidationFeedback(action='finish',scope='full'){
 orderErrorExposure=true;const verdict=orderValidationProjection(scope);renderOrderPageFeedback();paintStageCompletion();updateResultCTA();
 if(verdict.valid)return true;const first=verdict.actionableErrors[0];if(verdict.pendingIssues.length)window.OrderEmailLifecycle?.retry();if(first)navigateOrderIssue(first,{animate:true});else if(verdict.confirmations.length){const line=verdict.confirmations[0].lineId,a=S.allocations.find(x=>x.lineId===line);if(a){openRegularQ4(a.id,document.querySelector(`[data-edit-allocation="${CSS.escape(a.id)}"]`));requestAnimationFrame(()=>OrderQ4Review.validate());}}
 return false;
}
function paintStageCompletion(projection=orderValidationProjection()){
 for(const q of ['q1','q2','q3','q4']){
  const btn=document.querySelector(`.accordion-trigger[data-open="${q}"]`);if(!btn)continue;
  const state=projection.stageStates[q],section=btn.closest('.t-acc'),isComplete=state.complete,hasError=state.errorExposed;
  section.dataset.complete=String(isComplete);section.dataset.storedComplete=String(state.storedComplete);section.dataset.editing=String(state.editing);section.dataset.awaiting=String(state.awaiting);section.dataset.confirmation=String(state.confirmation);section.dataset.valid=String(state.valid);
  section.dataset.orderErrorStage=String(hasError);section.dataset.error=String(hasError);
  const icon=btn.querySelector(':scope > .stage-check');if(icon){icon.classList.add('ui-completion');icon.dataset.state=hasError?'invalid':isComplete?'saved-valid':'empty';}
  btn.classList.toggle('is-done',isComplete);section.dataset.status=hasError?'error':S.open===q?'active':isComplete?'done':'pending';
 }
}
// MSG0298: closed headers retain their fixed title and disclosure chevron.
function updateResultCTA(){
 const button=$('to-result');if(!button)return;const p=orderValidationProjection();button.disabled=false;button.removeAttribute('aria-disabled');button.dataset.actionState=p.valid?'result':'review';
 const label=p.valid?'납품가 비교 결과 보기':p.visibleErrors.length?`미완료 ${p.visibleErrors.length}개 확인`:'입력 내용 확인';if(button.textContent!==label)button.textContent=label;
 $('review-incomplete')?.remove();$('order-incomplete-list')?.remove();
 const owners=[];
 for(const stage of ['q1','q2','q3','q4']){
  const root=$('section-'+stage),trigger=root?.querySelector(':scope > .accordion-trigger'),title=trigger?.querySelector(':scope > .qcopy > strong');if(!title)continue;
  owners.push({key:stage,title,depth:0,available:true,matches:i=>i.stage===stage});
  if(stage==='q3')for(const site of S.locations){const child=$('q3-site-'+site.id),head=child?.querySelector(':scope > .accordion-trigger'),childTitle=head?.querySelector(':scope > .qcopy > strong');if(childTitle)owners.push({key:'q3|'+site.id,title:childTitle,depth:1,available:trigger.getAttribute('aria-expanded')==='true',matches:i=>i.stage==='q3'&&i.siteId===site.id});}
  if(stage==='q4')for(const item of root.querySelectorAll('[data-q4-body-line]')){const id=item.dataset.q4BodyLine,childTitle=item.querySelector('.q4-body-heading > button .q4-body-title'),mainOpen=trigger.getAttribute('aria-expanded')==='true';owners.push({key:'q4|'+id,title:childTitle,depth:1,available:mainOpen,matches:i=>i.stage==='q4'&&i.lineId===id});
   for(const row of item.querySelectorAll('[data-allocation]')){const a=allocationById(row.dataset.allocation);if(a)owners.push({key:'q4|'+id+'|'+a.locationId,title:row.querySelector('.q4-body-site-title'),depth:2,available:mainOpen&&item.dataset.expanded==='true',matches:i=>i.stage==='q4'&&i.lineId===id&&i.siteId===a.locationId});}
  }
 }
 OrderErrorBadges.paint(owners,p.exposedErrors);
 paintPageFieldIssues(p.exposedErrors,{projection:p});paintStageCompletion(p);
}
// MSG0313: check persisted values BEFORE entering a destructive save branch.
function skuInvalidationPlan(prev,next){
 const entries=[];
 if(!prev||!next)return {entries,kind:'none'};
 const packChanged=String(prev.pack)!==String(next.pack);
 const identityChanged=packChanged||prev.housing!==next.housing||prev.size!==next.size;
 if(!identityChanged)return {entries,kind:'none'};
 const take=(field,id,before)=>{if(before!==undefined&&before!==null&&String(before).trim()!=='')entries.push({field,id,before:String(before),after:''});};
 if(packChanged)take('lines.qty',prev.id,prev.qty);
 take('lines.price',prev.id,prev.price);
 if(packChanged)for(const a of S.allocations.filter(a=>a.lineId===prev.id))take('allocations.qty',a.id,a.qty);
 return {entries,kind:packChanged?'pack':'identity'};
}
function skuInvalidationCopy(plan){
 if(plan.kind==='identity')return '계란 정보를 변경하면 기존 구매단가를 다시 입력해야 합니다.';
 const fields=new Set(plan.entries.map(x=>x.field));
 const nouns=[];
 if(fields.has('lines.qty'))nouns.push('구매량');
 if(fields.has('lines.price'))nouns.push('가격');
 if(fields.has('allocations.qty'))nouns.push('납품수량');
 return `포장을 바꾸면 기존 ${nouns.join('·')}이 초기화됩니다.`;
}
function openSkuDialog(trigger){
 const dialog=$('sku-dialog');skuDialogReturnFocus=trigger||document.activeElement;
 skuDialogReturnSelector=trigger?.dataset?.edit?`[data-edit="${CSS.escape(String(trigger.dataset.edit))}"]`:trigger?.id?`#${CSS.escape(trigger.id)}`:null;
 skuDialogScrollY=window.scrollY;
 dialog.setAttribute('aria-label',editorMode==='edit'?'계란 정보 수정':'계란 추가 선택');
 dialog.removeAttribute('aria-labelledby');dialog.removeAttribute('aria-describedby');
 showQ1Modal(dialog);syncQ1ModalScrollLock();
 requestAnimationFrame(()=>$('picks-housing').querySelector('button[aria-pressed="true"]')?.focus({preventScroll:true})||$('picks-housing').querySelector('button')?.focus({preventScroll:true}));
}
function closeSkuDialog(after){
 const dialog=$('sku-dialog');
 hideQ1Modal(dialog,()=>{
  skuConfirmationPending=false;syncQ1ModalScrollLock();
  after?.();

 });
}
function openSkuDeleteDialog(id,button){
 if($('sku-dialog').open||$('sku-delete-dialog').open)return;
 const target=lineById(id);if(!target)return;
 pendingSkuDelete={id:target.id,focus:button,scrollY:window.scrollY};
 $('sku-delete-identity').textContent=itemIdentity(target);
 showQ1Modal($('sku-delete-dialog'));syncQ1ModalScrollLock();
 requestAnimationFrame(()=>$('sku-delete-cancel').focus({preventScroll:true}));
}
async function closeSkuDeleteDialog(commit=false){
 const ctx=pendingSkuDelete;if(!ctx||$('sku-delete-dialog').classList.contains('is-closing')||commit&&ctx.pending)return;
 if(commit){
  const target=lineById(ctx.id);
  if(!target){closeSkuDeleteDialog(false);return;}
  const candidate=structuredClone(S);candidate.lines=candidate.lines.filter(l=>l.id!==ctx.id);candidate.allocations=candidate.allocations.filter(a=>a.lineId!==ctx.id);
  if(candidate.current===ctx.id)candidate.current=candidate.lines[0]?.id||null;candidate.open='q1';ctx.pending=true;
  const result=await save(candidate,{errorId:'sku-delete-error',canCommit:()=>pendingSkuDelete===ctx&&!ctx.cancelled&&$('sku-delete-dialog').open});ctx.pending=false;
  if(!result.ok)return;
  editing=empty();addingSku=false;editorMode=S.lines.length?null:'initial';
 }else ctx.cancelled=true;
 hideQ1Modal($('sku-delete-dialog'),()=>{
  pendingSkuDelete=null;syncQ1ModalScrollLock();
  if(commit)render();
  requestAnimationFrame(()=>{
   window.scrollTo({top:ctx.scrollY,behavior:'instant'});
   const candidate=commit?document.querySelector(`[data-remove="${CSS.escape(String(S.lines[0]?.id||''))}"]`)||$('add-line')||document.querySelector('#section-q1 .accordion-trigger'):ctx.focus?.isConnected?ctx.focus:document.querySelector(`[data-remove="${CSS.escape(String(ctx.id))}"]`);
   candidate?.focus({preventScroll:true});
  });
 });
}
function showSkuConfirmation(plan){
 skuConfirmationPending=true;
 $('sku-confirm-copy').textContent=skuInvalidationCopy(plan);
 $('sku-confirm').hidden=false;
 $('sku-editor').hidden=true;
 $('sku-dialog').setAttribute('aria-labelledby','sku-confirm-title');$('sku-dialog').setAttribute('aria-describedby','sku-confirm-copy');$('sku-dialog').removeAttribute('aria-label');
 requestAnimationFrame(()=>$('sku-confirm-title').focus({preventScroll:true}));
}
function backFromSkuConfirmation(){
 skuConfirmationPending=false;$('sku-confirm').hidden=true;
 $('sku-dialog').removeAttribute('aria-labelledby');$('sku-dialog').removeAttribute('aria-describedby');$('sku-dialog').setAttribute('aria-label',editorMode==='edit'?'계란 정보 수정':'계란 추가 선택');$('sku-editor').hidden=false;
 requestAnimationFrame(()=>$('commit-sku').focus({preventScroll:true}));
}
function cancelSkuEditor(){
 const backToQ2=q2AddOrigin,snapshot=skuEditSnapshot;q2AddOrigin=false;addingSku=false;
 editing=empty();S.current=snapshot?snapshot.current:skuRestoreCurrent??S.lines[0]?.id??null;skuRestoreCurrent=null;skuEditSnapshot=null;editorMode=S.lines.length?null:'initial';
 if(snapshot)S.open=snapshot.open;
 err('err-q1','');closeSkuDialog(()=>{render();if(snapshot?.error)err('err-q1',snapshot.error);if(backToQ2)requestAnimationFrame(()=>$('q2-add-line').focus({preventScroll:true}));});
}
function render(){if(editorMode==='initial'&&S.lines.length)editorMode=null;
 pickGroup('picks-housing','housing',H);pickGroup('picks-size','size',SZ);pickGroup('picks-pack','pack',PK);
 for(const q of ['q1','q2','q3','q4']){
  const exp=S.open===q,btn=document.querySelector(`.accordion-trigger[data-open="${q}"]`);
  btn.setAttribute('aria-expanded',String(exp));
  $('section-'+q).dataset.open=String(exp);
  $('body-'+q).firstElementChild.inert=!exp;
 }
 paintStageCompletion();
 updateResultCTA();
 const priorEditor=$('sku-editor');
 if(editorMode==='initial'&&priorEditor.parentElement?.id==='sku-dialog-slot')$('add-controls').after(priorEditor);
 $('added-lines').hidden=!S.lines.length;$('add-controls').hidden=!!editorMode;$('q2-add-hint').hidden=S.lines.length===0||S.open!=='q2';
 $('added-lines').innerHTML=S.lines.map(l=>`<div class="sku-entry" role="group" aria-label="${esc(itemIdentity(l))}" data-line-id="${esc(l.id)}"><div class="sku-entry-copy"><div class="sku-name">${esc(itemIdentity(l))}</div><div class="sku-data">${validMonthlyQuantity(l)&&valid(l.price)?`월 ${monthlyQuantityText(l)}${quantityLabel(l)} · ${w(lineSubtotal(l))}`:'구매정보 미입력'}</div></div><div class="sku-entry-actions code1-text-actions">${CODE1_UI.textAction('수정','edit',esc(l.id),false,esc(itemIdentity(l))+' 수정')}${CODE1_UI.textAction('삭제','remove',esc(l.id),true,esc(itemIdentity(l))+' 삭제')}</div></div>`).join('');
 const node=$('sku-editor');node.hidden=!editorMode||skuConfirmationPending;
 if(editorMode){
  const previous=lineById(editing.id);
  // No visible editor title; dialog accessible name is assigned on opening.
  $('commit-sku').hidden=editorMode==='initial';$('commit-sku').textContent=editorMode==='edit'?'저장':'추가';
  $('cancel-sku').hidden=editorMode==='initial';
  if(editorMode!=='initial')$('sku-dialog-slot').append(node);
  else $('add-controls').after(node);
 }else $('add-controls').after(node);
 $('sku-confirm').hidden=!skuConfirmationPending;
 renderQ2();renderAddress();renderDelivery();$('q1-step-actions').hidden=!S.lines.length||!!editorMode;if(orderErrorExposure)renderOrderPageFeedback();
}
function renderQ2(){
 $('q2-lines').innerHTML=S.lines.map(l=>`<fieldset class="line-panel" data-line-id="${esc(l.id)}"><legend>${esc(itemIdentity(l))}</legend><div class="pair"><div class="numeric-field" data-q2-field="qty"><label for="qty-${esc(l.id)}">월 구매량</label><div class="input-unit"><input id="qty-${esc(l.id)}" data-line-qty="${esc(l.id)}" type="text" inputmode="numeric" value="${esc(showComma(quantityInputText(l)))}" placeholder="0"><select class="ui-quantity-unit" aria-label="월 구매량 단위" data-line-qty-unit="${esc(l.id)}">${!['each',String(l.pack)==='30'?'tray':'pack'].includes(quantityDisplayUnit(l))?'<option value="" selected disabled>단위 확인</option>':''}<option value="each" ${quantityDisplayUnit(l)==='each'?'selected':''}>개</option><option value="${String(l.pack)==='30'?'tray':'pack'}" ${quantityDisplayUnit(l)===(String(l.pack)==='30'?'tray':'pack')?'selected':''}>${unit(l.pack)}</option></select></div><p class="muted q2-demand-note" data-line-demand="${esc(l.id)}">${esc(quantityDisplayNote(l))}</p><p class="code1-q2-field-error ui-feedback-sr" id="q2-error-qty-${esc(l.id)}" role="alert" hidden></p></div><div class="numeric-field" data-q2-field="price"><label for="price-${esc(l.id)}">현재 구매가격</label><div class="input-unit"><input id="price-${esc(l.id)}" data-line-price="${esc(l.id)}" type="text" inputmode="numeric" value="${esc(showComma(l.price))}" placeholder="0"><span>원/${unit(l.pack)}</span></div><p class="code1-q2-field-error ui-feedback-sr" id="q2-error-price-${esc(l.id)}" role="alert" hidden></p></div></div><div class="line-subtotal"><span>월 수요 비례 비용</span><output data-line-subtotal="${esc(l.id)}">${lineSubtotal(l)===null?'입력 필요':w(lineSubtotal(l))}</output></div></fieldset>`).join('');
 $('q2-total').textContent=buyerTotal()===null?'입력 필요':w(buyerTotal());
 if(orderErrorExposure)paintPageFieldIssues(orderValidationProjection().exposedErrors);
}
function paintPageFieldIssues(issues,{shake=false,projection=orderValidationProjection()}={}){
 const scopes=projection.editingScopes;
 // Q2 uses its existing one-pixel underline and a helper below the same input group.
 const current=new Map(issues.filter(i=>i.stage==='q2'&&i.lineId&&['qty','price'].includes(i.fieldKey)).map(i=>[i.lineId+'|'+i.fieldKey,i]));
 document.querySelectorAll('#q2-lines .numeric-field[data-q2-field]').forEach(group=>{
  const panel=group.closest('[data-line-id]'),id=panel?.dataset.lineId,kind=group.dataset.q2Field,issue=current.get(id+'|'+kind),input=group.querySelector('input'),note=group.querySelector('.code1-q2-field-error');
  group.dataset.orderInvalid=String(!!issue);
  const underline=group.querySelector('.input-unit');if(underline)underline.dataset.orderInvalid=String(!!issue);
  if(input){if(issue){input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby',note.id);}else{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');input.classList.remove('code1-validation-shake');}}
  if(note){note.textContent=issue?.message||'';note.hidden=!issue;}
  if(issue&&shake)orderShake(underline||input);
 });

 // Q3 summary fields consume the SAME exposed verdict as the CTA/editor.
 for(const site of S.locations){const root=$('q3-site-'+site.id);if(!root)continue;const own=issues.filter(i=>i.stage==='q3'&&i.siteId===site.id),bad=own.length>0;
  const editing=scopes.some(x=>x.owner==='site'&&x.siteId===site.id),complete=siteValid(site)&&!editing;root.dataset.editing=String(editing);root.dataset.error=String(bad);root.dataset.orderErrorStage=String(bad);root.dataset.complete=String(complete);root.dataset.state=bad?'error':complete?'complete':'empty';
  const check=root.querySelector(':scope > .accordion-trigger > .ui-completion');if(check)check.dataset.state=bad?'invalid':complete?'saved-valid':'empty';
  const fields=new Set(own.map(i=>i.fieldKey||String(i.field||'').split(':').at(-1)));
  for(const group of root.querySelectorAll('[data-q3-summary-field]')){const invalid=fields.has(group.dataset.q3SummaryField);group.dataset.orderInvalid=String(invalid);group.setAttribute('aria-invalid',String(invalid));}
  for(const group of root.querySelectorAll('[data-q3-summary-value],[data-q3-summary-label]')){const key=group.dataset.q3SummaryValue||group.dataset.q3SummaryLabel;group.dataset.orderInvalid=String(fields.has(key));}
 }

 // Q4 saved rows consume the same stage/line/site/field keys as editor and CTA.
 for(const item of document.querySelectorAll('#section-q4 [data-q4-body-line]')){const id=item.dataset.q4BodyLine,rows=S.allocations.filter(a=>a.lineId===id),editing=scopes.some(x=>x.lineId===id||x.owner==='site'&&rows.some(a=>a.locationId===x.siteId));item.dataset.editing=String(editing);item.dataset.error=String(issues.some(i=>i.stage==='q4'&&(!i.lineId||i.lineId===id)));item.dataset.complete=String(!editing&&rows.length>0&&rows.every(allocationValid)&&!projection.fieldErrors.some(i=>i.stage==='q4'&&(!i.lineId||i.lineId===id)));}
 for(const row of document.querySelectorAll('#section-q4 [data-allocation]')){const a=allocationById(row.dataset.allocation);if(!a)continue;const own=issues.filter(i=>i.stage==='q4'&&i.lineId===a.lineId&&i.siteId===a.locationId),bad=own.length>0;row.dataset.orderErrorRow=String(bad);row.setAttribute('aria-invalid',String(bad));
  const fields=new Set(own.map(i=>i.fieldKey||String(i.field||'').split(':').at(-1)));
  for(const el of row.querySelectorAll('[data-q4-summary-fields]')){const keys=el.dataset.q4SummaryFields.split(' '),invalid=keys.some(k=>k==='repeat'? [...fields].some(f=>f==='repeat'||['repeat-contract','frequency','monthDay','date','legacy','period'].includes(f)||f.startsWith('weekdays-')):fields.has(k));el.dataset.orderInvalid=String(invalid);el.setAttribute('aria-invalid',String(invalid));}
 }
}

function updateLineSpend(){const l=lineById(S.current);$('line-total').textContent=l&&validMonthlyQuantity(l)&&valid(l.price)&&sum(l.qty,l.price)!==null?w(sum(l.qty,l.price)):'—';}
// Owns Q3 and Q4 only. v0.15R1 Q1/Q2 layout code remains from baseline.
let siteEditing=null;let siteEditOriginal=null;let siteEditGeneration=0;let primarySiteId=null;let focusedDetailDraft=null;let siteManagementOpen=false;let connectingLineId=null;let editingAllocationId=null;let deliveryDraft=null;
const q3Expanded=new Map();let q3EditorReturn=null,q3EditorSelector='#add-site',q4AssignmentDraft=null;const addressTrace=[];
const addressMarkup=site=>addressLines(site).map(line=>`<span>${esc(line)}</span>`).join('');
const addressEditor=createAddressEditor({
 getParent:()=>siteEditing&&$('site-editor-dialog').open&&!$('site-editor-dialog').classList.contains('is-closing')?{siteId:siteEditing.id,generation:siteEditGeneration,site:siteEditing}:null,
 onInvalid:control=>orderShake(control),
 onConfirm:({siteId,generation,address})=>{
  if(!siteEditing||siteEditing.id!==siteId||siteEditGeneration!==generation||!$('site-editor-dialog').open||q3SaveBusy)return false;
  if(siteEditOriginal&&!locationById(siteId))return false;
  Object.assign(siteEditing,addressFields(address));siteEditing.addressState=addressStatus(siteEditing).state;
  q3PaintAddress();q3SyncSaveAction();
  const exposed=[...$('site-editor-dialog').querySelectorAll('[data-q3-field][data-error="true"]')].map(g=>g.dataset.q3Field);
  q3PaintErrors(OrderSiteContract.issues(siteEditing).filter(i=>exposed.includes(i.key)),{focus:false});refreshCompletionBadges();return true;
 }
});
function renderAddress(){
 const host=$('q3-sites');if(!host)return;const ids=new Set(S.locations.map(s=>s.id));for(const id of q3Expanded.keys())if(!ids.has(id))q3Expanded.delete(id);
 host.innerHTML=S.locations.map(site=>{
  const savedItems=S.allocations.filter(a=>a.locationId===site.id&&a.modeExplicit===true&&a.q4Review?.version==='0460');
  const itemCount=new Set(savedItems.map(a=>a.lineId)).size;
  const address=String(site.road||'').trim()?`<div class="q3-address-value ui-location-lines" data-q3-summary-value="address">${addressMarkup(site)}</div>`:'<div class="q3-address-value" data-q3-summary-value="address">소재지 미입력</div>';
  const contacts=`<div class="q3-contact-grid"><div class="q3-contact-cell" data-q3-summary-field="contactPhone"><span class="q3-info-label">담당자</span><span>${esc(site.contactPhone||'—')}</span></div><div class="q3-contact-cell" data-q3-summary-field="storePhone"><span class="q3-info-label">대표번호</span><span>${esc(site.storePhone||'—')}</span></div><div class="q3-contact-cell q3-contact-cell--email" data-q3-summary-field="email"><span class="q3-info-label">이메일</span><span>${esc(site.email||'—')}</span></div></div>`;
  const actions=`<div class="q3-info-management"><div class="q3-copy-slot">${S.locations.length>1?`<button class="ui-copy-action" data-copy-align="start" type="button" data-contact-copy="${esc(site.id)}">${OrderIcons.svg('clone')}<span>다른 사업장에 연락처 복사</span></button>`:''}</div><div class="q3-site-actions code1-text-actions">${CODE1_UI.textAction('수정','site-edit',esc(site.id))}${CODE1_UI.textAction('삭제','site-delete',esc(site.id),true)}</div></div>`;
  const items=itemCount?`<section class="q3-products-frame" aria-label="납품받을 품목"><h4 class="q3-delivered-title"><span>납품받을 품목</span><span class="q3-product-count">${itemCount}종</span></h4>${savedItems.map(a=>{const line=lineById(a.lineId);return `<div class="q3-delivered-item" data-q3-item="${esc(a.id)}"><div class="q3-item-copy"><strong>${esc(itemIdentity(line))}</strong><span>${esc(deliveryLabel(a))}</span><span>${esc(a.mode==='ONCE'?'1회':'회당')} ${esc(a.qty)}${esc(unit(line?.pack))}</span></div><div class="code1-text-actions">${CODE1_UI.textAction('수정','q3-q4-edit',esc(a.id))}${CODE1_UI.textAction('해제','q3-unlink',esc(a.id),true)}</div></div>`;}).join('')}</section>`:'';
  return CODE1_UI.accordion({id:'q3-site-'+site.id,label:esc(siteName(site)),content:`<div class="q3-information-group"><h4 class="q3-information-title q3-info-label" data-q3-summary-label="address">사업장 소재지</h4>${address}${contacts}${actions}</div>${items}`,complete:siteValid(site),expanded:q3Expanded.get(site.id)||false,extraClass:'q3-site-accordion'});
 }).join('');$('q3-empty').hidden=S.locations.length>0;
}

// Q4 body view-state only. Saved business data, modal state and validation remain unchanged.
const q4BodyExpanded=new Map();
function q4BodySetExpanded(item,expanded){
 if(!item)return;
 const key=item.dataset.q4BodyLine,trigger=item.querySelector('[data-q4-body-toggle]');
 const panel=item.querySelector('.q4-body-panel'),inner=panel?.firstElementChild;
 if(!trigger||!panel||!inner)return;
 q4BodyExpanded.set(key,expanded);item.dataset.expanded=String(expanded);
 trigger.setAttribute('aria-expanded',String(expanded));
 if(!expanded&&inner.contains(document.activeElement))trigger.focus({preventScroll:true});
 inner.inert=!expanded;panel.setAttribute('aria-hidden',String(!expanded));updateResultCTA();
}
function renderDelivery(){
 const surface=$('allocations-delivery');
 const keys=new Set(S.lines.map(l=>String(l.id)));
 for(const key of q4BodyExpanded.keys())if(!keys.has(key))q4BodyExpanded.delete(key);
 const projection=orderValidationProjection(),q4Errors=projection.fieldErrors.filter(issue=>issue.stage==='q4');
 surface.innerHTML=S.lines.map(l=>{
  const rows=S.allocations.filter(a=>a.lineId===l.id),key=String(l.id);
  const expanded=q4BodyExpanded.get(key)===true;
  const issues=q4Errors.filter(issue=>issue.lineId===l.id||!issue.lineId);
  const edited=projection.editingScopes.some(x=>x.lineId===l.id||x.owner==='site'&&rows.some(a=>a.locationId===x.siteId));
  const complete=!edited&&rows.length>0&&rows.every(allocationValid)&&issues.length===0;
  const error=projection.exposedErrors.some(issue=>issue.stage==='q4'&&(!issue.lineId||issue.lineId===l.id));
  const modes=[...new Set(rows.map(a=>a.mode))];
  const modeLabel=modes.length>1?'혼합 납품':({FLEX:'소진 시 주문',FIXED:'정기 납품',ONCE:'1회 납품'}[modes[0]]||'납품 방식 미설정');
  const summary=`${new Set(rows.map(a=>a.locationId)).size}개 사업장 · ${modeLabel}`;
  const id='q4-body-'+encodeURIComponent(key);
  const content=rows.map(a=>{
  const name=siteName(locationById(a.locationId));
  const qtyLabel=a.mode!=='ONCE'&&q4SitesForLine(a.lineId).length>=2&&!valid(a.qty)?'회당 수량 미설정':a.mode==='ONCE'&&q4SitesForLine(a.lineId).length>=2?`1회 ${esc(a.oneTimeDeliveryQty||'미입력')}${unit(lineById(a.lineId)?.pack)}`:a.variableQty&&valid(a.qtyMin)&&valid(a.qtyMax)?`1회 ${esc(a.qtyMin)}~${esc(a.qtyMax)}${unit(l.pack)}`:valid(a.qty)?`1회 ${esc(a.qty)}${unit(l.pack)}`:'회당 수량 미설정';
  return `<div class="allocation-item q4-body-site" data-allocation="${esc(a.id)}"><div class="allocation-summary"><div class="allocation-summary-copy"><h4 class="q4-body-site-title">${esc(name)}</h4>${addressLines(locationById(a.locationId)).length?`<span class="q4-body-site-detail ui-location-lines">${addressMarkup(locationById(a.locationId))}</span>`:''}<span class="q4-body-site-detail" data-q4-summary-fields="mode repeat">${esc(deliveryLabel(a))}</span><span class="allocation-quantity q4-body-site-detail" data-q4-summary-fields="monthly qty min max">${a.mode!=='ONCE'&&q4SitesForLine(a.lineId).length>=2?(valid(a.monthlyDemandQty)?'월 '+esc(a.monthlyDemandQty)+({each:'개',tray:'판',pack:'팩'}[a.monthlyDemandUnit||quantityUnit(l)])+' · ':'월 사용량 미입력 · '):''}${qtyLabel}</span></div><div class="q4-allocation-item-actions code1-text-actions">${CODE1_UI.textAction(a.modeExplicit||a.q4Review?.version==='0460'?'수정':'설정하기','edit-allocation',esc(a.id))}${CODE1_UI.textAction('삭제','delete-allocation',esc(a.id),false)}</div></div></div>`;
  }).join('')||'';
  return `<div class="delivery-product q4-body-item" data-q4-body-line="${esc(key)}" data-expanded="${expanded}" data-complete="${complete}" data-error="${error}"><h3 class="q4-body-heading"><button type="button" class="q4-body-toggle" id="${esc(id)}-header" data-q4-body-toggle="${esc(key)}" aria-expanded="${expanded}" aria-controls="${esc(id)}-panel"><span class="q4-body-heading-copy"><strong class="q4-body-title">${esc(itemIdentity(l))}</strong><span class="q4-body-subtitle">${esc(summary)}</span></span><span class="q4-body-chevron" aria-hidden="true">${CODE1_UI.chevron}</span></button></h3><div class="q4-body-panel" id="${esc(id)}-panel" role="region" aria-labelledby="${esc(id)}-header" aria-hidden="${!expanded}"><div class="q4-body-panel-inner"${expanded?'':' inert'}>${content}<button type="button" class="q4-body-assignment-action" data-q4-select-sites="${esc(key)}">${OrderIcons.svg('swap')}<span>${rows.length?'납품 사업장 변경':'납품 사업장 선택'}</span></button></div></div></div>`;
 }).join('');
 updateResultCTA();
}

function invoiceDetails(stats){
 const buyRows=S.lines.map((l,i)=>{
  const sub=lineSubtotal(l),label=itemIdentity(l),unitName=quantityLabel(l);
  return `<div class="invoice-row invoice-buy" role="row"><span class="invoice-item">${esc(label)}</span><span class="invoice-meta">월 ${validMonthlyQuantity(l)?esc(monthlyQuantityText(l)):'—'}${unitName} · ${valid(l.price)?w(Number(l.price)):'입력 필요'}/${unit(l.pack)}</span><strong>${sub===null?'입력 필요':w(sub)}</strong></div>`;
 }).join('');
 const groups=S.locations.map(site=>({site,allocations:S.allocations.filter(a=>a.locationId===site.id)})).filter(x=>x.allocations.length);
 const bySite=groups.map(({site,allocations})=>`<div class="result-site-group invoice-site"><strong>${esc(siteName(site))}</strong><div class="site-delivery-address ui-location-lines">${addressMarkup(site)}</div>${allocations.map(a=>{const l=lineById(a.lineId);return l?`<div class="invoice-row invoice-assignment"><span>${esc(itemIdentity(l))}</span><strong>1회 ${valid(a.mode==='ONCE'&&S.allocations.filter(x=>x.lineId===a.lineId).length>=2?a.oneTimeDeliveryQty:a.qty)?esc(Number(a.mode==='ONCE'&&S.allocations.filter(x=>x.lineId===a.lineId).length>=2?a.oneTimeDeliveryQty:a.qty).toLocaleString('ko-KR')):'입력 필요'}${unit(l.pack)}</strong></div>`:''}).join('')}</div>`).join('');
 const terms=shippingRows().map(({line,allocation:a,site})=>`<div class="invoice-term"><span>${esc(siteName(site))} · ${esc(itemIdentity(line))}</span><strong>${esc(deliveryLabel(a))}</strong><span>1회 ${valid(a.mode==='ONCE'&&q4SitesForLine(a.lineId).length>=2?a.oneTimeDeliveryQty:a.qty)?esc(Number(a.mode==='ONCE'&&q4SitesForLine(a.lineId).length>=2?a.oneTimeDeliveryQty:a.qty).toLocaleString('ko-KR')):'입력 필요'}${unit(line.pack)}</span></div>`).join('');
 const comparable=stats.comparable&&stats.supply!==null&&stats.buyer!==null;
 const comparison=`<div class="invoice-row invoice-compare"><span>현재 월 구매비용</span><strong>${stats.buyer===null?'입력 필요':w(stats.buyer)}</strong></div><div class="invoice-row invoice-compare"><span>예시 월 납품 상품대금</span><strong>${comparable?w(stats.supply):'비교 조건 확인 필요'}</strong></div>${comparable?`<div class="invoice-row invoice-compare"><span>예시 월 차액</span><strong>${w(Math.abs(stats.buyer-stats.supply))} ${stats.buyer>=stats.supply?'절감':'증가'}</strong></div>`:'<p class="invoice-pending">월간 납품 수량·기간·예시 단가 조건을 확인한 후 비교할 수 있습니다.</p>'}`;
 return `<section class="invoice-block r1-buyer-lines"><h2>구매 내역</h2><div role="table" aria-label="계란별 구매 내역">${buyRows}</div><div class="invoice-total"><span>월 구매비용 합계</span><strong>${stats.buyer===null?'입력 필요':w(stats.buyer)}</strong></div></section><section class="invoice-block delivery-detail-card"><h2>납품지별 배정</h2>${bySite||'<p class="invoice-pending">등록된 납품지가 없습니다.</p>'}</section><section class="invoice-block invoice-terms"><h2>납품 조건</h2>${terms||'<p class="invoice-pending">설정된 납품 조건이 없습니다.</p>'}</section><section class="invoice-block invoice-comparison"><h2>비용 비교</h2>${comparison}</section>`;
}


function calcExample(){const buyer=buyerTotal();return {items:S.lines.map(l=>({id:l.id,buyer:lineSubtotal(l),unitOffer:null,supply:null,saving:null})),buyer,supply:null,saving:null,comparable:false,basis:null,reason:'실제 공급가와 비용 조건 확인이 필요합니다.'};}
const moneyOr=x=>x===null?'대조 불가':w(x);
function resultSkuLines(stats){return S.lines.map((l,i)=>`<div class="r1-item" role="group" aria-label="${esc(itemIdentity(l))}"><span>${esc(itemIdentity(l))}</span><span>월 ${monthlyQuantityText(l)}${quantityLabel(l)} · ${w(l.price)}/${unit(l.pack)}</span><strong>${w(stats.items[i].buyer)}</strong></div>`).join('');}
function renderResult(){
 const stats=calcExample(),buyer=stats.buyer,usable=false;
 // The reference's monetary figures are calculated, never screenshot constants.

 const value=stats.saving,rate=usable?Math.abs(value)/buyer*100:null;
 const outcome=usable?`<div class="r2-outcome ${value<0?'is-loss':''}"><div class="r2-outcome-value"><strong>${w(Math.abs(value))}</strong><b>${rate.toFixed(1)}% ${value<0?'증가':value===0?'동일':'절감'}</b></div></div>`:`<div class="r2-outcome is-unavailable" role="status"><div class="r2-outcome-value"><strong>산출 전</strong><b>조건 확인 필요</b></div></div>`;
 const comparison=`<div class="r2-finance-compare"><div class="r2-finance-pair"><div class="r2-finance-card"><span>현재 월 구매비용</span><strong>${buyer===null?'입력 필요':w(buyer)}</strong></div><div class="r2-finance-arrow" aria-label="비교">→</div><div class="r2-finance-card is-supply"><span>월 납품비용</span><strong class="${usable?'':'comparison-unavailable'}">${usable?w(stats.supply):'비교 조건 확인 필요'}</strong></div></div></div>`;
 const locationCount=new Set(S.allocations.map(a=>a.locationId).filter(id=>S.locations.some(loc=>loc.id===id))).size;
 const brief=`<p class="result-quicksummary" aria-label="입력 조건 요약">${S.lines.length}개 계란 품목 · ${locationCount}개 사업장 · ${S.allocations.length}개 납품 배정</p>`;
 // Unavailable information stays accessible but does not displace the user's sparse result layout.
 const unavailableNote=usable?'':`<span class="visually-hidden" role="status">${esc(stats.reason)}</span>`;
 $('receipt').innerHTML=outcome+comparison+brief+unavailableNote;
 $('result-detail-content').innerHTML=invoiceDetails(stats);
 $('result-title').textContent=usable&&value<0?'예상되는 월 비용 증가액':'예상되는 월 절감액';
 $('email-notice').hidden=true;
}

function errorAt(q,msg){changeOpen(q);err('err-'+q,msg)}
let skuSaving=false;
async function upsertSku(confirmed=false){
 if(skuSaving)return;
 if($('sku-dialog').classList.contains('is-closing'))return;
 if(!selected(editing)){err('err-q1','난각번호·계란 크기·포장을 모두 선택해 주세요.');return;}
 const index=S.lines.findIndex(l=>l.id===editing.id),prev=index>=0?S.lines[index]:null;
 const duplicate=S.lines.find(l=>l.id!==editing.id&&l.housing===editing.housing&&l.size===editing.size&&l.pack===editing.pack);
 if(duplicate){err('err-q1','이미 추가한 계란 규격입니다. 다른 규격을 선택해 주세요.');return;}
 const copy={...editing},plan=skuInvalidationPlan(prev,copy),candidate=structuredClone(S),draftFingerprint=JSON.stringify(editing),draftOwner=editing,wasConfirming=skuConfirmationPending;
 if(plan.entries.length&&!confirmed){showSkuConfirmation(plan);return;}
 if(prev&&(prev.housing!==copy.housing||prev.size!==copy.size||prev.pack!==copy.pack)){
  if(prev.pack!==copy.pack){delete copy.qtyExact;delete copy.qtyDisplayUnit;copy.qty='';copy.qtyUnit=String(copy.pack)==='30'?'tray':'pack';copy.price='';candidate.allocations.filter(a=>a.lineId===copy.id).forEach(a=>a.qty='');}
  else copy.price='';
 }
 if(index>=0)candidate.lines[index]=copy;else candidate.lines.push(copy);
 candidate.current=copy.id;const wasInitial=editorMode==='initial',backToQ2=q2AddOrigin;candidate.open=wasInitial||backToQ2?'q2':'q1';skuSaving=true;
 const result=await save(candidate,{errorId:'err-q1',canCommit:()=>editing===draftOwner&&JSON.stringify(editing)===draftFingerprint&&skuConfirmationPending===wasConfirming&&(!$('sku-dialog').classList.contains('is-closing'))});skuSaving=false;
 if(!result.ok)return;
 editing=empty();addingSku=false;q2AddOrigin=false;skuRestoreCurrent=null;skuEditSnapshot=null;editorMode=null;
 err('err-q1','');closeSkuDialog(()=>render());
 if(backToQ2)requestAnimationFrame(()=>{const qty=document.getElementById('qty-'+copy.id);qty?.focus({preventScroll:true});qty?.scrollIntoView({block:'nearest',behavior:'instant'});});
 else if(!wasInitial)requestAnimationFrame(()=>$('added-lines').querySelector(`[data-line-id="${CSS.escape(String(copy.id))}"] button`)?.focus({preventScroll:true}));
}
function finishQty(){if(!S.lines.length)return errorAt('q1','계란을 먼저 선택해 주세요.');if(buyerTotal()===null)return err('err-q2','계란별 월 구매량과 단가를 확인해 주세요.');err('err-q2','');if(changeOpen('q3'))navigateRegularStage('q3')}
function finishAddress(){if(!guardPendingEdits('q3-next'))return;if(!S.locations.length)return err('err-q3','사업장을 먼저 추가해 주세요.');const bad=S.locations.find(s=>!siteValid(s));if(bad&&OrderSiteContract.issues(bad).every(OrderSiteContract.isAwaiting)){window.OrderEmailLifecycle?.retry();refreshCompletionBadges();return;}if(bad){err('err-q3',OrderSiteContract.issues(bad)[0].message);editSite(bad.id);q3PaintErrors(OrderSiteContract.issues(bad));return;}err('err-q3','');if(changeOpen('q4'))navigateRegularStage('q4');}
function finishMode(){if(!requestValidationFeedback('q4-finish'))return;err('err-q4','');if(changeOpen(''))navigateRegularStage(null)}
$('start').onclick=()=>{if(!S.lines.length)S.open='q1';show('form')};$('form-back').onclick=()=>show('home');$('result-back').onclick=$('result-edit').onclick=()=>show('form');$('join-email').onclick=()=>{$('email-notice').hidden=false;$('email-notice').scrollIntoView({block:'nearest',behavior:'smooth'})};
document.querySelectorAll('.accordion-trigger[data-open]').forEach(b=>b.addEventListener('click',()=>changeOpen(S.open===b.dataset.open?'':b.dataset.open)));
$('picks-housing').onclick=$('picks-size').onclick=$('picks-pack').onclick=e=>{
 const b=e.target.closest('[data-pick]');if(!b)return;
 const field=b.dataset.pick,value=b.dataset.value;
 editing[field]=value;render();
 const note=$('err-q1');if(!note.hidden&&note.textContent.includes('난각번호')){if(selected(editing))err('err-q1','');else legacyErrorState('err-q1',note.textContent);}
 if(editorMode==='initial'&&selected(editing)){upsertSku();return;}
 requestAnimationFrame(()=>document.querySelector(`[data-pick="${CSS.escape(field)}"][data-value="${CSS.escape(value)}"]`)?.focus({preventScroll:true}));
};
for(const id of ['picks-housing','picks-size','picks-pack'])$(id).addEventListener('keydown',e=>{
 if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
 const b=e.target.closest('[data-pick]');if(!b)return;
 const options=[...$(id).querySelectorAll('[data-pick]')],i=options.indexOf(b);
 if(i<0)return;e.preventDefault();
 const delta=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;
 options[(i+delta+options.length)%options.length].click();
});$('commit-sku').onclick=()=>upsertSku(false);
$('q2-lines').addEventListener('change',e=>{const id=e.target.dataset.lineQtyUnit;if(!id)return;const line=lineById(id);if(!line)return;const allowed=['each',String(line.pack)==='30'?'tray':'pack'];if(!allowed.includes(e.target.value))return;Object.assign(line,convertMonthlyUnit(line,e.target.value));inlineDraft=true;void save(S,{publish:false});renderQ2();refreshCompletionBadges();});
$('q2-lines').addEventListener('input',e=>{const el=e.target;const id=el.dataset.lineQty||el.dataset.linePrice;if(!id)return;const l=lineById(id);if(!l)return;const old=el.value,pos=el.selectionStart??old.length,digitsBefore=old.slice(0,pos).replace(/\D/g,'').length;const digits=numericInput(old);if(digits===null){el.value=el.dataset.lineQty?showComma(quantityInputText(l)):showComma(l.price);return;}if(el.dataset.lineQty){const previousUnit=quantityUnit(l);for(const a of S.allocations.filter(a=>a.lineId===l.id))if(!a.monthlyDemandUnit)a.monthlyDemandUnit=previousUnit;delete l.qtyExact;l.qtyUnit=quantityDisplayUnit(l);}l[el.dataset.lineQty?'qty':'price']=digits;if(el.dataset.lineQty)q4InvalidateSiteDemand(id);const formatted=showComma(digits);el.value=formatted;let caret=0,count=0;while(caret<formatted.length&&count<digitsBefore){if(/\d/.test(formatted[caret]))count++;caret++}el.setSelectionRange(caret,caret);const demand=document.querySelector(`[data-line-demand="${CSS.escape(String(id))}"]`);if(demand)demand.textContent=quantityDisplayNote(l);const output=document.querySelector(`[data-line-subtotal="${CSS.escape(String(id))}"]`);if(output)output.textContent=lineSubtotal(l)===null?'입력 필요':w(lineSubtotal(l));$('q2-total').textContent=buyerTotal()===null?'입력 필요':w(buyerTotal());if($('err-q2')&&!$('err-q2').hidden){legacyErrorState('err-q2','계란별 월 구매량과 단가를 확인해 주세요.');if(buyerTotal()!==null)err('err-q2','');}refreshCompletionBadges();if(orderErrorExposure)renderOrderPageFeedback();inlineDraft=true;void save(S,{publish:false});});

$('q1-next').onclick=()=>{if(!guardPendingEdits('q1-next'))return;const bad=CODE1_ORDER_VALIDATION.validateOrderDraft(S,{scope:'full'}).fieldErrors.find(x=>x.stage==='q1');if(bad){errorAt('q1',bad.message);return;}err('err-q1','');if(changeOpen('q2'))navigateRegularStage('q2');};
let regularStageEpoch=0;
function cancelRegularStageNavigation(){regularStageEpoch++;}
window.addEventListener('wheel',cancelRegularStageNavigation,{passive:true});window.addEventListener('touchstart',cancelRegularStageNavigation,{passive:true});window.addEventListener('pointerdown',cancelRegularStageNavigation,{passive:true});
function navigateRegularStage(q){const seq=++regularStageEpoch;requestAnimationFrame(()=>{const animations=[...document.querySelectorAll('#page-form .t-acc-panel')].flatMap(e=>e.getAnimations());Promise.allSettled(animations.map(a=>a.finished)).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))).then(()=>{if(seq!==regularStageEpoch||$('q4-regular-dialog').open)return;const target=q?document.querySelector(`#section-${q}>.accordion-trigger`):$('to-result');if(!target)return;target.scrollIntoView({block:'nearest',behavior:'instant'});target.focus({preventScroll:true});});});}
$('q2-next').onclick=finishQty;
$('added-lines').addEventListener('click',e=>{
 const b=e.target.closest('[data-edit],[data-remove]');if(!b)return;
 if(b.dataset.remove){openSkuDeleteDialog(b.dataset.remove,b);return;}
 const l=lineById(b.dataset.edit);if(!l||!guardPendingEdits('sku-edit'))return;skuEditSnapshot={current:S.current,open:S.open,error:$('err-q1').textContent};skuRestoreCurrent=S.current;editing={...l};S.current=l.id;addingSku=false;editorMode='edit';skuConfirmationPending=false;changeOpen('q1',false);openSkuDialog(b);
});
const beginAdditionalSku=(fromQ2=false)=>{if(!guardPendingEdits('sku-add'))return;const fromButton=document.activeElement;skuEditSnapshot={current:S.current,open:S.open,error:$('err-q1').textContent};skuRestoreCurrent=S.current;q2AddOrigin=fromQ2;editing=empty();addingSku=true;S.current=null;editorMode='new';skuConfirmationPending=false;changeOpen('q1',false);openSkuDialog(fromButton);};
$('add-line').onclick=()=>beginAdditionalSku(false);
$('q2-add-line').onclick=()=>beginAdditionalSku(true);
$('cancel-sku').onclick=cancelSkuEditor;
$('sku-confirm-back').onclick=backFromSkuConfirmation;
$('sku-confirm-commit').onclick=()=>upsertSku(true);
window.OrderModalShell.bind($('sku-dialog'),()=>{if(skuConfirmationPending)backFromSkuConfirmation();else cancelSkuEditor();});
$('sku-delete-cancel').onclick=()=>closeSkuDeleteDialog(false);
$('sku-delete-commit').onclick=()=>closeSkuDeleteDialog(true);
window.OrderModalShell.bind($('sku-delete-dialog'),()=>closeSkuDeleteDialog(false));


// Q3 parent owns the durable transaction; address selection edits only its child draft.
function siteFocusDirty(){return false;}
function siteEditingDirty(){return !!siteEditing;}
function q4DraftActive(){return !!deliveryDraft||!!q4AssignmentDraft;}
function refreshCompletionBadges(){paintStageCompletion();updateResultCTA();}
function guardPendingEdits(destination){
 if(!storageReady)return false;
 if(storagePending||storageFailure){if(storageFailure)storageFeedback(storageFailure);return false;}
 if($('sku-delete-dialog').open){$('sku-delete-cancel').focus({preventScroll:true});return false;}
 if($('sku-dialog').open&&skuDraftActive()){err('err-q1','계란 규격을 저장하거나 취소한 후 이동해 주세요.');($('sku-confirm').hidden?$('commit-sku'):$('sku-confirm-commit')).focus({preventScroll:true});return false;}
 if(siteEditing){$('site-editor-error').textContent='사업장 편집을 저장하거나 취소한 후 이동해 주세요.';$('site-name').focus({preventScroll:true});return false;}
 if(document.querySelector('.ui-copy-dialog[open]')){document.querySelector('.ui-copy-dialog[open] [data-copy-cancel]')?.focus({preventScroll:true});return false;}
 if(q4DraftActive()){if($('q4-assignment-dialog').open)$('q4-assignment-cancel').focus({preventScroll:true});else $('q4-regular-save').focus({preventScroll:true});return false;}
 return true;
}
function q3FieldId(key){return {name:'site-name',address:'q3-address-slot',contactPhone:'site-contact-phone',email:'site-email',storePhone:'site-store-phone'}[key];}
function q3ReadInputs(){if(!siteEditing)return;for(const [key,id] of [['name','site-name'],['contactPhone','site-contact-phone'],['email','site-email'],['storePhone','site-store-phone']])siteEditing[key]=key.endsWith('Phone')?OrderPhone.get($(id)):$(id).value;}
function q3PaintAddress(){
 const trigger=$('q3-address-slot'),hasAddress=!!String(siteEditing?.road||'').trim();
 trigger.innerHTML=hasAddress?`${OrderIcons.svg('search')}<span class="ui-location-lines">${addressMarkup(siteEditing)}</span>`:`${OrderIcons.svg('search')}<span>소재지 검색</span>`;
 trigger.classList.toggle('ui-field-trigger--multiline',hasAddress);trigger.setAttribute('aria-label',hasAddress?'사업장 소재지 변경: '+addressLines(siteEditing).join(', '):'소재지 검색');
}
function q3PaintErrors(issues,{focus=true}={}){
 issues=issues.filter(i=>!OrderSiteContract.isAwaiting(i));const dialog=$('site-editor-dialog');dialog.querySelectorAll('[data-q3-field]').forEach(g=>{const issue=issues.find(i=>i.key===g.dataset.q3Field),input=$(q3FieldId(g.dataset.q3Field));g.dataset.error=String(!!issue);input?.setAttribute('aria-invalid',String(!!issue));if(g.dataset.q3Field.endsWith('Phone'))OrderPhone.instance(input)?.setInvalid(!!issue);
  const note=g.querySelector('.ui-field-error');if(!note)return;const visual=issue?.key==='email'&&issue?.code==='INVALID_SYNTAX';note.classList.toggle('ui-feedback-sr',!visual);note.textContent=visual?'이메일 형식을 확인해 주세요.':issue?.message||'';note.hidden=!issue;note.id='q3-'+g.dataset.q3Field+'-error';if(issue)input?.setAttribute('aria-describedby',note.id);else input?.removeAttribute('aria-describedby');
 });if(focus&&issues.length){const el=$(q3FieldId(issues[0].key));el?.scrollIntoView({block:'nearest',behavior:'instant'});el?.focus({preventScroll:true});orderShake(el?.closest('.ui-phone-shell')||el);}
}
function q3MountEditor(trigger){
 addressEditor.invalidate();siteEditGeneration++;
 const dialog=$('site-editor-dialog');q3EditorReturn=trigger||document.activeElement;q3EditorSelector=siteEditOriginal?`[data-site-edit="${CSS.escape(siteEditOriginal)}"]`:'#add-site';
 $('site-editor-title').textContent=siteEditOriginal?'사업장 수정':'사업장 추가';
 OrderPhone.mount($('site-contact-phone'));OrderPhone.mount($('site-store-phone'));OrderEmailUI.mount($('site-email'));
 for(const [key,id] of [['name','site-name'],['contactPhone','site-contact-phone'],['email','site-email'],['storePhone','site-store-phone']]){if(key.endsWith('Phone'))OrderPhone.set($(id),siteEditing[key]||'');else if(key==='email')OrderEmailUI.instance($(id)).reset(String(siteEditing[key]||''));else $(id).value=String(siteEditing[key]||'');}
 q3PaintAddress();
 q3SyncSaveAction();$('site-editor-error').textContent='';q3PaintErrors([]);
 OrderModalShell.open(dialog,{variant:'compact',returnFocus:()=>q3EditorReturn?.isConnected?q3EditorReturn:document.querySelector(q3EditorSelector),initialFocus:()=>$('site-name')});refreshCompletionBadges();
}
function addSite(){if(!guardPendingEdits('site-add'))return;siteEditOriginal=null;siteEditing=blankSite();q3MountEditor(document.activeElement);}
function editSite(id){if(!guardPendingEdits('site-edit'))return;const site=locationById(id);if(!site)return;siteEditOriginal=id;siteEditing=JSON.parse(JSON.stringify(site));q3MountEditor(document.activeElement);}
function closeSiteEditor(){addressEditor.invalidate();siteEditGeneration++;OrderEmailUI.instance($('site-email'))?.cancel();siteEditing=null;siteEditOriginal=null;q3SaveRevision++;q3SaveBusy=false;$('save-site').disabled=false;OrderModalShell.close($('site-editor-dialog'),{after:()=>{renderAddress();renderDelivery();refreshCompletionBadges();if(q4AssignmentDraft)paintQ4Assignment();}});}
let q3SaveRevision=0,q3SaveBusy=false;
function q3SyncSaveAction(){const button=$('save-site');if(!siteEditing){button.disabled=false;return;}const value=$('site-email').value,parsed=OrderEmail.parse(value),proof=OrderEmailDomain.status(value),checking=$('site-email').dataset.domainState==='CHECKING';
 const draft=!addressStatus(siteEditing).valid||parsed.valid&&!OrderEmailDomain.isSuccess(proof)&&!OrderEmailDomain.isHard(proof);
 button.dataset.saveIntent=draft?'draft':'valid';button.textContent=q3SaveBusy||checking?'확인 중':draft?'초안 저장':'저장';button.disabled=q3SaveBusy||checking;
}
async function saveSite(){
 if(!siteEditing||q3SaveBusy||addressEditor.isOpen)return false;OrderPhone.instance($('site-contact-phone'))?.commit();OrderPhone.instance($('site-store-phone'))?.commit();q3ReadInputs();const data=JSON.parse(JSON.stringify(siteEditing));data.name=String(data.name||'').trim();for(const k of ['contactPhone','email','storePhone'])data[k]=String(data[k]||'');
 const issues=OrderSiteContract.issues(data,{address:false,allowUnverified:true});if(issues.length){q3PaintErrors(issues);return false;}
 const intent=$('save-site').dataset.saveIntent||'valid',fingerprint=JSON.stringify(siteEditing),id=data.id,storedFingerprint=JSON.stringify(S.locations.find(x=>x.id===data.id)||null),revision=++q3SaveRevision;q3SaveBusy=true;q3SyncSaveAction();
 try{
  const emailProof=await OrderEmailUI.instance($('site-email')).check();
  if(revision!==q3SaveRevision||!siteEditing||siteEditing.id!==id||JSON.stringify(siteEditing)!==fingerprint||emailProof?.discarded)return false;
  if(JSON.stringify(S.locations.find(x=>x.id===id)||null)!==storedFingerprint){$('site-editor-error').textContent='사업장 정보가 변경되었습니다. 취소 후 다시 열어 주세요.';return false;}
  const confirmedIssues=OrderSiteContract.issues(data,{address:false,allowUnverified:intent==='draft'});if(confirmedIssues.length){q3PaintErrors(confirmedIssues);return false;}
  data.emailDomainState=OrderEmailDomain.status(data.email).state;data.mailboxVerified=false;
  data.addressState=addressStatus(data).state;data.basicInfoDraft=!addressStatus(data).valid||!OrderEmailDomain.isSuccess(OrderEmailDomain.status(data.email));
  if(intent!=='draft'&&data.basicInfoDraft){q3PaintErrors([{key:'email',code:'DOMAIN_UNCONFIRMED',message:'현재 이메일 주소를 확인할 수 없습니다.'}]);return false;}
  const index=S.locations.findIndex(x=>x.id===data.id);if(siteEditOriginal&&index<0){$('site-editor-error').textContent='사업장이 변경되었습니다. 취소 후 다시 열어 주세요.';return false;}
  const candidate={...S,locations:index<0?[...S.locations,data]:S.locations.map(x=>x.id===data.id?data:x)};
  const result=await save(candidate,{errorId:'site-editor-error',canCommit:()=>revision===q3SaveRevision&&!!siteEditing&&siteEditing.id===id&&JSON.stringify(siteEditing)===fingerprint});
  if(!result.ok)return false;q3Expanded.set(data.id,true);closeSiteEditor();renderDelivery();return true;
 }finally{if(revision===q3SaveRevision){q3SaveBusy=false;q3SyncSaveAction();}}
}
$('add-site').onclick=addSite;$('save-site').onclick=saveSite;$('cancel-site').onclick=closeSiteEditor;$('site-editor-close').onclick=closeSiteEditor;
$('q3-address-slot').onclick=()=>{if(siteEditing&&!q3SaveBusy)addressEditor.open($('q3-address-slot'));};
OrderModalShell.bind($('site-editor-dialog'),closeSiteEditor);
$('site-editor-dialog').addEventListener('input',e=>{if(!e.target.matches('input'))return;q3ReadInputs();const g=e.target.closest('[data-q3-field]');if(g?.dataset.error==='true'){const issue=OrderSiteContract.issues(siteEditing,{address:false}).find(i=>i.key===g.dataset.q3Field);if(!issue){g.dataset.error='false';e.target.removeAttribute('aria-invalid');g.querySelector('.ui-field-error').hidden=true;}}});
$('site-editor-dialog').addEventListener('order-phone-input',()=>{q3ReadInputs();if(!siteEditing)return;const exposed=[...$('site-editor-dialog').querySelectorAll('[data-q3-field][data-error="true"]')].map(g=>g.dataset.q3Field);q3PaintErrors(OrderSiteContract.issues(siteEditing,{address:false,allowUnverified:true}).filter(i=>exposed.includes(i.key)),{focus:false});});
$('site-editor-dialog').addEventListener('order-email-state',()=>{if(siteEditing){q3ReadInputs();q3SyncSaveAction();const exposed=$('site-editor-dialog').querySelector('[data-q3-field="email"]').dataset.error==='true';if(exposed)q3PaintErrors(OrderSiteContract.issues(siteEditing,{address:false,allowUnverified:true}),{focus:false});}refreshCompletionBadges();});
$('q3-sites').addEventListener('click',e=>{
 const t=e.target.closest('.q3-site-accordion > .accordion-trigger');if(t){const owner=t.parentElement,id=owner.id.slice('q3-site-'.length),open=t.getAttribute('aria-expanded')!=='true';q3Expanded.set(id,open);OrderDisclosure.set(owner,open);updateResultCTA();return;}
 const edit=e.target.closest('[data-site-edit]');if(edit){editSite(edit.dataset.siteEdit);return;}
 const copy=e.target.closest('[data-contact-copy]');if(copy){openContactCopy(copy.dataset.contactCopy,copy);return;}
 const q4=e.target.closest('[data-q3-q4-edit]');if(q4){if(!guardPendingEdits('q3-q4-edit'))return;openRegularQ4(q4.dataset.q3Q4Edit,q4);return;}
 const unlink=e.target.closest('[data-q3-unlink]');if(unlink){openSiteActionConfirm({kind:'unlink',id:unlink.dataset.q3Unlink,trigger:unlink});return;}
 const del=e.target.closest('[data-site-delete]');if(del){openSiteActionConfirm({kind:'site',id:del.dataset.siteDelete,trigger:del});}

});
const CONTACT_COPY_FIELDS=[['storePhone','매장 대표번호'],['contactPhone','담당자 전화번호'],['email','이메일']];
function contactCopyCheckbox(key,label,attrs,{multiline=false}={}){return `<label class="q4-check-row${multiline?' q4-check-row--multiline':''}"><input type="checkbox" ${attrs}><span class="q4-check-icon" aria-hidden="true">✓</span><span class="q4-check-copy">${esc(label)}</span></label>`;}
function openContactCopy(sourceId,trigger){
 if(!guardPendingEdits('contact-copy'))return;const source=locationById(sourceId);if(!source||S.locations.length<2)return;
 const validField=(key,value)=>String(value??'').trim()!==''&&(key==='email'?OrderSiteContract.email(value):OrderSiteContract.phone(value));
 const fields=CONTACT_COPY_FIELDS.map(([key,label])=>contactCopyCheckbox(key,label,`data-contact-copy-field="${key}"`)).join('');
 const targets=S.locations.filter(x=>x.id!==sourceId).map(x=>contactCopyCheckbox(x.id,siteName(x),`data-contact-copy-target="${esc(x.id)}"`,{multiline:true})).join('');
 const dialog=OrderCopyDialog.create({id:'q3-contact-copy',title:siteName(source)+' 연락처 복사',fields,targets,applyLabel:'변경'});document.body.append(dialog);
 const sourceBlock=document.createElement('section');sourceBlock.className='ui-copy-source';sourceBlock.setAttribute('aria-label','복사할 연락처');dialog.querySelector('.qa-copy-scroll').prepend(sourceBlock);
 const feedback=dialog.querySelector('#qa-copy-feedback');feedback.classList.add('ui-feedback-sr');
 let stage='select',review=null,applied=false,pending=false,closed=false,observed=JSON.stringify(source);
 const sourceView=()=>{const live=locationById(sourceId);sourceBlock.innerHTML=live?`<div class="ui-field-title">${esc(siteName(live))}</div><dl class="ui-copy-source-values">${CONTACT_COPY_FIELDS.map(([key,label])=>`<div><dt>${esc(label)}</dt><dd data-copy-source-value="${key}">${esc(live[key]??'')}</dd></div>`).join('')}</dl>`:'';};
 const collect=()=>{const live=locationById(sourceId),keys=[...dialog.querySelectorAll('[data-contact-copy-field]:checked')].map(e=>e.dataset.contactCopyField),ids=[...dialog.querySelectorAll('[data-contact-copy-target]:checked')].map(e=>e.dataset.contactCopyTarget);
  const valid=!!live&&keys.length>0&&ids.length>0&&keys.every(k=>CONTACT_COPY_FIELDS.some(f=>f[0]===k)&&validField(k,live[k]))&&ids.every(id=>id!==sourceId&&!!locationById(id));
  const patches=valid?ids.map(id=>{const target=locationById(id);return {id,name:siteName(target),snapshot:JSON.stringify(target),changes:keys.filter(key=>String(target[key]??'')!==String(live[key]??'')).map(key=>({key,label:CONTACT_COPY_FIELDS.find(f=>f[0]===key)[1],before:String(target[key]??''),after:String(live[key]??'')}))};}).filter(p=>p.changes.length):[];
  return {valid,keys,ids,patches,sourceSnapshot:live?JSON.stringify(live):'',targetSnapshots:ids.map(id=>[id,JSON.stringify(locationById(id))])};
 };
 const syncSelection=()=>{const live=locationById(sourceId);if(JSON.stringify(live)!==observed){observed=JSON.stringify(live);sourceView();}
  dialog.querySelectorAll('[data-contact-copy-field]').forEach(box=>{box.disabled=!live||!validField(box.dataset.contactCopyField,live[box.dataset.contactCopyField]);if(box.disabled)box.checked=false;});
  dialog.querySelectorAll('[data-contact-copy-target]').forEach(box=>{const target=locationById(box.dataset.contactCopyTarget);box.disabled=!target||target.id===sourceId;if(target)box.closest('label').querySelector('.q4-check-copy').textContent=siteName(target);if(box.disabled)box.checked=false;});
  const v=collect();dialog.querySelector('[data-copy-apply]').disabled=!v.valid||!v.patches.length;dialog.querySelector('#qa-copy-count').textContent=v.keys.length+'개';dialog.querySelector('[data-ui-subaccordion]').dataset.complete=String(v.keys.length>0);return v;
 };
 function selectStage(){stage='select';review=null;dialog.dataset.copyStage='select';dialog.setAttribute('aria-label',(locationById(sourceId)?siteName(locationById(sourceId)):'')+' 연락처 복사');dialog.querySelector('.qa-copy-title').textContent=dialog.getAttribute('aria-label');dialog.querySelector('.qa-copy-accordion-area').hidden=false;dialog.querySelector('.qa-copy-target-group').hidden=false;sourceBlock.hidden=false;const preview=dialog.querySelector('[data-copy-preview]');preview.innerHTML='';preview.classList.remove('ui-copy-review');dialog.querySelector('[data-copy-apply]').textContent='변경';dialog.querySelector('.qa-copy-scroll').scrollTop=0;sourceView();syncSelection();}
 function reviewStage(v){review={...v};stage='review';dialog.dataset.copyStage='review';dialog.setAttribute('aria-label','연락처 변경 확인');dialog.querySelector('.qa-copy-title').textContent='연락처 변경 확인';dialog.querySelector('.qa-copy-accordion-area').hidden=true;dialog.querySelector('.qa-copy-target-group').hidden=true;sourceBlock.hidden=true;
  const preview=dialog.querySelector('[data-copy-preview]');preview.classList.add('ui-copy-review');preview.innerHTML=OrderCopyDialog.renderReview(v.patches,{prefix:'q3-contact-review'});
  dialog.querySelector('[data-copy-apply]').textContent='확인';dialog.querySelector('[data-copy-apply]').disabled=!v.patches.length;dialog.querySelector('.qa-copy-scroll').scrollTop=0;preview.querySelector('.ui-copy-review-heading')?.focus({preventScroll:true});
 }
 const close=()=>{closed=true;dialog.querySelector('[data-copy-apply]').disabled=true;return OrderModalShell.close(dialog,{after:()=>dialog.remove()});};
 dialog.addEventListener('change',()=>{if(stage==='select')syncSelection();});
 dialog.addEventListener('click',async e=>{
  if(closed)return;
  if(e.target.closest('[data-copy-cancel]')){close();return;}
  const toggle=e.target.closest('[data-copy-accordion]');if(toggle){OrderDisclosure.set(toggle.closest('[data-ui-subaccordion]'),toggle.getAttribute('aria-expanded')!=='true');return;}
  if(!e.target.closest('[data-copy-apply]')||applied||pending)return;
  if(stage==='select'){const v=syncSelection();if(v.valid&&v.patches.length)reviewStage(v);return;}
  const current=collect();const intact=review&&current.valid&&JSON.stringify(locationById(sourceId))===review.sourceSnapshot&&review.targetSnapshots.every(([id,snapshot])=>id!==sourceId&&JSON.stringify(locationById(id))===snapshot)&&JSON.stringify(current.keys)===JSON.stringify(review.keys)&&JSON.stringify(current.ids)===JSON.stringify(review.ids)&&review.patches.every(p=>p.changes.every(c=>validField(c.key,c.after)));
  if(!intact){selectStage();dialog.querySelector('[data-copy-cancel]').focus({preventScroll:true});return;}
  const patchById=new Map(review.patches.map(p=>[p.id,p]));
  const staged=S.locations.map(site=>{const patch=patchById.get(site.id);if(!patch)return site;const next=JSON.parse(JSON.stringify(site));patch.changes.forEach(c=>next[c.key]=c.after);return next;});
  if(review.patches.some(p=>!staged.some(s=>s.id===p.id))) {selectStage();return;}
  pending=true;dialog.querySelector('[data-copy-apply]').disabled=true;const base=JSON.stringify(S.locations);
  const result=await save({...S,locations:staged},{errorId:'qa-copy-feedback',canCommit:()=>!closed&&dialog.open&&JSON.stringify(S.locations)===base});pending=false;
  if(!result.ok){if(!closed)dialog.querySelector('[data-copy-apply]').disabled=false;return;}applied=true;renderAddress();renderDelivery();refreshCompletionBadges();close();
 });
 OrderModalShell.bind(dialog,close);OrderModalShell.open(dialog,{variant:'copy',returnFocus:()=>document.querySelector(`[data-contact-copy="${CSS.escape(sourceId)}"]`),initialFocus:()=>dialog.querySelector('[data-copy-cancel]')});selectStage();
}
function paintQ4Assignment(){const c=q4AssignmentDraft;if(!c)return;const container=$('q4-assignment-options'),shape=S.locations.map(s=>s.id).join('|');
 if(container.dataset.shape!==shape){container.dataset.shape=shape;container.innerHTML=S.locations.map(site=>`<div class="q4-assignment-row" data-assignment-row="${esc(site.id)}">${contactCopyCheckbox(site.id,siteName(site),`data-assignment-site="${esc(site.id)}"`,{multiline:true})}<button type="button" class="ui-copy-action" data-copy-align="end" data-assignment-repair="${esc(site.id)}"></button></div>`).join('');}
 for(const site of S.locations){const row=container.querySelector(`[data-assignment-row="${CSS.escape(site.id)}"]`),box=row.querySelector('input'),action=row.querySelector('[data-assignment-repair]'),basic=OrderSiteContract.basicIssues(site),selected=c.selected.includes(site.id);
  // Selection owns stable identity only; Q3 completeness remains in the final verdict.
  box.checked=selected;box.disabled=!String(site.id||'').trim();row.dataset.error='false';box.removeAttribute('aria-invalid');
  row.querySelector('.q4-check-copy').textContent=siteName(site);action.dataset.repairKind='edit';action.hidden=basic.length===0;action.disabled=false;action.textContent='수정';action.setAttribute('aria-label',siteName(site)+' 기본정보 수정');
 }
 $('q4-assignment-clear').hidden=!S.allocations.some(a=>a.lineId===c.lineId);$('q4-assignment-clear').innerHTML=OrderIcons.svg('unlink')+'<span>모든 연결 해제</span>';
}
function requestAssignmentProof(siteId,force=false){const c=q4AssignmentDraft,site=locationById(siteId),parsed=OrderEmail.parse(site?.email);if(!c||!parsed.valid||c.checking.has(siteId))return;const token=site.email;
 c.checking.add(siteId);paintQ4Assignment();OrderEmailDomain.validate(parsed.domain,{force,signal:c.controller.signal}).then(()=>{if(q4AssignmentDraft!==c)return;c.checking.delete(siteId);paintQ4Assignment();if(locationById(siteId)?.email===token)refreshCompletionBadges();});
}
function openQ4Assignment(lineId,trigger){if(!guardPendingEdits('q4-assignment'))return;const line=lineById(lineId);if(!line)return;
 const selected=S.allocations.filter(a=>a.lineId===lineId).map(a=>a.locationId);q4AssignmentDraft={lineId,selected:[...selected],originalIds:[...selected],trigger,checking:new Set(),controller:new AbortController(),exposed:false,transitioning:false};
 $('q4-assignment-title').textContent=itemIdentity(line)+' 납품 사업장';$('q4-assignment-error').textContent='';delete $('q4-assignment-options').dataset.shape;paintQ4Assignment();
 OrderModalShell.open($('q4-assignment-dialog'),{variant:'compact',returnFocus:()=>trigger?.isConnected?trigger:document.querySelector(`[data-q4-select-sites="${CSS.escape(lineId)}"]`)});
 // One proof request per relevant site on entry; never a renderer-side network loop.
 for(const site of S.locations)if(!OrderSiteContract.basicIssues(site).length&&!OrderEmailDomain.isSuccess(OrderEmailDomain.status(site.email)))requestAssignmentProof(site.id);
 refreshCompletionBadges();
}
function closeQ4Assignment(){q4AssignmentDraft?.controller.abort();q4AssignmentDraft=null;OrderModalShell.close($('q4-assignment-dialog'));refreshCompletionBadges();}
$('q4-assignment-cancel').onclick=closeQ4Assignment;OrderModalShell.bind($('q4-assignment-dialog'),closeQ4Assignment);
$('q4-assignment-options').addEventListener('change',e=>{const c=q4AssignmentDraft,box=e.target.closest('[data-assignment-site]');if(!c||!box)return;const id=box.dataset.assignmentSite;c.selected=box.checked?[...new Set([...c.selected,id])]:c.selected.filter(x=>x!==id);paintQ4Assignment();});
$('q4-assignment-options').addEventListener('click',e=>{const action=e.target.closest('[data-assignment-repair]'),c=q4AssignmentDraft;if(!action||!c)return;const id=action.dataset.assignmentRepair;
 // Reuse the existing Q3 editor as a child of the selection dialog. Its return
 // trigger stays in the parent and the selection draft is not committed or lost.
 q4AssignmentDraft=null;editSite(id);q4AssignmentDraft=c;if(siteEditing)q3PaintErrors(OrderSiteContract.issues(siteEditing,{allowUnverified:true}));
});
$('q4-assignment-next').onclick=()=>{const c=q4AssignmentDraft;if(!c||c.transitioning)return;const ids=[...c.selected],bad=ids.find(id=>!String(id||'').trim()||!locationById(id));
 if(!ids.length||bad){c.exposed=true;$('q4-assignment-error').textContent=bad?'사업장 연결을 다시 확인해 주세요.':'납품 사업장을 선택해 주세요.';paintQ4Assignment();const target=bad?$('q4-assignment-options').querySelector(`[data-assignment-repair="${CSS.escape(bad)}"]`):$('q4-assignment-options').querySelector('input:not(:disabled)');target?.focus({preventScroll:true});orderShake(target?.closest('.q4-assignment-row')||$('q4-assignment-options'));return;}
 // Incomplete Q3 records may own delivery drafts. Completion and result gates
 // still consume the unchanged strict parent verdict, including mail proof.
 const allocations=ids.map(id=>JSON.parse(JSON.stringify(S.allocations.find(a=>a.lineId===c.lineId&&a.locationId===id)||blankAllocation(c.lineId,id))));c.transitioning=true;c.controller.abort();q4AssignmentDraft=null;
 OrderModalShell.close($('q4-assignment-dialog'),{immediate:true,after:()=>beginQ4Context(c.lineId,allocations,allocations[0].id,c.trigger,true)});
};
$('q4-assignment-clear').onclick=()=>{const c=q4AssignmentDraft;if(!c)return;openSiteActionConfirm({kind:'line-unlink',id:c.lineId,trigger:$('q4-assignment-clear')});};
$('allocations-delivery').addEventListener('click',e=>{const select=e.target.closest('[data-q4-select-sites]');if(select){openQ4Assignment(select.dataset.q4SelectSites,select);return;}const toggle=e.target.closest('[data-q4-body-toggle]');if(toggle){q4BodySetExpanded(toggle.closest('.q4-body-item'),toggle.getAttribute('aria-expanded')!=='true');return;}const b=e.target.closest('[data-edit-allocation]');if(b){q4BodySetExpanded(b.closest('.q4-body-item'),true);openRegularQ4(b.dataset.editAllocation,b);return;}const del=e.target.closest('[data-delete-allocation]');if(del&&allocationById(del.dataset.deleteAllocation)){q4DeleteCandidateId=del.dataset.deleteAllocation;q4DeleteReturn=del;const line=allocationById(q4DeleteCandidateId);$('q4-delete-context').textContent=itemIdentity(lineById(line.lineId))+' · '+siteName(locationById(line.locationId));showQ1Modal($('q4-delete-confirm'));}});

// MSG0325: regular page allocation editor. The separate planning QA HTML is never embedded.
let q4DeleteCandidateId=null,q4DeleteReturn=null;


let q4SiteDemandDraft=null,q4OnceDraft=null,q4SuspendedDraft=null,q4ValidationAttempted=false,orderErrorExposure=false;
const q4SitesForLine=id=>S.allocations.filter(a=>a.lineId===id);
function q4InvalidateSiteDemand(lineId){ /* Derived monthly drafts recalculate on open; saved delivery quantities are independent. */ }
















// MSG0340: seed checkbox state on mount; animate only an actual false -> true event
// on the same live input. Restored state, rebuilt DOM and sibling changes never animate.




const q4ValidInteger=v=>/^[1-9]\d*$/.test(String(v??''))&&Number.isSafeInteger(Number(v));
// V5 P1 candidate only: Q4 per-delivery amounts are in 1..99999. Q2 global quantity validator is unchanged.
const q4ValidAmount=v=>q4ValidInteger(v)&&Number(v)<=99999;





function openRegularQ4(id,trigger){return q4ReviewOpen(id,trigger);}

function closeRegularQ4(){window.OrderQ4Review.close();}







































// Align the portaled menu to its own trigger while the dialog scrolls/resizes.


$('q4-delete-cancel').onclick=()=>{hideQ1Modal($('q4-delete-confirm'),()=>{q4DeleteCandidateId=null;q4DeleteReturn?.focus({preventScroll:true});});};
$('q4-delete-confirm').addEventListener('cancel',e=>{e.preventDefault();$('q4-delete-cancel').click();});
let q4DeleteSaving=false;
$('q4-delete-commit').onclick=async()=>{if(!q4DeleteCandidateId||q4DeleteSaving)return;const id=q4DeleteCandidateId;q4DeleteSaving=true;const result=await save({...S,allocations:S.allocations.filter(a=>a.id!==id)},{errorId:'q4-delete-error',canCommit:()=>q4DeleteCandidateId===id&&$('q4-delete-confirm').open&&!$('q4-delete-confirm').classList.contains('is-closing')});q4DeleteSaving=false;if(!result.ok)return;q4DeleteCandidateId=null;hideQ1Modal($('q4-delete-confirm'),()=>{render();document.querySelector('#allocations-delivery')?.focus({preventScroll:true});});};
let q4PendingConfirmation=null;
const q4OnceConfirmDialog=document.createElement('dialog');q4OnceConfirmDialog.id='q4-once-month-confirm';q4OnceConfirmDialog.className='q1-sku-dialog q1-delete-dialog t-modal';
q4OnceConfirmDialog.innerHTML='<h2 id="q4-once-confirm-heading">1회 납품 수량 확인</h2><p id="q4-once-confirm-description"></p><div id="q4-once-confirm-sites"></div><p>이번 1회 납품 수량이 월 사용량 이상입니다. 입력한 수량이 맞나요?</p><div class="sku-delete-actions ui-transaction-group"><button type="button" class="ui-transaction-action" id="q4-once-return">수정하기</button><button type="button" class="ui-transaction-action ui-transaction-action--primary" id="q4-once-approve">맞습니다, 저장</button></div>';
document.body.append(q4OnceConfirmDialog);
















$('q3-next').onclick=finishAddress;
$('q4-next').onclick=()=>finishMode();

$('page-form').addEventListener('click',e=>{if(e.target.id==='review-incomplete'){requestValidationFeedback('review');return;}const b=e.target.closest('[data-issue-id]');if(!b||!b.closest('#order-incomplete-list'))return;const issue=orderPageIssues.find(x=>x.issueId===b.dataset.issueId);navigateOrderIssue(issue)});
$('to-result').onclick=()=>{if(!guardPendingEdits('result'))return;if(!orderValidationProjection().valid)return requestValidationFeedback('result');err('form-error','');show('result');};



function fromHash(){if(addressEditor.isOpen){addressEditor.cancel('back');history.replaceState({},'',`#/${current}`);return;}if(siteEditing){closeSiteEditor();history.replaceState({},'',`#/${current}`);return;}if(!guardPendingEdits('browser-back')){history.replaceState({},'',`#/${current}`);return;}let name=location.hash.replace('#/','');if(name==='result'&&!complete())show('form',false);else show(['home','form','result'].includes(name)?name:'home',false)}window.addEventListener('popstate',fromHash);
// MSG0460: explicit regular-state boundary. No provider, price or DB writes.
let q4ReviewContext=null,q4ReviewPending=null,q4ReviewCommitCount=0;
const q4ReviewClone=x=>JSON.parse(JSON.stringify(x));
function q4ReviewIssue(a,key,message){return {issueId:`q4:${a.lineId}:${a.locationId}:${key}`,stage:'q4',field:`${a.id}:${key}`,fieldKey:key,lineId:a.lineId,siteId:a.locationId,code:'BLOCK_REQUIRED',errorCode:'BLOCK_REQUIRED',severity:'error',blocking:true,message,humanMessage:message};}
function q4ReviewAllocationIssues(a,all=S.allocations){
 if(a.q4Review?.version!=='0460')return null;
 const z=[],put=(k,m)=>z.push(q4ReviewIssue(a,k,m)),num=v=>/^\d+$/.test(String(v??''))&&+v>0&&+v<=99999;
 if(!a.modeExplicit||!['FLEX','FIXED','ONCE'].includes(a.mode))put('mode','납품 방식을 선택해 주세요.');
 if(!a.advanced?.contactChannels?.length)put('contact','연락 수단을 하나 이상 선택해 주세요.');
 if(!num(a.qty))put('qty',a.mode==='ONCE'?'1회 납품량을 입력해 주세요.':'회당 예상 납품 수량을 입력해 주세요.');
 if(a.mode==='ONCE'){const result=window.OrderDatePolicy.validate(a.q4Review?.deliveryDate);if(!result.valid)put('desired-date',result.message);}
 if(a.mode!=='ONCE'){
  // Monthly quantities and explicit units are validated once by the shared allocation contract.
  if(a.variableQty){if(!num(a.qtyMin))put('min','최소 수량을 입력해 주세요.');if(!num(a.qtyMax))put('max','최대 수량을 입력해 주세요.');
   if(num(a.qtyMin)&&num(a.qtyMax)&&+a.qtyMin>+a.qtyMax)put('min','최소 수량이 최대 수량을 초과합니다.');
   if(num(a.qty)&&num(a.qtyMin)&&+a.qty<+a.qtyMin)put('qty','회당 수량이 최소 수량보다 작습니다.');
   if(num(a.qty)&&num(a.qtyMax)&&+a.qty>+a.qtyMax)put('qty','회당 수량이 최대 수량보다 큽니다.');}
  const h=a.q4Review.activeHoliday;if(!h||!(h.days?.length||h.none||h.irregular))put('holiday-days','매장 정기 휴무일 또는 없음·일정하지 않음을 선택해 주세요.');
  if(!h||['','선택 안 함',null,undefined].includes(h.conflict))put('holiday-conflict','휴무일 납품 충돌 시 대응을 선택해 주세요.');
 }
  if(a.mode==='FIXED'){
   const r=OrderRepeatContract.fromAllocation(a),contract=OrderRepeatContract.inspect(r);if(!contract.valid){if(contract.issue.kind==='weekdays'){for(const week of contract.week.filter(w=>!w.complete))put('weekdays-'+week.number,week.number+'주차 희망요일 개수를 확인해 주세요.');}else put(contract.issue.kind,contract.issue.message);}
   else if(r.semantics==='per-week-v1'){const expected=OrderRepeatContract.serialize(r).value;for(const key of ['intervalWeeks','frequencyPerWeek','freq','cycleCount','monthDay','scheduleDetail','weekPlans'])if(JSON.stringify(a[key])!==JSON.stringify(expected[key])){put('repeat-contract','반복 횟수와 저장된 주차 계획이 일치하지 않습니다. 다시 저장해 주세요.');break;}}
  }

 return z;
}
function monthlyIssues(source,line,allocations){
 const result=inspectMonthlyAllocations({line,allocations,locations:source.locations,revision:source.allocationRevision||0});
 return (result.issues||[]).map(issue=>{const allocation=allocations.find(a=>a.locationId===issue.locationId)||allocations[0];return {...q4ReviewIssue(allocation,'monthly',issue.message),code:issue.code,fieldKey:'monthly'};});
}
function q4ReviewVerdict(source=S,confirmation=null){
 const legacy=CODE1_ORDER_VALIDATION.validateOrderDraft(source,{scope:'full',confirmedFingerprint:confirmation});
 const currentLines=new Set(source.lines.filter(l=>{const a=source.allocations.filter(x=>x.lineId===l.id);return a.length&&a.every(x=>x.q4Review?.version==='0460');}).map(l=>l.id));
 const issues=legacy.fieldErrors.filter(e=>e.stage!=='q4'||!currentLines.has(e.lineId)||e.code==='BLOCK_ASSIGNMENT');
 const confirmations=[]; // Shared ONCE quantities own warnings for both restored and current records.
 for(const a of source.allocations)if(currentLines.has(a.lineId))issues.push(...q4ReviewAllocationIssues(a,source.allocations));
 for(const line of source.lines){
  const allocations=source.allocations.filter(a=>a.lineId===line.id);if(!allocations.length)continue;
  issues.push(...monthlyIssues(source,line,allocations));
  const once=inspectOnceAllocations({line,allocations,locations:source.locations,revision:source.allocationRevision||0});
  for(const issue of once.issues||[]){const a=allocations.find(a=>a.locationId===issue.locationId)||allocations[0];issues.push({...q4ReviewIssue(a,'once',issue.message),code:issue.code});}
  if(once.confirmation&&once.confirmation.fingerprint!==confirmation)confirmations.push({...once.confirmation,stage:'q4',code:'ONCE_AT_LEAST_MONTH',sites:once.confirmation.sites.map(site=>({...site,name:source.locations.find(l=>l.id===site.locationId)?.name||'사업장'}))});
 }
 return {...legacy,issues,fieldErrors:issues,confirmations,groupErrors:issues.filter(x=>x.fieldKey==='monthly'),valid:issues.length===0,resultStatus:issues.length?'BLOCK_REQUIRED':confirmations.length?'NEED_CONFIRMATION':'ESTIMATE_VALID'};
}
function q4ReviewOpen(id,trigger){if(deliveryDraft||q4AssignmentDraft)return false;const a=allocationById(id);if(!a)return false;return beginQ4Context(a.lineId,S.allocations.filter(x=>x.lineId===a.lineId),id,trigger,false);}
function beginQ4Context(lineId,allocations,id,trigger,selectionPending=false){
 const line=lineById(lineId);if(!line||!allocations.length)return false;const locations=allocations.map(a=>locationById(a.locationId));if(locations.some(x=>!x))return false;
 const selector=trigger?.dataset.q3Q4Edit?`[data-q3-q4-edit="${CSS.escape(id)}"]`:trigger?.dataset.q4SelectSites?`[data-q4-select-sites="${CSS.escape(lineId)}"]`:`[data-edit-allocation="${CSS.escape(id)}"]`;
 q4ReviewContext={openingAllocations:q4ReviewClone(allocations),id,lineId,ids:allocations.map(a=>a.id),selectionPending,signature:JSON.stringify([line,S.allocations.filter(a=>a.lineId===lineId),S.locations]),returnSelector:selector,trigger,scrollY:scrollY};
 deliveryDraft=q4ReviewClone(allocations.find(a=>a.id===id)||allocations[0]);editingAllocationId=id;
 window.OrderQ4Review.open({revision:S.allocationRevision||0,line:q4ReviewClone(line),allocations:q4ReviewClone(allocations),locations:q4ReviewClone(locations),selectedIndex:Math.max(0,allocations.findIndex(a=>a.id===id)),returnSelector:selector});$('q4-regular-dialog').dataset.entryOrigin=trigger?.dataset.q3Q4Edit?'q3':'q4';$('q4-regular-save').textContent=locations.some(site=>!siteValid(site))?'초안 저장':trigger?.dataset.q3Q4Edit?'적용':'저장';refreshCompletionBadges();return true;
}
function q4ReviewClosed(){q4ReviewContext=null;deliveryDraft=null;editingAllocationId=null;q4ReviewPending=null;q4ValidationAttempted=false;q4SiteDemandDraft=null;q4OnceDraft=null;if(q4OnceConfirmDialog.open)q4OnceConfirmDialog.close();err('err-q4','');renderDelivery();renderAddress();refreshCompletionBadges();}
async function q4ReviewCommit(patches,confirmedFingerprint=null,canCommit=()=>true){
 const c=q4ReviewContext;if(!c)return {ok:false,message:'열린 납품 조건이 없습니다.'};if(!canCommit())return {ok:false,status:'CANCELLED',message:'입력이 변경되었습니다. 다시 저장해 주세요.'};
 const current=S.allocations.filter(a=>a.lineId===c.lineId),line=lineById(c.lineId),locations=current.map(a=>locationById(a.locationId));
 if(JSON.stringify([line,current,S.locations])!==c.signature)return {ok:false,message:'상위 입력이 변경되었습니다. 취소 후 다시 열어 주세요.'};
 if(patches.length!==c.ids.length||patches.some(a=>!c.ids.includes(a.id)||a.lineId!==c.lineId||c.openingAllocations.find(open=>open.id===a.id)?.locationId!==a.locationId))return {ok:false,message:'사업장 연결을 다시 확인해 주세요.'};
 if(new Set(patches.map(a=>a.id)).size!==patches.length||new Set(patches.map(a=>a.locationId)).size!==patches.length||patches.some(a=>!locationById(a.locationId)))return {ok:false,message:'사업장 연결이 올바르지 않습니다.'};
 const staged=[...S.allocations.filter(a=>a.lineId!==c.lineId).map(q4ReviewClone),...patches.map(q4ReviewClone)];
 const candidate={...S,allocations:staged},verdict=q4ReviewVerdict(candidate,confirmedFingerprint);
 // Delivery-draft saving does not promote incomplete Q3 data. The full verdict
 // is still required by badges, completion and the final result gate.
 const blocking=verdict.fieldErrors.filter(e=>e.stage!=='q3'&&(e.stage!=='q4'||e.lineId===c.lineId));
 if(blocking.length)return {ok:false,message:blocking[0].message,issues:blocking};
 const warning=verdict.confirmations.find(w=>w.lineId===c.lineId);
 if(warning){q4ReviewPending={patches:q4ReviewClone(patches),warning,canCommit};
  $('q4-once-confirm-description').textContent=`${itemIdentity(line)} · 월 사용량 ${warning.monthly}${warning.baseUnit==='each'?'개':unit(line.pack)} · 이번 납품 총 ${warning.total}${warning.baseUnit==='each'?'개':unit(line.pack)}`;
  $('q4-once-confirm-sites').textContent=warning.sites.map(x=>`${x.name} ${x.qty}${unit(line.pack)}`).join(' · ');
  showQ1Modal(q4OnceConfirmDialog);return {ok:false,confirmation:true};
 }
 if(confirmedFingerprint)staged.filter(a=>a.lineId===c.lineId&&a.mode==='ONCE').forEach(a=>a.onceConfirmedFingerprint=confirmedFingerprint);
 // The only committed-state assignment; repeated Save clicks cannot apply again after closing.
 const result=await save({...S,allocations:staged},{errorId:'q4-commit-error',canCommit:()=>canCommit()&&q4ReviewContext===c&&(!confirmedFingerprint||q4ReviewPending?.warning.fingerprint===confirmedFingerprint&&q4OnceConfirmDialog.open&&!q4OnceConfirmDialog.classList.contains('is-closing'))&&$('q4-regular-dialog').open&&!$('q4-regular-dialog').classList.contains('is-closing')&&JSON.stringify([lineById(c.lineId),S.allocations.filter(a=>a.lineId===c.lineId),S.locations])===c.signature});
 if(!result.ok)return {...result,message:result.status==='CANCELLED'?'저장을 취소했습니다.':storageText(result)};q4ReviewCommitCount++;q4ReviewPending=null;return {ok:true};
}
window.OrderRegularQ4Bridge=Object.freeze({
 allocationContext:lineId=>{const id=lineId||q4ReviewContext?.lineId;const allocations=q4ReviewContext?.selectionPending&&id===q4ReviewContext.lineId?q4ReviewContext.openingAllocations:S.allocations.filter(a=>a.lineId===id);return q4ReviewClone({line:lineById(id),allocations,locations:S.locations,revision:S.allocationRevision||0});},
 inspect:patches=>{const line=lineById(patches[0]?.lineId);return [...patches.flatMap(a=>q4ReviewAllocationIssues(a,patches)||[]),...(line?monthlyIssues(S,line,patches):[])];},open:q4ReviewOpen,commit:q4ReviewCommit,closed:q4ReviewClosed,
 get commitCount(){return q4ReviewCommitCount;},get committed(){return q4ReviewClone(S);},
 forecast({allocation,quantity,rangeMin,rangeMax,variable,repeat,period,frequency,date,monthly}){
  const line=lineById(allocation.lineId)||q4ReviewContext&&lineById(q4ReviewContext.lineId),now=OrderDatePolicy.today();
  const weekDays=['월','화','수','목','금','토','일'];
  const packed=OrderRepeatContract.serialize(repeat||{period,frequency,date,weeklyCheck:false,weekdays:{}});
  const plans=(packed.ok?packed.value.weekPlans:[]).map(plan=>(plan.weekdays||[]).map(day=>weekDays.indexOf(day)+1));
  const intent=OrderRepeatContract.monthValue(date);
  const schedule=period==='매월'?{kind:'MONTHLY',day:intent.valid?(intent.value==='last'?'last':Number(intent.value)):null}:period==='매주'?{kind:'WEEKLY',weekdays:plans[0]||[]}:{kind:'CYCLE',weekPlans:plans,anchorDate:allocation.cycleAnchorDate};
  const policy=allocation.calendarPolicy; // Only explicitly approved policy is forwarded; no four-week or holiday default.
  const result=calendarForecast({year:now.year,month:now.month,mode:allocation.mode,quantity:String(quantity),...(variable?{range:{min:String(rangeMin),max:String(rangeMax)}}:{}),schedule,calendarPolicy:policy});
  if(result.status!=='VALID'||!line||!validMonthlyQuantity(line)||!['10','20','30'].includes(String(line.pack)))return {resolved:false,status:allocation.mode==='FLEX'?'실제 주문 일정에 따라 달라집니다.':'납품일·휴무일 적용 기준 확인 필요',evidence:result};
  const low=fromRatio(result.normalized.low),high=fromRatio(result.normalized.high),demand=baseQuantity(line,monthly),factor=quantityFactor(line,String(line.pack)==='30'?'tray':'pack');
  const lowDelta=compare(multiply(low,factor),demand),highDelta=compare(multiply(high,factor),demand),comparison=lowDelta===0&&highDelta===0?'equal':highDelta<0?'short':lowDelta>0?'over':'range';
  return {resolved:true,low:exactDisplay(result.normalized.low),high:exactDisplay(result.normalized.high),comparison,status:comparison==='equal'?'월 사용량과 동일':comparison==='short'?'월 사용량보다 미달':comparison==='over'?'월 사용량보다 초과':'납품 수량 범위에 따라 달라집니다.',evidence:result};
 }

});
$('q4-once-return').onclick=()=>{q4ReviewPending=null;window.OrderModalShell.close(q4OnceConfirmDialog,{after:()=> $('q4-regular-save').focus({preventScroll:true})});};
let onceSaving=false;
$('q4-once-approve').onclick=async()=>{if(!q4ReviewPending||onceSaving)return;onceSaving=true;const p=q4ReviewPending,r=await q4ReviewCommit(p.patches,p.warning.fingerprint,p.canCommit);onceSaving=false;if(!q4OnceConfirmDialog.open||!r.ok&&q4ReviewPending!==p)return;if(r.ok){window.OrderModalShell.close(q4OnceConfirmDialog,{immediate:true,after:()=>window.OrderQ4Review.close()});}else if(!r.confirmation){q4ReviewPending=null;window.OrderModalShell.close(q4OnceConfirmDialog,{immediate:true,after:()=>window.OrderQ4Review.commitError(r)});}};
window.OrderModalShell.bind(q4OnceConfirmDialog,()=> $('q4-once-return').click());


/* MSG0494: restored data is rechecked independently of any editor. One timer,
   two concurrent domain jobs, three transient attempts, no render-side polling.
   Proof is session-memory evidence, never a persisted PASS string. */
window.OrderEmailLifecycle=Object.freeze((()=>{
 const jobs=new Map();let timer=0,paintQueued=false,stopped=false,booted=false,lastRetry=0;
 function domains(){return new Set(S.locations.map(site=>OrderEmail.parse(site.email)).filter(p=>p.valid).map(p=>p.domain));}
 function paint(){if(paintQueued||!booted)return;paintQueued=true;queueMicrotask(()=>{paintQueued=false;paintStageCompletion();updateResultCTA();renderOrderPageFeedback();if(q4AssignmentDraft)paintQ4Assignment();if(siteEditing){q3SyncSaveAction();if($('site-editor-dialog').querySelector('[data-error="true"]'))q3PaintErrors(OrderSiteContract.issues(siteEditing,{address:false}),{focus:false});}});}
 function schedule(){clearTimeout(timer);timer=0;if(stopped||[...jobs.values()].filter(j=>j.running).length>=2)return;const active=domains();let next=Infinity;for(const [domain,j]of jobs){if(!active.has(domain)){jobs.delete(domain);continue;}if(!j.running&&j.attempts<3)next=Math.min(next,j.at);}
  if(Number.isFinite(next))timer=setTimeout(pump,Math.max(100,next-Date.now()));}
 function pump(){if(stopped)return;const active=domains();let running=[...jobs.values()].filter(j=>j.running).length;for(const [domain,j]of jobs){if(!active.has(domain)||j.running||j.attempts>=3||j.at>Date.now()||running>=2)continue;
   const proof=OrderEmailDomain.peek(domain);if((OrderEmailDomain.isSuccess(proof)||OrderEmailDomain.isHard(proof))&&proof.expiresAt>Date.now()){j.at=proof.expiresAt+1;continue;}
   j.running=true;j.attempts++;running++;paint();OrderEmailDomain.validate(domain,{force:proof.state==='UNKNOWN'}).then(r=>{j.running=false;if(jobs.get(domain)!==j||!domains().has(domain))return;const p=OrderEmailDomain.peek(domain);
    if(OrderEmailDomain.isSuccess(p)||OrderEmailDomain.isHard(p)){j.attempts=0;j.at=Math.max(Date.now()+1000,p.expiresAt||Date.now()+1000);}else j.at=Date.now()+[0,1500,5000][Math.min(j.attempts,2)];paint();schedule();});
  }paint();schedule();}
 function reconcile(){if(!booted||stopped)return;const active=domains();for(const domain of active)if(!jobs.has(domain)){const p=OrderEmailDomain.peek(domain);jobs.set(domain,{running:false,attempts:0,at:p.expiresAt&&p.expiresAt>Date.now()?p.expiresAt:Date.now()});}for(const domain of jobs.keys())if(!active.has(domain))jobs.delete(domain);schedule();}
 function retry(){if(Date.now()-lastRetry<1500)return;lastRetry=Date.now();for(const [domain,j]of jobs){const p=OrderEmailDomain.peek(domain);if(!OrderEmailDomain.isSuccess(p)&&!OrderEmailDomain.isHard(p)&&!j.running){j.attempts=0;j.at=Date.now();}}reconcile();}
 OrderEmailDomain.subscribe(()=>{paint();reconcile();});
 window.addEventListener('online',retry);window.addEventListener('pagehide',()=>{stopped=true;clearTimeout(timer);});window.addEventListener('pageshow',()=>{if(stopped){stopped=false;reconcile();}});
 return {boot(){booted=true;reconcile();},reconcile,retry,inspect:()=>({booted,stopped,timerScheduled:!!timer,jobCount:jobs.size,running:[...jobs.values()].filter(j=>j.running).length,attemptCounts:[...jobs.values()].map(j=>j.attempts)})};
})());

window.OrderValidationState=Object.freeze({snapshot:()=>JSON.parse(JSON.stringify(orderValidationProjection())),line:id=>JSON.parse(JSON.stringify(lineById(id)||null))});window.__orderReviewBoot=async()=>{const restored=await storageHydration;storageRevision=restored.revision;storageToken=restored.versionToken;document.documentElement.dataset.storageStatus=restored.status;if(restored.ok&&restored.data){S=ensureMigration(restored.data);lastCommitted=structuredClone(S);editorMode=S.lines.length?null:'initial';}else if(!restored.ok)storageFailure=restored;storageReady=true;$('app').inert=false;render();fromHash();if(storageFailure)storageFeedback(storageFailure);OrderEmailLifecycle.boot();document.documentElement.dataset.storageReady='true';storagePaint();};
})();
