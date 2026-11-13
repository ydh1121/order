/* MSG0583 candidate body adapter. Shared region/date/numeric controls edit raw
 * intent; the app remains the only durable storage and transaction owner. */
import {dateFieldMarkup,bindDateField} from './date-field.mjs';
import {dateModeOptions} from './q4-date.mjs';
import {bindNumericInputs} from './numeric-input.mjs';
import {inspectSimpleQuote} from './simple-quote-contract.mjs';
import {bindSimpleRegion} from './simple-region-ui.mjs';
const kinds={FLEX:'소진 시 주문',FIXED:'정기 주문',ONCE:'1회 주문'};
export function createSimpleQuoteUI({bridge}){
 const $=id=>document.getElementById(id),get=()=>bridge.getState().simpleQuote;
 const regionOwners=new Map();let mounted=false,numeric=null,latestWrite=Promise.resolve({ok:true}),q3Pending=false,q4Pending=false,localGeneration=0,forceSync=false;
 let date=null,dateMode=null,dateBaselineParts=null,dateDirty=false,dateLocalValue='',dateListeners=[],dateFinalizing=false;
 const notify=()=>bridge.notify?.();
 const id=()=>`simple-site-${crypto.randomUUID()}`;
 function write(next){
  const unchanged=JSON.stringify(next)===JSON.stringify(get()),prior=latestWrite;let request;
  try{request=bridge.write(next);}catch{request={ok:false,status:'WRITE_FAILED'};}
  latestWrite=Promise.all([prior,Promise.resolve(request).catch(()=>({ok:false,status:'WRITE_FAILED'}))]).then(([,result])=>result??(unchanged?{ok:true,status:'UNCHANGED'}:{ok:false,status:'WRITE_RESULT_REQUIRED'}));return latestWrite;
 }
 async function settled(){let request,result;do{request=latestWrite;result=await request;}while(request!==latestWrite);return result;}
 function mount(){
  if(mounted)return;mounted=true;document.documentElement.dataset.quoteMode='simple';
  $('add-site').closest('.add-row').hidden=true;$('q3-empty').hidden=true;
  $('q3-sites').innerHTML='<div class="simple-quote-fields"><div class="numeric-field ui-egg-field simple-count-field"><label for="simple-site-count">사업장 수</label><div class="input-unit ui-egg-number"><input id="simple-site-count" type="text" inputmode="numeric" autocomplete="off" value="1" min="1" max="500" step="1"><span>개</span></div></div><div id="simple-shared-region-host"></div><label class="q4-check-row"><input id="simple-regions-differ" type="checkbox"><span class="q4-check-icon" aria-hidden="true">✓</span><span class="q4-check-copy">사업장 위치가 여러곳이에요</span></label><div id="simple-site-regions" class="simple-quote-fields"></div></div>';
  numeric=bindNumericInputs($('q3-sites'),{selector:'#simple-site-count',options:()=>({grouped:true,allowEmpty:true,allowZero:false,maxDigits:3,min:1,max:500,step:1})});
  $('simple-site-count').addEventListener('input',event=>{if(event.isComposing||event.orderNumeric?.accepted!==true)return;applyCount(event.orderNumeric.value,{shrink:['step-key','step-wheel'].includes(event.orderNumeric.phase)});});
  $('simple-site-count').addEventListener('blur',()=>finishCount());
  $('simple-site-count').addEventListener('keydown',event=>{if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;event.preventDefault();event.stopPropagation();finishCount();});
  $('q3-sites').addEventListener('numericstatechange',notify);
  $('simple-regions-differ').onchange=event=>{const next=structuredClone(get());next.regionsDiffer=event.target.checked;growSites(next,Number(next.siteCount));write(next);renderRegions(next);notify();};
  $('q3-next').onclick=async()=>{
   if(q3Pending)return;q3Pending=true;const generation=localGeneration,openingStage=bridge.getState().open;
   try{const completion=finishCount(),intent=q3Intent();const finished=await completion;if(!finished.ok)return;const saved=await settled();if(!saved.ok||intent!==q3Intent()||generation!==localGeneration||bridge.getState().open!==openingStage||!bridge.guard('simple-q3-next'))return;
    if(!q3InputValid()||!inspectSimpleQuote(bridge.getState()).stages.q3.ready){bridge.error('err-q3','사업장 수와 지역을 확인해 주세요.');focusQ3();return;}bridge.error('err-q3','');closeRegions();bridge.openStage('q4');
   }finally{q3Pending=false;}
  };
  $('allocations-delivery').innerHTML='<div class="simple-quote-fields simple-inline-order"><section class="qa-form-section"><div class="ui-field-title">주문 방식</div><div class="qa-mode-choices qa-three" id="simple-order-kinds" role="group" aria-label="주문 방식"></div><div class="qa-mode-choices qa-two" id="simple-flex-basis" role="group" aria-label="소진 시 주문 기준"></div><p id="simple-consult-fixed" hidden>협의</p></section><section class="qa-form-section"><div id="simple-date-slot"></div><button type="button" class="ui-copy-action" id="simple-date-clear">희망일 지우기</button><p class="ui-field-error" id="simple-order-error" role="alert" hidden></p></section></div>';
  $('simple-order-kinds').innerHTML=Object.entries(kinds).map(([kind,label])=>`<button type="button" class="ui-choice" data-simple-kind="${kind}" aria-pressed="false">${label}</button>`).join('');
  $('simple-flex-basis').innerHTML=[['WEEK','주 단위'],['MONTH','월 단위']].map(([basis,label])=>`<button type="button" class="ui-choice" data-simple-basis="${basis}" aria-pressed="false">${label}</button>`).join('');
  $('simple-order-kinds').onclick=event=>{const button=event.target.closest('[data-simple-kind]');if(!button)return;const next={...get(),orderKind:button.dataset.simpleKind};write(next);paintOrder();renderDate();notify();};
  $('simple-flex-basis').onclick=event=>{const button=event.target.closest('[data-simple-basis]');if(!button)return;write({...get(),flexBasis:button.dataset.simpleBasis});paintOrder();notify();};
  $('simple-date-clear').onclick=()=>{if(!date)return;date.sync('');dateLocalValue='';dateBaselineParts=JSON.stringify(date.parts());dateDirty=false;date.setError('');bridge.error('simple-order-error','');write({...get(),preferredDate:''});notify();};
  $('q4-next').onclick=async()=>{
   if(q4Pending)return;q4Pending=true;const generation=localGeneration,openingStage=bridge.getState().open;
   try{const completion=finishDate(),intent=q4Intent();const valid=await completion;if(!valid.ok)return;const saved=await settled();if(!saved.ok||intent!==q4Intent()||generation!==localGeneration||bridge.getState().open!==openingStage||!bridge.guard('simple-q4-next'))return;
    if(!inspectSimpleQuote(bridge.getState()).stages.q4.ready){bridge.error('err-q4','주문 방식을 확인해 주세요.');$('simple-order-kinds').querySelector('button')?.focus();return;}bridge.error('err-q4','');bridge.openStage('');
   }finally{q4Pending=false;}
  };
 }
 function growSites(next,count){while(next.sites.length<count)next.sites.push({id:id(),region:'',regionSelection:null});}
 function applyCount(value,{shrink=false}={}){
  if(value===''){notify();return Promise.resolve({ok:false,status:'INCOMPLETE_COUNT'});}
  if(!/^[1-9]\d{0,2}$/.test(value)||Number(value)>500){$('simple-site-count').setAttribute('aria-invalid','true');bridge.error('err-q3','사업장 수를 확인해 주세요.');notify();return Promise.resolve({ok:false,status:'INVALID_COUNT'});}
  $('simple-site-count').setAttribute('aria-invalid','false');bridge.error('err-q3','');const next=structuredClone(get()),count=Number(value);next.siteCount=value;next.siteCountConfirmed=true;
  if(shrink)next.sites=next.sites.slice(0,count);growSites(next,count);const result=write(next);renderRegions(next);notify();return result;
 }
 function finishCount(){
  const field=$('simple-site-count');if(!numeric?.inspect().valid){bridge.error('err-q3','사업장 수를 확인해 주세요.');return Promise.resolve({ok:false,status:'INVALID_COUNT'});}
  const parsed=numeric.read(field);if(parsed.value===''){numeric.replace(field,get().siteCount,{history:'append'});notify();return Promise.resolve({ok:false,status:'INCOMPLETE_COUNT'});}
  return parsed.valid?applyCount(parsed.value,{shrink:true}):Promise.resolve({ok:false,status:'INVALID_COUNT'});
 }
 function activeRegions(){const value=get();return value.regionsDiffer?value.sites.map(site=>regionOwners.get(site.id)).filter(Boolean):[regionOwners.get('shared')].filter(Boolean);}
 function q3Intent(){return JSON.stringify({state:get(),count:$('simple-site-count')?.value,regions:activeRegions().map(owner=>{const {rootQuery,leafQuery,composing,editing,selection}=owner.inspect();return {rootQuery,leafQuery,composing,editing,selection};})});}
 function dateEditing(){return dateDirty||date?.inspect().valid===false;}
 function q4Intent(){return JSON.stringify({state:get(),parts:date?.parts(),dirty:dateDirty,numeric:date?.inspect()});}
 function q3InputValid(){if(!mounted)return true;const parsed=numeric.read($('simple-site-count'));return numeric.inspect().valid&&parsed.valid&&parsed.value===get().siteCount&&/^[1-9]\d{0,2}$/.test(parsed.value)&&Number(parsed.value)<=500&&activeRegions().every(owner=>{const view=owner.inspect();return !view.editing&&!view.composing;});}
 function focusQ3(){for(const owner of activeRegions()){const view=owner.inspect();if(view.editing||view.composing){const host=owner.host;host.querySelector(`[data-region-query="${view.rootQuery&&view.openLevel==='leaf'?'leaf':'root'}"]`)?.focus({preventScroll:true});return;}}$('simple-site-count')?.focus({preventScroll:true});}
 function closeRegions(){for(const owner of regionOwners.values())owner.close();}
 function selectionText(selection){return selection.rootCode===selection.leafCode?selection.rootLabel:selection.rootLabel+' '+selection.leafLabel;}
 function regionOwner(host,key,label,value,raw){
  let controller=regionOwners.get(key);
  if(!controller){
   const bound=bindSimpleRegion(host,{idPrefix:key==='shared'?'simple-region':'simple-site-'+key,label,value,legacyText:raw,onSelect:selection=>{
    const next=structuredClone(get());if(key==='shared'){next.sharedRegionSelection=selection;next.sharedRegion=selectionText(selection);}else{const row=next.sites.find(site=>site.id===key);if(!row)return;row.regionSelection=selection;row.region=selectionText(selection);}write(next);notify();
   },onDraftChange:notify});controller={...bound,host};regionOwners.set(key,controller);
  }else controller.setValue(value,{legacyText:raw,force:forceSync});
  return controller;
 }
 function renderRegions(value){
  const shared=$('simple-shared-region-host');shared.hidden=value.regionsDiffer;regionOwner(shared,'shared','사업장 1',value.sharedRegionSelection,value.sharedRegion);
  const sites=$('simple-site-regions');sites.hidden=!value.regionsDiffer;const ids=new Set(value.sites.map(site=>site.id));
  for(const [key,owner]of regionOwners)if(key!=='shared'&&!ids.has(key)){owner.destroy();owner.host.remove();regionOwners.delete(key);}
  value.sites.forEach((site,index)=>{
   let host=regionOwners.get(site.id)?.host;if(!host){host=document.createElement('div');host.dataset.simpleSiteRegionHost=site.id;sites.append(host);}if(sites.children[index]!==host)sites.insertBefore(host,sites.children[index]||null);
   regionOwner(host,site.id,'사업장 '+(index+1),site.regionSelection,site.region);
  });
 }
 function paintOrder(){const value=get();for(const button of $('simple-order-kinds').querySelectorAll('[data-simple-kind]'))button.setAttribute('aria-pressed',String(button.dataset.simpleKind===value.orderKind));for(const button of $('simple-flex-basis').querySelectorAll('[data-simple-basis]'))button.setAttribute('aria-pressed',String(button.dataset.simpleBasis===value.flexBasis));$('simple-flex-basis').hidden=value.orderKind!=='FLEX';$('simple-consult-fixed').hidden=value.orderKind!=='FIXED';}
 function disposeDate(){for(const [node,type,listener]of dateListeners)node.removeEventListener(type,listener);dateListeners=[];date?.destroy();date=null;}
 function renderDate(){
  const mode=get().orderKind==='ONCE'?'ONCE':'FIXED';
  if(date&&dateMode===mode){if(!dateDirty&&date.value!==get().preferredDate){date.sync(get().preferredDate);dateLocalValue=date.value;dateBaselineParts=JSON.stringify(date.parts());}return;}
  const raw=date?.parts(),dirty=dateDirty,local=dateDirty?dateLocalValue:get().preferredDate,baseline=dateBaselineParts;disposeDate();dateMode=mode;
  $('simple-date-slot').innerHTML=dateFieldMarkup({id:'simple-preferred-date',label:'납품 희망 시기',required:false,value:local});
  const root=$('simple-preferred-date');date=bindDateField(root,{getDate:()=>get().preferredDate,getParts:raw?()=>raw:null,policyOptions:dateModeOptions(mode).policyOptions,onChange:(value,result)=>{
   dateLocalValue=value||'';if(result?.source==='calendar'){dateDirty=false;dateBaselineParts=JSON.stringify(date.parts());bridge.error('simple-order-error','');write({...get(),preferredDate:dateLocalValue});}
   else dateDirty=JSON.stringify(date.parts())!==dateBaselineParts;
   notify();
  }});
  dateLocalValue=date.value;dateBaselineParts=raw&&dirty?baseline:JSON.stringify(date.parts());dateDirty=dirty;
  const on=(type,listener)=>{root.addEventListener(type,listener);dateListeners.push([root,type,listener]);};
  on('input',event=>{if(event.target.matches('[data-order-date-part]')){dateDirty=JSON.stringify(date.parts())!==dateBaselineParts;notify();}});
  on('numericstatechange',()=>{dateDirty=JSON.stringify(date.parts())!==dateBaselineParts;notify();});
  // Date owner handles normalization first. Its Enter stopPropagation does not
  // prevent this same-root listener; calendar opening is never a save boundary.
  on('keydown',event=>{if(event.key==='Enter'&&event.target.matches('[data-order-date-part]')&&!event.isComposing&&event.keyCode!==229)void finishDate();});
  on('focusout',event=>{if(!event.target.matches('[data-order-date-part]')||root.contains(event.relatedTarget)||event.relatedTarget?.id==='simple-date-clear'||event.relatedTarget?.closest?.('#order-common-calendar')||$('order-common-calendar')?.open)return;void finishDate();});
 }
 async function finishDate(){
  if(!date||dateFinalizing)return {ok:!dateEditing()};dateFinalizing=true;
  try{
   const result=date.commit(),parts=date.parts(),changed=JSON.stringify(parts)!==dateBaselineParts,value=date.value;
   const incomplete=!value&&changed,invalid=!date.inspect().valid||result?.status==='invalid'||result?.status==='editing'||incomplete||value&&!date.repaint()?.selectable;
   if(invalid){dateDirty=changed;date.setError('날짜를 확인해 주세요.');notify();return {ok:false,status:'INVALID_DATE'};}
   if(!changed&&value===get().preferredDate){dateDirty=false;notify();return {ok:true,status:'UNCHANGED'};}
   dateLocalValue=value;dateBaselineParts=JSON.stringify(parts);dateDirty=false;date.setError('');bridge.error('simple-order-error','');notify();return await write({...get(),preferredDate:value});
  }finally{dateFinalizing=false;}
 }
 function focusDraft(){const field=$('simple-preferred-date');const inputs=[...field?.querySelectorAll('[data-order-date-part]')||[]];(inputs.find(input=>!input.value)||inputs.at(-1))?.focus({preventScroll:true});}
 function resetLocal(){localGeneration++;closeRegions();for(const owner of regionOwners.values())owner.destroy();regionOwners.clear();$('simple-site-regions')?.replaceChildren();disposeDate();dateMode=null;dateDirty=false;dateBaselineParts=null;dateLocalValue='';forceSync=true;}
 function render(){mount();const value=get();if(forceSync||document.activeElement!==$('simple-site-count'))numeric.replace($('simple-site-count'),value.siteCount);$('simple-regions-differ').checked=value.regionsDiffer;renderRegions(value);paintOrder();renderDate();forceSync=false;}
 return Object.freeze({render,resetLocal,focusDraft,focusQ3,hasDraft:dateEditing,inspect:()=>({draft:dateEditing()?{preferredDate:dateLocalValue,parts:date?.parts()}:null,dateParts:date?.parts()??null,q3InputValid:q3InputValid(),regions:activeRegions().map(owner=>owner.inspect()),state:structuredClone(get()),authStatus:'UNAVAILABLE',lastHandoff:null}),resumeAuth:()=>({ok:false,status:'UNAVAILABLE'})});
}
