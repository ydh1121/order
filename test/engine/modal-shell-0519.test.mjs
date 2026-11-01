import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';

// Evaluate the production owner with controlled DOM/animation doubles. These
// prove lifecycle and concurrency behavior, not browser geometry or OS painting.
const source=await readFile(new URL('../../web/common-ui.mjs',import.meta.url),'utf8');
const node=parse(source,{ecmaVersion:'latest',sourceType:'module'}).body.find(n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.property?.name==='OrderModalShell');
const script=source.slice(node.start,node.end);
function style(){const values=new Map();return {getPropertyValue:k=>values.get(k)?.[0]||'',getPropertyPriority:k=>values.get(k)?.[1]||'',setProperty:(k,v,p='')=>values.set(k,[v,p]),removeProperty:k=>values.delete(k)};}
function element(){const classes=new Set(),listeners=new Map();return {style:style(),dataset:{},isConnected:true,tabIndex:0,
 classList:{contains:k=>classes.has(k),add:(...names)=>names.forEach(k=>classes.add(k)),remove:(...names)=>names.forEach(k=>classes.delete(k)),toggle:(k,b)=>b?classes.add(k):classes.delete(k)},
 addEventListener:(k,fn)=>{const list=listeners.get(k)||[];list.push(fn);listeners.set(k,list);},
 fire(k,e={}){for(const f of listeners.get(k)||[])f(e);},getClientRects:()=>[{}],matches:()=>false,closest:()=>null,
 hasAttribute:()=>true,contains:()=>false};}
function harness({reduced=false,mobile=false}={}){
 const root=element(),body=element(),frames=new Map(),animations=[],scrolls=[];let frameId=0;
 const document={documentElement:root,body,activeElement:null};
 const window=element();window.visualViewport=Object.assign(element(),{height:800,offsetTop:0});
 window.scrollTo=value=>scrolls.push(value);
 const context={window,document,innerHeight:800,scrollX:4,scrollY:360,matchMedia:q=>({matches:q.includes('reduced-motion')?reduced:!mobile}),
 requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id),
 getComputedStyle:(el,pseudo)=>({backgroundColor:pseudo?'rgba(17, 30, 46, 0.48)':'rgb(255, 255, 255)',opacity:'1',visibility:'visible',fontSize:'16px',getPropertyValue:k=>({'--ui-motion':'250ms','--ui-ease':'ease-out','--ui-modal-fade-open':'200ms','--ui-modal-fade-close':'150ms','--ui-modal-backdrop':'rgba(17,30,46,.48)'}[k]||el.style.getPropertyValue(k))})};
 function animate(el,keyframes,options){let resolve,reject;const a={el,keyframes,options,cancelled:false,finished:new Promise((yes,no)=>{resolve=yes;reject=no;}),finish(){resolve();},cancel(){a.cancelled=true;reject(new Error('cancelled'));}};animations.push(a);return a;}
 const focus=el=>{el.focus=()=>{document.activeElement=el;};return el;};
 function dialog(id,natural=240){const d=Object.assign(element(),{id,open:false}),panel=element(),scroll=Object.assign(element(),{scrollTop:0});
  panel.natural=natural;panel.querySelector=()=>scroll;panel.getBoundingClientRect=()=>({height:Math.min(parseFloat(panel.style.getPropertyValue('--ui-modal-editor-session-block'))||panel.natural,parseFloat(d.style.getPropertyValue('--ui-modal-max-block'))||Infinity)});panel.animate=(k,o)=>animate(panel,k,o);
  d.panel=panel;d.scroll=scroll;d.children=[];d.querySelector=()=>panel;d.querySelectorAll=()=>d.children;d.contains=el=>d.children.includes(el);d.getBoundingClientRect=()=>({left:100,right:500,top:100,bottom:500});d.animate=(k,o)=>animate(d,k,o);d.showModal=()=>{d.open=true;};d.close=()=>{d.open=false;d.fire('close');};focus(d);return d;
 }
 vm.runInNewContext(script,context);
 return {shell:window.OrderModalShell,root,body,window,document,context,dialog,focus,animations,scrolls,flush(){const pending=[...frames.values()];frames.clear();pending.forEach(f=>f());}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('A06 nested child close preserves parent lock, backdrop color, focus and original scroll until final close',()=>{
 const h=harness({reduced:true}),launch=h.focus(element()),parent=h.dialog('parent'),trigger=h.focus(element()),child=h.dialog('child');parent.children=[trigger];
 h.root.style.setProperty('--ui-modal-gutter','original','important');
 h.shell.open(parent,{variant:'editor',returnFocus:launch});assert.equal(h.root.style.getPropertyValue('--ui-modal-gutter'),'rgb(141,147,155)');
 h.shell.open(child,{variant:'editor',returnFocus:trigger});assert.deepEqual([...h.shell.activeIds],['parent','child']);assert.equal(h.root.style.getPropertyValue('--ui-modal-gutter'),'rgb(81,91,103)');
 h.shell.close(child);h.flush();assert.equal(h.root.classList.contains('ui-modal-locked'),true);assert.equal(h.body.classList.contains('ui-modal-body-locked'),true);assert.equal(h.root.style.getPropertyValue('--ui-modal-gutter'),'rgb(141,147,155)');assert.equal(h.document.activeElement,trigger);assert.equal(h.scrolls.length,0);
 h.shell.close(parent);h.flush();assert.equal(h.root.classList.contains('ui-modal-locked'),false);assert.equal(h.body.classList.contains('ui-modal-body-locked'),false);assert.equal(h.root.style.getPropertyValue('--ui-modal-gutter'),'original');assert.equal(h.root.style.getPropertyPriority('--ui-modal-gutter'),'important');assert.equal(h.document.activeElement,launch);assert.equal(h.scrolls.length,1);assert.deepEqual({...h.scrolls[0]},{left:4,top:360,behavior:'instant'});
});

test('A07 native cancel and backdrop are consumed only by top modal',()=>{
 const h=harness({reduced:true}),parent=h.dialog('parent'),child=h.dialog('child');let p=0,c=0,prevent=0,stop=0;
 h.shell.bind(parent,()=>p++);h.shell.bind(child,()=>c++);h.shell.open(parent);h.shell.open(child);
 const event={preventDefault(){prevent++;},stopPropagation(){stop++;}};parent.fire('cancel',event);child.fire('cancel',event);
 parent.fire('click',{target:parent,clientX:0,clientY:0});child.fire('click',{target:child,clientX:0,clientY:0});
 assert.equal(p,0);assert.equal(c,2);assert.equal(prevent,2);assert.equal(stop,2);
});

test('A05 content resize supersedes old animation, preserves scroll, and stale completion cannot clear new motion',async()=>{
 const h=harness(),d=h.dialog('address',200);h.shell.open(d,{variant:'editor',contentSize:'dynamic'});d.scroll.scrollTop=30;
 assert.equal(h.shell.resize(d,()=>{d.panel.natural=450;}),true);const first=h.animations.at(-1);assert.equal(first.el,d.panel);assert.equal(d.dataset.modalResizing,'true');assert.equal(d.scroll.scrollTop,30);
 h.shell.resize(d,()=>{d.panel.natural=300;});const second=h.animations.at(-1);assert.equal(first.cancelled,true);first.finish();await tick();assert.equal(d.dataset.modalResizing,'true');
 second.finish();await tick();assert.equal(d.dataset.modalResizing,undefined);assert.equal(d.panel.style.getPropertyValue('--ui-modal-editor-session-block'),'300px');
});

test('A05 reduced motion applies final height without creating an animation',()=>{
 const h=harness({reduced:true}),d=h.dialog('address',180);h.shell.open(d,{variant:'editor',contentSize:'dynamic'});h.shell.resize(d,()=>{d.panel.natural=500;});assert.equal(d.panel.style.getPropertyValue('--ui-modal-editor-session-block'),'500px');assert.equal(h.animations.length,0);assert.equal(d.dataset.modalResizing,undefined);
});

test('A05 viewport/keyboard resize uses one shared frame, caps panel and preserves scroll',()=>{
 const h=harness({reduced:true}),d=h.dialog('address',600);h.shell.open(d,{variant:'editor',contentSize:'dynamic'});d.scroll.scrollTop=22;
 h.window.visualViewport.height=320;h.window.visualViewport.offsetTop=60;h.window.visualViewport.fire('resize');h.window.visualViewport.fire('scroll');h.flush();
 assert.equal(d.style.getPropertyValue('--ui-modal-max-block'),'294.40000000000003px');assert.equal(d.style.getPropertyValue('--ui-modal-viewport-top'),'60px');assert.equal(d.style.getPropertyValue('--ui-modal-viewport-bottom'),'420px');assert.equal(d.scroll.scrollTop,22);assert.ok(d.panel.getBoundingClientRect().height<=320);
});

test('A05 close during content resize cancels it; reopen cannot be closed by old mobile completion',async()=>{
 const h=harness({mobile:true}),d=h.dialog('address',200);h.shell.open(d,{variant:'editor'});h.shell.resize(d,()=>{d.panel.natural=400;});const size=h.animations.at(-1);
 h.shell.close(d);const closing=h.animations.at(-1);assert.equal(size.cancelled,true);h.shell.open(d,{variant:'editor'});closing.finish();await tick();assert.equal(d.open,true);assert.deepEqual([...h.shell.activeIds],['address']);assert.equal(d.classList.contains('is-closing'),false);
});

test('A07 inactive/closing modal rejects mutation and cannot revive stale address content',()=>{
 const h=harness({mobile:true}),d=h.dialog('address');let patches=0;
 assert.equal(h.shell.resize(d,()=>patches++),false);h.shell.open(d,{variant:'editor'});h.shell.close(d);assert.equal(h.shell.resize(d,()=>patches++),false);assert.equal(patches,0);
});

test('A10 Tab wraps only inside active child, respecting prevented input events',()=>{
 const h=harness({reduced:true}),parent=h.dialog('parent'),child=h.dialog('child'),a=h.focus(element()),b=h.focus(element());child.children=[a,b];h.shell.open(parent);h.shell.open(child);h.document.activeElement=b;let prevented=0;
 const event={key:'Tab',shiftKey:false,defaultPrevented:false,preventDefault(){prevented++;}};parent.fire('keydown',event);assert.equal(prevented,0);child.fire('keydown',event);assert.equal(h.document.activeElement,a);assert.equal(prevented,1);
 h.document.activeElement=b;child.fire('keydown',{...event,defaultPrevented:true});assert.equal(h.document.activeElement,b);assert.equal(prevented,1);
});
