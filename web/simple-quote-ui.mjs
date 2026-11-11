/* MSG0581 provisional Q3/Q4 adapter. Q1/Q2 controls remain app-owned;
 * calendar, modal, numeric editing and persistence retain their existing owners. */
import {dateFieldMarkup,bindDateField} from './date-field.mjs';
import {dateModeOptions} from './q4-date.mjs';
import {bindNumericInputs} from './numeric-input.mjs';
import {inspectSimpleQuote,createSimpleAuthHandoff,resumeSimpleAuthHandoff} from './simple-quote-contract.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kinds={FLEX:'소진 시 주문',FIXED:'정기 주문',ONCE:'1회 주문'};
export function createSimpleQuoteUI({bridge,onAuthRequest=null}){
 const $=id=>document.getElementById(id),shell=window.OrderModalShell;
 let mounted=false,renderedRegions='',numeric=null,draft=null,baseline=null,baselineDateParts=null,dateClearRequested=false,openingInput=null,date=null,generation=0,pending=false,lastHandoff=null,authStatus='UNKNOWN',authGeneration=0,authRequest=null;
 const get=()=>bridge.getState().simpleQuote;
 const id=()=>`simple-site-${crypto.randomUUID()}`;
 function mount(){
  if(mounted)return;mounted=true;document.documentElement.dataset.quoteMode='simple';
  $('add-site').closest('.add-row').hidden=true;$('q3-empty').hidden=true;
  $('q3-sites').innerHTML='<div class="simple-quote-fields"><label class="ui-field-title" for="simple-site-count">사업장 수</label><input class="text-input" id="simple-site-count" type="text" inputmode="numeric" autocomplete="off"><label class="ui-field-title" for="simple-region">지역</label><input class="text-input" id="simple-region" maxlength="1024" placeholder="시·구·동" autocomplete="address-level2"><label class="ui-check-row"><input id="simple-regions-differ" type="checkbox"><span>사업장별 지역이 달라요</span></label><div id="simple-site-regions" class="simple-quote-fields"></div></div>';
  numeric=bindNumericInputs($('q3-sites'),{selector:'#simple-site-count',options:()=>({grouped:false,allowEmpty:true,allowZero:true,maxDigits:3,min:0,max:500,step:1})});
  $('simple-site-count').addEventListener('input',event=>{if(event.isComposing||event.orderNumeric?.accepted!==true)return;const value=event.orderNumeric.value;if(value&&Number(value)>500){$('simple-site-count').setAttribute('aria-invalid','true');bridge.error('err-q3','사업장 수를 확인해 주세요.');return;}$('simple-site-count').setAttribute('aria-invalid','false');bridge.error('err-q3','');const next=structuredClone(get());next.siteCount=value;const count=Number(value)||0;next.sites=next.sites.slice(0,count);while(next.sites.length<count)next.sites.push({id:id(),region:''});bridge.write(next);renderRegions(next);});
  $('simple-region').addEventListener('input',event=>{if(event.isComposing)return;bridge.write({...get(),sharedRegion:event.target.value});});
  $('simple-region').addEventListener('compositionend',event=>bridge.write({...get(),sharedRegion:event.target.value}));
  $('simple-regions-differ').onchange=event=>{const next={...get(),regionsDiffer:event.target.checked};bridge.write(next);renderRegions(next);};
  $('simple-site-regions').addEventListener('input',event=>{const input=event.target.closest('[data-simple-site-region]');if(!input||event.isComposing)return;writeRegion(input);});
  $('simple-site-regions').addEventListener('compositionend',event=>{const input=event.target.closest('[data-simple-site-region]');if(input)writeRegion(input);});
  $('q3-next').onclick=()=>{if(!bridge.guard('simple-q3-next'))return;const stage=inspectSimpleQuote(bridge.getState()).stages.q3;if(!q3InputValid()||!stage.ready){bridge.error('err-q3','사업장 수와 지역을 확인해 주세요.');return;}bridge.error('err-q3','');bridge.openStage('q4');};
  $('allocations-delivery').innerHTML='<div id="simple-order-summary" class="muted"></div><button class="ui-copy-action" id="simple-order-edit" type="button">주문 방식 선택</button>';
  $('simple-order-edit').onclick=()=>openOrder($('simple-order-edit'));
  $('q4-next').onclick=()=>{if(!bridge.guard('simple-q4-next'))return;if(!inspectSimpleQuote(bridge.getState()).stages.q4.ready){openOrder($('q4-next'));return;}bridge.openStage('');};
  const dialog=document.createElement('dialog');dialog.id='simple-order-dialog';dialog.className='q4-regular-dialog';dialog.dataset.modalRole='editor';dialog.setAttribute('aria-labelledby','simple-order-title');
  dialog.innerHTML='<div class="q4-regular-panel"><header class="q4-regular-head"><strong id="simple-order-title">주문 방식</strong><button type="button" class="ui-icon-button" data-simple-order-close aria-label="닫기">'+window.OrderIcons.svg('close')+'</button></header><div class="q4-regular-scroll"><div class="simple-quote-fields"><div class="qa-mode-choices qa-three" id="simple-order-kinds" role="group" aria-label="주문 방식"></div><div class="qa-mode-choices qa-two" id="simple-flex-basis" role="group" aria-label="소진 시 주문 기준"></div><p id="simple-consult-fixed" hidden>협의</p><div id="simple-date-slot"></div><button type="button" class="ui-copy-action" id="simple-date-clear">희망일 지우기</button><p id="simple-order-error" class="err" role="alert" hidden></p></div></div><footer class="q4-regular-actions ui-transaction-group"><button type="button" class="ui-transaction-action" data-simple-order-cancel>취소</button><button type="button" class="ui-transaction-action ui-transaction-action--primary" data-simple-order-confirm>확인</button></footer></div>';
  document.body.append(dialog);
  dialog.querySelector('[data-simple-order-close]').onclick=()=>shell.requestClose(dialog,'close');dialog.querySelector('[data-simple-order-cancel]').onclick=()=>shell.requestClose(dialog,'cancel');
  shell.bind(dialog,closeOrder,{editable:true,isDirty:()=>!!draft&&(JSON.stringify(draft)!==baseline||JSON.stringify(date?.parts()??null)!==baselineDateParts),onExitIntent:()=>{generation++;setPending(false);}});
  dialog.querySelector('[data-simple-order-confirm]').onclick=confirmOrder;
  $('simple-order-kinds').onclick=event=>{const b=event.target.closest('[data-simple-kind]');if(!b||!draft||pending)return;draft.orderKind=b.dataset.simpleKind;renderOrderDraft();};
  $('simple-flex-basis').onclick=event=>{const b=event.target.closest('[data-simple-basis]');if(!b||!draft||pending)return;draft.flexBasis=b.dataset.simpleBasis;paintOrderChoices();};
  $('simple-date-clear').onclick=()=>{if(!draft||pending)return;draft.preferredDate='';date.sync('');dateClearRequested=true;shell.resize(dialog);};
  const auth=document.createElement('dialog');auth.id='simple-auth-dialog';auth.className='q1-sku-dialog';auth.setAttribute('aria-labelledby','simple-auth-title');auth.innerHTML='<div class="q1-confirm"><h2 id="simple-auth-title">여러 종류의 계란이 필요한가요?</h2><p>회원가입 후 여러 종류를 상세 견적할 수 있어요.</p><p id="simple-auth-status" role="status" hidden></p><div class="ui-transaction-group"><button class="ui-transaction-action" type="button" data-simple-auth-cancel>계속 입력</button><button class="ui-transaction-action ui-transaction-action--primary" type="button" data-simple-auth-request>회원가입으로 이어가기</button></div></div>';document.body.append(auth);
  shell.bind(auth,closeAuth);auth.querySelector('[data-simple-auth-cancel]').onclick=()=>shell.requestClose(auth,'cancel');
  auth.querySelector('[data-simple-auth-request]').onclick=async()=>{
   if(authStatus==='PENDING'&&authCurrent(authRequest)||!auth.open||!bridge.guard('simple-auth-request'))return;lastHandoff=createSimpleAuthHandoff(bridge.getState(),{requestId:`simple-auth-${crypto.randomUUID()}`,inputRevision:bridge.revision()});const request={generation:++authGeneration,handoff:lastHandoff,inputSignature:bridge.signature(),cancelled:false};authRequest=request;
   authStatus=onAuthRequest?'PENDING':'UNAVAILABLE';$('simple-auth-status').hidden=false;$('simple-auth-status').textContent=onAuthRequest?'연결 중':'회원가입 연결을 아직 이용할 수 없습니다.';
   if(onAuthRequest){try{await onAuthRequest(lastHandoff);if(authCurrent(request)&&authStatus==='PENDING'){authStatus='REQUESTED';$('simple-auth-status').textContent='입력 내용이 유지됩니다.';}}catch{if(authCurrent(request)){authStatus='UNAVAILABLE';$('simple-auth-status').textContent='다시 시도해 주세요.';}}}
  };
 }
 function writeRegion(input){const next=structuredClone(get()),row=next.sites.find(s=>s.id===input.dataset.simpleSiteRegion);if(row){row.region=input.value;bridge.write(next);}}
 // Editing safety is separate from required-stage completion: an untouched
 // empty count must not prevent entering the form or saving incomplete input.
 function q3InputValid(){if(!mounted)return true;if(!numeric?.inspect().valid)return false;const parsed=numeric.read($('simple-site-count'));return parsed.valid&&/^\d{0,3}$/.test(parsed.value)&&Number(parsed.value)<=500&&parsed.value===get().siteCount;}
 function renderRegions(value){
  $('simple-region').closest('.simple-quote-fields').querySelector('label[for="simple-region"]').hidden=value.regionsDiffer;$('simple-region').hidden=value.regionsDiffer;
  const signature=JSON.stringify([value.regionsDiffer,value.sites.map(s=>s.id)]);if(signature!==renderedRegions){renderedRegions=signature;
   $('simple-site-regions').innerHTML=value.regionsDiffer?value.sites.map((s,i)=>`<label class="ui-field-title" for="simple-region-${esc(s.id)}">사업장 ${i+1} 지역</label><input class="text-input" id="simple-region-${esc(s.id)}" data-simple-site-region="${esc(s.id)}" value="${esc(s.region)}" maxlength="1024" placeholder="시·구·동" autocomplete="address-level2">`).join(''):'';
  }else for(const input of $('simple-site-regions').querySelectorAll('[data-simple-site-region]')){const row=value.sites.find(site=>site.id===input.dataset.simpleSiteRegion);if(row&&document.activeElement!==input&&input.value!==row.region)input.value=row.region;}
 }
 function render(){mount();const s=get();if(document.activeElement!==$('simple-site-count'))numeric.replace($('simple-site-count'),s.siteCount);if(document.activeElement!==$('simple-region'))$('simple-region').value=s.sharedRegion;$('simple-regions-differ').checked=s.regionsDiffer;renderRegions(s);$('simple-order-summary').textContent=s.orderKind?[kinds[s.orderKind],s.orderKind==='FLEX'?{WEEK:'주 단위',MONTH:'월 단위'}[s.flexBasis]:s.orderKind==='FIXED'?'협의':'',s.preferredDate].filter(Boolean).join(' · '):'주문 방식 미선택';}
 function paintOrderChoices(){
  const active=document.activeElement,focusedKind=active?.dataset.simpleKind,focusedBasis=active?.dataset.simpleBasis;
  $('simple-order-kinds').innerHTML=Object.entries(kinds).map(([key,label])=>`<button type="button" class="ui-choice" data-simple-kind="${key}" aria-pressed="${draft.orderKind===key}">${label}</button>`).join('');
  $('simple-flex-basis').hidden=draft.orderKind!=='FLEX';$('simple-flex-basis').innerHTML=[['WEEK','주 단위'],['MONTH','월 단위']].map(([key,label])=>`<button type="button" class="ui-choice" data-simple-basis="${key}" aria-pressed="${draft.flexBasis===key}">${label}</button>`).join('');$('simple-consult-fixed').hidden=draft.orderKind!=='FIXED';
  if(focusedKind)$('simple-order-kinds').querySelector(`[data-simple-kind="${focusedKind}"]`)?.focus({preventScroll:true});else if(focusedBasis&&!$('simple-flex-basis').hidden)$('simple-flex-basis').querySelector(`[data-simple-basis="${focusedBasis}"]`)?.focus({preventScroll:true});
 }
 function renderOrderDraft(){
  const parts=date?.parts(),dialog=$('simple-order-dialog'),mutate=()=>{date?.destroy();paintOrderChoices();const policyOptions=dateModeOptions(draft.orderKind==='ONCE'?'ONCE':'FIXED').policyOptions;$('simple-date-slot').innerHTML=dateFieldMarkup({id:'simple-preferred-date',label:'납품 희망 시기',required:false,value:draft.preferredDate});date=bindDateField($('simple-preferred-date'),{getDate:()=>draft.preferredDate,getParts:parts?()=>parts:null,policyOptions,onChange:value=>{if(draft&&!pending){dateClearRequested=false;draft.preferredDate=value||'';shell.resize(dialog);}}});};
  if(dialog.open)shell.resize(dialog,mutate);else mutate();
 }
 function setPending(value){pending=value;const dialog=$('simple-order-dialog');dialog.querySelector('[data-simple-order-confirm]').disabled=value;dialog.querySelector('.q4-regular-scroll').inert=value;}
 function openOrder(trigger){if(draft||!bridge.guard('simple-order-open'))return;draft=structuredClone(get());baseline=JSON.stringify(draft);openingInput=bridge.signature();generation++;dateClearRequested=false;setPending(false);$('simple-order-error').hidden=true;renderOrderDraft();baselineDateParts=JSON.stringify(date.parts());shell.open($('simple-order-dialog'),{variant:'editor',role:'editor',history:true,returnFocus:trigger});}
 function closeOrder(){generation++;setPending(false);date?.destroy();date=null;draft=null;baselineDateParts=null;shell.close($('simple-order-dialog'),{after:()=>bridge.refresh()});}
 async function confirmOrder(){
  if(!draft||pending)return;const dateResult=date.commit(),candidate={...bridge.getState(),simpleQuote:structuredClone(draft)},stage=inspectSimpleQuote(candidate).stages.q4;
  const editedPartial=!date.value&&!dateClearRequested&&JSON.stringify(date.parts())!==baselineDateParts;
  const dateInvalid=!date.inspect().valid||dateResult?.status==='invalid'||dateResult?.status==='editing'||editedPartial||date.parts().day!==''&&!date.value||date.value&&!date.repaint()?.selectable;
  if(!stage.ready||dateInvalid){$('simple-order-error').hidden=false;$('simple-order-error').textContent=dateInvalid?'날짜를 확인해 주세요.':'주문 방식을 확인해 주세요.';return;}
  if(openingInput!==bridge.signature()){$('simple-order-error').hidden=false;$('simple-order-error').textContent='입력이 변경되었습니다. 취소 후 다시 확인해 주세요.';return;}
  setPending(true);const seq=++generation;let result;
  try{result=await bridge.commit(structuredClone(draft),{canCommit:()=>seq===generation&&!!draft&&$('simple-order-dialog').open&&openingInput===bridge.signature(),errorId:'simple-order-error'});}catch{result={ok:false};if(seq===generation){$('simple-order-error').hidden=false;$('simple-order-error').textContent='저장하지 못했습니다. 다시 시도해 주세요.';}}
  if(seq!==generation)return;setPending(false);if(result?.ok)closeOrder();
 }
 function authCurrent(request){return !!request&&request===authRequest&&request.generation===authGeneration&&!request.cancelled&&$('simple-auth-dialog').open&&request.inputSignature===bridge.signature()&&request.handoff.inputRevision===bridge.revision();}
 function closeAuth(){authGeneration++;if(authRequest)authRequest.cancelled=true;authStatus='CANCELLED';shell.close($('simple-auth-dialog'));}
 function additional(trigger){mount();authGeneration++;if(authRequest)authRequest.cancelled=true;authRequest=null;lastHandoff=null;authStatus='UNKNOWN';$('simple-auth-status').hidden=true;shell.open($('simple-auth-dialog'),{variant:'compact',role:'confirm',history:true,returnFocus:trigger});}
 function resumeAuth(value){
  if(!lastHandoff)return {ok:false,status:'NO_REQUEST'};
  if(!authCurrent(authRequest)){const cancelled=authRequest?.cancelled||!$('simple-auth-dialog').open;authStatus=cancelled?'CANCELLED':'UNKNOWN';return Object.freeze({ok:false,status:cancelled?'CANCELLED':'STALE',requestId:lastHandoff.requestId,inputRevision:lastHandoff.inputRevision,input:lastHandoff.input,authentication:authStatus,businessVerification:'UNKNOWN'});}
  const result=resumeSimpleAuthHandoff(lastHandoff,value);authStatus=result.authentication;return result;
 }
 return Object.freeze({render,additional,hasDraft:()=>!!draft,inspect:()=>({draft:draft?structuredClone(draft):null,dateParts:date?.parts()??null,lastHandoff,authStatus,q3InputValid:q3InputValid(),state:structuredClone(get())}),resumeAuth});
}
