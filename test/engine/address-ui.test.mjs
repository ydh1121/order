import test from 'node:test';
import assert from 'node:assert/strict';
import {createAddressEditor} from '../../web/address-ui.mjs';

// DOM/shell mock only: exercises the child transaction and call contract. Real
// focus, modal history, motion, pointer events and provider traffic need Chromium.
const selected = () => ({road:'합성시 가상로 10',postal:'08843',jibun:'합성시 가상동 1',region:'합성시',providerId:'1'.repeat(25),addressProvider:'JUSO',detail:'2층',dropoff:'문 앞'});
function harness({address=selected(),result={status:'UNAVAILABLE',items:[]},resolve}={}) {
  const elements = new Map(), nodes = [], commits = [], requests = [], searches = [];
  class Element {
    constructor(id='') {this.id=id;this.value='';this.hidden=false;this.open=false;this.textContent='';this.dataset={};this.children=[];this.attributes=new Map();this.listeners=new Map();this.classList={contains:()=>false};nodes.push(this);if(id)elements.set(id,this);}
    addEventListener(type,callback){this.listeners.set(type,[...(this.listeners.get(type)||[]),callback]);}
    fire(type,details={}){const event={target:this,preventDefault(){},stopImmediatePropagation(){},...details};for(const callback of this.listeners.get(type)||[])callback(event);}
    setAttribute(key,value){this.attributes.set(key,String(value));}
    removeAttribute(key){this.attributes.delete(key);}
    getAttribute(key){return this.attributes.get(key)??null;}
    replaceChildren(...children){this.children=children;}
    append(...children){this.children.push(...children);}
    replaceWith(node){elements.set(this.id,node);}
    focus(){doc.activeElement=this;}
    scrollIntoView(){}
    querySelectorAll(){return this.children;}
    set innerHTML(value){this.html=value;this.firstElementChild=new Element();}
    get innerHTML(){return this.html||'';}
  }
  for(const id of ['address-editor-dialog','address-query','address-results','address-detail','address-dropoff','address-search-field','address-error','address-status','address-retry','address-selected','address-selected-title','address-selected-lines','address-detail-fields','address-clear','address-next-page','address-search-icon','address-close','address-scroll','address-confirm','address-cancel'])new Element(id);
  const doc={getElementById:id=>elements.get(id)||nodes.find(node=>node.id===id),createElement:()=>new Element(),activeElement:null};
  let binding,pending;
  const shell={bind(_dialog,dispose,options){binding={dispose,...options};},open(dialog){dialog.open=true;},close(dialog){dialog.open=false;},resize(_dialog,fn){return fn();},sync(){},requestClose(dialog,reason){requests.push(reason);if(binding.beforeClose?.(reason)===false)return false;if(binding.isDirty()){binding.onExitIntent?.(reason);pending={dialog,reason};return false;}binding.dispose(reason);return true;}};
  const parent={siteId:'site-a',generation:1,site:structuredClone(address)};
  const originalWindow=globalThis.window;globalThis.window={OrderIcons:{svg:name=>`<svg data-icon="${name}"></svg>`}};
  const editor=createAddressEditor({getParent:()=>parent,onConfirm:payload=>{commits.push(payload);return true;},service:{search:async(...args)=>{searches.push(args);return typeof result==='function'?result(...args):result;},resolve},shell,document:doc});
  const $=id=>elements.get(id),input=(id,value)=>{$(id).value=value;$(id).fire('input');};
  return {editor,parent,commits,requests,searches,$,input,get binding(){return binding;},discard(){if(pending){binding.dispose(pending.reason);pending=null;}},cleanup(){editor.invalidate();globalThis.window=originalWindow;}};
}

test('DOM MOCK: new query cannot confirm the prior selected address; original parent remains untouched',()=>{
  const h=harness();try {
    const original=structuredClone(h.parent);h.editor.open();assert.equal(h.binding.editable,true);assert.equal(h.binding.isDirty(),false);
    h.input('address-query','새 건물');assert.equal(h.$('address-selected-title').textContent,'기존 선택 주소');assert.equal(h.binding.isDirty(),true);
    h.$('address-confirm').fire('click');assert.equal(h.commits.length,0);assert.equal(h.$('address-query').getAttribute('aria-invalid'),'true');assert.deepEqual(h.parent,original);
    h.$('address-cancel').fire('click');assert.deepEqual(h.requests,['cancel']);assert.equal(h.editor.isOpen,true,'dirty close waits for common shell decision');
    h.discard();assert.equal(h.editor.isOpen,false);assert.deepEqual(h.parent,original);
  } finally {h.cleanup();}
});

const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('C55-03 DOM MOCK: filtered empty page preserves candidates and hasMore; failure retries the same page',async()=>{
 const pages=[];let retry=false;
 const h=harness({result:async(_query,{page})=>{pages.push(page);return page===1?{status:'OK',items:[selected()],hasMore:true}:page===2?{status:'EMPTY',reason:'NO_SELECTABLE_ADDRESSES',items:[],hasMore:true}:retry?{status:'EMPTY',items:[],hasMore:false}:{status:'UNAVAILABLE',items:[]};}});
 try{
  h.editor.open();h.input('address-query','검사 검색');h.$('address-retry').fire('click');await settle();
  h.$('address-next-page').fire('click');await settle();assert.equal(h.editor.inspect().status,'RESULTS');assert.equal(h.$('address-results').hidden,false);assert.equal(h.$('address-next-page').hidden,false);assert.doesNotMatch(h.$('address-status').textContent,/검색 결과가 없습니다/);
  h.$('address-next-page').fire('click');await settle();assert.equal(h.$('address-results').hidden,false);assert.equal(h.editor.inspect().page,2);
  retry=true;h.$('address-retry').fire('click');await settle();assert.deepEqual(pages,[1,2,3,3]);assert.equal(h.editor.inspect().page,3);assert.equal(h.$('address-next-page').hidden,true);assert.equal(h.editor.inspect().options,1);
 }finally{h.cleanup();}
});
test('C55-02 DOM MOCK: place name/branch leads address; chosen one resolves and late resolution cannot confirm',async()=>{
 const place={kind:'PLACE',placeId:'101',name:'엽기떡볶이 언주역점',road:'합성시 가상로 10',jibun:'합성시 가상동 1',page:1,addressProvider:'KAKAO'};
 let release,resolveCalls=0;
 const h=harness({address:{},result:{status:'OK',items:[place],hasMore:false},resolve:()=>{resolveCalls++;return new Promise(resolve=>{release=resolve;});}});
 try{
  h.editor.open();h.input('address-query','엽기떡볶이 언주역');h.$('address-retry').fire('click');await settle();
  assert.equal(h.editor.inspect().options,1);assert.equal(h.$('address-results').children[0].children[1].children[0].textContent,place.name);
  h.$('address-query').fire('keydown',{key:'Enter'});h.$('address-query').fire('keydown',{key:'Enter'});assert.equal(resolveCalls,1);assert.equal(h.commits.length,0);
  h.input('address-query','다른 장소');release({status:'OK',item:selected()});await settle();h.$('address-confirm').fire('click');assert.equal(h.commits.length,0);
 }finally{h.cleanup();}
});

test('C55-02 DOM MOCK: selected place resolution retries once; Escape cancellation allows another choice',async()=>{
 const place={kind:'PLACE',placeId:'101',name:'<img src=x> 언주역점',road:'합성시 가상로 10',jibun:'',page:1,addressProvider:'KAKAO'};
 let attempts=0,release;
 const h=harness({address:{},result:{status:'OK',items:[place],hasMore:false},resolve:async()=>{attempts++;return attempts===1?{status:'UNAVAILABLE'}:attempts===2?new Promise(resolve=>{release=resolve;}):{status:'OK',item:selected()};}});
 try{
  h.editor.open();h.input('address-query','언주역점');h.$('address-retry').fire('click');await settle();
  const name=h.$('address-results').children[0].children[1].children[0];assert.equal(name.textContent,place.name);assert.equal(name.innerHTML,'','provider name reaches textContent only');
  h.$('address-query').fire('keydown',{key:'Enter'});await settle();assert.equal(h.$('address-retry').hidden,false);
  h.$('address-retry').fire('click');assert.equal(attempts,2);h.$('address-editor-dialog').fire('keydown',{key:'Escape'});release({status:'OK',item:selected()});await settle();
  h.$('address-query').fire('keydown',{key:'ArrowDown'});h.$('address-query').fire('keydown',{key:'Enter'});await settle();assert.equal(attempts,3);
  assert.equal(h.commits.length,0);assert.equal(h.$('address-selected-lines').children[0].textContent,place.name);
  h.$('address-confirm').fire('click');assert.equal(h.commits.length,1);assert.equal(h.commits[0].address.postal,'08843');assert.equal('name' in h.commits[0].address,false);
 }finally{h.cleanup();}
});

test('DOM MOCK: child optional edits are parent-only on confirm, one callback despite duplicate confirmation',()=>{
  const h=harness();try {
    const original=structuredClone(h.parent);h.editor.open();h.input('address-detail','3층');h.input('address-dropoff','새 선반');
    assert.equal(h.binding.isDirty(),true);h.$('address-confirm').fire('click');h.$('address-confirm').fire('click');
    assert.equal(h.commits.length,1);assert.equal(h.commits[0].address.detail,'3층');assert.equal(h.commits[0].address.dropoff,'새 선반');assert.equal(h.commits[0].address.postal,'08843');assert.deepEqual(h.parent,original);
    assert.deepEqual(Object.keys(h.commits[0]).sort(),['address','generation','siteId']);
  } finally {h.cleanup();}
});

test('DOM MOCK: explicit clear, unchanged close, IME Escape and stale parent keep independent contracts',()=>{
  const h=harness();try {
    h.editor.open();h.$('address-close').fire('click');assert.equal(h.editor.isOpen,false);assert.equal(h.commits.length,0);
    h.editor.open();h.$('address-query').fire('compositionstart');assert.equal(h.binding.beforeClose('escape'),false);h.$('address-query').fire('compositionend');
    h.$('address-clear').fire('click');h.$('address-confirm').fire('click');assert.equal(h.commits.length,1);assert.ok(Object.values(h.commits[0].address).every(value=>value===''));
    h.editor.open();h.input('address-detail','오래된 초안');h.parent.generation++;h.$('address-confirm').fire('click');assert.equal(h.commits.length,1);assert.equal(h.editor.isOpen,false);assert.equal(h.editor.inspect().counts.stale,1);
  } finally {h.cleanup();}
});

test('DOM MOCK: unavailable search preserves text and previous selection without becoming an input error',async()=>{
  const h=harness();try {
    h.editor.open();h.input('address-query','검색 장애');h.$('address-retry').fire('click');await new Promise(resolve=>setImmediate(resolve));
    assert.equal(h.editor.inspect().status,'UNAVAILABLE');assert.equal(h.$('address-query').value,'검색 장애');assert.equal(h.$('address-query').getAttribute('aria-invalid'),'false');assert.equal(h.$('address-selected-title').textContent,'기존 선택 주소');assert.equal(h.$('address-retry').hidden,false);assert.match(h.$('address-retry').innerHTML,/data-icon="refresh"/);assert.equal(h.commits.length,0);
  } finally {h.cleanup();}
});

test('DOM MOCK: waiting for an explicit discard decision issues no delayed search and keeps a retry path',async()=>{
  const h=harness();try {
    h.editor.open();h.input('address-query','취소 확인 대기');h.$('address-cancel').fire('click');
    await new Promise(resolve=>setTimeout(resolve,325));
    assert.equal(h.searches.length,0);assert.equal(h.editor.isOpen,true);assert.equal(h.$('address-query').value,'취소 확인 대기');assert.equal(h.$('address-retry').hidden,false);assert.equal(h.commits.length,0);
    h.$('address-retry').fire('click');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.searches.length,1);assert.equal(h.searches[0][0],'취소 확인 대기');
  } finally {h.cleanup();}
});

test('C54-02 DOM MOCK: restored Kakao selection opens without queries and confirms only address fields once',()=>{
 const address={...selected(),addressProvider:'KAKAO',providerId:'KAKAO:v1:'+'a'.repeat(64)};
 const h=harness({address});try {
  const parent=structuredClone(h.parent);h.editor.open();assert.equal(h.searches.length,0);assert.equal(h.$('address-query').value,address.road);
  h.input('address-dropoff','공통 출입문 옆');h.$('address-confirm').fire('click');h.$('address-confirm').fire('click');
  assert.equal(h.searches.length,0);assert.equal(h.commits.length,1);assert.equal(h.commits[0].address.addressProvider,'KAKAO');assert.equal(h.commits[0].address.postal,'08843');assert.equal(h.commits[0].address.dropoff,'공통 출입문 옆');assert.deepEqual(h.parent,parent);
 } finally {h.cleanup();}
});
