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
const integerOption=value=>typeof value==='bigint'&&value>=0n?value:typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?BigInt(value):typeof value==='string'&&/^[0-9]+$/.test(value)?BigInt(value):null;
/** Exact stepping shares the input parser and caller-owned bounds. It does not
 * repair invalid text or turn a no-op at a limit into a user edit. */
export function stepNumericText(raw,direction,config={}){
 const parsed=parseNumericText(raw,{...config,clampMax:null}),unchanged={...parsed,changed:false};
 if(!parsed.valid||direction!==1&&direction!==-1)return unchanged;
 const step=integerOption(config.step??1),minimum=integerOption(config.min??(config.allowZero===false?1:0));
 const maxima=[config.max,config.clampMax].map(integerOption).filter(value=>value!==null);
 if(Number.isInteger(config.maxDigits)&&config.maxDigits>0)maxima.push(10n**BigInt(config.maxDigits)-1n);
 const maximum=maxima.length?maxima.reduce((a,b)=>a<b?a:b):null;
 if(step===null||step===0n||minimum===null||maximum!==null&&maximum<minimum)return unchanged;
 const current=parsed.value===''?0n:BigInt(parsed.value);
 // Preserve a caller-rejected value for an explicit repair, rather than silently
 // jumping from an out-of-range value to an unrelated boundary.
 if(parsed.value!==''&&(current<minimum||maximum!==null&&current>maximum))return unchanged;
 let next=current+BigInt(direction)*step;
 if(next<minimum)next=minimum;if(maximum!==null&&next>maximum)next=maximum;
 if(parsed.value!==''&&next===current)return unchanged;
 let value=String(next);
 if(/^0[0-9]+$/.test(parsed.value))value=value.padStart(parsed.value.length,'0');
 const checked=parseNumericText(value,config);if(!checked.valid)return unchanged;
 return {...checked,raw:String(raw??''),changed:true};
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
 const states=new WeakMap(),listeners=[];let historySequence=0;
 const historyEntry=(value,mark,key=++historySequence)=>({value,mark:{...mark},key});
 const opts=input=>typeof options==='function'?options(input)||{}:options||{};
 const target=event=>{const input=event.target;return input?.matches?.(selector)&&!input.disabled&&!input.readOnly?input:null;};
 function state(input){let s=states.get(input);if(!s){const mark=selection(input);s={value:String(input.value??''),mark,history:[historyEntry(String(input.value??''),mark)],at:0,composing:false,composition:null,afterComposition:null,before:null,emitting:false};states.set(input,s);}return s;}
 function syncExternal(input,s){if(!s.composing&&String(input.value)!==s.value){s.value=String(input.value);s.mark=selection(input);s.history=[historyEntry(s.value,s.mark)];s.at=0;}}
 function snapshot(input,s){syncExternal(input,s);s.before={value:s.value,mark:selection(input)};return s.before;}
 function restore(input,s,mark=s.before){if(!mark)return;input.value=mark.value;s.value=mark.value;s.mark={...mark.mark};place(input,s.mark);}
 function packet(event,value){try{Object.defineProperty(event,'orderNumeric',{value,configurable:true});}catch{event.orderNumeric=value;}}
 function reflect(input,s=states.get(input)){if(input.closest?.('.ui-egg-number'))input.style?.setProperty('--ui-number-ch',String(String(input.value).length));if(input.dataset)input.dataset.numericState=s?.composing?'composing':parseNumericText(input.value,opts(input)).valid?'valid':'invalid';}
 function stateChanged(input){reflect(input);const E=input.ownerDocument?.defaultView?.Event||Event;input.dispatchEvent(new E('numericstatechange',{bubbles:true}));}
 function emit(input,s,data){const E=input.ownerDocument?.defaultView?.Event||Event,event=new E('input',{bubbles:true});packet(event,data);s.emitting=true;try{input.dispatchEvent(event);}finally{s.emitting=false;}}
 function remember(s){const last=s.history[s.at];if(last?.value===s.value){last.mark={...s.mark};return;}s.history.splice(++s.at);s.history.push(historyEntry(s.value,s.mark));if(s.history.length>100){s.history.shift();s.at--;}}
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
   const value=parseNumericText(s.value,opts(input));const info={...value,accepted:false,changed:false,phase};packet(event,info);if(phase!=='compositionend')stop(event);else s.afterComposition={value:s.value};s.before=null;stateChanged(input);return info;
  }
  const mark=selection(input),formatted=formatNumericText(p.value,opts(input));
  const nextMark=formatted===raw?mark:{start:caretAt(formatted,digitCount(raw.slice(0,mark.start))),end:caretAt(formatted,digitCount(raw.slice(0,mark.end))),direction:mark.direction};
  if(input.value!==formatted)input.value=formatted;place(input,nextMark);s.value=formatted;s.mark=nextMark;remember(s);s.before=null;reflect(input,s);
  const explicit=['input','paste','drop'].includes(phase)||phase==='compositionend'&&String(event.data??'')!=='';
  const info={valid:true,value:p.value,raw,accepted:true,changed:oldValue!==formatted||explicit,explicit,completed:['paste','drop','compositionend'].includes(phase),phase};packet(event,info);
  // Publish the trailing-event guard before a consumer can correct this value
  // and replace/transfer the field while handling the accepted composition.
  if(phase==='compositionend'){s.afterComposition={value:s.value};stateChanged(input);}
  if(notify&&info.changed)emit(input,s,info);
  return info;
 }
 function history(input,s,direction,event){
  event.preventDefault?.();stop(event);if(s.composing)return;
  const next=Math.max(0,Math.min(s.history.length-1,s.at+direction));if(next===s.at)return;
  const fromHistoryKey=s.history[s.at].key;s.at=next;const item=s.history[next];input.value=item.value;s.value=item.value;s.mark={...item.mark};s.before=null;place(input,s.mark);
  const p=parseNumericText(s.value,opts(input));if(p.valid)emit(input,s,{...p,accepted:true,changed:true,phase:direction<0?'undo':'redo',fromHistoryKey,historyKey:item.key});stateChanged(input);
 }
 function steppingOptions(input){
  const config={...opts(input)};
  for(const key of ['min','max','step'])if(config[key]===undefined){const attribute=input.getAttribute?.(key);if(attribute!==null&&attribute!==undefined&&attribute!=='')config[key]=attribute;}
  return config;
 }
 function step(input,s,direction,event,phase){
  if(input.ownerDocument?.activeElement!==input||s.composing||event.isComposing||event.keyCode===229||input.dataset?.numericStep==='off'||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
  syncExternal(input,s);const result=stepNumericText(input.value,direction,steppingOptions(input));
  // Even at a valid boundary an arrow/wheel belongs to the focused numeric
  // control; it must not scroll the modal or trigger a second delegated owner.
  if(!result.valid)return;event.preventDefault?.();stop(event);if(!result.changed)return;
  const previous=String(input.value),mark=selection(input),formatted=formatNumericText(result.value,opts(input));
  const endpoint=position=>position===previous.length?formatted.length:caretAt(formatted,digitCount(previous.slice(0,position)));
  input.value=formatted;s.value=formatted;s.mark={start:endpoint(mark.start),end:endpoint(mark.end),direction:mark.direction};place(input,s.mark);
  s.before=null;s.afterComposition=null;remember(s);reflect(input,s);
  emit(input,s,{...result,accepted:true,explicit:true,completed:true,phase});
 }
 function on(type,fn,extra={}){const settings={capture:true,...extra};root.addEventListener(type,fn,settings);listeners.push([type,fn,settings]);}
 on('focusin',event=>{const input=target(event);if(!input)return;const s=state(input);s.input=input;syncExternal(input,s);s.mark=selection(input);});
 on('beforeinput',event=>{
  const input=target(event);if(!input)return;const s=state(input);s.input=input;
  if(s.composing||event.isComposing)return;
  if(event.inputType!=='insertCompositionText')s.afterComposition=null;
  if(event.inputType&&!['insertFromPaste','insertFromDrop'].includes(event.inputType))s.transfer=null;
  if(event.inputType==='historyUndo'||event.inputType==='historyRedo'){history(input,s,event.inputType==='historyUndo'?-1:1,event);return;}
  const mark=snapshot(input,s);mark.inputType=event.inputType;mark.data=event.data;
  if(event.inputType?.startsWith('insert')&&event.data!==null&&event.data!==undefined){
   const candidate=String(input.value).slice(0,mark.mark.start)+event.data+String(input.value).slice(mark.mark.end),p=inspectCandidate(input,s,candidate,event);
   if(!p.valid&&!repairAllowed(s,candidate,event.inputType,event.data)&&event.cancelable){event.preventDefault();restore(input,s,mark);stop(event);}
  }
 });
 for(const type of ['paste','drop'])on(type,event=>{
  const input=target(event);if(!input)return;const s=state(input);s.input=input;if(s.composing)return;s.afterComposition=null;
  const text=(event.clipboardData||event.dataTransfer)?.getData('text/plain')??'',p=parseNumericText(text,opts(input));snapshot(input,s);s.transfer=p.valid?type:null;
  if(!p.valid){event.preventDefault();restore(input,s);stop(event);}
 });
 on('input',event=>{const input=target(event);if(!input)return;const s=state(input);s.input=input;if(s.emitting)return;if(s.composing||event.isComposing){stop(event);return;}if(s.afterComposition&&input.value===s.afterComposition.value){s.afterComposition=null;stop(event);return;}s.afterComposition=null;const phase=event.inputType==='insertFromPaste'?'paste':event.inputType==='insertFromDrop'?'drop':s.transfer||'input';s.transfer=null;accept(input,s,event,{phase});});
 on('compositionstart',event=>{const input=target(event);if(!input)return;const s=state(input);s.input=input;syncExternal(input,s);s.composing=true;s.composition={value:s.value,mark:selection(input)};s.before=s.composition;stateChanged(input);});
 on('compositionend',event=>{const input=target(event);if(!input)return;const s=state(input);s.input=input;s.composing=false;s.before=s.composition||{value:s.value,mark:s.mark};s.composition=null;accept(input,s,event,{phase:'compositionend',notify:true});});
 on('pointerdown',event=>{const input=target(event);if(input)state(input).afterComposition=null;});
 on('keydown',event=>{const input=target(event);if(!input)return;const s=state(input);s.afterComposition=null;
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){step(input,s,event.key==='ArrowUp'?1:-1,event,'step-key');return;}
  if(!(event.ctrlKey||event.metaKey)||event.altKey)return;const key=String(event.key).toLowerCase(),undo=key==='z'&&!event.shiftKey,redo=key==='y'||key==='z'&&event.shiftKey;if(undo||redo)history(input,s,undo?-1:1,event);
 });
 on('wheel',event=>{const input=target(event);if(!input||!Number.isFinite(event.deltaY)||event.deltaY===0)return;
  const rect=input.getBoundingClientRect?.();if(!rect||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY)||event.clientX<rect.left||event.clientX>=rect.right||event.clientY<rect.top||event.clientY>=rect.bottom)return;
  step(input,state(input),event.deltaY<0?1:-1,event,'step-wheel');
 },{passive:false});
 function replace(input,raw,{notify=false,history:historyMode='replace',phase='correction'}={}){
  if(!input?.matches?.(selector)||!['replace','append'].includes(historyMode))return {valid:false,accepted:false,changed:false,reason:'TARGET'};
  const s=state(input);s.input=input;if(s.composing)return {valid:false,accepted:false,changed:false,reason:'COMPOSING'};
  const parsed=parseNumericText(raw,opts(input));if(!parsed.valid)return {...parsed,accepted:false,changed:false};
  const previous=String(input.value),previousState=s.value,mark=selection(input),formatted=formatNumericText(parsed.value,opts(input));
  const endpoint=position=>position===previous.length?formatted.length:caretAt(formatted,digitCount(previous.slice(0,position)));
  input.value=formatted;s.value=formatted;s.mark={start:endpoint(mark.start),end:endpoint(mark.end),direction:mark.direction};place(input,s.mark);
  s.before=null;s.afterComposition=s.emitting&&s.afterComposition?{value:s.value}:null;s.transfer=null;
  if(previous!==formatted||previousState!==formatted){if(historyMode==='append')remember(s);else{s.history.splice(s.at+1);s.history[s.at]=historyEntry(s.value,s.mark,s.history[s.at].key);}}
  reflect(input,s);const info={...parsed,accepted:true,changed:previous!==formatted,explicit:false,completed:true,phase};
  if(notify&&info.changed)emit(input,s,info);return info;
 }
 // A caller may replace a field while applying a coupled draft transaction
 // (quantity + cadence). Move its editing history to that field's replacement;
 // rendering itself must neither publish an edit nor erase undo/caret state.
 function transfer(from,to){
  const rejected=reason=>({valid:false,accepted:false,changed:false,reason});
  if(!from?.matches?.(selector)||!to?.matches?.(selector))return rejected('TARGET');
  const s=states.get(from);if(!s)return rejected('SOURCE');
  if(s.composing||states.get(to)?.composing)return rejected('COMPOSING');
  if(String(from.value)!==s.value)return rejected('EXTERNAL_CHANGE');
  const config=opts(to),parsed=parseNumericText(s.value,config);
  if(!parsed.valid)return {...parsed,accepted:false,changed:false};
  // Do not reinterpret history across roles with different grouping or bounds.
  if(s.history.some(item=>{const previous=parseNumericText(item.value,opts(from)),next=parseNumericText(item.value,config);return previous.valid!==next.valid||previous.value!==next.value||next.valid&&formatNumericText(next.value,config)!==item.value;}))return rejected('FORMAT');
  const mark=selection(from),next={...s,input:to,mark:{...mark},history:s.history.map(item=>historyEntry(item.value,item.mark,item.key)),before:null,composition:null,afterComposition:s.afterComposition?{value:s.value}:null,transfer:null,emitting:false};
  next.history[next.at].mark={...mark};to.value=next.value;place(to,mark);states.set(to,next);if(from!==to)states.delete(from);reflect(to,next);
  return {...parsed,accepted:true,changed:false,phase:'transfer'};
 }
 const api={replace,transfer,inspectHistory(input){const s=states.get(input);return s?{key:s.history[s.at].key,previousKey:s.history[s.at-1]?.key??null,nextKey:s.history[s.at+1]?.key??null,keys:s.history.map(item=>item.key)}:null;},refresh(){root.querySelectorAll(selector).forEach(input=>{if(!input.matches?.(selector))return;const s=state(input);s.input=input;syncExternal(input,s);if(!s.composing){const parsed=parseNumericText(input.value,opts(input));if(parsed.valid&&input.value!==formatNumericText(parsed.value,opts(input)))replace(input,parsed.value,{phase:'refresh'});}reflect(input,s);});return api;},read(input){return parseNumericText(input.value,opts(input));},inspect(){let invalidCount=0,composingCount=0;root.querySelectorAll(selector).forEach(input=>{if(input.disabled||input.readOnly)return;reflect(input);if(states.get(input)?.composing)composingCount++;else if(!parseNumericText(input.value,opts(input)).valid)invalidCount++;});return {valid:invalidCount===0&&composingCount===0,invalidCount,composingCount};},destroy(){listeners.forEach(([type,fn,settings])=>root.removeEventListener(type,fn,settings));bindings.delete(root);}};
 bindings.set(root,api);return api.refresh();
}
