import {validatePhone} from '../validation/phone.mjs';
import {PHONE_RULE_VERSION, PHONE_DATA_VERSION, AREA_PREFIXES} from '../reference/phone-rules.mjs';

/** Compatibility view; every downstream state derives from this one core verdict. */
export function parseBrowserPhone(value, options = {}) {
  const original = value ?? '';
  const contract = validatePhone({raw: original, ...options});
  const spec = contract.evidence.limits;
  const type = contract.normalized?.type ?? spec?.type;
  const kind = ({SEOUL:'area', AREA:'area', MOBILE:'mobile', INTERNET:'voip', REPRESENTATIVE:'national'})[type] ?? 'unknown';
  const digits = contract.normalized?.digits ?? contract.candidate?.digits ?? '';
  const parts = contract.normalized?.segments ?? contract.candidate?.segments ?? [];
  const limits = spec?.widths ?? [3,4,4];
  return {valid: contract.status === 'VALID', empty: contract.status === 'EMPTY', original,
    digits, kind, prefix: spec ? parts[0] : undefined,
    parts: parts.length ? [...parts] : ['', '', ''], limits: [...limits],
    formatted: contract.normalized?.formatted ?? (typeof original === 'string' ? original.trim() : ''),
    reason: contract.status === 'VALID' ? null : contract.reasonCodes[0], contract};
}

/** Field, parent, badge and save share the exact same result; editing is neutral. */
export function projectPhone(result, {required = true, editing = false, errorExposed = false,
  explicitClear = false, initialEmpty = false} = {}) {
  const contract = result.contract ?? result;
  const complete = contract.status === 'VALID' || (!required && contract.status === 'EMPTY' && (explicitClear || initialEmpty));
  const uncertain = ['UNKNOWN','UNSUPPORTED','UNAVAILABLE','POLICY_UNRESOLVED'].includes(contract.status);
  const invalid = !complete && !editing && errorExposed && !uncertain;
  return {contract, fieldComplete: complete, parentComplete: complete,
    saveAllowed: complete, badgeCount: editing || complete ? 0 : 1,
    visual: editing ? 'NEUTRAL' : invalid ? 'ERROR' : complete ? 'COMPLETE' : 'NEUTRAL',
    exposeError: invalid, editing, grants: {ownership:false,order:false}};
}

/** DOM/caret/IME adapter extracted from verified MSG0497 e13f, with core-only verdicts. */
export function createOrderPhoneAdapter() {
 const AREA=['02', ...AREA_PREFIXES];
 const mounted=new WeakMap();
 const parse=parseBrowserPhone;
 function mount(input){
  if(mounted.has(input))return mounted.get(input);
  const initial=input.value,id=input.id,label=input.getAttribute('aria-label')||input.closest('[data-q3-field]')?.querySelector('label')?.textContent.trim()||'전화번호';
  const shell=document.createElement('div');shell.className='ui-phone-shell ui-field__control';shell.dataset.phoneFor=id;shell.setAttribute('role','group');shell.setAttribute('aria-label',label);
  input.replaceWith(shell);shell.append(input);input.className='ui-phone-part';input.type='tel';input.inputMode='numeric';input.autocomplete='tel';input.placeholder='';input.removeAttribute('maxlength');
  const parts=[input],separators=[];
  for(let i=1;i<3;i++){const sep=document.createElement('span');sep.className='ui-phone-separator';sep.textContent='-';sep.setAttribute('aria-hidden','true');separators.push(sep);const next=document.createElement('input');next.type='tel';next.inputMode='numeric';next.autocomplete='off';next.className='ui-phone-part';next.id=id+'-part'+(i+1);next.setAttribute('aria-label',label+' '+(i+1)+'번째 구역');parts.push(next);shell.append(sep,next);}
  // Segment intention belongs to this one editor, never to the parser or another field.
  let sourceRaw=initial,explicitClear=false;
  let values=['','',''],shape=null,explicitMiddle=false,rawMode=false,rawValue='',rawOrigin='',history=[],historyAt=-1,selectAll=false,painting=false,composing=false,compositionStart=null,settledComposition=null;
  let selection={index:0,start:0,end:0,direction:'none',all:false};
  const snapshot=()=>({values:values.slice(),shape:shape?{...shape}:null,explicitMiddle,rawMode,rawValue,rawOrigin,explicitClear});
  function prefixShape(value){const p=parse(value);return p.kind!=='unknown'&&p.prefix===value?{kind:p.kind,prefixLength:p.prefix.length,count:p.kind==='national'?2:3}:null;}
  function get(){return rawMode?rawValue:shape&&values.slice(1,shape.count).some(Boolean)?values.slice(0,shape.count).join('-'):values[0];}
  function verdict(){return parse(get(),rawMode||!shape?{}:{segments:values.slice(0,shape.count),
   intent:explicitMiddle&&shape.kind==='area'?{kind:'explicit',...([3,4].includes(values[1].length)?{middleWidth:values[1].length}:{})}:{kind:'automatic'},phase:'editing'});} 
  function capture(el=document.activeElement){const index=parts.indexOf(el);if(index>=0&&!painting&&!composing)selection={index,start:el.selectionStart||0,end:el.selectionEnd||0,direction:el.selectionDirection||'none',all:selectAll};return {...selection};}
  function clearSelection(){selectAll=false;delete shell.dataset.selectAll;}
  function focusSegment(index,at){const el=parts[index]&&!parts[index].hidden?parts[index]:parts[0];el.focus({preventScroll:true});const pos=Math.max(0,Math.min(at,el.value.length));el.setSelectionRange(pos,pos);capture(el);}
  function render(){painting=true;const count=rawMode?1:shape?.count||1;for(let i=0;i<3;i++){parts[i].hidden=i>=count;parts[i].value=rawMode?(i===0?rawValue:''):values[i];parts[i].removeAttribute('placeholder');if(i>0)separators[i-1].hidden=i>=count;}shell.dataset.phoneKind=rawMode?'raw':shape?.kind||'unknown';shell.dataset.sourceReview=String(rawMode);shell.dataset.empty=String(!get());shell.dataset.valid=String(verdict().valid);painting=false;}
  function restore(mark=selection,{focus=true}={}){render();selectAll=!!mark.all;shell.toggleAttribute('data-select-all',selectAll);if(selectAll)shell.dataset.selectAll='true';const el=parts[mark.index]&&!parts[mark.index].hidden?parts[mark.index]:input;if(focus)el.focus({preventScroll:true});el.setSelectionRange(Math.min(mark.start,el.value.length),Math.min(mark.end,el.value.length),mark.direction||'none');selection={...mark,index:parts.indexOf(el)};}
  function remember(){const now=snapshot();if(historyAt>=0&&JSON.stringify(history[historyAt])===JSON.stringify(now))return;history=history.slice(0,historyAt+1);history.push(now);if(history.length>100)history.shift();historyAt=history.length-1;}
  function emit(){shell.dispatchEvent(new CustomEvent('order-phone-input',{bubbles:true,detail:{id,value:get()}}));}
  function accept(next,index,caret,{notify=true,rememberChange=true,focus=true}={}){const before=JSON.stringify(snapshot());({values,shape,explicitMiddle,rawMode,rawValue,rawOrigin}=next);explicitClear=!!next.explicitClear&&!rawValue&&!values.some(Boolean);clearSelection();if(rememberChange)remember();render();if(focus)focusSegment(index,caret);if(notify&&before!==JSON.stringify(snapshot()))emit();return true;}
  function normalFrom(value,{explicit=false}={}){const p=parse(value),next={values:['','',''],shape:null,explicitMiddle:explicit,rawMode:false,rawValue:'',rawOrigin:''};if(!p.digits)return next;if(p.kind==='unknown'){next.values[0]=p.digits;return next;}next.shape={kind:p.kind,prefixLength:p.prefix.length,count:p.kind==='national'?2:3};next.values=p.parts.concat(['','','']).slice(0,3);return next;}
  function set(value,{notify=false}={}){const original=String(value??''),p=parse(original);sourceRaw=original;explicitClear=false;let normal=normalFrom(original,{explicit:/[-\s]/.test(original.trim())});const partial=/^\d*$/.test(original)&&within(normal);const next=p.valid||!original||partial?normal:{values:['','',''],shape:null,explicitMiddle:false,rawMode:true,rawValue:original,rawOrigin:original};accept(next,0,0,{notify,rememberChange:false,focus:false});history=[];historyAt=-1;remember();}
  function within(next){if(next.rawMode)return true;const v=next.values;if(v.some(s=>!/^\d*$/.test(s)))return false;const exact=prefixShape(v[0]);if(exact)next.shape=exact;else if(!v.slice(1).some(Boolean)&&!v[0])next.shape=null;
   const s=next.shape;if(!s)return !v.slice(1).some(Boolean)&&v[0].length<=4;
   if(v[0].length>s.prefixLength||v.slice(1,s.count).some(x=>x.length>4)||v.slice(s.count).some(Boolean))return false;
   return v.join('').length<=s.prefixLength+4*(s.count-1);
  }
  function commit(){if(composing)return false;const next=snapshot();if(rawMode){const p=parse(rawValue);if(p.valid)accept(normalFrom(rawValue),0,p.parts[0].length,{focus:false});return verdict().valid;}
   if(!explicitMiddle&&shape?.kind==='area'){const p=parse(values.join(''));if(p.valid)accept(normalFrom(p.digits),selection.index,selection.start,{focus:false});}
   render();return verdict().valid;
  }
  function lockMiddle(){if(!rawMode&&shape?.kind==='area'&&[3,4].includes(values[1].length)){explicitMiddle=true;remember();}}
  function acceptedInsertion(text,formatted){text=String(text??'');if(/^\d+$/.test(text))return {text,whole:formatted&&parse(text).valid};if(formatted){const p=parse(text);if(p.valid)return {text:p.digits,whole:true};}return null;}
  function insert(el,text,{formatted=false,mark=capture(el),advance=false}={}){const a=acceptedInsertion(text,formatted);if(!a){restore(mark);return false;}const i=parts.indexOf(el),at=el.selectionStart||0,end=el.selectionEnd||0;
   if(a.whole){const next=normalFrom(a.text,{explicit:/[-\s]/.test(String(text).trim())});return accept(next,next.shape.count-1,next.values[next.shape.count-1].length);}
   let next=snapshot(),target=i,caret=at+a.text.length;
   if(selectAll){next=normalFrom(a.text);if(!within(next)){restore(mark);return false;}target=next.shape?next.values.findLastIndex(x=>x.length):0;caret=next.values[target].length;}
   else if(rawMode){next.rawValue=rawValue.slice(0,at)+a.text+rawValue.slice(end);target=0;}
   else if(!shape){const digits=values[0].slice(0,at)+a.text+values[0].slice(end),p=parse(digits);next=normalFrom(digits);if(!within(next)){restore(mark);return false;}target=0;caret=Math.min(caret,next.values[0].length);if(p.kind!=='unknown'&&digits.length>p.prefix.length){target=next.values.findLastIndex(x=>x.length);caret=next.values[target].length;}}
   else{next.values[i]=values[i].slice(0,at)+a.text+values[i].slice(end);if(!within(next)){restore(mark);return false;}}
   accept(next,target,caret);
   if(advance&&!rawMode&&shape){if(target===0&&values[0].length===shape.prefixLength&&prefixShape(values[0])&&!values.slice(1).some(Boolean))focusSegment(1,0);else if(target===1&&shape.count===3&&values[1].length===4&&caret>=4)focusSegment(2,0);}
   capture();return true;
  }
  function remove(el,kind){const i=parts.indexOf(el);let start=el.selectionStart||0,end=el.selectionEnd||0,next=snapshot();if(selectAll)return accept({...normalFrom(''),explicitClear:true},0,0);if(start===end){if(kind==='deleteContentBackward')start=Math.max(0,start-1);else end=Math.min(el.value.length,end+1);}if(rawMode){next.rawValue=rawValue.slice(0,start)+rawValue.slice(end);if(!next.rawValue)next={...normalFrom(''),explicitClear:true};}else{next.values[i]=values[i].slice(0,start)+values[i].slice(end);if(!next.values.some(Boolean))next={...normalFrom(''),explicitClear:true};if(!within(next))return false;}return accept(next,i,start);}
  function reconcile(el,mark=selection){const text=el.value,i=parts.indexOf(el);if(rawMode){const old=rawValue;let l=0;while(l<old.length&&l<text.length&&old[l]===text[l])l++;let r=0;while(r<old.length-l&&r<text.length-l&&old[old.length-1-r]===text[text.length-1-r])r++;const inserted=text.slice(l,text.length-r);if(!/^\d*$/.test(inserted)){restore(mark);return false;}const next=snapshot();next.rawValue=text;if(!text)return accept(normalFrom(''),0,0);return accept(next,0,el.selectionStart||0);}
   const a=text===''?{text:'',whole:false}:acceptedInsertion(text,true);if(!a){restore(mark);return false;}if(a.whole){const n=normalFrom(a.text,{explicit:/[-\s]/.test(text.trim())});return accept(n,n.shape.count-1,n.values[n.shape.count-1].length);}const next=snapshot();next.values[i]=a.text;if(!within(next)){restore(mark);return false;}return accept(next,i,el.selectionStart||0);
  }
  function travelHistory(delta){const at=historyAt+delta;if(at<0||at>=history.length)return;historyAt=at;const next=JSON.parse(JSON.stringify(history[at]));accept(next,rawMode?0:selection.index,99,{rememberChange:false});}
  shell.addEventListener('keydown',e=>{const el=e.target;if(!parts.includes(el))return;capture(el);const i=parts.indexOf(el);
   if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){e.preventDefault();selectAll=true;parts.forEach(p=>{if(!p.hidden)p.select();});shell.dataset.selectAll='true';capture(el);return;}
   if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();travelHistory(e.key.toLowerCase()==='y'||e.shiftKey?1:-1);return;}
   if(e.key==='Tab'){if(!e.shiftKey&&i===1)lockMiddle();clearSelection();return;}
   if(e.key==='Enter'){e.preventDefault();e.stopPropagation();commit();return;}
   if(e.key==='Backspace'&&el.selectionStart===0&&el.selectionEnd===0&&!selectAll&&i>0){e.preventDefault();focusSegment(i-1,parts[i-1].value.length);return;}
   if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key))clearSelection();
   if(e.key==='ArrowLeft'&&el.selectionStart===0&&el.selectionEnd===0&&i>0){e.preventDefault();focusSegment(i-1,parts[i-1].value.length);}
   if(e.key==='ArrowRight'&&el.selectionStart===el.value.length&&el.selectionEnd===el.value.length&&i<2&&!parts[i+1].hidden){if(i===1)lockMiddle();e.preventDefault();focusSegment(i+1,0);}
  });
  shell.addEventListener('pointerdown',e=>{if(e.target===parts[2])lockMiddle();clearSelection();});
  for(const name of ['select','focusin','keyup','pointerup'])shell.addEventListener(name,e=>{if(parts.includes(e.target))capture(e.target);});
  shell.addEventListener('beforeinput',e=>{const el=e.target;if(!parts.includes(el))return;const kind=e.inputType||'',mark=composing?compositionStart:capture(el);
   if(composing||e.isComposing){if(e.cancelable&&e.data!==null&&!/^\d*$/.test(e.data))e.preventDefault();return;}settledComposition=null;
   if(kind==='historyUndo'||kind==='historyRedo'){if(e.cancelable){e.preventDefault();travelHistory(kind==='historyUndo'?-1:1);}return;}
   if(kind.startsWith('insert')&&e.data!==null&&e.cancelable){e.preventDefault();insert(el,e.data,{formatted:kind!=='insertText'||e.data.length>4,mark,advance:kind==='insertText'});return;}
   if((kind==='deleteContentBackward'||kind==='deleteContentForward')&&e.cancelable){e.preventDefault();remove(el,kind);}
  });
  for(const name of ['paste','drop'])shell.addEventListener(name,e=>{if(!parts.includes(e.target))return;const text=(name==='paste'?e.clipboardData:e.dataTransfer)?.getData('text/plain')??'';e.preventDefault();insert(e.target,text,{formatted:true,mark:capture(e.target)});});
  shell.addEventListener('dragover',e=>{if(parts.includes(e.target))e.preventDefault();});
  shell.addEventListener('compositionstart',e=>{if(parts.includes(e.target)){compositionStart=capture(e.target);composing=true;}});
  shell.addEventListener('compositionupdate',e=>{if(parts.includes(e.target)&&composing&&!/^\d*$/.test(e.data||''))restore(compositionStart||selection,{focus:false});});
  shell.addEventListener('compositionend',e=>{if(!parts.includes(e.target))return;const mark=compositionStart||selection;composing=false;restore(mark);if(e.data&&/^\d+$/.test(e.data))insert(e.target,e.data,{mark});compositionStart=null;settledComposition={values:parts.map(p=>p.value),mark:{...selection}};});
  shell.addEventListener('input',e=>{if(painting||!parts.includes(e.target))return;if(composing||e.isComposing){restore(compositionStart||selection,{focus:false});return;}const settled=settledComposition;settledComposition=null;if(settled&&parts.every((p,i)=>p.value===settled.values[i])){restore(settled.mark);return;}reconcile(e.target,selection);});
  shell.addEventListener('focusout',e=>{if(composing&&parts.includes(e.target)){composing=false;restore(compositionStart||selection,{focus:false});compositionStart=null;}if(!shell.contains(e.relatedTarget))commit();});
  shell.addEventListener('copy',e=>{if(selectAll){e.preventDefault();e.clipboardData?.setData('text/plain',get());}});
  const api={get,set,commit,shell,parts,parse:verdict,
   contract:()=>verdict().contract,
   projection:options=>projectPhone(verdict(),{required:input.getAttribute('aria-required')==='true',explicitClear,initialEmpty:!sourceRaw,...options}),
   snapshot:()=>({...snapshot(),selection:{...capture()},originalRaw:sourceRaw,composing}),
   focus:()=>input.focus({preventScroll:true}),setInvalid(flag){shell.setAttribute('aria-invalid',String(flag));parts.forEach(p=>p.setAttribute('aria-invalid',String(flag)));}};mounted.set(input,api);set(initial);return api;
 }
 return Object.freeze({parse,mount,get:input=>mounted.get(input)?.get()??input?.value??'',
   set:(input,value)=>{const control=mounted.get(input);if(control)control.set(value);else if(input)input.value=value==null?'':String(value);},
   instance:input=>mounted.get(input), project:projectPhone,
   metadata:Object.freeze({version:'PHONE_BROWSER_MSG0504_1.0.0',rules:PHONE_RULE_VERSION,data:PHONE_DATA_VERSION,
     areas:AREA,scope:'Domestic and +82 syntax; current allocation/activation/ownership not checked.'})});
}
