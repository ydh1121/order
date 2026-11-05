/* Approved D1R6 date field and one common top-layer calendar. This is a draft
 * editor: only its caller owns transaction/persistence. */
import DatePolicy from './order-date.mjs';
import {bindNumericInputs} from './numeric-input.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const calendarIcon='<svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 2v6 M17 2v6 M3 10h18" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
const arrow=direction=>`<svg viewBox="0 0 20 20" aria-hidden="true" width="20" height="20"><path d="${direction<0?'M12 5l-5 5 5 5':'M8 5l5 5-5 5'}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const fieldBindings=new WeakMap(),calendars=new WeakMap();
const partsOf=value=>DatePolicy.validDate(value)?Object.fromEntries(['year','month','day'].map((key,i)=>[key,String(Number(value.split('-')[i]))])):null;
function messages(target,messages){target.replaceChildren(...messages.map((text,i)=>{const p=target.ownerDocument.createElement('p');p.textContent=`${i+1}. ${text}`;return p;}));target.hidden=messages.length===0;}
export function dateFieldMarkup({id,value='',parts:rawParts=null,readOnly=false,required=true,label=readOnly?'정기 주문 시작 예상일':'정기 주문 시작 예상일 지정',emptyMessage='납품일을 선택해주세요.',now=new Date(),error=''}={}){
 const selected=partsOf(value),parts=rawParts||selected||{...partsOf(DatePolicy.todayKST(now)),day:''};
 const input=(part,name,placeholder)=>`<input id="${esc(id+'-'+part)}" data-order-date-part="${part}" type="text" inputmode="numeric" autocomplete="off" maxlength="${part==='year'?4:2}" aria-label="${esc(label+' '+name)}" aria-describedby="${esc(id+'-error')} ${esc(id+'-notices')}" value="${esc(parts?.[part]??'')}" placeholder="${placeholder}" ${readOnly?'disabled readonly tabindex="-1"':`aria-required="${required}"`}><span>${name}</span>`;
 return `<div class="order-date-field qa-site-field" id="${esc(id)}" data-order-date-field data-readonly="${readOnly}"><label class="qa-site-label ui-field-title" for="${esc(id+'-year')}">${esc(label)}${required&&!readOnly?'<span class="ui-required" aria-hidden="true"> *</span>':''}</label><div class="qa-date-anchor order-date-anchor" data-readonly="${readOnly}"${readOnly?' aria-disabled="true"':''}><div class="qa-date-segments"${readOnly&&!selected?' hidden':''}>${input('year','년','0000')}${input('month','월','00')}${input('day','일','00')}</div>${readOnly?`<span data-order-date-empty${selected?' hidden':''}>${esc(emptyMessage)}</span>`:`<button type="button" class="qa-calendar-trigger" data-order-calendar-open aria-label="${esc(label+' 달력 열기')}" aria-haspopup="dialog" aria-controls="order-common-calendar" aria-expanded="false">${calendarIcon}</button>`}</div><p id="${esc(id+'-error')}" class="qa-date-error ui-field-error" data-order-date-error${error?'':' hidden'}>${esc(error)}</p><div class="order-date-notices" id="${esc(id+'-notices')}" data-order-date-notices role="status" aria-live="polite" hidden></div></div>`;
}
function calendarFor(doc){
 if(calendars.has(doc))return calendars.get(doc);
 const win=doc.defaultView,shell=win.OrderModalShell;if(!shell)throw Error('ORDER_MODAL_SHELL_REQUIRED');
 const dialog=doc.createElement('dialog');dialog.id='order-common-calendar';dialog.className='q4-regular-dialog order-calendar-dialog';dialog.dataset.orderCalendar='';dialog.setAttribute('aria-labelledby','order-calendar-title');dialog.setAttribute('aria-describedby','order-calendar-help');
 dialog.innerHTML=`<div class="q4-regular-panel"><div class="qa-date-popover order-calendar-content"><div class="qa-calendar-heading"><button type="button" class="ui-icon-button" data-order-calendar-nav="-1" aria-label="이전 달">${arrow(-1)}</button><strong id="order-calendar-title" aria-live="polite"></strong><button type="button" class="ui-icon-button" data-order-calendar-nav="1" aria-label="다음 달">${arrow(1)}</button></div><div class="qa-calendar-weeknames" aria-hidden="true">${['월','화','수','목','금','토','일'].map((name,i)=>`<span${i>4?` data-weekend="${i===5?'saturday':'sunday'}"`:''}>${name}</span>`).join('')}</div><div class="qa-calendar-grid" role="group" aria-label="날짜 선택"></div><p class="visually-hidden" id="order-calendar-help">방향키로 날짜 이동, Page Up과 Page Down으로 월 이동, Enter로 선택, Escape로 닫기</p><div class="order-calendar-guidance" role="status" aria-live="polite"></div><div class="qa-calendar-actions"><button type="button" data-order-calendar-close>닫기</button></div></div></div>`;
 doc.body.append(dialog);
 const grid=dialog.querySelector('.qa-calendar-grid'),guidance=dialog.querySelector('.order-calendar-guidance'),title=dialog.querySelector('#order-calendar-title');let owner=null,view=null,boundaryTimer=null;
 const now=()=>owner.now(),evaluate=(date,current=now())=>DatePolicy.evaluateDate({date,now:current,unavailable:owner.unavailable(),...owner.policyOptions}),allowed=key=>evaluate(key).selectable;
 const align=bindCalendarGuidance(dialog,guidance);
 function render(focusDate=null){
  if(!owner)return;const current=now(),bounds=DatePolicy.dateBounds(current,owner.policyOptions);if(!bounds)return;
  if(!view||view<bounds.minimumMonth||view>bounds.maximumMonth)view=bounds.minimumMonth;
  const [year,month]=view.split('-').map(Number),last=new Date(Date.UTC(year,month,0)).getUTCDate(),offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,selected=owner.value();
  title.textContent=`${year}년 ${String(month).padStart(2,'0')}월`;
  const enabled=Array.from({length:last},(_,i)=>DatePolicy.dateKey(year,month,i+1)).filter(allowed),focus=enabled.includes(focusDate)?focusDate:enabled.includes(selected)?selected:enabled[0];
  const cells=Array(offset).fill('<span aria-hidden="true"></span>');
  for(let day=1;day<=last;day++){
   const key=DatePolicy.dateKey(year,month,day),info=DatePolicy.dayInfo(key),evaluation=evaluate(key,current),holiday=info.holiday,kind=holiday?(holiday.kind==='substitute'?'substitute':'holiday'):info.weekday===0?'sunday':info.weekday===6?'saturday':'weekday';
   const label=`${year}년 ${month}월 ${day}일${holiday?' '+holiday.name:''}${evaluation.code==='PROVIDER_UNAVAILABLE'?' 납품사 휴무일':''}${evaluation.selectable?'':' 선택 불가'}`;
   cells.push(`<button type="button" data-order-calendar-key="${key}" data-day-kind="${kind}" aria-label="${esc(label)}" aria-pressed="${selected===key}"${key===DatePolicy.todayKST(current)?' aria-current="date"':''}${evaluation.selectable?'':' disabled aria-disabled="true"'} tabindex="${key===focus?0:-1}">${day}</button>`);
  }
  grid.innerHTML=cells.join('');dialog.querySelector('[data-order-calendar-nav="-1"]').disabled=view<=bounds.minimumMonth;dialog.querySelector('[data-order-calendar-nav="1"]').disabled=view>=bounds.maximumMonth;
  if(selected)messages(guidance,evaluate(selected,current).messages);
  else{guidance.hidden=false;const p=doc.createElement('p');p.textContent=DatePolicy.baseNotice;guidance.replaceChildren(p);}
  matchDisabledLightness(dialog,grid);align();
 }
 function close({immediate=false}={}){clearTimeout(boundaryTimer);if(owner)owner.trigger?.setAttribute('aria-expanded','false');shell.close(dialog,{immediate,after:()=>{owner=null;}});}
 function refreshBoundary(){clearTimeout(boundaryTimer);if(!owner||!dialog.open)return;const current=DatePolicy.todayKST(now()),old=view;render();owner.repaint();if(old!==view)grid.querySelector('[tabindex="0"]')?.focus({preventScroll:true});const t=now().getTime(),day=86400000;boundaryTimer=setTimeout(refreshBoundary,day-((t+9*3600000)%day)+30);}
 function open(nextOwner){owner=nextOwner;owner.commit();const bounds=DatePolicy.dateBounds(now(),owner.policyOptions),value=owner.value();view=DatePolicy.validDate(value)&&value>=bounds.minimum&&value<=bounds.maximum?value.slice(0,7):bounds.minimumMonth;render();owner.trigger.setAttribute('aria-expanded','true');shell.open(dialog,{variant:'selection',role:'calendar',returnFocus:owner.trigger,initialFocus:()=>grid.querySelector('[tabindex="0"]')||dialog.querySelector('[data-order-calendar-close]'),contentSize:'content',history:true});align();refreshBoundary();}
 function navigate(delta){if(!owner)return;const [y,m]=view.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1)),next=DatePolicy.dateKey(d.getUTCFullYear(),d.getUTCMonth()+1,1).slice(0,7),b=DatePolicy.dateBounds(now(),owner.policyOptions);if(next<b.minimumMonth||next>b.maximumMonth)return;view=next;render();const nav=dialog.querySelector(`[data-order-calendar-nav="${delta}"]`);(nav.disabled?grid.querySelector('[tabindex="0"]'):nav)?.focus({preventScroll:true});}
 shell.bind(dialog,()=>close(),{editable:false});
 dialog.addEventListener('click',event=>{const day=event.target.closest('[data-order-calendar-key]'),nav=event.target.closest('[data-order-calendar-nav]');if(event.target.closest('[data-order-calendar-close]')){close();return;}if(nav&&!nav.disabled){navigate(Number(nav.dataset.orderCalendarNav));return;}if(day&&!day.disabled&&owner&&allowed(day.dataset.orderCalendarKey)){owner.choose(day.dataset.orderCalendarKey);close();}});
 dialog.addEventListener('keydown',event=>{
  const active=event.target.closest('[data-order-calendar-key]');if(!active||!owner)return;const key=event.key,delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[key];if(delta===undefined&&!['Home','End','PageUp','PageDown'].includes(key))return;event.preventDefault();event.stopPropagation();let desired,direction=1;const from=active.dataset.orderCalendarKey;
  if(delta!==undefined){desired=DatePolicy.addDays(from,delta);direction=Math.sign(delta);}else if(key==='Home'||key==='End'){const w=(DatePolicy.utcDate(from).getUTCDay()+6)%7;desired=DatePolicy.addDays(from,key==='Home'?-w:6-w);direction=key==='Home'?1:-1;}else{const [y,m,d]=from.split('-').map(Number),move=key==='PageUp'?-1:1,next=new Date(Date.UTC(y,m-1+move,1));desired=DatePolicy.dateKey(next.getUTCFullYear(),next.getUTCMonth()+1,Math.min(d,new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate()));direction=move;}
  const {minimum,maximum}=DatePolicy.dateBounds(now(),owner.policyOptions);if(desired<minimum)desired=minimum;if(desired>maximum)desired=maximum;let guard=0;while(!allowed(desired)&&guard++<62){desired=DatePolicy.addDays(desired,direction);if(desired<minimum||desired>maximum)return;}if(!allowed(desired))return;view=desired.slice(0,7);render(desired);grid.querySelector(`[data-order-calendar-key="${desired}"]`)?.focus({preventScroll:true});
 });
 const api={open,close,refresh:render,belongs:binding=>owner===binding,dialog};calendars.set(doc,api);return api;
}
export function bindDateField(root,{now=()=>new Date(),getDate=()=>'',getParts=null,onChange=()=>{},unavailable=()=>[],policyOptions={},error=''}={}){
 if(!root)throw Error('DATE_FIELD_REQUIRED');const existing=fieldBindings.get(root);if(existing)return existing;
 const currentNow=()=>{const raw=typeof now==='function'?now():now;return raw instanceof Date?raw:new Date(raw);};
 const fields=[...root.querySelectorAll('[data-order-date-part]')],trigger=root.querySelector('[data-order-calendar-open]'),readOnly=root.dataset.readonly==='true',notices=root.querySelector('[data-order-date-notices]'),errorNode=root.querySelector('[data-order-date-error]'),anchor=root.querySelector('.order-date-anchor'),listeners=[];
 let selected=DatePolicy.validDate(getDate())?getDate():'',dirty=false,currentError=error,disposed=false,last=null;
 const numeric=bindNumericInputs(root,{selector:'[data-order-date-part]',options:input=>({grouped:false,maxDigits:input.dataset.orderDatePart==='year'?4:2,allowEmpty:true,allowZero:true,min:0,step:1})});
 const values=()=>Object.fromEntries(fields.map(input=>[input.dataset.orderDatePart,input.value]));
 function write(parts,{preserve=false}={}){for(const input of fields){const value=String(parts[input.dataset.orderDatePart]??'');if(input.disabled||preserve)input.value=value;else numeric.replace(input,value);}}
 function repaint(){const result=selected?DatePolicy.evaluateDate({date:selected,now:currentNow(),unavailable:unavailable(),...policyOptions}):null;messages(notices,result?.messages||[]);const bad=!!currentError||!!selected&&!result?.selectable;anchor.dataset.dateError=String(bad);fields.forEach(input=>input.setAttribute('aria-invalid',String(bad)));errorNode.textContent=currentError;errorNode.hidden=!currentError;return result;}
 function apply({final=false,editingPart=null,notify=true}={}){if(readOnly||disposed)return null;const result=DatePolicy.normalizeDateDraft(values(),currentNow(),{final,editingPart,...policyOptions});if(result.status==='invalid')return result;write(result.parts);dirty=result.status!=='valid';selected=result.date||'';last=result;result.evaluation=selected?DatePolicy.evaluateDate({date:selected,now:currentNow(),unavailable:unavailable(),...policyOptions}):null;currentError='';repaint();if(notify)onChange(selected||null,result);return result;}
 function commit(){if(numeric.inspect().valid===false)return {status:'editing',date:null,parts:values()};return dirty?apply({final:true}):last;}
 function sync(value=getDate()){selected=DatePolicy.validDate(value)?value:'';const parts=partsOf(selected)||{...partsOf(DatePolicy.todayKST(currentNow())),day:''};write(parts);dirty=false;last=null;const empty=root.querySelector('[data-order-date-empty]');if(empty)empty.hidden=!!selected;const segments=root.querySelector('.qa-date-segments');segments.hidden=readOnly&&!selected;repaint();}
 function choose(value){if(disposed)return;sync(value);const result={status:'valid',date:value,parts:partsOf(value),changed:true,source:'calendar',evaluation:repaint()};onChange(value,result);}
 function on(type,handler,options){root.addEventListener(type,handler,options);listeners.push([type,handler,options]);}
 const owner={now:currentNow,value:()=>selected,unavailable,policyOptions,trigger,commit,choose,repaint};
 on('input',event=>{const input=event.target;if(!input.matches('[data-order-date-part]')||readOnly||event.isComposing)return;if(event.orderNumeric&&!event.orderNumeric.valid)return;dirty=true;apply({final:!!event.orderNumeric?.completed,editingPart:input.dataset.orderDatePart});event.stopPropagation();});
 on('focusout',event=>{if(fields.includes(event.target)&&!root.contains(event.relatedTarget))commit();});
 on('keydown',event=>{if(event.key==='Enter'&&fields.includes(event.target)&&!event.isComposing){event.preventDefault();event.stopPropagation();commit();event.target.blur();}});
 if(trigger)on('click',event=>{if(event.target.closest('[data-order-calendar-open]')){event.stopPropagation();calendarFor(root.ownerDocument).open(owner);}});
 function restoreParts(parts){if(readOnly||!parts)return;const raw=Object.fromEntries(['year','month','day'].map(key=>[key,String(parts[key]??'')]));write(raw,{preserve:true});const inspected=DatePolicy.inspectDateParts(raw,currentNow(),policyOptions);selected=inspected.value;dirty=false;last=null;repaint();}
 const api={sync,restoreParts,commit,repaint,inspect:()=>numeric.inspect(),parts:values,get value(){return selected;},setError(message=''){currentError=message;repaint();},close(){const c=calendars.get(root.ownerDocument);if(c?.belongs(owner))c.close();},destroy(){disposed=true;const c=calendars.get(root.ownerDocument);if(c?.belongs(owner))c.close({immediate:true});numeric.destroy();listeners.forEach(([type,fn,opts])=>root.removeEventListener(type,fn,opts));fieldBindings.delete(root);}};
 fieldBindings.set(root,api);sync(selected);if(getParts)restoreParts(getParts());return api;
}
 function bindCalendarGuidance(panel,guidance){
  if(typeof guidance==='string')guidance=panel.querySelector(guidance);
  if(!panel||!guidance)return ()=>false;
  const canvas=panel.ownerDocument.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
  // Raster ink (including font hinting) is more reliable here than advance
  // width or TextMetrics alone for the small Korean weekday and numbered note.
  function inkOffset(text,element,position){
   if(!context)return 0;
   const style=getComputedStyle(element),ratio=panel.ownerDocument.defaultView.devicePixelRatio||1,size=parseFloat(style.fontSize),padding=8;
   canvas.width=Math.ceil((size*4+padding*2)*ratio);canvas.height=Math.ceil((size*3+padding*2)*ratio);
   context.scale(ratio,ratio);context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
   context.textBaseline='alphabetic';context.fillStyle='#000';
   const origin=padding+((position*ratio)%1)/ratio;context.fillText(text.charAt(0),origin,padding+size*2);
   const data=context.getImageData(0,0,canvas.width,canvas.height).data;let first=canvas.width;
   for(let y=0;y<canvas.height;y++)for(let x=0;x<first;x++)if(data[(y*canvas.width+x)*4+3]>0){first=x;break;}
   return first<canvas.width?first/ratio-origin:0;
  }
  function align(){
   if(!panel.open)return false;
   const weekday=panel.querySelector('.qa-calendar-weeknames > span:first-child'),line=[...guidance.querySelectorAll('p')].find(p=>!p.hidden&&p.textContent.trim());
   if(!weekday||!line)return false;
   const range=panel.ownerDocument.createRange();range.selectNodeContents(weekday);
   const glyph=range.getBoundingClientRect(),base=guidance.getBoundingClientRect(),panelRect=panel.getBoundingClientRect(),scale=panel.offsetWidth?panelRect.width/panel.offsetWidth:1;
   const target=(glyph.left-base.left)/(scale||1)+inkOffset(weekday.textContent.trim(),weekday,glyph.left/(scale||1));
   let inset=target;
   // Resolve the note's own first-glyph bearing at its eventual pixel phase.
   for(let n=0;n<2;n++)inset=target-inkOffset(line.textContent.trim(),line,base.left/(scale||1)+inset);
   guidance.style.setProperty('--order-calendar-note-inset',Math.max(0,inset).toFixed(3)+'px');return true;
  }
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(align):null;resize?.observe(panel);
  const mutations=new MutationObserver(align);mutations.observe(guidance,{childList:true,subtree:true,characterData:true});
  panel.addEventListener('animationend',align);panel.addEventListener('transitionend',align);
  panel.ownerDocument.fonts?.ready.then(align);queueMicrotask(align);
  return align;
 }

function matchDisabledLightness(dialog,grid){
  function rgb(text){const n=text.match(/[\d.]+/g)?.map(Number);return n&&n.length>=3?n.slice(0,3):null;}
  function luminance(channels){return channels.map(x=>{const c=x/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);}
  function tokenColor(name){const swatch=document.createElement('span');swatch.style.cssText='position:absolute;visibility:hidden;color:var('+name+')';dialog.append(swatch);const result=rgb(getComputedStyle(swatch).color);swatch.remove();return result;}
  function mixPercent(base,target){let lo=0,hi=1;for(let i=0;i<30;i++){const m=(lo+hi)/2,current=luminance(base.map(c=>255+(c-255)*m));if(current>target)lo=m;else hi=m;}return ((lo+hi)*50).toFixed(3)+'%';}
  function matchDisabledLightnessInner(){const weekdayDisabled=grid.querySelector('button:disabled[data-day-kind="weekday"]:not([aria-current="date"])');if(!weekdayDisabled)return;const computed=getComputedStyle(weekdayDisabled),channels=rgb(computed.color),opacity=Number(computed.opacity),blue=tokenColor('--blue'),danger=tokenColor('--ui-danger');if(!channels||!blue||!danger)return;const target=luminance(channels.map(c=>c*opacity+255*(1-opacity)));dialog.style.setProperty('--order-disabled-blue-mix',mixPercent(blue,target));dialog.style.setProperty('--order-disabled-danger-mix',mixPercent(danger,target));dialog.dataset.disabledLightness=target.toFixed(5);}

matchDisabledLightnessInner();
}
