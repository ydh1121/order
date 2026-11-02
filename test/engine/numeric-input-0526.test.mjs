import test from 'node:test';
import assert from 'node:assert/strict';
import {bindNumericInputs,stepNumericText} from '../../web/numeric-input.mjs';

// These are deterministic event-contract tests, not native IME/OS evidence.
class EditEvent {
 constructor(type,init={}){Object.assign(this,{type,bubbles:true,cancelable:true,defaultPrevented:false,stopped:false},init);}
 preventDefault(){if(this.cancelable)this.defaultPrevented=true;}
 stopImmediatePropagation(){this.stopped=true;}
}
function harness(raw='999',config={}){
 const listeners=new Map(),inputs=[],accepted=[],changes=[],document={activeElement:null,defaultView:{Event:EditEvent}};
 const root={addEventListener(type,fn,options){const rows=listeners.get(type)||[];rows.push({fn,capture:typeof options==='boolean'?options:!!options?.capture,options});listeners.set(type,rows);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(row=>row.fn!==fn));},querySelectorAll:()=>inputs.filter(input=>input.selected)};
 function field(value,{selected=true,attributes={}}={}){
  const input={value,selected,dataset:{},disabled:false,readOnly:false,ownerDocument:document,selectionStart:value.length,selectionEnd:value.length,selectionDirection:'none',matches:()=>selected,getAttribute:name=>attributes[name]??null,getBoundingClientRect:()=>({left:10,right:110,top:20,bottom:64}),
   setSelectionRange(start,end,direction='none'){Object.assign(this,{selectionStart:start,selectionEnd:end,selectionDirection:direction});},
   dispatchEvent(event){event.target=this;for(const phase of [true,false])for(const listener of listeners.get(event.type)||[]){if(listener.capture!==phase)continue;listener.fn(event);if(event.stopped)return !event.defaultPrevented;}return !event.defaultPrevented;}};
  inputs.push(input);return input;
 }
 const input=field(raw),api=bindNumericInputs(root,{options:()=>config});document.activeElement=input;
 root.addEventListener('input',event=>{if(event.orderNumeric)accepted.push({...event.orderNumeric});});
 root.addEventListener('numericstatechange',()=>changes.push(api.inspect()));
 const fire=(type,init={},target=input)=>{const event=new EditEvent(type,init);target.dispatchEvent(event);return event;};
 const key=(key,init={},target=input)=>fire('keydown',{key,...init},target);
 const wheel=(init={},target=input)=>fire('wheel',{clientX:50,clientY:40,deltaY:-100,...init},target);
 return {root,input,api,document,accepted,changes,listeners,field,fire,key,wheel};
}

test('C26-04 exact step keeps integers above Number precision and caller-owned step/bounds',()=>{
 assert.equal(stepNumericText('9007199254740993',1).value,'9007199254740994');
 assert.equal(stepNumericText('9,007,199,254,740,993',-1,{grouped:true}).value,'9007199254740992');
 assert.equal(stepNumericText('0012',1).value,'0013');
 assert.equal(stepNumericText('10',1,{step:'5'}).value,'15');
 assert.equal(stepNumericText('10',-1,{step:'5',min:'8'}).value,'8');
 assert.equal(stepNumericText('30',1,{clampMax:31}).value,'31');
 assert.equal(stepNumericText('32',-1,{clampMax:31}).changed,false,'stepping does not silently repair an invalid day');
 assert.equal(stepNumericText('99',1,{maxDigits:2}).changed,false);
 for(const raw of ['10가20','605/3','1e3','1.2','-2'])assert.equal(stepNumericText(raw,1).changed,false,raw);
 for(const step of ['any','1.5','0',0,-1,Number.MAX_SAFE_INTEGER+1])assert.equal(stepNumericText('10',1,{step}).changed,false,String(step));
});

test('C26-04 focused arrows emit one exact edit; grouped caret and selected ranges survive',()=>{
 const h=harness('999',{grouped:true});h.input.setSelectionRange(3,3);
 assert.equal(h.key('ArrowUp').defaultPrevented,true);assert.equal(h.input.value,'1,000');assert.equal(h.input.selectionStart,5);
 assert.equal(h.accepted.length,1);assert.equal(h.accepted[0].value,'1000');assert.equal(h.accepted[0].phase,'step-key');
 h.input.setSelectionRange(0,5,'backward');h.key('ArrowDown');assert.equal(h.input.value,'999');assert.equal(h.input.selectionStart,0);assert.equal(h.input.selectionEnd,3);assert.equal(h.input.selectionDirection,'backward');assert.equal(h.accepted.length,2);
 h.document.activeElement=null;assert.equal(h.key('ArrowUp').defaultPrevented,false);assert.equal(h.accepted.length,2);
});

test('C26-04 wheel requires target focus and pointer inside, leaving scroll/zoom gestures alone',()=>{
 const h=harness('10');assert.equal(h.wheel().defaultPrevented,true);assert.equal(h.input.value,'11');assert.equal(h.accepted.length,1);
 for(const init of [{clientX:9},{clientX:110},{clientY:19},{clientY:64},{deltaY:0},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true}])assert.equal(h.wheel(init).defaultPrevented,false,JSON.stringify(init));
 h.document.activeElement=null;assert.equal(h.wheel().defaultPrevented,false);assert.equal(h.accepted.length,1);
 const wheel=h.listeners.get('wheel')[0];assert.equal(wheel.options.passive,false);assert.equal(wheel.capture,true);
});

test('C26-04 identifiers, readonly/fixed/locked controls, disabled and composing inputs never step',()=>{
 const h=harness('15');
 for(const [property,value] of [['readOnly',true],['disabled',true]]){h.input[property]=value;assert.equal(h.key('ArrowUp').defaultPrevented,false);assert.equal(h.wheel().defaultPrevented,false);h.input[property]=false;}
 h.input.dataset.numericStep='off';h.key('ArrowUp');delete h.input.dataset.numericStep;
 const phone=h.field('01012345678',{selected:false}),postal=h.field('08843',{selected:false});
 for(const input of [phone,postal]){h.document.activeElement=input;h.key('ArrowUp',{},input);h.wheel({},input);}assert.equal(postal.value,'08843');assert.equal(phone.value,'01012345678');
 h.document.activeElement=h.input;h.fire('compositionstart');h.key('ArrowUp');h.wheel();assert.equal(h.input.value,'15');h.fire('compositionend',{data:''});
 h.key('ArrowUp',{isComposing:true});h.key('ArrowUp',{keyCode:229});assert.equal(h.accepted.length,0);
});

test('C26-04 unchanged min/max emits zero domain edits and leaves provenance/transaction untouched',()=>{
 const h=harness('0',{min:0,max:1});let writes=0,source='derived';h.root.addEventListener('input',event=>{if(event.orderNumeric?.changed){writes++;source='manual';}});
 assert.equal(h.key('ArrowDown').defaultPrevented,true);assert.equal(h.wheel({deltaY:100}).defaultPrevented,true);assert.equal(h.accepted.length,0);assert.equal(writes,0);assert.equal(source,'derived');assert.equal(h.changes.length,0);
 h.key('ArrowUp');assert.equal(h.accepted.length,1);assert.equal(writes,1);h.key('ArrowUp');h.wheel();assert.equal(h.accepted.length,1);assert.equal(writes,1);
});

test('C26-04 step history supports undo/redo independently from persistence and external derived refresh',()=>{
 const h=harness('999',{grouped:true});h.key('ArrowUp');h.wheel();assert.equal(h.input.value,'1,001');
 h.key('z',{ctrlKey:true});assert.equal(h.input.value,'1,000');h.key('z',{metaKey:true});assert.equal(h.input.value,'999');
 h.key('z',{metaKey:true,shiftKey:true});assert.equal(h.input.value,'1,000');assert.equal(h.accepted.at(-1).phase,'redo');
 h.input.value='167';h.input.setSelectionRange(3,3);h.key('ArrowDown');assert.equal(h.input.value,'166');h.key('z',{ctrlKey:true});assert.equal(h.input.value,'167');
 for(const key of ['ArrowLeft','ArrowRight','+','-'])assert.equal(h.key(key,{ctrlKey:true}).defaultPrevented,false);
});

test('C26-04 repeated refresh/bind has one listener and newly rendered fields inherit current attributes',()=>{
 const h=harness('1');for(let n=0;n<8;n++){h.api.refresh();assert.equal(bindNumericInputs(h.root),h.api);}
 assert.equal(h.listeners.get('keydown').length,1);assert.equal(h.listeners.get('wheel').length,1);h.key('ArrowUp');assert.equal(h.accepted.length,1);
 const next=h.field('2026',{attributes:{min:'2026',max:'2027',step:'1'}});h.document.activeElement=next;h.api.refresh();h.key('ArrowDown',{},next);assert.equal(h.accepted.length,1);h.wheel({},next);assert.equal(next.value,'2027');assert.equal(h.accepted.length,2);
 h.api.destroy();h.wheel({},next);assert.equal(next.value,'2027');assert.equal(h.listeners.get('wheel').length,0);
});

test('C26-04 empty editable fields can start a value without changing invalid original text',()=>{
 const h=harness('');h.key('ArrowUp');assert.equal(h.input.value,'1');assert.equal(h.accepted.length,1);h.key('z',{ctrlKey:true});assert.equal(h.input.value,'');
 const invalid=harness('10가20');assert.equal(invalid.key('ArrowUp').defaultPrevented,false);assert.equal(invalid.input.value,'10가20');assert.equal(invalid.accepted.length,0);
});
