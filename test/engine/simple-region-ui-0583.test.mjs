import test from 'node:test';
import assert from 'node:assert/strict';
import {bindSimpleRegion} from '../../web/simple-region-ui.mjs';
import {REGION_REFERENCE_VERSION} from '../../web/region-reference.mjs';

// Local event-contract harness, not browser layout/native IME/OS evidence.
class UiEvent{
 constructor(type,init={}){Object.assign(this,{type,bubbles:true,defaultPrevented:false,stopped:false},init);}
 preventDefault(){this.defaultPrevented=true;}stopPropagation(){this.stopped=true;}
}
class Element{
 constructor(doc,tag='div'){Object.assign(this,{ownerDocument:doc,tagName:tag,children:[],dataset:{},attributes:{},listeners:new Map(),className:'',value:'',hidden:false,disabled:false,_text:'',selectionStart:0,selectionEnd:0});this.classList={add:name=>this.className+=(this.className?' ':'')+name};}
 set textContent(text){this._text=String(text);this.replaceChildren();}get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 set innerHTML(value){this._html=value;}
 append(...children){for(const child of children){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(row=>row!==child);child.parentNode=this;this.children.push(child);}}
 replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);}
 setAttribute(name,value){this.attributes[name]=String(value);}removeAttribute(name){delete this.attributes[name];}getAttribute(name){return this.attributes[name]??null;}
 addEventListener(type,fn){const list=this.listeners.get(type)||[];list.push(fn);this.listeners.set(type,list);}removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(row=>row!==fn));}
 dispatchEvent(event){event.target??=this;for(let el=this;el;el=event.bubbles&&!event.stopped?el.parentNode:null){for(const fn of [...(el.listeners.get(event.type)||[])])fn(event);if(event.stopped)break;}return !event.defaultPrevented;}
 contains(target){for(let el=target;el;el=el.parentNode)if(el===this)return true;return false;}
 closest(selector){const key=selector.match(/^\[data-([a-z-]+)\]$/)?.[1]?.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());for(let el=this;el;el=el.parentNode)if(key&&Object.hasOwn(el.dataset,key))return el;return null;}
 focus(){this.ownerDocument.activeElement=this;this.dispatchEvent(new UiEvent('focusin'));}scrollIntoView(){}
 setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;}
}
const descendants=node=>node.children.flatMap(child=>[child,...descendants(child)]);
const selected=(rootCode,leafCode,rootLabel,leafLabel)=>({referenceVersion:REGION_REFERENCE_VERSION,rootCode,leafCode,rootLabel,leafLabel});
const seoul=selected('1100000000','1168000000','서울특별시','강남구');
function harness({value=null,legacyText='',document:existing,idPrefix='region-a'}={}){
 const doc=existing||new Element(null,'document');if(!existing){doc.ownerDocument=doc;doc.createElement=tag=>new Element(doc,tag);doc.defaultView={OrderAccordionView:{chevron:'<svg aria-hidden="true"></svg>'}};doc.body=doc.createElement('body');doc.append(doc.body);}
 const host=doc.createElement('section');doc.body.append(host);const selections=[],drafts=[];
 const api=bindSimpleRegion(host,{idPrefix,label:'사업장 1',value,legacyText,onSelect:(value,meta)=>selections.push({value,meta}),onDraftChange:value=>drafts.push(value)});
 const find=(name,value)=>descendants(host).find(el=>el.dataset[name]===value),field=level=>find('regionQuery',level),list=level=>find('regionList',level);
 const fire=(el,type,init={})=>{const event=new UiEvent(type,init);el.dispatchEvent(event);return event;};
 return {doc,host,api,selections,drafts,find,field,list,fire,
  type(level,value){const input=field(level);input.value=value;input.setSelectionRange(value.length,value.length);fire(input,'input');},
  key(level,key,init={}){return fire(field(level),'keydown',{key,...init});},
  pick(level,code){const option=list(level).children.find(row=>row.dataset.regionOption===code);assert.ok(option,`official option ${code} is visible`);fire(option,'pointerdown');fire(option,'click');return option;}
 };
}

test('region queries and partial root emit zero selections; explicit initial-consonant leaf emits one exact selection',()=>{
 const h=harness();assert.equal(h.api.inspect().editing,false);assert.equal(h.field('leaf').disabled,true);
 h.type('root','ㅅㅇ');assert.equal(h.api.inspect().editing,true);assert.deepEqual(h.list('root').children.map(el=>el.dataset.regionOption),['1100000000']);assert.equal(h.selections.length,0);
 h.key('root','Enter');assert.equal(h.selections.length,0,'typed match is not an implicit highlighted choice');
 h.key('root','ArrowDown');assert.equal(h.field('root').getAttribute('aria-activedescendant'),'region-a-root-list-option-1100000000');h.key('root','Enter');
 assert.equal(h.selections.length,0);assert.equal(h.api.inspect().selection,null);assert.equal(h.api.inspect().editing,true);assert.equal(h.doc.activeElement,h.field('leaf'));
 h.type('leaf','ㄱㄴ');assert.deepEqual(h.list('leaf').children.map(el=>el.dataset.regionOption),['1168000000']);h.key('leaf','ArrowDown');h.key('leaf','Enter');
 assert.equal(h.selections.length,1);assert.deepEqual(h.selections[0].value,seoul);assert.equal(Object.isFrozen(h.selections[0].value),true);assert.equal(h.api.inspect().editing,false);
 h.fire(h.find('regionToggle','leaf'),'click');h.pick('leaf','1168000000');assert.equal(h.selections.length,1,'duplicate explicit same selection does not emit twice');
});
test('same root retains district; different root clears only local child until a matching official district is selected',()=>{
 const h=harness({value:seoul});h.type('root','서울');h.pick('root','1100000000');assert.equal(h.field('leaf').value,'강남구');assert.equal(h.selections.length,0);
 h.type('root','부산');h.pick('root','2600000000');assert.equal(h.field('leaf').value,'');assert.deepEqual(h.api.inspect().selection,seoul);assert.equal(h.api.inspect().editing,true);assert.equal(h.selections.length,0);
 h.type('leaf','중구');assert.deepEqual(h.list('leaf').children.map(el=>el.dataset.regionOption),['2611000000']);h.pick('leaf','2611000000');
 assert.deepEqual(h.selections[0].value,selected('2600000000','2611000000','부산광역시','중구'));
});
test('Sejong direct root selection is complete without an invented district',()=>{
 const h=harness();h.type('root','세종');h.pick('root','3611000000');assert.equal(h.selections.length,1);
 assert.deepEqual(h.selections[0].value,selected('3611000000','3611000000','세종특별자치시',''));
 assert.equal(h.find('simpleRegionLevel','leaf').hidden,true);assert.equal(h.field('leaf').disabled,true);assert.equal(h.field('leaf').value,'');assert.equal(h.api.inspect().editing,false);
});
test('IME query is preserved without filtering or Enter selection until composition completes',()=>{
 const h=harness({value:seoul});h.fire(h.field('root'),'compositionstart');h.type('root','부');assert.equal(h.api.inspect().composing,true);assert.equal(h.api.inspect().openLevel,null);
 const event=h.key('root','Enter',{isComposing:true,keyCode:229});assert.equal(event.defaultPrevented,false);assert.equal(h.selections.length,0);assert.equal(h.list('root').hidden,true);
 h.field('root').value='부산';h.fire(h.field('root'),'compositionend');assert.equal(h.api.inspect().composing,false);assert.equal(h.api.inspect().openLevel,'root');assert.deepEqual(h.list('root').children.map(el=>el.dataset.regionOption),['2600000000']);
 assert.equal(h.selections.length,0);assert.deepEqual(h.api.inspect().selection,seoul);
});
test('Escape closes one list, Tab leaves raw uncommitted, and normal caret/undo keys are not intercepted',()=>{
 const h=harness({value:seoul});h.type('root','ㄴㄴ없는지역');assert.equal(h.find('regionEmpty','root').hidden,false);assert.equal(h.field('root').getAttribute('aria-expanded'),'true');
 const escape=h.key('root','Escape');assert.equal(escape.defaultPrevented,true);assert.equal(escape.stopped,true);assert.equal(h.api.inspect().openLevel,null);assert.equal(h.field('root').value,'ㄴㄴ없는지역');assert.equal(h.key('root','Escape').stopped,false);
 h.type('root','서울');h.key('root','ArrowDown');const tab=h.key('root','Tab');assert.equal(tab.defaultPrevented,false);assert.equal(h.api.inspect().openLevel,null);assert.equal(h.selections.length,0);
 for(const key of ['Home','End','ArrowLeft','ArrowRight','z'])assert.equal(h.key('root',key,{ctrlKey:key==='z'}).defaultPrevented,false);
});
test('pointerdown keeps query focus and pointer click selects exactly once with accessible list state',()=>{
 const h=harness();h.field('root').focus();h.type('root','세종');const option=h.list('root').children[0];
 assert.equal(option.getAttribute('role'),'option');assert.equal(h.list('root').getAttribute('role'),'listbox');assert.equal(h.field('root').getAttribute('aria-controls'),h.list('root').id);
 assert.equal(h.fire(option,'pointerdown').defaultPrevented,true);assert.equal(h.doc.activeElement,h.field('root'));h.fire(option,'click');h.fire(option,'click');
 assert.equal(h.selections.length,1);assert.equal(h.field('root').getAttribute('aria-expanded'),'false');assert.equal(h.field('root').getAttribute('aria-activedescendant'),null);
});
test('same parent selection sync preserves raw/caret/IME; explicit force resets while a different implicit value cannot overwrite edits',()=>{
 const h=harness({value:seoul}),root=h.field('root');h.type('root','ㅂㅅ');root.focus();root.setSelectionRange(1,1);h.fire(root,'compositionstart');
 assert.equal(h.api.setValue({...seoul}),true);assert.equal(h.field('root'),root);assert.equal(root.value,'ㅂㅅ');assert.equal(root.selectionStart,1);assert.equal(h.api.inspect().composing,true);
 const busan=selected('2600000000','2611000000','부산광역시','중구');assert.equal(h.api.setValue(busan),false);assert.equal(root.value,'ㅂㅅ');
 assert.equal(h.api.setValue(busan,{force:true}),true);assert.equal(root.value,'부산광역시');assert.equal(h.field('leaf').value,'중구');assert.equal(h.api.inspect().editing,false);assert.equal(h.api.inspect().composing,false);assert.equal(h.selections.length,0);
});
test('stable host controllers stay isolated, bind once, close on outside focus and release stale listeners on destroy',()=>{
 const a=harness({value:seoul,idPrefix:'site-A'}),b=harness({document:a.doc,idPrefix:'site-B'});assert.equal(bindSimpleRegion(a.host),a.api);
 a.type('leaf','중');assert.equal(a.api.inspect().openLevel,'leaf');b.field('root').focus();assert.equal(a.api.inspect().openLevel,null);
 b.type('root','세종');const stale=b.list('root').children[0];b.api.destroy();b.fire(stale,'click');b.type('root','서울');assert.equal(b.selections.length,0);
 assert.deepEqual(a.api.inspect().selection,seoul);assert.equal(a.field('root').value,'서울특별시');assert.equal(b.api.setValue(seoul,{force:true}),false);
});
test('legacy text and stale reference labels remain readable without becoming a current catalog selection',()=>{
 const legacy=harness({legacyText:'서울특별시 강남구 역삼동'});assert.equal(legacy.field('root').value,'서울특별시 강남구 역삼동');assert.equal(legacy.api.inspect().selection,null);assert.equal(legacy.selections.length,0);assert.equal(legacy.field('leaf').disabled,true);
 const value={...seoul,referenceVersion:'historical-reference'};const old=harness({value});assert.equal(old.field('root').value,'서울특별시');assert.equal(old.field('leaf').value,'강남구');assert.deepEqual(old.api.inspect().selection,value);assert.equal(old.field('leaf').disabled,true);assert.equal(old.selections.length,0);
});
test('unmatched or composing root query locks the old leaf without erasing it or accepting a late option click',()=>{
 const h=harness({value:seoul});h.fire(h.find('regionToggle','leaf'),'click');const stale=h.list('leaf').children.find(row=>row.dataset.regionOption==='1114000000');assert.ok(stale);
 h.type('root','부산');assert.equal(h.field('leaf').disabled,true);assert.equal(h.find('regionToggle','leaf').disabled,true);assert.equal(h.field('leaf').value,'강남구');assert.deepEqual(h.api.inspect().selection,seoul);
 h.fire(stale,'click');h.fire(h.find('regionToggle','leaf'),'click');assert.equal(h.selections.length,0);assert.equal(h.field('root').value,'부산');assert.equal(h.api.inspect().openLevel,'root');
 h.type('root','서울특별시');assert.equal(h.field('leaf').disabled,false);assert.equal(h.selections.length,0,'returning to the chosen label changes no selection');
 h.fire(h.field('root'),'compositionstart');assert.equal(h.field('leaf').disabled,true);h.fire(stale,'click');assert.equal(h.selections.length,0);assert.equal(h.field('leaf').value,'강남구');
 h.fire(h.field('root'),'compositionend');assert.equal(h.field('leaf').disabled,false);assert.deepEqual(h.api.inspect().selection,seoul);assert.equal(h.selections.length,0);
});
