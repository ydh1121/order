import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderPhoneAdapter} from '../../src/engine/adapters/phone-browser.mjs';
import {phoneDOMHarness} from '../fixtures/engine/phone-dom-mock.mjs';
const withDOM=run=>{const harness=phoneDOMHarness();try{run(harness);}finally{harness.cleanup();}};
const type=(input,text)=>{input.focus();for(const data of text)input.fire('beforeinput',{inputType:'insertText',data});};
const paste=(input,text)=>input.fire('paste',{clipboardData:{getData:()=>text}});

test('DOM MOCK: plus82 restored source and domestic serialization share one verdict',()=>withDOM(h=>{
 const input=h.input('phone','+82 10 2345 6789'),api=createOrderPhoneAdapter(),c=api.mount(input);
 assert.equal(c.get(),'010-2345-6789');assert.equal(c.parse().valid,true);
 assert.equal(c.snapshot().originalRaw,'+82 10 2345 6789');
 assert.deepEqual(c.projection().contract,c.contract());assert.equal(c.projection().saveAllowed,true);
 c.set('+82 2 234 5678');assert.equal(c.snapshot().originalRaw,'+82 2 234 5678');assert.equal(c.get(),'02-234-5678');
}));

test('DOM MOCK: explicit Tab middle-three is preserved; programmatic focus does not create it',()=>withDOM(h=>{
 const c=createOrderPhoneAdapter().mount(h.input('phone','02'));
 type(c.parts[1],'234');c.parts[1].fire('keydown',{key:'Tab'});type(c.parts[2],'5678');
 assert.equal(c.get(),'02-234-5678');assert.equal(c.parse().valid,true);assert.equal(c.snapshot().explicitMiddle,true);
 c.set('02');type(c.parts[1],'234');type(c.parts[2],'5678');assert.equal(c.snapshot().explicitMiddle,false);assert.equal(c.parse().valid,true);
}));

test('DOM MOCK: rejected paste and IME preserve existing digits plus selected range',()=>withDOM(h=>{
 const c=createOrderPhoneAdapter().mount(h.input('phone','010-2345-6789')),last=c.parts[2];
 last.focus();last.setSelectionRange(1,3);paste(last,'12345678');
 assert.equal(c.get(),'010-2345-6789');assert.equal(last.selectionStart,1);assert.equal(last.selectionEnd,3);
 last.fire('compositionstart',{data:''});last.value='6한9';last.fire('compositionend',{data:'한'});
 assert.equal(c.get(),'010-2345-6789');assert.equal(last.selectionStart,1);assert.equal(last.selectionEnd,3);
 paste(last,'15881234');assert.equal(c.get(),'1588-1234');assert.equal(c.parse().valid,true);assert.equal(c.parts[2].hidden,true);
}));

test('DOM MOCK: corrupted restoration and explicit full clear do not silently rewrite raw',()=>withDOM(h=>{
 const raw='010-1234-12345678',c=createOrderPhoneAdapter().mount(h.input('phone',raw,false));
 assert.equal(c.get(),raw);assert.equal(c.parse().valid,false);assert.equal(c.snapshot().rawMode,true);
 c.parts[0].focus();c.parts[0].fire('keydown',{key:'a',ctrlKey:true});c.parts[0].fire('beforeinput',{inputType:'deleteContentBackward',data:null});
 assert.equal(c.get(),'');assert.equal(c.snapshot().explicitClear,true);assert.equal(c.snapshot().originalRaw,raw);assert.equal(c.projection().saveAllowed,true);
}));

test('DOM MOCK: first-prefix edit cannot discard extra groups; undo restores accepted edit',()=>withDOM(h=>{
 const c=createOrderPhoneAdapter().mount(h.input('phone','02-2345-6789'));
 c.parts[0].focus();c.parts[0].setSelectionRange(0,2);type(c.parts[0],'1');
 assert.equal(c.parse().valid,false);assert.equal(c.get(),'1-2345-6789');
 c.parts[0].fire('keydown',{key:'z',ctrlKey:true});assert.equal(c.get(),'02-2345-6789');assert.equal(c.parse().valid,true);
 c.parts[0].setSelectionRange(0,2);c.parts[0].fire('beforeinput',{inputType:'insertText',data:'1588'});
 assert.equal(c.get(),'02-2345-6789');assert.equal(c.parts[0].selectionStart,0);assert.equal(c.parts[0].selectionEnd,2);
}));
