/* Shared unsigned-integer editing contract. Semantic quantity/date validation
 * stays with the caller. No arbitrary character stripping or floating parsing.
 * Phone/postal inputs must never be included in the bound selector. */
export function parseNumericText(raw,{grouped=false,allowEmpty=true,allowZero=true,maxDigits=null,clampMax=null}={}){
 raw=String(raw??'');
 if(raw==='')return {valid:!!allowEmpty,value:allowEmpty?'':null,raw,reason:allowEmpty?null:'EMPTY'};
 const plain=/^[0-9]+$/.test(raw),formatted=grouped&&/^[0-9]{1,3}(?:,[0-9]{3})+$/.test(raw);
 if(!plain&&!formatted)return {valid:false,value:null,raw,reason:'FORMAT'};
 let value=formatted?raw.split(',').join(''):raw;
 if(Number.isInteger(maxDigits)&&maxDigits>0&&value.length>maxDigits)return {valid:false,value:null,raw,reason:'LENGTH'};
 if(!allowZero&&/^0+$/.test(value))return {valid:false,value:null,raw,reason:'ZERO'};
 if(Number.isSafeInteger(clampMax)&&clampMax>=0&&BigInt(value)>BigInt(clampMax))value=String(clampMax);
 return {valid:true,value,raw,reason:null};
}
export function formatNumericText(value,{grouped=false}={}){
 const raw=String(value??'');return grouped&&/^[0-9]+$/.test(raw)?raw.replace(/\B(?=(\d{3})+(?!\d))/g,','):raw;
}
const bindings=new WeakMap();
const selection=input=>({start:input.selectionStart??String(input.value).length,end:input.selectionEnd??String(input.value).length,direction:input.selectionDirection||'none'});
const place=(input,mark)=>{try{input.setSelectionRange(mark.start,mark.end,mark.direction);}catch{}};
const digitCount=text=>(String(text).match(/[0-9]/g)||[]).length;
const caretAt=(text,count)=>{let p=0,n=0;while(p<text.length&&n<count){if(/[0-9]/.test(text[p]))n++;p++;}return p;};
const stop=event=>{event.stopImmediatePropagation?.();};

/** Bind once to a stable owner; refresh after rendering to register new fields.
 * Accepted input events expose orderNumeric.value (digit string), never Number.
 * Invalid legacy text is kept visible and can be repaired by deletion/replacement.
 * Native shortcuts operate a per-field edit history even when grouping reformats
 * the DOM. This is an input history, not a persistence or transaction history. */
export function bindNumericInputs(root,{selector='[data-numeric-input]',options=()=>({})}={}){
 const prior=bindings.get(root);if(prior){prior.refresh();return prior;}
 const states=new WeakMap(),listeners=[];
 const opts=input=>typeof options==='function'?options(input)||{}:options||{};
 const target=event=>{const input=event.target;return input?.matches?.(selector)&&!input.disabled&&!input.readOnly?input:null;};
 function state(input){let s=states.get(input);if(!s){const mark=selection(input);s={value:String(input.value??''),mark,history:[{value:String(input.value??''),mark}],at:0,composing:false,composition:null,afterComposition:null,before:null,emitting:false};states.set(input,s);}return s;}
 function syncExternal(input,s){if(!s.composing&&String(input.value)!==s.value){s.value=String(input.value);s.mark=selection(input);s.history=[{value:s.value,mark:{...s.mark}}];s.at=0;}}
 function snapshot(input,s){syncExternal(input,s);s.before={value:s.value,mark:selection(input)};return s.before;}
 function restore(input,s,mark=s.before){if(!mark)return;input.value=mark.value;s.value=mark.value;s.mark={...mark.mark};place(input,s.mark);}
 function packet(event,value){try{Object.defineProperty(event,'orderNumeric',{value,configurable:true});}catch{event.orderNumeric=value;}}
 function reflect(input,s=states.get(input)){if(input.dataset)input.dataset.numericState=s?.composing?'composing':parseNumericText(input.value,opts(input)).valid?'valid':'invalid';}
 function stateChanged(input){reflect(input);const E=input.ownerDocument?.defaultView?.Event||Event;input.dispatchEvent(new E('numericstatechange',{bubbles:true}));}
 function emit(input,s,data){const E=input.ownerDocument?.defaultView?.Event||Event,event=new E('input',{bubbles:true});packet(event,data);s.emitting=true;try{input.dispatchEvent(event);}finally{s.emitting=false;}}
 function remember(s){const last=s.history[s.at];if(last?.value===s.value){last.mark={...s.mark};return;}s.history.splice(++s.at);s.history.push({value:s.value,mark:{...s.mark}});if(s.history.length>100){s.history.shift();s.at--;}}
 function repairAllowed(s,candidate,type,data){const old=parseNumericText(s.before?.value??s.value,opts(s.input));return !old.valid&&(/^delete/.test(type)||type==='insertText'&&/^[0-9]*$/.test(data??''))&&candidate.length<=(s.before?.value??s.value).length+String(data??'').length;}
 function inspectCandidate(input,s,raw,event){
  const config=opts(input);let p=parseNumericText(raw,config);
  // Commas introduced by this owner may temporarily be ungrouped after a native
  // digit insertion/deletion. Only those known gestures may regroup them;
  // pasted/autofilled strings still require the complete explicit format.
  const type=event.inputType||s.before?.inputType||'',data=event.data??s.before?.data;
  if(!p.valid&&config.grouped&&/^[0-9,]*$/.test(raw)&&parseNumericText(s.before?.value??s.value,config).valid&&(/^delete/.test(type)||type==='insertText'&&/^[0-9]+$/.test(data??'')))p=parseNumericText(raw.split(',').join(''),config);
  return p;
 }
 function accept(input,s,event,{phase='input',notify=false}={}){
  const raw=String(input.value),before=s.before||{value:s.value,mark:s.mark},p=inspectCandidate(input,s,raw,event),oldValue=s.value;
  if(!p.valid){
   const repair=repairAllowed(s,raw,event.inputType||s.before?.inputType||'',event.data??s.before?.data);
   if(repair){s.value=raw;s.mark=selection(input);remember(s);}else restore(input,s,before);
   const value=parseNumericText(s.value,opts(input));const info={...value,accepted:false,changed:false,phase};packet(event,info);if(phase==='input')stop(event);s.before=null;stateChanged(input);return info;
  }
  const mark=selection(input),formatted=formatNumericText(p.value,opts(input));
  const nextMark=formatted===raw?mark:{start:caretAt(formatted,digitCount(raw.slice(0,mark.start))),end:caretAt(formatted,digitCount(raw.slice(0,mark.end))),direction:mark.direction};
  if(input.value!==formatted)input.value=formatted;place(input,nextMark);s.value=formatted;s.mark=nextMark;remember(s);s.before=null;reflect(input,s);
  const explicit=phase==='input'||phase==='compositionend'&&String(event.data??'')!=='';
  const info={valid:true,value:p.value,raw,accepted:true,changed:oldValue!==formatted||explicit,explicit,phase};packet(event,info);
  if(phase==='compositionend')stateChanged(input);
  if(notify&&info.changed)emit(input,s,info);
  return info;
 }
 function history(input,s,direction,event){
  event.preventDefault?.();stop(event);if(s.composing)return;
  const next=Math.max(0,Math.min(s.history.length-1,s.at+direction));if(next===s.at)return;
  s.at=next;const item=s.history[next];input.value=item.value;s.value=item.value;s.mark={...item.mark};s.before=null;place(input,s.mark);
  const p=parseNumericText(s.value,opts(input));if(p.valid)emit(input,s,{...p,accepted:true,changed:true,phase:direction<0?'undo':'redo'});stateChanged(input);
 }
 function on(type,fn){root.addEventListener(type,fn,true);listeners.push([type,fn]);}
 on('focusin',event=>{const input=target(event);if(!input)return;const s=state(input);s.input=input;if(!s.composing&&input.value!==s.value){s.value=String(input.value);s.mark=selection(input);s.history=[{value:s.value,mark:{...s.mark}}];s.at=0;}else s.mark=selection(input);});
 on('beforeinput',event=>{
  const input=target(event);if(!input)return;const s=state(input);s.input=input;
  if(s.composing||event.isComposing)return;
  if(event.inputType!=='insertCompositionText')s.afterComposition=null;
  if(event.inputType==='historyUndo'||event.inputType==='historyRedo'){history(input,s,event.inputType==='historyUndo'?-1:1,event);return;}
  const mark=snapshot(input,s);mark.inputType=event.inputType;mark.data=event.data;
  if(event.inputType?.startsWith('insert')&&event.data!==null&&event.data!==undefined){
   const candidate=String(input.value).slice(0,mark.mark.start)+event.data+String(input.value).slice(mark.mark.end),p=inspectCandidate(input,s,candidate,event);
   if(!p.valid&&!repairAllowed(s,candidate,event.inputType,event.data)&&event.cancelable){event.preventDefault();restore(input,s,mark);stop(event);}
  }
 });
 for(const type of ['paste','drop'])on(type,event=>{
  const input=target(event);if(!input)return;const s=state(input);s.input=input;if(s.composing)return;s.afterComposition=null;
  const text=(event.clipboardData||event.dataTransfer)?.getData('text/plain')??'',p=parseNumericText(text,opts(input));snapshot(input,s);
  if(!p.valid){event.preventDefault();restore(input,s);stop(event);}
 });
 on('input',event=>{const input=target(event);if(!input)return;const s=state(input);s.input=input;if(s.emitting)return;if(s.composing||event.isComposing){stop(event);return;}if(s.afterComposition&&input.value===s.afterComposition.value){s.afterComposition=null;stop(event);return;}s.afterComposition=null;accept(input,s,event);});
 on('compositionstart',event=>{const input=target(event);if(!input)return;const s=state(input);s.input=input;syncExternal(input,s);s.composing=true;s.composition={value:s.value,mark:selection(input)};s.before=s.composition;stateChanged(input);});
 on('compositionend',event=>{const input=target(event);if(!input)return;const s=state(input);s.input=input;s.composing=false;s.before=s.composition||{value:s.value,mark:s.mark};s.composition=null;accept(input,s,event,{phase:'compositionend',notify:true});s.afterComposition={value:s.value};});
 on('pointerdown',event=>{const input=target(event);if(input)state(input).afterComposition=null;});
 on('keydown',event=>{const input=target(event);if(input)state(input).afterComposition=null;if(!input||!(event.ctrlKey||event.metaKey)||event.altKey)return;const key=String(event.key).toLowerCase(),undo=key==='z'&&!event.shiftKey,redo=key==='y'||key==='z'&&event.shiftKey;if(undo||redo)history(input,state(input),undo?-1:1,event);});
 const api={refresh(){root.querySelectorAll(selector).forEach(input=>{const s=state(input);s.input=input;syncExternal(input,s);reflect(input,s);});return api;},read(input){return parseNumericText(input.value,opts(input));},inspect(){let invalidCount=0,composingCount=0;root.querySelectorAll(selector).forEach(input=>{if(input.disabled||input.readOnly)return;reflect(input);if(states.get(input)?.composing)composingCount++;else if(!parseNumericText(input.value,opts(input)).valid)invalidCount++;});return {valid:invalidCount===0&&composingCount===0,invalidCount,composingCount};},destroy(){listeners.forEach(([type,fn])=>root.removeEventListener(type,fn,true));bindings.delete(root);}};
 bindings.set(root,api);return api.refresh();
}
