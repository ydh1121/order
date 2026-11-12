import test from 'node:test';
import assert from 'node:assert/strict';
import {createSpinningCounter} from '../../web/spinning-counter.mjs';

// Deliberately small DOM + controllable clock. Expected results below are
// business-visible strings/cancellation/lifecycle facts, not copies of easing.
class Element {
  constructor(doc,tag='span'){this.ownerDocument=doc;this.tagName=tag;this.children=[];this.style={};this.dataset={};this.attributes={};this.isConnected=true;this.hidden=false;this._text='';this.classes=new Set();this.classList={add:name=>this.classes.add(name)};}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
  appendChild(child){this.children.push(child);child.parentNode=this;return child;}
  replaceChildren(...children){this._text='';this.children=[];for(const child of children)this.appendChild(child);}
  setAttribute(name,value){this.attributes[name]=String(value);}
  removeAttribute(name){delete this.attributes[name];}
  getAttribute(name){return this.attributes[name]??null;}
  getBoundingClientRect(){return {width:0};}
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.isConnected=false;}
}
function harness({reduced=false}={}) {
  let time=0,next=1;const pending=new Map(),oldFrames=[],cancelled=[],motionListeners=new Set(),pageListeners=new Map();
  const media={matches:reduced,addEventListener:(type,fn)=>motionListeners.add(fn),removeEventListener:(type,fn)=>motionListeners.delete(fn)};
  const view={performance:{now:()=>time},requestAnimationFrame:fn=>{const id=next++;pending.set(id,fn);oldFrames.push(fn);return id;},cancelAnimationFrame:id=>{cancelled.push(id);pending.delete(id);},
    matchMedia:()=>media,getComputedStyle:()=>({getPropertyValue:()=>'',fontSize:'24px'}),addEventListener:(type,fn)=>pageListeners.set(type,fn),removeEventListener:(type,fn)=>{if(pageListeners.get(type)===fn)pageListeners.delete(type);}};
  const doc={defaultView:view,createElement:tag=>new Element(doc,tag)};doc.documentElement=new Element(doc,'html');
  const output=new Element(doc,'output'),counter=createSpinningCounter(output);
  const frame=ms=>{time+=ms;const callbacks=[...pending.values()];pending.clear();for(const fn of callbacks)fn(time);};
  return {output,counter,media,pending,cancelled,oldFrames,motionListeners,pageListeners,frame,
    flush(){for(let i=0;i<700&&pending.size;i++)frame(16);assert.equal(pending.size,0,'no animation remains beyond bounded source rhythm');},
    reduce(value){media.matches=value;for(const fn of motionListeners)fn({matches:value});},
    semantic:()=>output.children.find(c=>c.className==='order-counter-value'),reel:()=>output.children.find(c=>c.className==='t-reel')};
}
const cols=h=>h.reel().children.filter(c=>c.className==='t-reel-col');
const visibleDigits=h=>cols(h).map(col=>col.children.filter(c=>c.className==='t-reel-digit'&&c.style.opacity==='1').map(c=>c.textContent).join('')).join('');

test('C58-counter initial hidden then exact semantic target is immediate with decorative reels',()=>{
  const h=harness();assert.equal(h.output.hidden,true);assert.equal(h.counter.inspect().state,'hidden');
  assert.equal(h.counter.set('2,020,000원'),true);assert.equal(h.output.hidden,false);
  assert.equal(h.semantic().textContent,'2,020,000원');assert.equal(h.reel().getAttribute('aria-hidden'),'true');assert.equal(h.output.getAttribute('aria-label'),null);
  assert.equal(h.counter.inspect().state,'rolling');assert.equal(h.pending.size,1);
  h.flush();assert.equal(visibleDigits(h),'2020000');assert.equal(h.counter.inspect().state,'settled');
  assert.deepEqual(h.reel().children.filter(c=>c.className==='t-reel-sep').map(c=>c.textContent),[',',',','원']);
});
test('C58-counter arbitrary exact integer length never rounds through Number',()=>{
  const h=harness({reduced:true}),expected='90,071,992,547,409,931,234,567,890,123,457원';
  h.counter.set(expected);assert.equal(h.semantic().textContent,expected);assert.equal(h.counter.inspect().value,expected);
  assert.equal(visibleDigits(h),'90071992547409931234567890123457');assert.equal(h.pending.size,0);
});
test('C58-counter unchanged target does not restart initial roll or replace children',()=>{
  const h=harness();h.counter.set('1,234원');const generation=h.counter.inspect().generation,nodes=[...h.reel().children],frameCount=h.oldFrames.length;
  h.counter.set('1,234원');assert.equal(h.counter.inspect().generation,generation);assert.deepEqual(h.reel().children,nodes);assert.equal(h.oldFrames.length,frameCount);
});
test('C58-counter unchanged digit positions stay still while only target changes roll',()=>{
  const h=harness();h.counter.set('1,234원');h.flush();const before=cols(h);
  h.counter.set('1,235원');const after=cols(h);assert.deepEqual(after,before,'right-aligned digit columns are reused');
  assert.deepEqual(after.map(c=>c.dataset.counterMoving),['false','false','false','true']);
  h.frame(400);assert.equal(after[0].children[2].style.transform,'none');h.flush();assert.equal(visibleDigits(h),'1235');
});
test('C58-counter changed length preserves right-aligned prior digits and stationary separators',()=>{
  const h=harness();h.counter.set('999원');h.flush();const old=cols(h);
  h.counter.set('1,999원');const next=cols(h);assert.deepEqual(next.slice(1),old);assert.equal(next[0].dataset.counterFrom,'0');
  assert.deepEqual(next.map(c=>c.dataset.counterMoving),['true','false','false','false']);h.flush();assert.equal(visibleDigits(h),'1999');
});
test('C58-counter rapid retarget invalidates a delivered late callback and settles latest only',()=>{
  const h=harness();h.counter.set('1,234원');const stale=h.oldFrames[0];h.frame(80);
  h.counter.set('9,876원');const state=h.counter.inspect(),before=h.semantic().textContent;stale();
  assert.equal(h.semantic().textContent,before);assert.equal(h.counter.inspect().generation,state.generation);assert.ok(h.cancelled.length);
  h.flush();assert.equal(h.semantic().textContent,'9,876원');assert.equal(visibleDigits(h),'9876');
});
test('C58-counter invalid, zero, fractional and incomplete inputs hide rather than animate zero',()=>{
  for(const invalid of [null,undefined,'','0','0원','0,000원','01원','605/3원','1,20원','1.2원','NaN','입력 필요',1234]){
    const h=harness();h.counter.set('1,234원');const stale=h.oldFrames[0];assert.equal(h.counter.set(invalid),false);
    assert.equal(h.output.hidden,true);assert.equal(h.semantic().textContent,'');assert.equal(h.reel().children.length,0);assert.equal(h.pending.size,0);stale();assert.equal(h.semantic().textContent,'');
  }
});
test('C58-counter runtime reduced motion cancels to latest and future values remain immediate',()=>{
  const h=harness();h.counter.set('6,050원');h.frame(160);const stale=h.oldFrames[0];h.reduce(true);
  assert.equal(h.pending.size,0);assert.equal(h.counter.inspect().state,'settled');assert.equal(visibleDigits(h),'6050');stale();assert.equal(visibleDigits(h),'6050');
  h.counter.set('6,060원');assert.equal(visibleDigits(h),'6060');assert.equal(h.pending.size,0);h.reduce(false);assert.equal(h.pending.size,0,'preference restoration does not replay settled amount');
});
test('C58-counter route settle/page hide cancels to exact target without save callbacks',()=>{
  const h=harness();h.counter.set('5,000원');const stale=h.oldFrames[0];h.pageListeners.get('pagehide')();
  assert.equal(h.pending.size,0);assert.equal(visibleDigits(h),'5000');stale();assert.equal(visibleDigits(h),'5000');
  const generation=h.counter.inspect().generation;h.counter.set('5,000원');assert.equal(h.counter.inspect().generation,generation);
});
test('C58-counter destroy and duplicate binding release listeners and reject stale target writes',()=>{
  const h=harness();assert.equal(createSpinningCounter(h.output),h.counter);assert.equal(h.motionListeners.size,1);h.counter.set('8,888원');const stale=h.oldFrames[0];
  h.counter.destroy();assert.equal(h.pending.size,0);assert.equal(h.motionListeners.size,0);assert.equal(h.pageListeners.size,0);assert.equal(h.counter.set('9,999원'),false);
  stale();assert.equal(h.semantic().textContent,'8,888원');assert.equal(visibleDigits(h),'8888');assert.equal(h.counter.inspect().state,'destroyed');
});
test('C58-counter removed output cannot be painted by a pending frame',()=>{
  const h=harness();h.counter.set('1,000원');h.output.isConnected=false;const before=JSON.stringify(cols(h).map(c=>c.children.map(x=>x.style)));
  h.frame(100);assert.equal(h.pending.size,0);assert.equal(JSON.stringify(cols(h).map(c=>c.children.map(x=>x.style))),before);h.counter.destroy();
});
