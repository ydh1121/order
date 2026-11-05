import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDateField} from '../../web/date-field.mjs';
import {dateModeOptions,oneTimeDateValue} from '../../web/q4-date.mjs';
// Controlled delegated DOM events exercise the actual shared field binding and
// numeric adapter. Real top-layer calendar/storage interactions belong to smoke.
class EditEvent{
 constructor(type,init={}){Object.assign(this,{type,bubbles:true,cancelable:true},init);}
 preventDefault(){this.defaultPrevented=true;}
 stopPropagation(){this.bubbles=false;}
 stopImmediatePropagation(){this.stopped=true;}
}
function fieldHarness(parts){
 const listeners=new Map(),changes=[],doc={activeElement:null,defaultView:{Event:EditEvent},createElement:()=>({textContent:''})};
 const node=()=>({ownerDocument:doc,dataset:{},hidden:false,textContent:'',children:[],setAttribute(name,value){this[name]=value;},replaceChildren(...children){this.children=children;}});
 const notices=node(),error=node(),anchor=node(),segments=node();
 const fields=['year','month','day'].map(part=>({...node(),value:String(parts[part]??''),dataset:{orderDatePart:part},ownerDocument:doc,disabled:false,readOnly:false,selectionStart:0,selectionEnd:0,matches:selector=>selector==='[data-order-date-part]',closest:()=>null,setSelectionRange(start,end,direction='none'){Object.assign(this,{selectionStart:start,selectionEnd:end,selectionDirection:direction});},dispatchEvent(event){event.target=this;for(const capture of [true,false])for(const row of listeners.get(event.type)||[]){if(row.capture!==capture)continue;row.fn(event);if(event.stopped)return false;}return !event.defaultPrevented;}}));
 const root={dataset:{readonly:'false'},ownerDocument:doc,querySelectorAll:()=>fields,contains:target=>fields.includes(target),querySelector:selector=>({'[data-order-date-notices]':notices,'[data-order-date-error]':error,'.order-date-anchor':anchor,'.qa-date-segments':segments})[selector]||null,addEventListener(type,fn,options){listeners.set(type,[...(listeners.get(type)||[]),{fn,capture:typeof options==='boolean'?options:!!options?.capture}]);},removeEventListener(type,fn){listeners.set(type,(listeners.get(type)||[]).filter(row=>row.fn!==fn));}};
 const api=bindDateField(root,{now:()=>new Date('2026-11-05T10:00:00+09:00'),getDate:()=>oneTimeDateValue(parts),getParts:()=>parts,...dateModeOptions('ONCE'),onChange:(value,result)=>changes.push({value,result})});
 function edit(part,value,{inputType='insertText',completed=false}={}){const field=fields.find(field=>field.dataset.orderDatePart===part);doc.activeElement=field;field.setSelectionRange(0,field.value.length);if(completed)field.dispatchEvent(new EditEvent('paste',{clipboardData:{getData:()=>value}}));const before=new EditEvent('beforeinput',{inputType,data:value});field.dispatchEvent(before);if(before.defaultPrevented)return;field.value=value;field.setSelectionRange(value.length,value.length);field.dispatchEvent(new EditEvent('input',{inputType,data:value}));}
 return {api,fields,changes,edit,notices,error};
}

test('C55-15 actual binding restore/commit/repaint keeps frozen saved parts and emits zero edits',()=>{
 for(const raw of [{year:2027,month:1,day:10},{year:2026,month:1,day:10},{year:2101,month:1,day:10},{year:3333,month:222,day:33},{year:2026,month:11,day:''}]){
  const saved=Object.freeze(raw),before=JSON.stringify(saved),h=fieldHarness(saved),expected=Object.fromEntries(Object.entries(saved).map(([key,value])=>[key,String(value)]));
  assert.deepEqual(h.api.parts(),expected);
  for(let i=0;i<3;i++){h.api.restoreParts(saved);h.api.commit();h.api.repaint();assert.deepEqual(h.api.parts(),expected);}
  assert.equal(h.changes.length,0);assert.equal(JSON.stringify(saved),before);h.api.destroy();
 }
});

test('C55-14 actual input handler corrects complete fields before blur and retains first digits',()=>{
 const h=fieldHarness(Object.freeze({year:2026,month:11,day:''}));
 h.edit('year','3');assert.equal(h.api.parts().year,'3');assert.equal(h.changes.at(-1).result.status,'incomplete');
 h.edit('year','3333');assert.equal(h.api.parts().year,'2100');
 h.edit('month','22');assert.equal(h.api.parts().month,'12');
 h.edit('day','33');assert.equal(h.api.parts().day,'31');assert.equal(h.api.value,'2100-12-31');
 assert.equal(h.changes.at(-1).value,'2100-12-31');assert.equal(h.changes.length,4);
 h.api.commit();assert.equal(h.changes.length,4,'unchanged complete field does not publish twice');
 h.edit('day','');assert.equal(h.api.parts().day,'');assert.equal(h.api.value,'');h.api.destroy();
});

test('C55-13 actual binding displays the common numbered advisory on restore without edits',()=>{
 const h=fieldHarness(Object.freeze({year:2026,month:11,day:8}));
 assert.deepEqual(h.notices.children.map(p=>p.textContent),['1. 납품일까지 여유가 짧아 일정 확인이 필요합니다.','2. 일요일 납품은 납품사 일정 확인이 필요합니다.']);
 assert.equal(h.changes.length,0);h.api.destroy();
});
