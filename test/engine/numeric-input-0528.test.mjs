import test from 'node:test';
import assert from 'node:assert/strict';
import {bindNumericInputs} from '../../web/numeric-input.mjs';
// Deterministic delegated-event contract, not OS/IME acceptance evidence.
class E{constructor(type,init={}){Object.assign(this,{type,bubbles:true,cancelable:true},init);}preventDefault(){this.defaultPrevented=true;}stopImmediatePropagation(){this.stopped=true;}}
function harness(raw='1200',{grouped=true,egg=true,view={}}={}){
 const listeners=new Map(),accepted=[],css=new Map(),document={activeElement:null,defaultView:{Event:E,...view}};
 const input={value:raw,dataset:{},disabled:false,readOnly:false,ownerDocument:document,selectionStart:raw.length,selectionEnd:raw.length,selectionDirection:'none',style:{setProperty:(k,v)=>css.set(k,v)},matches:s=>s!=='.ui-egg-number',closest:s=>s==='.ui-egg-number'&&egg?{className:'input-unit ui-egg-number'}:null,getAttribute:()=>null,setSelectionRange(start,end,direction='none'){Object.assign(this,{selectionStart:start,selectionEnd:end,selectionDirection:direction});},dispatchEvent(event){event.target=this;for(const phase of [true,false])for(const l of listeners.get(event.type)||[]){if(l.capture!==phase)continue;l.fn(event);if(event.stopped)return !event.defaultPrevented;}return !event.defaultPrevented;}};
 const root={ownerDocument:document,querySelectorAll:()=>[input],addEventListener(type,fn,opts){listeners.set(type,[...(listeners.get(type)||[]),{fn,capture:typeof opts==='boolean'?opts:!!opts?.capture}]);},removeEventListener(){}};
 const api=bindNumericInputs(root,{options:field=>({grouped:field.grouped??grouped})});document.activeElement=input;root.addEventListener('input',e=>accepted.push({...e.orderNumeric}));
 const fire=(type,init={})=>{const e=new E(type,init);input.dispatchEvent(e);return e;};
 const edit=(text,{type='insertText',start=input.selectionStart,end=input.selectionEnd}={})=>{input.setSelectionRange(start,end);const e=fire('beforeinput',{inputType:type,data:text});if(e.defaultPrevented)return;input.value=input.value.slice(0,start)+text+input.value.slice(end);input.setSelectionRange(start+text.length,start+text.length);return fire('input',{inputType:type,data:text});};
 const remount=(raw=input.value,config={})=>{const next={...input,...config,value:raw,dataset:{},selectionStart:raw.length,selectionEnd:raw.length,selectionDirection:'none'};root.querySelectorAll=()=>[next];api.refresh();const fireNext=(type,init={})=>{const e=new E(type,init);next.dispatchEvent(e);return e;};return {input:next,fire:fireNext,focus(){document.activeElement=next;fireNext('focusin');}};};
 return {input,api,root,accepted,css,fire,edit,remount,onInput:fn=>root.addEventListener('input',fn)};
}
test('C28 initial/reopened grouped rendering publishes no model edit and keeps identifier/date roles untouched',()=>{
 const h=harness('1200');assert.equal(h.input.value,'1,200');assert.equal(h.api.read(h.input).value,'1200');assert.equal(h.accepted.length,0);assert.equal(h.css.get('--ui-number-ch'),'5');
 for(let i=0;i<4;i++)h.api.refresh();assert.equal(h.accepted.length,0);
 const date=harness('2026',{grouped:false,egg:false});assert.equal(date.input.value,'2026');assert.equal(date.css.size,0);
});
test('C28 caller correction updates display, exact packet, rollback baseline and caret in one transaction',()=>{
 const h=harness('199');h.edit('201',{start:0,end:3});assert.equal(h.accepted.at(-1).value,'201');
 h.input.setSelectionRange(1,3,'backward');const packet=h.api.replace(h.input,'200',{notify:false,history:'replace'});assert.equal(packet.value,'200');assert.equal(packet.phase,'correction');assert.equal(packet.explicit,false);assert.equal(h.input.value,'200');assert.equal(h.input.selectionStart,1);assert.equal(h.input.selectionEnd,3);assert.equal(h.input.selectionDirection,'backward');assert.equal(h.accepted.length,1,'caller updates model once from return value');
 h.edit('가',{start:2,end:2});assert.equal(h.input.value,'200','rejected text cannot restore pre-correction201');
 h.fire('keydown',{key:'z',ctrlKey:true});assert.equal(h.input.value,'199');h.api.refresh();h.fire('keydown',{key:'z',ctrlKey:true,shiftKey:true});assert.equal(h.input.value,'200','refresh preserves redo of corrected transaction');
});
test('C28 programmatic append correction and unchanged bounds keep exact history without duplicate edits',()=>{
 const h=harness('9007199254740993');const result=h.api.replace(h.input,'9007199254740994',{history:'append',notify:true});assert.equal(result.value,'9007199254740994');assert.equal(h.input.value,'9,007,199,254,740,994');assert.equal(h.accepted.length,1);
 const unchanged=h.api.replace(h.input,'9007199254740994',{notify:true});assert.equal(unchanged.changed,false);assert.equal(h.accepted.length,1);
 h.fire('keydown',{key:'z',ctrlKey:true});assert.equal(h.api.read(h.input).value,'9007199254740993');h.api.replace(h.input,'9007199254740993');h.api.refresh();h.fire('keydown',{key:'y',ctrlKey:true});assert.equal(h.api.read(h.input).value,'9007199254740994');
});
test('C28 paste/drop expose completed canonical transactions; typing2→29 remains incomplete until caller commits',()=>{
 for(const [gesture,inputType]of [['paste','insertFromPaste'],['drop','insertFromDrop']]){const h=harness('');h.fire(gesture,{[gesture==='paste'?'clipboardData':'dataTransfer']:{getData:()=> '1,200'}});h.edit('1,200',{type:inputType});assert.equal(h.input.value,'1,200');assert.equal(h.accepted.length,1);assert.equal(h.accepted[0].value,'1200');assert.equal(h.accepted[0].phase,gesture);assert.equal(h.accepted[0].completed,true);}
 const h=harness('');h.edit('2');assert.equal(h.accepted[0].value,'2');assert.equal(h.accepted[0].completed,false);h.edit('9');assert.equal(h.accepted[1].value,'29');assert.equal(h.accepted[1].completed,false);
});
test('C28 correction refuses invalid whole text and IME composition instead of rewriting a private buffer',()=>{
 const h=harness('1200');for(const raw of ['10가20','605/3','1e3']){assert.equal(h.api.replace(h.input,raw).accepted,false);assert.equal(h.input.value,'1,200');}
 h.fire('compositionstart');h.input.value='1,가200';const result=h.api.replace(h.input,'20');assert.equal(result.reason,'COMPOSING');assert.equal(h.input.value,'1,가200');h.api.refresh();assert.equal(h.input.value,'1,가200');h.fire('compositionend',{data:'가'});assert.equal(h.input.value,'1,200');assert.equal(h.accepted.length,0);
});
test('C28 corrected field remount transfers exact history and selected caret without another model edit',()=>{
 const h=harness('199'),initialKey=h.api.inspectHistory(h.input).key;h.edit('201',{start:0,end:3});
 const editedKey=h.api.inspectHistory(h.input).key;h.input.setSelectionRange(1,3,'backward');h.api.replace(h.input,'200');
 assert.equal(h.api.inspectHistory(h.input).key,editedKey,'a correction is the same accepted edit');
 const expected=h.api.inspectHistory(h.input),next=h.remount('200');
 assert.equal(h.api.transfer(h.input,next.input).accepted,true);next.focus();h.api.refresh();
 assert.deepEqual(h.api.inspectHistory(next.input),expected);assert.deepEqual([next.input.selectionStart,next.input.selectionEnd,next.input.selectionDirection],[1,3,'backward']);assert.equal(h.accepted.length,1);
 next.fire('keydown',{key:'z',ctrlKey:true});assert.equal(next.input.value,'199');assert.equal(h.accepted.at(-1).fromHistoryKey,editedKey);assert.equal(h.accepted.at(-1).historyKey,initialKey);
 next.fire('keydown',{key:'y',ctrlKey:true});assert.equal(next.input.value,'200');assert.equal(h.accepted.at(-1).fromHistoryKey,initialKey);assert.equal(h.accepted.at(-1).historyKey,editedKey);assert.deepEqual([next.input.selectionStart,next.input.selectionEnd,next.input.selectionDirection],[1,3,'backward']);
 assert.equal(h.api.transfer(h.input,next.input).reason,'SOURCE','a moved source cannot replay its history twice');assert.equal(h.accepted.length,3);
});
test('C28 same-value clamp keeps a distinct transaction key through remount and undo/redo',()=>{
 const h=harness('200'),beforeKey=h.api.inspectHistory(h.input).key;h.edit('201',{start:0,end:3});const correctionKey=h.api.inspectHistory(h.input).key;h.api.replace(h.input,'200');
 assert.notEqual(correctionKey,beforeKey);const next=h.remount('200');h.api.transfer(h.input,next.input);next.focus();
 next.fire('beforeinput',{inputType:'historyUndo'});assert.equal(next.input.value,'200');assert.equal(h.accepted.at(-1).fromHistoryKey,correctionKey);assert.equal(h.accepted.at(-1).historyKey,beforeKey);
 next.fire('beforeinput',{inputType:'historyRedo'});assert.equal(next.input.value,'200');assert.equal(h.accepted.at(-1).fromHistoryKey,beforeKey);assert.equal(h.accepted.at(-1).historyKey,correctionKey);assert.equal(h.accepted.length,3);
});
test('C28 transfer does not consume composition, unknown external edits or a different numeric format',()=>{
 const h=harness('1200'),next=h.remount('2');h.fire('compositionstart');h.input.value='1,가200';assert.equal(h.api.transfer(h.input,next.input).reason,'COMPOSING');assert.equal(next.input.value,'2');
 h.fire('compositionend',{data:'가'});h.input.value='1201';assert.equal(h.api.transfer(h.input,next.input).reason,'EXTERNAL_CHANGE');assert.equal(next.input.value,'2');
 h.api.replace(h.input,'1200');assert.equal(h.api.transfer(h.input,{matches:()=>false}).reason,'TARGET');
 const plain=h.remount('2',{grouped:false});assert.equal(h.api.transfer(h.input,plain.input).reason,'FORMAT');assert.equal(plain.input.value,'2');assert.equal(h.accepted.length,0);
});
test('C28 retained history keys do not collide after trimming or a new undo branch',()=>{
 const h=harness('0');for(let value=1;value<=110;value++)h.api.replace(h.input,String(value),{history:'append'});
 const before=h.api.inspectHistory(h.input);assert.equal(before.keys.length,100);assert.equal(new Set(before.keys).size,100);
 h.fire('keydown',{key:'z',ctrlKey:true});const removed=before.key;h.api.replace(h.input,'999',{history:'append'});const after=h.api.inspectHistory(h.input);assert.ok(after.key>removed);assert.equal(after.keys.includes(removed),false);assert.equal(after.nextKey,null);
});
test('C28 composition commit correction and remount suppress the trailing input exactly once',()=>{
 const h=harness('199');let next;
 h.onInput(event=>{if(event.orderNumeric?.phase!=='compositionend')return;h.api.replace(event.target,'200');next=h.remount('200');assert.equal(h.api.transfer(event.target,next.input).accepted,true);next.focus();});
 h.fire('compositionstart');h.input.value='201';h.input.setSelectionRange(1,3,'backward');h.fire('compositionend',{data:'201'});
 assert.equal(h.accepted.length,1);assert.equal(next.input.value,'200');assert.deepEqual([next.input.selectionStart,next.input.selectionEnd,next.input.selectionDirection],[1,3,'backward']);
 const trailing=next.fire('input',{inputType:'insertCompositionText',data:'201'});assert.equal(trailing.stopped,true);assert.equal(h.accepted.length,1,'the corrected replacement owns the trailing composition guard');
 next.fire('keydown',{key:'z',ctrlKey:true});assert.equal(next.input.value,'199');next.fire('keydown',{key:'y',ctrlKey:true});assert.equal(next.input.value,'200');assert.equal(h.accepted.length,3);
 next.fire('beforeinput',{inputType:'insertText',data:'2'});next.input.value='202';next.fire('input',{inputType:'insertText',data:'2'});assert.equal(h.accepted.length,4,'a later deliberate edit is accepted normally');assert.equal(h.accepted.at(-1).value,'202');
});
test('MSG0540 range fit completes synchronously against its padded modal viewport before a numeric edit returns',()=>{
 const h=harness('20'),view=h.input.ownerDocument.defaultView;let deferred=0;
 const viewport={clientWidth:288,parentElement:null},expandedParent={clientWidth:360,parentElement:viewport};
 const numbers=[{scrollWidth:70},{scrollWidth:224}],range={dataset:{},parentElement:expandedParent,querySelectorAll:()=>numbers};
 view.requestAnimationFrame=()=>{deferred++;};view.cancelAnimationFrame=()=>{};
 view.getComputedStyle=node=>node===range?{columnGap:'8px'}:node===viewport?{paddingLeft:'20px',paddingRight:'20px'}:{paddingLeft:'0px',paddingRight:'0px'};
 const priorClosest=h.input.closest;h.input.closest=selector=>selector==='.qa-var-range'?range:priorClosest(selector);
 h.api.replace(h.input,'123456789012');
 assert.equal(range.dataset.long,'true','expanded parent cannot override the 248px visible viewport');
 assert.equal(deferred,0,'no later animation frame may repair a clipped accepted input');
 assert.equal(h.input.value,'123,456,789,012');assert.equal(h.accepted.length,0,'layout fitting does not publish a model write');
 numbers[1].scrollWidth=70;h.api.replace(h.input,'20');assert.equal(range.dataset.long,'false','short values restore the shared row in the same turn');
});

test('MSG0540 range viewport resize fits once per owner and preserves exact value, caret, undo and zero writes',()=>{
 const listeners=new Set();let adds=0,removes=0;
 const h=harness('20',{view:{addEventListener(type,fn){if(type==='resize'){adds++;listeners.add(fn);}},removeEventListener(type,fn){if(type==='resize'){removes++;listeners.delete(fn);}}}});
 const view=h.input.ownerDocument.defaultView,viewport={clientWidth:504,parentElement:null},parent={clientWidth:464,parentElement:viewport},numbers=[{scrollWidth:70},{scrollWidth:224}],range={dataset:{},parentElement:parent,querySelectorAll:()=>numbers};
 view.getComputedStyle=node=>node===range?{columnGap:'8px'}:node===viewport?{paddingLeft:'20px',paddingRight:'20px'}:{paddingLeft:'0px',paddingRight:'0px'};
 const closest=h.input.closest;h.input.closest=selector=>selector==='.qa-var-range'?range:closest(selector);
 h.api.replace(h.input,'123456789012',{history:'append'});h.input.setSelectionRange(3,6,'backward');const history=h.api.inspectHistory(h.input);
 assert.equal(range.dataset.long,'false');assert.equal(bindNumericInputs(h.root),h.api);assert.equal(adds,1,'rebinding cannot duplicate global listeners');
 viewport.clientWidth=288;for(const fn of listeners)fn();assert.equal(range.dataset.long,'true');assert.equal(h.input.value,'123,456,789,012');assert.deepEqual([h.input.selectionStart,h.input.selectionEnd,h.input.selectionDirection],[3,6,'backward']);assert.deepEqual(h.api.inspectHistory(h.input),history);assert.equal(h.accepted.length,0);
 viewport.clientWidth=504;for(const fn of listeners)fn();assert.equal(range.dataset.long,'false');h.fire('keydown',{key:'z',ctrlKey:true});assert.equal(h.input.value,'20');
 h.api.destroy();assert.equal(removes,1);assert.equal(listeners.size,0);
});
