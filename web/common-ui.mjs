import {validMonthlyQuantity} from './quantity-contract.mjs';
import {addressStatus} from './address-contract.mjs';
import './contact-ui.mjs';
/* MSG0481 reimplementation from verified MSG0478 bytes.
 * Pure weekly/month-day contract shared by rendering, selection, bridge and page verdict.
 * This does not schedule real deliveries or silently repair legacy data. */
window.OrderRepeatContract=Object.freeze((()=>{
 const days=Object.freeze(['월','화','수','목','금','토','일']);
 const periods=Object.freeze({'매주':1,'2주':2,'3주':3,'4주':4,'매월':0});
 const clone=x=>JSON.parse(JSON.stringify(x));
 function monthValue(value){
  const s=String(value??'').trim();
  if(s==='말일'||s==='last')return {valid:true,value:'last',display:'말일'};
  if(!/^(?:[1-9]|[12]\d|3[01])(?:일)?$/.test(s))return {valid:false,value:s,display:s};
  return {valid:true,value:String(parseInt(s,10)),display:String(parseInt(s,10))+'일'};
 }
 function inspect(r={}){
  const W=periods[r.period],N=/^[1-7]회$/.test(String(r.frequency??''))?parseInt(r.frequency,10):NaN;
  const result={valid:true,weeks:W??0,perWeek:Number.isFinite(N)?N:null,total:Number.isFinite(N)&&W>0?W*N:null,week:[],issue:null};
  const fail=(kind,message,week=null)=>{result.valid=false;if(!result.issue)result.issue={kind,message,week};};
  if(W===undefined){fail('period','반복 주기를 선택해 주세요.');return result;}
  if(W===0){const m=monthValue(r.date);result.month=m;if(!m.valid)fail('date','납품 날짜를 1~31의 정수 또는 말일로 입력해 주세요.');return result;}
  if(!Number.isInteger(N))fail('frequency','매주 납품 횟수를 1~7회 중에서 선택해 주세요.');
  if(r.legacyReviewRequired)fail('legacy','기존 반복 횟수의 의미를 확인하고 매주 납품 횟수를 다시 선택해 주세요.');
  for(let w=1;w<=W;w++){
   const selected=days.filter(d=>r.weekdays?.[w+':'+d]===true),count=selected.length;
   const complete=Number.isInteger(N)&&count===N;
   result.week.push({number:w,selected,count,required:result.perWeek,complete,over:Number.isInteger(N)&&count>N});
   if(r.weeklyCheck&&!complete&&Number.isInteger(N))fail('weekdays',`${w}주차에 희망요일 ${N}개를 선택해 주세요. (현재 ${count}개)`,w);
  }
  return result;
 }
 function fromAllocation(a={}){
  if(a.q4Review?.activeRepeat){const r=clone(a.q4Review.activeRepeat);if(!('legacyReviewRequired' in r))r.legacyReviewRequired=periods[r.period]>1&&r.semantics!=='per-week-v1';return r;}
  const W=Number(a.intervalWeeks??1),weekdays={};
  (Array.isArray(a.weekPlans)&&a.weekPlans.length?a.weekPlans:[{weekdays:a.days||[]}]).forEach((p,j)=>(p.weekdays||[]).forEach(d=>{if(days.includes(d))weekdays[(j+1)+':'+d]=true;}));
  const old=a.frequencyPerWeek??(W===1?a.freq:a.cycleCount);
  return {period:W===0?'매월':W===1?'매주':W+'주',frequency:old===undefined?'2회':String(old)+'회',date:a.monthDay==='last'?'말일':a.monthDay==null?'':String(a.monthDay)+'일',dateMode:a.monthDay==null?'custom':'preset',weeklyCheck:a.scheduleDetail==='days',weekdays,weekOpen:1,semantics:a.repeatSemantics||null,legacyReviewRequired:W>1&&a.repeatSemantics!=='per-week-v1',legacyOriginal:{cycleCount:a.cycleCount,freq:a.freq,intervalWeeks:a.intervalWeeks,weekPlans:clone(a.weekPlans||[])}};
 }
 function serialize(r){
  const v=inspect(r),W=periods[r.period],month=monthValue(r.date);
  if(!v.valid)return {ok:false,issue:v.issue};
  const plans=W===0?[]:Array.from({length:W},(_,i)=>({weekdays:r.weeklyCheck?days.filter(d=>r.weekdays?.[(i+1)+':'+d]===true):[]}));
  return {ok:true,value:{repeatSemantics:'per-week-v1',intervalWeeks:W,frequencyPerWeek:W===0?null:v.perWeek,freq:W===0?1:v.perWeek,cycleCount:W===0?1:v.total,monthDay:W===0?month.value:'',scheduleDetail:W>0&&r.weeklyCheck?'days':'count',weekPlans:plans,days:plans[0]?.weekdays||[]}};
 }
 function resetPeriod(r,value){if(r.period===value)return false;r.period=value;r.weeklyCheck=false;r.weekdays={};r.weekOpen=0;r.legacyReviewRequired=false;r.semantics='per-week-v1';if(value==='매월'){r.date='';r.dateMode='custom';}return true;}
 const snapshot=r=>({period:r.period,frequency:r.frequency,date:r.date??'',dateMode:r.dateMode||'custom',weeklyCheck:!!r.weeklyCheck,weekdays:clone(r.weekdays||{}),weekOpen:r.weekOpen??0,semantics:r.semantics||'per-week-v1',legacyReviewRequired:!!r.legacyReviewRequired,...(r.legacyOriginal?{legacyOriginal:clone(r.legacyOriginal)}:{})});
 return {days,periods,inspect,monthValue,fromAllocation,serialize,resetPeriod,snapshot};
})());
/* MSG0485. Input ownership: one phone buffer, one email field and domain-only verifier.
   Original local-part case is preserved. Network results never prove mailbox ownership. */
/* Shared input focus modality. Registered once at boot, never per render/mount.
   Native text inputs may match :focus-visible even after a pointer click. */
window.OrderInputFocus=Object.freeze((()=>{
 const root=document.documentElement;
 const set=value=>{if(root.dataset.inputModality!==value)root.dataset.inputModality=value;};
 set('keyboard');
 window.addEventListener('pointerdown',()=>set('pointer'),{capture:true,passive:true});
 window.addEventListener('keydown',event=>{if(!['Shift','Control','Alt','Meta','CapsLock'].includes(event.key))set('keyboard');},{capture:true});
 return {get modality(){return root.dataset.inputModality;}};
})());

window.OrderSiteContract=Object.freeze((()=>{
 const phone=v=>OrderPhone.parse(v).valid,email=v=>OrderEmail.parse(v).valid;
 function issues(s,{address=true,allowUnverified=false,emailProof=null}={}){const out=[];if(!String(s?.name||'').trim())out.push({key:'name',message:'사업장 명칭을 입력해 주세요.'});const location=addressStatus(s);if(address&&!location.valid)out.push(location.issue);if(!phone(s?.contactPhone))out.push({key:'contactPhone',message:'담당자 전화번호를 확인해 주세요.'});
  if(!email(s?.email)){const syntax=OrderEmail.parse(s?.email);out.push({key:'email',code:syntax.unsupported?'UNSUPPORTED_LOCAL':'INVALID_SYNTAX',message:syntax.unsupported?'현재 지원하지 않는 이메일 형식입니다.':'이메일 형식을 확인해 주세요.'});}else{const proof=OrderEmailDomain.isCurrent?.(emailProof,s.email)?emailProof:OrderEmailDomain.status(s.email);if(OrderEmailDomain.isHard(proof))out.push({key:'email',code:proof.state,message:'이메일 주소를 확인해 주세요.'});else if(!allowUnverified&&!OrderEmailDomain.isSuccess(proof))out.push({key:'email',code:'DOMAIN_UNCONFIRMED',message:'현재 이메일 주소를 확인할 수 없습니다.'});}
  if(String(s?.storePhone||'').trim()&&!phone(s.storePhone))out.push({key:'storePhone',message:'매장 대표번호를 확인해 주세요.'});return out;}
 return {phone,email,issues,isAwaiting:issue=>issue?.code==='DOMAIN_UNCONFIRMED',basicIssues:s=>issues(s,{allowUnverified:true}),valid:(s,options)=>issues(s,options).length===0};
})());
/* New clone glyph is constructed locally from rectangles, not a library path.
 * Legacy check/chevron/egg/calendar provenance remains NOT_VERIFIED, shape unchanged. */
/* Presentation only: consume the existing unique validation groups. No validation
   or model writes happen when an accordion opens, closes or routes a badge. */
window.OrderErrorBadges=Object.freeze({
 paint(owners,issues){
  const counts=new Map(owners.map(o=>[o.key,new Set()]));
  for(const issue of issues){let chosen=null;for(const owner of owners)if(owner.available&&owner.matches(issue)&&(!chosen||owner.depth>chosen.depth))chosen=owner;if(chosen)counts.get(chosen.key).add(issue.groupKey||issue.issueId);}
  for(const owner of owners){const title=owner.title;if(!title)continue;let badge=title.querySelector(':scope > [data-incomplete-count]');
   if(!badge){badge=document.createElement('span');badge.className='ui-incomplete-badge';badge.dataset.incompleteCount=owner.key;badge.hidden=true;title.append(badge);}
   title.classList.add('ui-badge-title');let label=title.querySelector(':scope > .ui-badge-label');if(!label){label=document.createElement('span');label.className='ui-badge-label';for(const n of [...title.childNodes])if(n!==badge)label.append(n);title.insertBefore(label,badge);}
   const count=owner.available?counts.get(owner.key).size:0,text=String(count);if(badge.textContent!==text)badge.textContent=text;badge.hidden=count===0;badge.dataset.countDigits=String(text.length);badge.dataset.countOverflow=String(text.length>3);badge.setAttribute('aria-label','미완료 입력 '+count+'개');
  }
 }
});

/* Shared header/check morphology; domain state and interaction remain with each
   existing consumer. bindKey/requiredLabel are presentation-only variants. */
window.OrderAccordionView=Object.freeze((()=>{
 const chevron='<svg viewBox="0 0 16 16" width="17" height="17" focusable="false" aria-hidden="true"><path d="M4 6.5L8 10.5L12 6.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 const check='<svg viewBox="0 0 20 20" width="13" height="13" focusable="false" aria-hidden="true"><path d="m4.5 10 3.7 3.5 7.3-7.2" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 function render({id='',label='',content='',complete=false,expanded=false,error=false,extraClass='',bodyClass='',required=false,bindKey=false,requiredLabel=false}={}){
  const title=requiredLabel?`<strong class="qa-inline-title"><span class="qa-title-truncate">${label}</span>${required?'<span class="ui-required qa-inline-required" aria-hidden="true">*</span>':''}</strong>`:`<strong>${label}</strong>`;
  return `<div class="t-acc ui-global-stage ui-accordion ${extraClass}" data-ui-subaccordion="true" data-complete="${complete}" data-error="${error}" data-state="${error?'error':complete?'complete':'empty'}" data-open="${expanded}" data-required="${required}" ${id?`id="${id}"`:''}><button type="button" class="accordion-trigger t-acc-head ui-global-stage-trigger ui-accordion__trigger" ${bindKey?`data-acc="${id}"`:''} aria-expanded="${expanded}" ${id?`aria-controls="${id}-body"`:''} ${requiredLabel?`aria-label="${label}${required?' (필수)':''}"`:''}><span class="stage-check ui-completion" data-state="${error?'invalid':complete?'saved-valid':'empty'}" aria-hidden="true">${check}</span><span class="qcopy ui-accordion__label">${title}</span><span class="chev t-acc-chevron ui-chevron" aria-hidden="true">${chevron}</span></button><div class="ui-accordion__body ${bodyClass}" ${id?`id="${id}-body"`:''} ${expanded?'':'hidden'}>${content}</div></div>`;
 }
 return {render,check,chevron};
})());

window.OrderIcons=Object.freeze({
 definitions:Object.freeze({refresh:{viewBox:'0 0 20 20',source:'PROJECT_ORIGINAL_REFRESH_LINES_0521',body:'<path d="M16 6.5A6.5 6.5 0 1 0 16.5 12M16 2v4.5h-4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'},selectSite:{viewBox:'0 0 20 20',source:'PROJECT_ORIGINAL_SELECTION_CHECK_LINES_0521',body:'<rect x="2.5" y="2.5" width="15" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m6 10 2.6 2.7L14 7.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'},search:{viewBox:'0 0 20 20',source:'PROJECT_ORIGINAL_SEARCH_CIRCLE_LINE_0519',body:'<circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m12.5 12.5 4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'},close:{viewBox:'0 0 20 20',source:'PROJECT_ORIGINAL_CLOSE_LINES_0519',body:'<path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'},forward:{viewBox:'0 0 20 20',source:'PROJECT_ORIGINAL_DIRECTION_LINES_0505',body:'<path d="M3 10h14m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'},unlink:{viewBox:'0 0 20 20',source:'PROJECT_ORIGINAL_UNLINK_LINES_0491',body:'<path d="m7 6 2-2a3 3 0 0 1 4.2 4.2l-1 1M13 14l-2 2a3 3 0 0 1-4.2-4.2l1-1M3 3l14 14M3 8H1M8 3V1M17 12h2M12 17v2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'},swap:{viewBox:'0 0 20 20',source:'PROJECT_ORIGINAL_SWAP_LINES_0487',body:'<path d="M3 6h13m-3-3 3 3-3 3M17 14H4m3-3-3 3 3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'},clone:{viewBox:'0 0 20 20',source:'PROJECT_ORIGINAL_RECTANGLES_0481',body:'<path d="M3 2h9a1 1 0 0 1 1 1v2H6a2 2 0 0 0-2 2v7H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><rect x="6" y="7" width="12" height="11" rx="1.5"/>'}}),
 svg(name){const d=this.definitions[name];if(!d)return '';return `<svg viewBox="${d.viewBox}" width="17" height="17" data-project-icon="${name}" fill="currentColor" aria-hidden="true" focusable="false">${d.body}</svg>`;}
});

window.OrderDisclosure=Object.freeze((()=>{
 const animations=new WeakMap();
 function set(element,open){if(!element)return Promise.resolve(false);const trigger=element.querySelector(':scope > .accordion-trigger'),body=element.querySelector(':scope > .ui-accordion__body');if(!trigger||!body)return Promise.resolve(false);
  const previous=animations.get(body);if(trigger.getAttribute('aria-expanded')===String(open)&&!previous)return Promise.resolve(true);
  const from=body.hidden?0:body.getBoundingClientRect().height;if(previous){previous.onfinish=null;previous.oncancel=null;animations.delete(body);previous.cancel();}
  body.hidden=false;body.style.height='';body.style.overflow='';const to=open?body.scrollHeight:0;trigger.setAttribute('aria-expanded',String(open));element.dataset.open=String(open);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches||Math.abs(to-from)<.75){body.hidden=!open;return Promise.resolve(true);}
  body.style.height=from+'px';body.style.overflow='clip';const a=body.animate([{height:from+'px'},{height:to+'px'}],{duration:250,easing:'cubic-bezier(.22,1,.36,1)'});animations.set(body,a);
  const finish=()=>{if(animations.get(body)!==a)return;animations.delete(body);body.hidden=!open;body.style.height='';body.style.overflow='';};
  a.onfinish=finish;a.oncancel=()=>{if(animations.get(body)===a){animations.delete(body);body.style.height='';body.style.overflow='';}};return a.finished.then(()=>{finish();return true},()=>false);
 }
 return {set};
})());

/* Shared child-copy presentation. Callers own independent field/data transactions. */
window.OrderCopyDialog=Object.freeze((()=>{
 const text=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 return {
 create({id='qa-copy-confirm',title,fields,targets,applyLabel='설정 복제'}){
  const host=document.createElement('dialog');host.id=id;host.className='ui-copy-dialog';host.setAttribute('aria-label',title);
  const heading=text(title);
  let acc=CODE1_UI.accordion({id:id+'-fields',label:'복제할 항목 <span class="ui-required" aria-hidden="true">*</span><span class="qa-copy-live" id="qa-copy-count" aria-live="polite">0개</span>',content:fields,expanded:true,extraClass:'qa-copy-fields-accordion'});
  acc=acc.replace('<button type="button"','<button data-copy-accordion type="button"');
  if(id==='qa-copy-confirm')acc=acc.replaceAll(id+'-fields','qa-copy-fields').replace('data-copy-accordion','data-copy-accordion data-acc="qa-copy-fields"');
  host.innerHTML=`<div class="qa-copy-card ui-copy-panel"><header class="qa-copy-header q4-regular-head"><strong class="qa-copy-title">${heading}</strong></header><div class="qa-copy-scroll q4-regular-scroll"><div class="qa-copy-accordion-area">${acc}</div><div class="qa-copy-target-group" id="qa-copy-target-group"><div class="ui-field-title qa-copy-target-heading" tabindex="-1">적용할 사업장 <span class="ui-required" aria-hidden="true">*</span></div><div class="qa-copy-targets">${targets}</div></div><div class="qa-copy-preview" data-copy-preview></div><p class="qa-copy-feedback ui-field-error" id="qa-copy-feedback" role="status" aria-live="polite"></p></div><footer class="qa-copy-buttons q4-regular-actions ui-transaction-group"><button type="button" class="ui-transaction-action" data-copy-cancel>취소</button><button type="button" class="ui-transaction-action ui-transaction-action--primary" data-copy-apply disabled>${applyLabel}</button></footer></div>`;
  return host;
 },
 renderReview(patches,{prefix='copy-review'}={}){
  return patches.map((patch,n)=>{const siteId=`${prefix}-site-${n}`,fields=patch.changes.map((change,k)=>{const fieldId=`${siteId}-field-${k}`;
   const value=(side,label,raw)=>`<dl class="ui-copy-review-value" data-copy-value="${side}"><dt class="ui-copy-review-label" id="${fieldId}-${side}-label">${label}</dt><dd class="ui-copy-review-data" data-empty="${String(raw??'').trim().length===0}" aria-labelledby="${siteId}-title ${fieldId}-label ${fieldId}-${side}-label">${String(raw??'').trim().length?text(raw):'미입력'}</dd></dl>`;
   return `<fieldset class="ui-copy-review-field"><legend id="${fieldId}-label">${text(change.label)}</legend><div class="ui-copy-review-values">${value('before','현재',change.before)}<span class="ui-copy-review-direction" aria-hidden="true">${OrderIcons.svg('forward')}</span>${value('after','변경 후',change.after)}</div></fieldset>`;
  }).join('');return `<section class="ui-copy-review-site" id="${siteId}" aria-labelledby="${siteId}-title"><h3 class="ui-copy-review-heading" id="${siteId}-title" tabindex="-1">${text(patch.name)}</h3>${fields}</section>`;}).join('');
 }
 };
})());


/* MSG0470: one native-dialog presentation owner. Domain drafts/commits remain in their adapters.
   No prototype patching, scroll compensation padding, scale animation or fixed body offsets. */
window.OrderModalShell=Object.freeze((()=>{
 const entries=new Map(),bound=new WeakMap();let saved=null,version=0,sessionSerial=0;
 const events=[];let discardDialog=null,discardSession=null,pointerGesture=null;
 const record=(dialog,action,reason='',dirty=false)=>{events.push({sequence:events.length?events.at(-1).sequence+1:1,dialog:dialog.id,session:entries.get(dialog)?.session||null,action,reason:['back','escape','cancel','close','backdrop','navigate'].includes(reason)?reason:reason?'other':'',dirty:!!dirty});if(events.length>80)events.shift();};
 const root=document.documentElement,body=document.body;
 const less=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
 const time=(name,fallback)=>{const value=getComputedStyle(root).getPropertyValue(name).trim(),n=parseFloat(value);return Number.isFinite(n)?n*(value.endsWith('ms')?1:1000):fallback;};
 const ease=()=>getComputedStyle(root).getPropertyValue('--ui-ease').trim()||'ease-out';
 const rgb=value=>{const n=String(value).match(/[\d.]+/g)?.map(Number);return n?.length>=3?[...n.slice(0,3),n[3]??1]:null;};
 const capture=(el,names)=>Object.fromEntries(names.map(k=>[k,[el.style.getPropertyValue(k),el.style.getPropertyPriority(k)]]));
 const restore=(el,values)=>Object.entries(values).forEach(([k,[v,p]])=>v?el.style.setProperty(k,v,p):el.style.removeProperty(k));
 const top=()=>[...entries.keys()].filter(d=>d.open).at(-1)||null;
 // Opt-in modal history owns only tokens created in this document. Serial
 // unwinding prevents an asynchronous Back from consuming a rapid new open.
 const historyEntries=new Map(),historyKey='__orderModal0519',historySession=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 let historySerial=0,historyPending=null;
 const historyToken=state=>state&&typeof state==='object'?state[historyKey]:null;
 const historyURL=()=>window.location?.href;
 function reconcileHistory(){
  const nav=window.history;if(!nav||historyPending)return;
  const current=historyEntries.get(historyToken(nav.state));
  if(current?.registered&&!current.active&&current.url===historyURL()){
   historyPending=current;
   try{nav.back();}catch{historyPending=null;current.registered=false;nav.replaceState(current.previousState,'',current.url);reconcileHistory();}
   return;
  }
  for(const [dialog,rec] of entries){const item=rec.historyEntry;if(!item?.active||!item.waiting||rec.closing||!dialog.open)continue;
   item.previousState=nav.state;item.url=historyURL();
   const state=item.previousState&&typeof item.previousState==='object'&&!Array.isArray(item.previousState)?{...item.previousState}:{};
   try{nav.pushState({...state,[historyKey]:item.token},'',item.url);item.registered=true;item.waiting=false;}catch{item.active=false;item.waiting=false;}
  }
 }
 function registerHistory(dialog,rec,old,enabled){
  if(!enabled||!window.history?.pushState)return;
  if(old?.historyEntry?.active){rec.historyEntry=old.historyEntry;rec.historyEntry.rec=rec;return;}
  const item={token:historySession+'-'+(++historySerial),dialog,rec,active:true,registered:false,waiting:true,url:historyURL(),previousState:null};
  historyEntries.set(item.token,item);rec.historyEntry=item;reconcileHistory();
 }
 function retireHistory(rec){const item=rec?.historyEntry;if(!item)return;item.active=false;item.waiting=false;reconcileHistory();}
 window.addEventListener('popstate',event=>{
  const url=historyURL(),pending=historyPending;historyPending=null;
  if(pending)pending.registered=false;
  const destination=historyEntries.get(historyToken(event.state));
  const active=[...entries.values()].map(r=>r.historyEntry).filter(h=>h?.active&&h.registered);
  const own=(pending?.url===url)||active.some(h=>h.url===url)||destination?.url===url;
  if(!own){if(pending)reconcileHistory();return;}
  event.stopImmediatePropagation();
  // Forward into a retired, same-document entry is undone to its recorded
  // predecessor. It cannot reopen an editor or strand a duplicate parent token.
  if(destination&&!destination.active&&destination.url===url)destination.registered=true;
  // A forward traversal to an already cancelled token only identifies its live
  // ancestor; a discarded domain draft is never reconstructed from history.
  let target=destination;const seen=new Set();while(target&&!target.active&&!seen.has(target.token)){seen.add(target.token);target=historyEntries.get(historyToken(target.previousState));}
  const targetIndex=active.findIndex(h=>h===target),departed=active.slice(targetIndex+1);
  // A browser traversal can cross several entries, but one exit gesture may
  // discard only the visible child. Restore live editor history before asking
  // whether its changed input should be discarded. A declined exit therefore
  // cannot strand the parent or let the next Back escape the form.
  if(departed.length){
   const item=departed.at(-1),cfg=bound.get(item.dialog);
   const guarded=!!cfg?.editable;
   for(const h of departed){h.registered=false;h.waiting=h!==item||guarded;h.active=h!==item||guarded;}
   reconcileHistory();requestClose(item.dialog,'back');
  }
  reconcileHistory();
 },{capture:true});
 function paintLock(){
  const open=[...entries.keys()].filter(d=>d.open);
  if(open.length){
   if(!saved){saved={root:capture(root,['--ui-modal-gutter']),x:scrollX,y:scrollY,rootClass:root.classList.contains('ui-modal-locked'),bodyClass:body.classList.contains('ui-modal-body-locked'),base:(rgb(getComputedStyle(body).backgroundColor)||rgb(getComputedStyle(root).backgroundColor)||[255,255,255]).slice(0,3)};}
   // Native backdrops do not consistently paint reserved root gutters. Composite
   // their actual shared token over the saved canvas; nested close leaves one dim.
   let color=[...saved.base];for(const dialog of open){const dim=rgb(getComputedStyle(dialog,'::backdrop').backgroundColor)||rgb(getComputedStyle(root).getPropertyValue('--ui-modal-backdrop'));if(dim)color=color.map((c,i)=>c*(1-dim[3])+dim[i]*dim[3]);}
   root.style.setProperty('--ui-modal-gutter',`rgb(${color.map(Math.round).join(',')})`);
   root.classList.add('ui-modal-locked');body.classList.add('ui-modal-body-locked');return;
  }
  if(saved){const old=saved;saved=null;restore(root,old.root);root.classList.toggle('ui-modal-locked',old.rootClass);body.classList.toggle('ui-modal-body-locked',old.bodyClass);window.scrollTo({left:old.x,top:old.y,behavior:'instant'});}
 }
 function restoreFocus(rec){
  const target=typeof rec?.returnFocus==='function'?rec.returnFocus():rec?.returnFocus;
  const parent=top();if(target?.isConnected&&(!parent||parent.contains(target)))target.focus({preventScroll:true});
 }
 function release(dialog,after){
  const rec=entries.get(dialog);if(!rec){after?.();return;}
  retireHistory(rec);
  entries.delete(dialog);rec.animation?.cancel();rec.sizeAnimation?.cancel();dialog.classList.remove('is-open','is-closing');
  dialog.style.opacity='';dialog.style.transform='';
  restore(dialog,rec.geometry);delete dialog.dataset.modalContentSize;delete dialog.dataset.modalResizing;
  dialog.querySelector(':scope > .q4-regular-panel')?.style.removeProperty('--ui-modal-editor-session-block');
  paintLock();after?.();const current=version;
  requestAnimationFrame(()=>{if(current===version)restoreFocus(rec);});
 }
 function isDirty(cfg){try{return !!cfg.isDirty?.();}catch{return true;}}
 function ensureDiscardDialog(){
  if(discardDialog?.isConnected)return discardDialog;
  const dialog=document.createElement('dialog');dialog.id='order-discard-dialog';dialog.className='q4-regular-dialog ui-compact-confirm';
  dialog.setAttribute('aria-labelledby','order-discard-title');dialog.setAttribute('aria-describedby','order-discard-description');
  dialog.innerHTML='<div class="q4-regular-panel"><header class="q4-regular-head"><strong id="order-discard-title">변경 내용을 취소할까요?</strong></header><div class="q4-regular-scroll"><p id="order-discard-description">확인하지 않은 변경 내용이 취소됩니다.</p></div><footer class="q4-regular-actions ui-transaction-group"><button type="button" class="ui-transaction-action ui-transaction-action--primary" data-discard-continue>계속 입력</button><button type="button" class="ui-transaction-action" data-discard-confirm>변경 취소</button></footer></div>';
  document.body.append(dialog);discardDialog=dialog;
  dialog.querySelector('[data-discard-continue]').addEventListener('click',()=>resolveDiscard(false));
  dialog.querySelector('[data-discard-confirm]').addEventListener('click',()=>resolveDiscard(true));
  bind(dialog,()=>resolveDiscard(false),{editable:true,isDirty:()=>false});return dialog;
 }
 function resolveDiscard(discard){
  const pending=discardSession;if(!pending||pending.resolving)return false;pending.resolving=true;
  const dialog=discardDialog;dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  close(dialog,{after:()=>{
   if(discardSession!==pending)return;discardSession=null;
   const valid=entries.get(pending.owner)===pending.rec&&pending.owner.open&&!pending.rec.closing;
   record(pending.owner,discard?'discard-confirm':'discard-continue',pending.reason,true);
   if(discard&&valid)pending.cfg.requestClose?.(pending.reason);
  }});return true;
 }
 function cancelDiscardFor(dialog){
  if(discardSession?.owner!==dialog)return;
  discardSession=null;if(discardDialog?.open)close(discardDialog,{immediate:true});
 }
 function requestClose(dialog,reason='cancel'){
  const cfg=bound.get(dialog),rec=entries.get(dialog);
  if(!cfg||!rec||!dialog.open||rec.closing||top()!==dialog)return false;
  if(reason==='backdrop'&&cfg.editable){record(dialog,'backdrop-blocked',reason);return false;}
  try{if(cfg.beforeClose?.(reason)===false){record(dialog,'inner-dismiss',reason);return false;}}catch{record(dialog,'exit-blocked',reason);return false;}
  const dirty=!!cfg.editable&&isDirty(cfg);
  if(!dirty){record(dialog,'exit',reason);cfg.requestClose?.(reason);return true;}
  if(discardSession)return false;
  // Cancel a pending save attempt, never its editable draft, before waiting for
  // a discard decision. Consumers keep their own revision/canCommit contract.
  try{cfg.onExitIntent?.(reason);}catch{record(dialog,'exit-blocked',reason,true);return false;}
  const prompt=ensureDiscardDialog(),pending={owner:dialog,rec,cfg,reason,focus:document.activeElement,resolving:false};discardSession=pending;
  prompt.querySelectorAll('button').forEach(b=>b.disabled=false);record(dialog,'discard-request',reason,true);
  open(prompt,{variant:'compact',history:true,returnFocus:()=>pending.focus?.isConnected&&dialog.contains(pending.focus)?pending.focus:dialog,initialFocus:()=>prompt.querySelector('[data-discard-continue]')});return false;
 }
 function bind(dialog,dispose,options={}){
  const current=bound.get(dialog);if(current){current.requestClose=dispose;Object.assign(current,options);return;}
  const cfg={requestClose:dispose,editable:false,...options};bound.set(dialog,cfg);
  dialog.addEventListener('cancel',event=>{event.preventDefault();event.stopPropagation();if(top()===dialog)requestClose(dialog,'escape');});
  dialog.addEventListener('keydown',event=>{
   if(event.key!=='Tab'||event.defaultPrevented||top()!==dialog)return;
   const candidates=[...dialog.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex],[contenteditable="true"]')].filter(el=>el.tabIndex>=0&&!el.matches(':disabled')&&!el.closest('[hidden],[inert]')&&el.getClientRects().length&&getComputedStyle(el).visibility==='visible');
   const active=document.activeElement,index=candidates.indexOf(active);
   if(!candidates.length){event.preventDefault();if(!dialog.hasAttribute('tabindex'))dialog.tabIndex=-1;dialog.focus({preventScroll:true});return;}
   if(event.shiftKey&&(index<=0)||!event.shiftKey&&(index<0||index===candidates.length-1)){event.preventDefault();candidates[event.shiftKey?candidates.length-1:0].focus({preventScroll:true});}
  });
  dialog.addEventListener('click',event=>{if(event.target!==dialog||top()!==dialog)return;const r=dialog.getBoundingClientRect(),outside=event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;if(!outside)return;
   event.preventDefault?.();event.stopPropagation?.();
   if(cfg.editable){record(dialog,'backdrop-blocked','backdrop');return;}
   // Non-editing confirmations retain outside-dismiss only for a gesture that
   // started and ended outside this same top dialog, never a text drag.
   if(pointerGesture?.dialog===dialog&&pointerGesture.outside&&pointerGesture.upOutside)requestClose(dialog,'backdrop');
  });
  // Supports existing native .close() callers, including the nested ONCE confirmation.
  dialog.addEventListener('close',()=>{if(!dialog.open)release(dialog);});
 }
 const outsideDialog=(dialog,event)=>{const r=dialog.getBoundingClientRect();return event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom;};
 document.addEventListener?.('pointerdown',event=>{const dialog=top();pointerGesture=dialog?{dialog,pointerId:event.pointerId,outside:outsideDialog(dialog,event),upOutside:false}:null;},{capture:true});
 document.addEventListener?.('pointerup',event=>{if(!pointerGesture)return;pointerGesture.upOutside=outsideDialog(pointerGesture.dialog,event);if(top()!==pointerGesture.dialog){event.preventDefault();event.stopImmediatePropagation();pointerGesture.blocked=true;}},{capture:true});
 document.addEventListener?.('click',event=>{if(pointerGesture&&event.detail!==0&&(pointerGesture.blocked||top()!==pointerGesture.dialog)){event.preventDefault();event.stopImmediatePropagation();record(pointerGesture.dialog,'clickthrough-blocked');pointerGesture=null;}},{capture:true});
 function viewport(dialog){
  const view=window.visualViewport,height=view?.height||innerHeight;
  dialog.style.setProperty('--ui-modal-max-block',(height*.92)+'px');
  dialog.style.setProperty('--ui-modal-viewport-top',(view?.offsetTop||0)+'px');
  dialog.style.setProperty('--ui-modal-viewport-bottom',Math.max(0,innerHeight-(view?.offsetTop||0)-height)+'px');
 }
 function revealFocusedControl(dialog){
  if(top()!==dialog)return;
  const scroll=dialog.querySelector(':scope > .q4-regular-panel .q4-regular-scroll'),active=document.activeElement;
  if(!scroll?.contains(active)||!scroll.getBoundingClientRect||!active?.getBoundingClientRect)return;
  const box=scroll.getBoundingClientRect(),field=active.getBoundingClientRect(),view=window.visualViewport;
  const visibleTop=Math.max(box.top,view?.offsetTop||0),visibleBottom=Math.min(box.bottom,(view?.offsetTop||0)+(view?.height||innerHeight));
  if(visibleBottom<=visibleTop)return;
  const delta=field.top<visibleTop?field.top-visibleTop:field.bottom>visibleBottom?field.bottom-visibleBottom:0;
  if(delta)scroll.scrollTop=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,scroll.scrollTop+delta));
 }
 // One explicit content-size owner. Callers patch DOM inside mutate; no observer
 // loop or page-specific height timer is needed. Existing editors remain fixed
 // for their session unless they request a resize.
 function resize(dialog,mutate=null,{animate=true}={}){
  const rec=entries.get(dialog),panel=dialog.querySelector(':scope > .q4-regular-panel');
  if(!rec||!dialog.open||rec.closing||!panel)return false;
  const from=panel.getBoundingClientRect().height,scroll=panel.querySelector('.q4-regular-scroll'),scrollTop=scroll?.scrollTop||0;
  rec.sizeAnimation?.cancel();rec.sizeAnimation=null;delete dialog.dataset.modalResizing;
  mutate?.();if(entries.get(dialog)!==rec||!dialog.open||rec.closing)return false;
  viewport(dialog);panel.style.removeProperty('--ui-modal-editor-session-block');
  const to=Math.min(panel.getBoundingClientRect().height,(window.visualViewport?.height||innerHeight)*.92);
  if(to<=0)return false;
  panel.style.setProperty('--ui-modal-editor-session-block',to+'px');if(scroll)scroll.scrollTop=scrollTop;
  if(!animate||less()||Math.abs(from-to)<1){revealFocusedControl(dialog);return true;}
  const a=panel.animate([{height:from+'px'},{height:to+'px'}],{duration:time('--ui-motion',250),easing:ease()});
  rec.sizeAnimation=a;dialog.dataset.modalResizing='true';
  const finish=()=>{if(entries.get(dialog)===rec&&rec.sizeAnimation===a){a.cancel();rec.sizeAnimation=null;delete dialog.dataset.modalResizing;revealFocusedControl(dialog);}};
  a.finished.then(finish,()=>{});return true;
 }
 function open(dialog,{variant='compact',returnFocus=document.activeElement,initialFocus=null,contentSize='session',history=false}={}){
  const old=entries.get(dialog);if(old){old.epoch++;old.animation?.cancel();old.sizeAnimation?.cancel();}
  cancelDiscardFor(dialog);
  const rec={session:++sessionSerial,epoch:(old?.epoch||0)+1,animation:null,sizeAnimation:null,returnFocus,variant,closing:false,contentSize,geometry:old?.geometry||capture(dialog,['--ui-modal-max-block','--ui-modal-viewport-top','--ui-modal-viewport-bottom'])};entries.set(dialog,rec);version++;
  dialog.dataset.modalVariant=variant;dialog.classList.remove('is-closing');dialog.style.opacity='';dialog.style.transform='';
  dialog.dataset.modalContentSize=contentSize;delete dialog.dataset.modalResizing;
  if(!bound.has(dialog))bind(dialog,()=>close(dialog));
  viewport(dialog);if(!dialog.open)dialog.showModal();paintLock();if(variant==='editor')resize(dialog,null,{animate:false});
  registerHistory(dialog,rec,old,history);
  dialog.classList.add('is-open');
  if(!less()){const a=dialog.animate([{opacity:0},{opacity:1}],{duration:time('--ui-modal-fade-open',200),easing:ease()});rec.animation=a;a.finished.then(()=>{if(entries.get(dialog)===rec&&rec.animation===a){a.cancel();rec.animation=null;}},()=>{});}
  if(initialFocus){const t=typeof initialFocus==='function'?initialFocus():initialFocus;t?.focus({preventScroll:true});revealFocusedControl(dialog);}
  return rec.epoch;
 }
 function close(dialog,{after=null,immediate=false}={}){
  cancelDiscardFor(dialog);
  const rec=entries.get(dialog);if(!dialog.open){release(dialog,after);return;}
  if(!rec){dialog.close();after?.();return;}
  if(rec.closing)return;rec.closing=true;retireHistory(rec);version++;const epoch=++rec.epoch;
  const opacity=getComputedStyle(dialog).opacity;rec.animation?.cancel();rec.animation=null;rec.sizeAnimation?.cancel();rec.sizeAnimation=null;delete dialog.dataset.modalResizing;
  dialog.classList.remove('is-open');dialog.classList.add('is-closing');
  const finish=()=>{if(entries.get(dialog)!==rec||rec.epoch!==epoch)return;if(dialog.open)dialog.close();release(dialog,after);};
  // The verified desktop close strategy is synchronous. Mobile has one opacity-only owner.
  if(immediate||less()||matchMedia('(min-width:768px)').matches){finish();return;}
  const a=dialog.animate([{opacity:Number(opacity)||1},{opacity:0}],{duration:time('--ui-modal-fade-close',150),easing:'ease-in',fill:'forwards'});rec.animation=a;
  a.finished.then(finish,()=>{});
 }
 let resizeFrame=0;const resizeViewport=()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{entries.forEach((r,d)=>{if(d.open&&!r.closing){viewport(d);if(r.variant==='editor')resize(d,null,{animate:false});else revealFocusedControl(d);}});});};
 window.addEventListener('resize',resizeViewport);window.visualViewport?.addEventListener('resize',resizeViewport);window.visualViewport?.addEventListener('scroll',resizeViewport);
 return {open,close,bind,requestClose,resize,sync:paintLock,inspect:()=>({activeIds:[...entries.keys()].filter(d=>d.open).map(d=>d.id),pendingDiscard:discardSession?{dialog:discardSession.owner.id,reason:discardSession.reason,session:discardSession.rec.session}:null,events:events.map(e=>({...e}))}),get activeIds(){return [...entries.keys()].filter(d=>d.open).map(d=>d.id);}};
})());
/* MSG0465: one optional desired-date policy for renderer, keyboard, draft and committed state.
   This is a user preference, NOT a delivery reservation or supplier-calendar engine. */
/* MSG0470 public-holiday display snapshot: annual official sources, no live key or delivery engine.
   Source provenance and supported years are inspectable on OrderHolidaySnapshot.metadata. */
window.OrderHolidaySnapshot=(()=>{
 const metadata={"version":"ORDER-KR-PUBLIC-20261029-v1","retrieved":"2026-10-29","coverage":[2026,2027],"scope":"South Korea nationwide public holidays; not local/company days or delivery commitments","sources":{"KASI2026":{"url":"https://astro.kasi.re.kr/kor/life/post/calendarData?search_year=2026","version":"V1.0a / 2024-07-25 16:57 + KASA 2026-06-29 correction","basis":"KASI annual dates, crosschecked with KASA 2026 almanac and 2026 Labour/Constitution update"},"KASA2026":{"url":"https://www.kasi.re.kr/kor/post/newsMaterial/32031","version":"2025-06-30 / 2026 almanac announcement","basis":"Official KASA announcement republished by KASI"},"KASA2027":{"url":"https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431","version":"2026-06-29 / 2027 almanac announcement","basis":"Official annual announcement; also confirms Labour and Constitution holidays effective in 2026"},"KASI2027":{"url":"https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027","version":"KASI annual table retrieved 2026-10-29","basis":"Detailed annual public-holiday dates; source page prepublication disclaimer is retained, not mislabeled as gazette bytes"},"SPCDE":{"url":"https://www.data.go.kr/data/15012690/openapi.do","version":"Special-day service metadata inspected 2026-10-29; authenticated API NOT_CALLED","basis":"National/public-holiday/anniversary classification and isHoliday semantics; no API key acquired or embedded"}},"records":[{"date":"2026-01-01","name":"1월 1일","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-02-16","name":"설날 연휴","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-02-17","name":"설날","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-02-18","name":"설날 연휴","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-03-01","name":"3·1절","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-03-02","name":"대체공휴일(3·1절)","type":"substitute","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-05-01","name":"노동절","type":"public-holiday","isHoliday":true,"sources":["KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-05-05","name":"어린이날","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-05-24","name":"부처님오신날","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-05-25","name":"대체공휴일(부처님오신날)","type":"substitute","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-06-03","name":"전국동시지방선거","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-06-06","name":"현충일","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-07-17","name":"제헌절","type":"public-holiday","isHoliday":true,"sources":["KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-08-15","name":"광복절","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-08-17","name":"대체공휴일(광복절)","type":"substitute","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-09-24","name":"추석 연휴","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-09-25","name":"추석","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-09-26","name":"추석 연휴","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-10-03","name":"개천절","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-10-05","name":"대체공휴일(개천절)","type":"substitute","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-10-09","name":"한글날","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2026-12-25","name":"기독탄신일","type":"public-holiday","isHoliday":true,"sources":["KASI2026","KASA2026"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2026"},{"date":"2027-01-01","name":"1월 1일","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-02-06","name":"설날 연휴","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-02-07","name":"설날","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-02-08","name":"설날 연휴","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-02-09","name":"대체공휴일(설날)","type":"substitute","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-03-01","name":"3·1절","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-05-01","name":"노동절","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-05-03","name":"대체공휴일(노동절)","type":"substitute","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-05-05","name":"어린이날","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-05-13","name":"부처님오신날","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-06-06","name":"현충일","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-07-17","name":"제헌절","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-07-19","name":"대체공휴일(제헌절)","type":"substitute","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-08-15","name":"광복절","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-08-16","name":"대체공휴일(광복절)","type":"substitute","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-09-14","name":"추석 연휴","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-09-15","name":"추석","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-09-16","name":"추석 연휴","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-10-03","name":"개천절","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-10-04","name":"대체공휴일(개천절)","type":"substitute","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-10-09","name":"한글날","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-10-11","name":"대체공휴일(한글날)","type":"substitute","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-12-25","name":"기독탄신일","type":"public-holiday","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"},{"date":"2027-12-27","name":"대체공휴일(기독탄신일)","type":"substitute","isHoliday":true,"sources":["KASI2027","KASA2027"],"version":"ORDER-KR-PUBLIC-20261029-v1","coverage":"2027"}],"limitations":["Static review snapshot; no authenticated special-day API was called.","KASI detailed annual tables are checked against published KASA notices; publication disclaimers are not erased.","Later extraordinary holidays, annual updates and years outside 2026/2027 require fresh data.","No weekday-based substitute-day inference; June 7 2027 is not fabricated as a holiday."]},byDate=new Map(metadata.records.map(r=>[r.date,Object.freeze(r)]));
 return Object.freeze({metadata:Object.freeze(metadata),get(year,month,day){
  const key=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),record=byDate.get(key)||null;
  return {covered:metadata.coverage.includes(Number(year)),record};
 }});
})();

window.OrderDatePolicy=Object.freeze((()=>{
 const zone='Asia/Seoul';
 const calendar=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
 const today=(now=new Date())=>Object.fromEntries(calendar.formatToParts(now).filter(p=>['year','month','day'].includes(p.type)).map(p=>[p.type,Number(p.value)]));
 const key=d=>Number(d.year)*10000+Number(d.month)*100+Number(d.day);
 const empty=d=>!d||d.day===''||d.day===null||d.day===undefined;
 const days=(year,month)=>new Date(Date.UTC(Number(year),Number(month),0)).getUTCDate();
 const calendarValid=d=>!!d&&['year','month','day'].every(k=>String(d[k]).trim()!==''&&Number.isInteger(Number(d[k])))&&Number(d.year)>=2000&&Number(d.year)<=2100&&Number(d.month)>=1&&Number(d.month)<=12&&Number(d.day)>=1&&Number(d.day)<=days(d.year,d.month);
 const validate=(d,now=new Date())=>empty(d)?{valid:true,empty:true,code:'EMPTY',message:''}:!calendarValid(d)?{valid:false,empty:false,code:'INVALID',message:'해당 월에 존재하는 날짜를 입력해 주세요.'}:key(d)<key(today(now))?{valid:false,empty:false,code:'PAST',message:'오늘 이후의 납품 희망일을 선택해 주세요.'}:{valid:true,empty:false,code:'VALID',message:''};
 const blank=()=>({...today(),day:''});
 return {zone,today,key,empty,days,calendarValid,validate,blank};
})());



/* CODE1 shared UI primitives – framework-independent; reusable Q1..Q4 / Home / Results / Admin.
   Visual base: regular v0.15 Q1. This module owns glyph and semantic data contracts;
   pages own domain policy and persistence. Do not use this module as blanket redesign authority. */
const CODE1_UI = (() => {
  const {chevron,check}=window.OrderAccordionView;
  const accordion=options=>window.OrderAccordionView.render(options);
  const textAction=(label,action,id,danger=false,ariaLabel='')=>`<button type="button" class="code1-text-action ${danger?'code1-text-action--danger':''}" data-${action}="${id}" ${ariaLabel?`aria-label="${ariaLabel}"`:''}>${label}</button>`;
  const status = (state='empty') => `<span class="ui-completion" data-state="${state}" aria-hidden="true">${check}</span>`;
  const markState = (done, saved=false,invalid=false) => invalid?'invalid':done?(saved?'saved-valid':'draft-valid'):'empty';
  const parseSiteInteger = v => /^\d+$/.test(String(v??'')) && Number.isSafeInteger(Number(v)) && Number(v) <= 99999999;
  const code1PublicCopyForbidden = /(검토용|QA\s*(?:후보|입력|용|검토)|저장되지 않습니다|자동 균등 배분하지 않으며|모의 데이터|internal\b|mock\b)/i;
  return Object.freeze({chevron,check,accordion,textAction,status,markState,parseSiteInteger,code1PublicCopyForbidden});
})();

/* CODE1 / order.ooo — normalized read-only Q1→Q4 validation domain.
 * Same verdict must guard Q4 commit, stage completion, result CTA and restoration.
 * No DOM writes, storage writes, or silent defaults. Unknown approval remains blocked.
 */
const CODE1_ORDER_VALIDATION=(()=>{
 const int=(v,max=99999999)=>/^\d+$/.test(String(v??''))&&Number.isSafeInteger(+v)&&+v>0&&+v<=max;
 const dims={housing:['1','2','3','4'],size:['왕란','특란','대란','중란','소란'],pack:['10','20','30']};
 const week=['월','화','수','목','금','토','일'];
 const copy=o=>JSON.parse(JSON.stringify(o));
 const record=(stage,field,message,code)=>({stage,field,message,code});
 function validateOrderDraft(S,{scope='full',target=null,siteDraft=null,onceDraft=null,confirmedFingerprint=null,emailProofs=null}={}){
  const issues=[], warnings=[], confirmations=[];
  const put=(stage,field,message,code='BLOCK_REQUIRED',siteId=null,lineId=null)=>{const u=lines.find(l=>l.id===lineId)?.pack==='30'?'판':'팩';const human=siteId||lineId?message.replaceAll('판',u):message;issues.push({issueId:[stage,lineId||'',siteId||'',field,code].join(':'),stage,field,fieldKey:field.split(':').pop(),siteId,lineId,code,errorCode:code,severity:'error',blocking:true,message:human,humanMessage:human});};
  const lines=Array.isArray(S?.lines)?S.lines:[],sites=Array.isArray(S?.locations)?S.locations:[],allocations=Array.isArray(S?.allocations)?S.allocations:[];
  const locById=Object.fromEntries(sites.map(l=>[l.id,l]));
  const within=(l)=>allocations.filter(a=>a.lineId===l.id);
  if(!lines.length)put('q1','sku','계란 제품을 한 개 이상 선택해 주세요.');
  const catalog=new Set(),pairs=new Set();
  for(const l of lines){
   const k=`line:${l.id}`;
   if(!dims.housing.includes(String(l.housing))||!dims.size.includes(l.size)||!dims.pack.includes(String(l.pack)))put('q1',k+':spec','계란 번호·크기·포장 단위를 모두 선택해 주세요.','BLOCK_REQUIRED',null,l.id);
   if(!validMonthlyQuantity(l))put('q2',k+':qty','월 구매 수량은 1 이상인 정수로 입력해 주세요.','BLOCK_REQUIRED',null,l.id);
   if(!int(l.price))put('q2',k+':price','현재 구매 단가는 1원 이상 입력해 주세요.','BLOCK_REQUIRED',null,l.id);
   const ident=[l.housing,l.size,l.pack].join('|'); if(catalog.has(ident))warnings.push({stage:'q1',lineId:l.id,code:'POLICY_OPEN_DUPLICATE'});catalog.add(ident);
   if(!within(l).length)put('q4',k+':site','이 계란의 납품 사업장을 선택해 주세요.','BLOCK_ASSIGNMENT',null,l.id);
  }
   if(!sites.length)put('q3','sites','사업장 기본정보를 입력해 주세요.');
   for(const site of sites)for(const issue of OrderSiteContract.issues(site,{emailProof:emailProofs?.get?.(site.id)}))put('q3',`site:${site.id}:${issue.key}`,issue.message,issue.code||'BLOCK_REQUIRED',site.id,null);
   for(const a of allocations){const pair=a.lineId+'|'+a.locationId;if(pairs.has(pair))put('q4',a.id+':duplicate','같은 품목과 사업장을 중복 연결할 수 없습니다.','BLOCK_ASSIGNMENT',a.locationId,a.lineId);pairs.add(pair);if(!lines.some(l=>l.id===a.lineId)||!locById[a.locationId])put('q4',a.id+':site','존재하지 않는 품목 또는 사업장 연결입니다.','BLOCK_ASSIGNMENT',a.locationId,a.lineId);}
  // The draft is mapped to exactly one allocation and one SKU. Other SKUs always read saved data.
  const active=allocations.map(a=>target&&a.id===target.id?target:a);
  // The same-SKU mixed-mode ownership rule is not signed off; reject rather than changing siblings.
  for(const l of lines){const linked=active.filter(a=>a.lineId===l.id);if(linked.length>=2&&new Set(linked.map(a=>a.mode)).size>1)put('q4',`line:${l.id}:mixed-mode`,'사업장마다 다른 납품 방식은 확인이 필요합니다.','POLICY_OPEN_MIXED_MODE',null,l.id);}
  const modeOk=m=>['FLEX','FIXED','ONCE'].includes(m);
  for(const a of active){
   if(scope==='draft'&&target&&a.lineId!==target.lineId)continue;
   const line=lines.find(l=>l.id===a.lineId),same=active.filter(x=>x.lineId===a.lineId),count=same.length,localDraft=!!target&&target.lineId===a.lineId;
   if(a.mode==='ONCE'){const d=window.OrderDatePolicy.validate(a.q4Review?.deliveryDate);if(!d.valid)put('q4',a.id+':desired-date',d.message,'BLOCK_REQUIRED',a.locationId,a.lineId);}
   const prefix=a.id;
   if(!modeOk(a.mode)||a.modeExplicit!==true)put('q4',prefix+':mode','납품 방식을 선택해 주세요.','BLOCK_REQUIRED',a.locationId,a.lineId);
   if(!Array.isArray(a.advanced?.contactChannels)||!a.advanced.contactChannels.length)put('q4',prefix+':contact','연락 수단을 하나 이상 선택해 주세요.','BLOCK_REQUIRED',a.locationId,a.lineId);
   if(a.mode!=='ONCE'){
    const proc=a.mode==='FIXED'?a.advanced?.fixedOrderProcess:a.advanced?.flexOrderProcess;
    const allow=a.mode==='FIXED'?['seller','auto']:['store','seller'];
    if(!allow.includes(proc))put('q4',prefix+':process','주문 진행 방식을 선택해 주세요.','BLOCK_REQUIRED',a.locationId,a.lineId);
   }
   if(count===1&&(!int(a.qty,99999)))put('q4',prefix+':qty',a.mode==='ONCE'?'1회 납품 수량을 입력해 주세요.':'회당 예상 납품 수량을 입력해 주세요.','BLOCK_REQUIRED',a.locationId,a.lineId);
   if(a.mode==='ONCE'){
    if(count>=2){
     const entry=localDraft&&onceDraft?onceDraft[a.locationId]?.value:a.oneTimeDeliveryQty;
     if(!int(entry,99999))put('q4',`site:${a.locationId}:once`,'사업장별 1회 납품량을 1 이상인 정수로 입력해 주세요.','BLOCK_REQUIRED',a.locationId,a.lineId);
     // Confirm when every same-SKU ONCE site has an explicit quantity; never use Q2 as a hard cap.
     if(same.every(x=>x.mode==='ONCE')&&a.id===same[0].id&&line&&int(line.qty)){
      const values=same.map(x=>({siteId:x.locationId,name:locById[x.locationId]?.name||'사업장',quantity:localDraft&&onceDraft?onceDraft[x.locationId]?.value:x.oneTimeDeliveryQty}));
      if(values.every(x=>int(x.quantity,99999))){const total=values.reduce((n,x)=>n+Number(x.quantity),0);
       const fingerprint=[line.id,line.qty,...values.map(x=>`${x.siteId}:${x.quantity}`)].join('|');
       if(total>=Number(line.qty)&&fingerprint!==confirmedFingerprint&&!same.every(x=>x.onceConfirmedFingerprint===fingerprint))confirmations.push({stage:'q4',code:'ONCE_AT_LEAST_MONTH',fingerprint,lineId:line.id,monthly:Number(line.qty),total,sites:values.map(x=>({name:x.name,qty:Number(x.quantity)}))});
      }
     }
    }
   }else {
    if(count===1){
     if(a.variableQty)checkRange(a.locationId,a.lineId,a.qty,a.qtyMin,a.qtyMax,prefix);
    } else {
     const draft=localDraft&&siteDraft?siteDraft[a.locationId]:null;
     const monthly=draft?draft.value:a.monthlyDemandQty;
     const base=draft?draft.baseQty:a.qty;
     if(!int(monthly))put('q4',`site:${a.locationId}:monthly`,'사업장 월 사용량을 1 이상인 정수로 입력해 주세요.','BLOCK_REQUIRED',a.locationId,a.lineId);
     if(!int(base,99999))put('q4',`site:${a.locationId}:base`,'사업장별 회당 예상 납품 수량을 입력해 주세요.','BLOCK_REQUIRED',a.locationId,a.lineId);
     const variable=draft?!!draft.variableQty:!!a.variableQty;
     if(variable)checkRange(a.locationId,a.lineId,base,draft?.qtyMin??a.qtyMin,draft?.qtyMax??a.qtyMax,`site:${a.locationId}`);
     // Exact monthly distribution checked once per SKU/group, not N times.
     if(a.id===same.find(x=>x.mode!=='ONCE')?.id&&line&&int(line.qty)){
      const recurring=same.filter(x=>x.mode!=='ONCE');
      if(recurring.length!==same.length){
       // Mixed per-site mode ownership policy has not been approved. Never mutate an unrelated mode.
       put('q4',`line:${a.lineId}:mixed-mode`,'사업장마다 다른 납품 방식을 확인해 주세요.','POLICY_OPEN_MIXED_MODE',null,a.lineId);
      }else{
       const values=recurring.map(x=>localDraft&&siteDraft?.[x.locationId]?siteDraft[x.locationId].value:x.monthlyDemandQty);
       if(values.every(v=>int(v))&&values.reduce((n,v)=>n+Number(v),0)!==Number(line.qty))put('q4',`line:${a.lineId}:site-sum`,'사업장 월 사용량의 합계가 현재 월 구매량과 일치하지 않습니다.','BLOCK_CONFLICT',null,a.lineId);
      }
     }
    }
   }
    if(a.mode==='FIXED'){const contract=OrderRepeatContract.inspect(OrderRepeatContract.fromAllocation(a));if(!contract.valid)put('q4',a.id+':'+contract.issue.kind,contract.issue.message,'BLOCK_REPEAT',a.locationId,a.lineId);}

  }
  function checkRange(siteId,lineId,base,low,high,prefix){
   if(!int(low,99999))put('q4',`site:${siteId}:min`,'가변 수량 최소값을 입력해 주세요.','BLOCK_REQUIRED',siteId,lineId);
   if(!int(high,99999))put('q4',`site:${siteId}:max`,'가변 수량 최대값을 입력해 주세요.','BLOCK_REQUIRED',siteId,lineId);
   if(int(low,99999)&&int(high,99999)&&+low>+high){put('q4',`site:${siteId}:min`,'최소 수량이 최대 수량을 초과합니다.','BLOCK_CONFLICT',siteId,lineId);put('q4',`site:${siteId}:max`,'최대 수량이 최소 수량보다 작습니다.','BLOCK_CONFLICT',siteId,lineId);}
   if(int(base,99999)&&int(low,99999)&&+base<+low)put('q4',`site:${siteId}:base`,'회당 수량이 최소 수량보다 작습니다.','BLOCK_CONFLICT',siteId,lineId);
   if(int(base,99999)&&int(high,99999)&&+base>+high)put('q4',`site:${siteId}:base`,'회당 수량이 최대 수량보다 큽니다.','BLOCK_CONFLICT',siteId,lineId);
  }
  const unique=[...new Map(issues.map(z=>[z.issueId,z])).values()];
  return {valid:unique.length===0,issues:unique,fieldErrors:unique,groupErrors:unique.filter(i=>i.field.endsWith('site-sum')||i.field.endsWith('mixed-mode')),warnings,confirmations,resultStatus:unique.length?(unique.some(i=>i.code==='BLOCK_CONFLICT')?'BLOCK_CONFLICT':'BLOCK_REQUIRED'):confirmations.length?'NEED_CONFIRMATION':active.every(x=>x.mode==='ONCE')?'NO_MONTHLY_COMPARISON':'ESTIMATE_VALID'};
 }
 return Object.freeze({validateOrderDraft,int});
})();


const CODE1_ORDER_ERRORS=(()=>{
 const escape=v=>typeof CSS!=='undefined'&&CSS.escape?CSS.escape(String(v)):String(v).replace(/[^a-zA-Z0-9_-]/g,'\\$&');
 const uiMap=(issue,root)=>{
  const f=issue.field||'',site=issue.siteId;
  if(site&&/site:.*:once$/.test(f))return root.querySelector(`[data-q4-demand-site="${escape(site)}"]`);
  if(site&&/site:.*:monthly$/.test(f))return root.querySelector(`[data-q4-demand-site="${escape(site)}"]`);
  if(site&&/site:.*:base$/.test(f))return root.querySelector(`[data-q4-site-base="${escape(site)}"]`)||root.querySelector('#q4-qty');
  if(site&&/site:.*:min$/.test(f))return root.querySelector(`[data-q4-site-min="${escape(site)}"]`)||root.querySelector('#q4-min');
  if(site&&/site:.*:max$/.test(f))return root.querySelector(`[data-q4-site-max="${escape(site)}"]`)||root.querySelector('#q4-max');
  if(issue.stage==='q2')return document.getElementById((f.endsWith(':price')?'price-':'qty-')+String(issue.lineId));
  if(f.endsWith(':qty'))return root.querySelector('#q4-qty');
  if(f.endsWith(':mode'))return root.querySelector('.q4-mode');
  if(f.endsWith(':contact'))return root.querySelector('.q4-contact-grid');
  if(f.endsWith(':days'))return root.querySelector('.q4-week-row')||root.querySelector('#q4-days-section');
  if(f.endsWith(':count'))return root.querySelector('[data-q4-combo-trigger="count"]');
  if(f.endsWith(':cycle'))return root.querySelector('[data-q4-combo-trigger="interval"]');
  if(f.endsWith(':date'))return root.querySelector('[data-q4-combo-trigger="month-day"]');
  if(f.endsWith(':process'))return root.querySelector('.q4-order-options');
  if(f.endsWith(':site-sum')||f.endsWith(':mixed-mode'))return root.querySelector('.q4-demand-fields');
  if(issue.stage==='q2')return document.getElementById((f.endsWith(':price')?'price-':'qty-')+String(issue.lineId));
  // Common Q1-Q3 routing: select the actual invalid subcontrol once its saved-row editor is mounted.
  // A Q1 specification issue may name a group; focus its first available option without rewriting the selection.
  if(issue.stage==='q1'){
   const editor=document.querySelector('#sku-editor:not([hidden])');
   if(editor&&issue.lineId){
    const line=window.OrderValidationState?.line(issue.lineId);
    const allowed={housing:['1','2','3','4'],size:['왕란','특란','대란','중란','소란'],pack:['10','20','30']};
    const field=['housing','size','pack'].find(k=>!allowed[k].includes(String(line?.[k]??'')))||'housing';
    return editor.querySelector('#picks-'+field)||editor;
   }
   return document.querySelector(`[data-edit="${escape(issue.lineId||'')}"]`)||document.querySelector('#sku-editor');
  }
   if(issue.stage==='q3'&&site){const key=issue.fieldKey||String(issue.field||'').split(':').at(-1),ids={name:'site-name',address:'q3-address-slot',contactPhone:'site-contact-phone',email:'site-email',storePhone:'site-store-phone'};if(document.getElementById('site-editor-dialog')?.open)return document.getElementById(ids[key]||'site-name');return document.querySelector(`[data-site-edit="${escape(site)}"]`);}
  if(issue.stage==='q3')return document.querySelector(`[data-line-id="${escape(issue.lineId||'')}"]`)||document.querySelector('#site-editor');
  return null;
 };
 const activeIssues=[];
 function clear(root){
  root.querySelectorAll('[data-order-invalid="true"]').forEach(n=>{n.removeAttribute('data-order-invalid');n.removeAttribute('aria-invalid');if(String(n.getAttribute('aria-describedby')||'').startsWith('order-error-'))n.removeAttribute('aria-describedby');n.classList.remove('order-target-error');if(n.matches('.t-acc'))n.dataset.error='false';});
  root.querySelectorAll('[data-order-error-note]').forEach(x=>x.remove());
  root.querySelectorAll('[data-order-error-stage]').forEach(x=>{x.removeAttribute('data-order-error-stage');});
 }
 function applyAll(issues,root=document,{persist=true}={}){
  clear(root);if(persist){activeIssues.splice(0,activeIssues.length,...issues);}
  const touched=new Set();
  issues.forEach((issue,i)=>{
   const target=uiMap(issue,root),stage=document.querySelector(`.accordion-trigger[data-open="${issue.stage}"]`)?.closest('.t-acc');
   if(stage){stage.dataset.orderErrorStage='true';stage.dataset.status='error';}
   if(!target||!root.contains(target))return;
   target.dataset.orderInvalid='true';target.setAttribute('aria-invalid','true');
   const shape=target.closest('.t-acc[data-ui-subaccordion]');if(shape&&issue.stage==='q4'){shape.dataset.error='true';shape.dataset.orderInvalid='true';shape.setAttribute('aria-invalid','true');}
   if(touched.has(target))return;
   touched.add(target);
   if(issue.stage==='q2'&&issue.lineId&&['qty','price'].includes(issue.fieldKey)){
    const group=target.closest('.numeric-field'),under=group?.querySelector('.input-unit');
    const helper=document.getElementById('q2-error-'+issue.fieldKey+'-'+issue.lineId);
    if(group)group.dataset.orderInvalid='true';if(under)under.dataset.orderInvalid='true';
    if(helper){helper.textContent=issue.message;helper.hidden=false;target.setAttribute('aria-describedby',helper.id);}
    return;
   }
   const note=document.createElement('p');note.className='ui-error order-error-note ui-feedback-sr';note.dataset.orderErrorNote=issue.issueId;
   note.id='order-error-'+i;note.setAttribute('role','alert');
   note.textContent=issue.message;
   const control=target.matches('input,button,textarea,select')?target:target.querySelector('input,button,textarea,select');
   if(control){control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',note.id);control.dataset.orderInvalid='true';}
   // Site inputs live inside narrow unit flex rows: error copy belongs BELOW that row, never beside the numeric input.
   let anchor=target;
   if(target.matches('[data-q4-demand-site]'))anchor=target.closest('.ui-number-unit')||target;
   else if(target.matches('[data-q4-site-base]'))anchor=target.closest('.ui-site-base')||target;
   else if(target.matches('[data-q4-site-min],[data-q4-site-max]'))anchor=target.closest('.ui-site-var-range')||target;
   else if(target.id==='q4-qty')anchor=target.closest('.q4-field-line')||target;
   anchor.insertAdjacentElement('afterend',note);
  });
  return issues;
 }
 function navigateTo(issue,root=document,{animate=true}={}){
  if(!issue)return false;
  const node=uiMap(issue,root);
  if(!node||!root.contains(node))return false;
  for(let parent=node.closest('.t-acc[data-ui-subaccordion]');parent;parent=parent.parentElement?.closest('.t-acc[data-ui-subaccordion]')){
   const trigger=parent.querySelector(':scope > .accordion-trigger');if(trigger&&trigger.getAttribute('aria-expanded')==='false')trigger.click();
  }
  const focus=node.matches('input,button,select,textarea')?node:node.querySelector('[aria-invalid="true"],input,button,select,textarea')||node;
  focus.scrollIntoView({block:'center',behavior:'instant'});focus.focus({preventScroll:true});
  if(animate&&!(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)){
   node.classList.remove('code1-validation-shake');void node.offsetWidth;node.classList.add('code1-validation-shake');
   node.addEventListener('animationend',()=>node.classList.remove('code1-validation-shake'),{once:true});
  }
  return true;
 }
 return Object.freeze({applyAll,navigateTo,clear,findTarget:uiMap,activeIssues:()=>activeIssues.slice()});
})();


export {CODE1_UI,CODE1_ORDER_VALIDATION,CODE1_ORDER_ERRORS};
