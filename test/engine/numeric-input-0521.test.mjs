import test from 'node:test';
import assert from 'node:assert/strict';
import {bindNumericInputs,formatNumericText,parseNumericText} from '../../web/numeric-input.mjs';

// Controlled editing events prove exact text/caret/model contracts. The separate
// browser run owns native IME/selection/undo and OS acceptance, not these doubles.
class EditEvent {
 constructor(type,init={}){Object.assign(this,{type,bubbles:true,cancelable:true,defaultPrevented:false,stopped:false},init);}
 preventDefault(){if(this.cancelable)this.defaultPrevented=true;}
 stopImmediatePropagation(){this.stopped=true;}
}
function harness(value='123',{grouped=false,allowEmpty=true,allowZero=true,maxDigits=null,clampMax=null}={}){
 const inputs=[],listeners=new Map(),accepted=[],changes=[];
 const root={addEventListener(type,fn,capture){const a=listeners.get(type)||[];a.push({fn,capture});listeners.set(type,a);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(x=>x.fn!==fn));},querySelectorAll:()=>inputs};
 function input(raw,selected=true){const el={value:raw,disabled:false,readOnly:false,selected,selectionStart:raw.length,selectionEnd:raw.length,selectionDirection:'none',ownerDocument:{defaultView:{Event:EditEvent}},matches:()=>selected,
  setSelectionRange(start,end,direction='none'){Object.assign(this,{selectionStart:start,selectionEnd:end,selectionDirection:direction});},dispatchEvent(event){event.target=this;for(const phase of [true,false])for(const l of listeners.get(event.type)||[]){if(!!l.capture!==phase)continue;l.fn(event);if(event.stopped)return !event.defaultPrevented;}return !event.defaultPrevented;}};inputs.push(el);return el;}
 const el=input(value),adapter=bindNumericInputs(root,{options:()=>({grouped,allowEmpty,allowZero,maxDigits,clampMax})});
 root.addEventListener('input',event=>accepted.push({...event.orderNumeric}));root.addEventListener('numericstatechange',()=>changes.push(adapter.inspect()));
 const fire=(type,fields={},target=el)=>{const e=new EditEvent(type,fields);target.dispatchEvent(e);return e;};
 const edit=(data,{inputType='insertText',start=el.selectionStart,end=el.selectionEnd,cancelable=true}={})=>{
  el.setSelectionRange(start,end);const e=fire('beforeinput',{data,inputType,cancelable});if(e.defaultPrevented)return e;
  const raw=el.value.slice(0,start)+data+el.value.slice(end);el.value=raw;el.setSelectionRange(start+data.length,start+data.length);return fire('input',{data,inputType});
 };
 return {el,adapter,accepted,changes,fire,edit,input};
}

test('R16 integer text is accepted whole, never stripped or interpreted as exponent/fraction',()=>{
 for(const raw of ['10가20','1e3','-2','1.5','10\n20',' 12','12 ','605/3','NaN','１２'])assert.equal(parseNumericText(raw).valid,false,raw);
 assert.deepEqual(parseNumericText('00025'),{valid:true,value:'00025',raw:'00025',reason:null});
 assert.equal(parseNumericText('').value,'');assert.equal(parseNumericText('',{allowEmpty:false}).reason,'EMPTY');
 assert.equal(parseNumericText('0',{allowZero:false}).reason,'ZERO');assert.equal(parseNumericText('1234',{maxDigits:3}).reason,'LENGTH');
 assert.equal(formatNumericText('605/3',{grouped:true}),'605/3');
});

test('R16 comma paste is explicit strict grouping, and the 31-day clamp is opt-in only',()=>{
 assert.equal(parseNumericText('1,234').valid,false);assert.equal(parseNumericText('1,234',{grouped:true}).value,'1234');
 for(const raw of ['12,34','1,23,456',',123','123,','1,,234'])assert.equal(parseNumericText(raw,{grouped:true}).valid,false,raw);
 assert.equal(parseNumericText('32').value,'32');assert.equal(parseNumericText('32',{clampMax:31}).value,'31');
 assert.equal(parseNumericText('999999999999999999999999999999',{clampMax:31}).value,'31');
 assert.equal(parseNumericText('0',{clampMax:31}).value,'0');
});

test('R16 invalid beforeinput and fallback preserve the exact previous text and selected range',()=>{
 const h=harness('1020');h.el.setSelectionRange(2,2);
 const before=h.edit('가',{start:2,end:2});assert.equal(before.defaultPrevented,true);assert.equal(h.el.value,'1020');assert.equal(h.el.selectionStart,2);assert.equal(h.accepted.length,0);
 h.el.setSelectionRange(1,3,'backward');h.fire('beforeinput',{inputType:'insertFromPaste',data:null,cancelable:false});h.el.value='1e3';h.el.setSelectionRange(3,3);h.fire('input',{inputType:'insertFromPaste',data:null});
 assert.equal(h.el.value,'1020');assert.equal(h.el.selectionStart,1);assert.equal(h.el.selectionEnd,3);assert.equal(h.el.selectionDirection,'backward');assert.equal(h.accepted.length,0);
});

test('R16 grouped selection replacement keeps digit position and publishes only exact digit text',()=>{
 const h=harness('12,345',{grouped:true});h.edit('9',{start:1,end:4});
 assert.equal(h.el.value,'1,945');assert.equal(h.el.selectionStart,3);assert.equal(h.accepted.length,1);assert.equal(h.accepted[0].value,'1945');
 h.edit('0',{start:5,end:5});assert.equal(h.el.value,'19,450');assert.equal(h.el.selectionStart,6);assert.equal(h.accepted[1].value,'19450');
});

test('R16 paste/drop reject hazardous entire payloads without emitting accepted state',()=>{
 for(const type of ['paste','drop'])for(const text of ['10가20','605/3','1e3','10\n20']){
  const h=harness('123'),e=h.fire(type,{[type==='paste'?'clipboardData':'dataTransfer']:{getData:()=>text}});
  assert.equal(e.defaultPrevented,true);assert.equal(h.el.value,'123');assert.equal(h.accepted.length,0);
 }
 const h=harness('',{grouped:true}),e=h.fire('paste',{clipboardData:{getData:()=>'1,234'}});assert.equal(e.defaultPrevented,false);
 h.el.value='1,234';h.el.setSelectionRange(5,5);h.fire('input',{inputType:'insertFromPaste'});assert.equal(h.accepted[0].value,'1234');
});

test('R16 IME preserves composition draft then restores invalid text with zero domain edits',()=>{
 const h=harness('1020');h.el.setSelectionRange(2,2);h.fire('compositionstart');h.el.value='10가20';h.el.setSelectionRange(3,3);h.fire('input',{isComposing:true,inputType:'insertCompositionText',data:'가'});
 assert.equal(h.el.value,'10가20');assert.equal(h.accepted.length,0);assert.equal(h.adapter.inspect().composingCount,1);
 const e=h.fire('compositionend',{data:'가'});assert.equal(h.el.value,'1020');assert.equal(h.el.selectionStart,2);assert.equal(e.orderNumeric.accepted,false);assert.equal(h.accepted.length,0);assert.equal(h.adapter.inspect().valid,true);
});

test('R16 accepted IME completion publishes once and ignores the duplicate trailing input',()=>{
 const h=harness('12');h.fire('compositionstart');h.el.value='123';h.el.setSelectionRange(3,3);h.fire('input',{isComposing:true});h.fire('compositionend',{data:'3'});h.fire('input',{inputType:'insertText',data:'3'});
 assert.equal(h.accepted.length,1);assert.equal(h.accepted[0].value,'123');assert.equal(h.adapter.inspect().valid,true);
});

test('R16 undo and redo retain grouping and exact values without native character concatenation',()=>{
 const h=harness('999',{grouped:true});h.edit('9');assert.equal(h.el.value,'9,999');h.edit('8');assert.equal(h.el.value,'99,998');
 h.fire('keydown',{key:'z',ctrlKey:true});assert.equal(h.el.value,'9,999');assert.equal(h.accepted.at(-1).value,'9999');
 h.fire('beforeinput',{inputType:'historyUndo'});assert.equal(h.el.value,'999');assert.equal(h.accepted.at(-1).value,'999');
 h.fire('keydown',{key:'z',metaKey:true,shiftKey:true});assert.equal(h.el.value,'9,999');assert.equal(h.accepted.at(-1).phase,'redo');
});

test('R16 damaged saved text is never cleared and remains repairable; undo to damage blocks the final gate',()=>{
 const h=harness('10가20');assert.equal(h.el.value,'10가20');assert.equal(h.adapter.inspect().valid,false);
 h.edit('',{inputType:'deleteContentBackward',start:2,end:3});assert.equal(h.el.value,'1020');assert.equal(h.accepted[0].value,'1020');assert.equal(h.adapter.inspect().valid,true);
 h.fire('keydown',{key:'z',ctrlKey:true});assert.equal(h.el.value,'10가20');assert.equal(h.adapter.inspect().valid,false);assert.equal(h.changes.at(-1).invalidCount,1);assert.equal(h.accepted.length,1);
 h.edit('5',{start:0,end:5});assert.equal(h.el.value,'5');assert.equal(h.accepted.at(-1).value,'5');
});

test('R16 delegated new fields and read-only last-day stay separate from phone/postal inputs',()=>{
 const h=harness('10'),other=h.input('08843',false),last=h.input('말일');last.readOnly=true;
 other.dispatchEvent(new EditEvent('input',{data:'x'}));assert.equal(other.value,'08843');last.dispatchEvent(new EditEvent('input'));assert.equal(last.value,'말일');assert.equal(h.adapter.inspect().valid,true);
 const next=h.input('2');next.dispatchEvent(new EditEvent('beforeinput',{inputType:'insertText',data:'3'}));next.value='23';next.setSelectionRange(2,2);next.dispatchEvent(new EditEvent('input',{inputType:'insertText',data:'3'}));assert.equal(h.accepted.at(-1).value,'23');
 h.adapter.destroy();h.el.value='invalid';h.fire('input');assert.equal(h.el.value,'invalid');
});

test('R16 selection edits preserve leading zeros; autofill fallback cannot sanitize invalid input',()=>{
 const h=harness('0012');h.edit('3',{start:3,end:4});assert.equal(h.el.value,'0013');assert.equal(h.accepted[0].value,'0013');
 h.el.value='10가20';h.fire('input',{inputType:'insertReplacementText'});assert.equal(h.el.value,'0013');assert.equal(h.accepted.length,1);
});

test('R16 a displayed derived value becomes the rollback/undo baseline before the next real edit',()=>{
 const h=harness('50');h.el.value='117';h.el.setSelectionRange(3,3);
 h.edit('가');assert.equal(h.el.value,'117');assert.equal(h.accepted.length,0);
 h.edit('0');assert.equal(h.el.value,'1170');h.fire('keydown',{key:'z',ctrlKey:true});assert.equal(h.el.value,'117');assert.equal(h.accepted.at(-1).value,'117');
});

test('R11 explicit same-text replacement consumes a derived packaging quantity; focus/refresh alone does not',()=>{
 const h=harness('167');let each=5000;
 h.adapter.refresh();h.fire('focusin');assert.equal(h.accepted.length,0);assert.equal(each,5000);
 h.edit('167',{start:0,end:3});assert.equal(h.accepted.length,1);assert.equal(h.accepted[0].explicit,true);each=Number(h.accepted[0].value)*30;assert.equal(each,5010);
 h.fire('input');assert.equal(h.accepted.length,2,'An explicit input event still reaches the consumer when its visible text matches');
});
