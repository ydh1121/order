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
function element(){const classes=new Set(),listeners=new Map(),attrs=new Map();return {style:style(),dataset:{},isConnected:true,tabIndex:0,setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k)??null,
 classList:{contains:k=>classes.has(k),add:(...names)=>names.forEach(k=>classes.add(k)),remove:(...names)=>names.forEach(k=>classes.delete(k)),toggle:(k,b)=>b?classes.add(k):classes.delete(k)},
 addEventListener:(k,fn)=>{const list=listeners.get(k)||[];list.push(fn);listeners.set(k,list);},
 fire(k,e={}){for(const f of listeners.get(k)||[]){f(e);if(e.immediateStopped)break;}},getClientRects:()=>[{}],matches:()=>false,closest:()=>null,
 hasAttribute:()=>true,contains:()=>false};}
function harness({reduced=false,mobile=false,withHistory=false}={}){
 const root=element(),body=element(),frames=new Map(),animations=[],scrolls=[];let frameId=0;
 const document=Object.assign(element(),{documentElement:root,body,activeElement:null}),created=[];
 const window=element();window.innerWidth=1440;body.getBoundingClientRect=()=>({width:1410});window.visualViewport=Object.assign(element(),{height:800,offsetTop:0});
 const historyStack=[{state:{route:'form',untouched:'keep'},url:'https://order.test/#/form'}],historyQueue=[];let historyIndex=0,historyBacks=0;
 if(withHistory){window.location={href:historyStack[0].url};window.history={get state(){return historyStack[historyIndex].state;},pushState(state,unused,url){historyStack.splice(++historyIndex);historyStack.push({state:structuredClone(state),url});window.location.href=url;},replaceState(state,unused,url){historyStack[historyIndex]={state:structuredClone(state),url};window.location.href=url;},back(){historyBacks++;historyQueue.push(-1);},forward(){historyQueue.push(1);}};}
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
 document.createElement=()=>{const d=dialog(''),keep=focus(element()),discard=focus(element());d.children=[keep,discard];d.querySelector=selector=>selector==='[data-discard-continue]'?keep:selector==='[data-discard-confirm]'?discard:d.panel;return d;};
 body.append=d=>{created.push(d);d.isConnected=true;};
 vm.runInNewContext(script,context);
 return {shell:window.OrderModalShell,root,body,window,document,context,dialog,focus,animations,scrolls,historyStack,get discardDialog(){return created.find(d=>d.id==='order-discard-dialog');},get historyIndex(){return historyIndex;},get historyBacks(){return historyBacks;},stepHistory(){const move=historyQueue.shift();if(move===undefined)return false;const next=historyIndex+move;if(next<0||next>=historyStack.length)return false;historyIndex=next;window.location.href=historyStack[next].url;window.fire('popstate',{state:historyStack[next].state,stopImmediatePropagation(){this.immediateStopped=true;}});return true;},flush(){const pending=[...frames.values()];frames.clear();pending.forEach(f=>f());}};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('C26-01 nested native backdrop retains page geometry and lock until final top-layer close',()=>{
 const h=harness({reduced:true}),launch=h.focus(element()),parent=h.dialog('parent'),trigger=h.focus(element()),child=h.dialog('child');parent.children=[trigger];
 h.root.style.setProperty('--ui-modal-page-inline','original','important');
 h.shell.open(parent,{variant:'editor',returnFocus:launch});assert.equal(h.root.style.getPropertyValue('--ui-modal-page-inline'),'30px');
 h.shell.open(child,{variant:'editor',returnFocus:trigger});assert.deepEqual([...h.shell.activeIds],['parent','child']);assert.equal(h.root.style.getPropertyValue('--ui-modal-page-inline'),'30px');
 assert.equal(h.root.style.getPropertyValue('--ui-modal-gutter'),'','native backdrop is the sole shade; no separately composited canvas colour');
 h.shell.close(child);h.flush();assert.equal(h.root.classList.contains('ui-modal-locked'),true);assert.equal(h.body.classList.contains('ui-modal-body-locked'),true);assert.equal(h.document.activeElement,trigger);assert.equal(h.scrolls.length,0);
 h.shell.close(parent);h.flush();assert.equal(h.root.classList.contains('ui-modal-locked'),false);assert.equal(h.body.classList.contains('ui-modal-body-locked'),false);assert.equal(h.root.style.getPropertyValue('--ui-modal-page-inline'),'original');assert.equal(h.root.style.getPropertyPriority('--ui-modal-page-inline'),'important');assert.equal(h.document.activeElement,launch);assert.equal(h.scrolls.length,1);assert.deepEqual({...h.scrolls[0]},{left:4,top:360,behavior:'instant'});
});

test('C26-01 desktop and mobile close wait for dialog AND native backdrop motion before unlocking',async()=>{
 for(const mobile of [false,true]){
  const h=harness({mobile}),p=h.dialog('parent'),c=h.dialog('child');h.shell.open(p);h.shell.open(c);h.shell.close(c);
  const [surface,backdrop]=h.animations.slice(-2);assert.equal(backdrop.options.pseudoElement,'::backdrop');assert.equal(surface.options.duration,150);assert.equal(backdrop.options.duration,150);
  surface.finish();await tick();assert.equal(c.open,true);assert.equal(h.root.classList.contains('ui-modal-locked'),true);assert.equal(h.scrolls.length,0);
  backdrop.finish();await tick();assert.equal(c.open,false);assert.equal(p.open,true);assert.equal(h.root.classList.contains('ui-modal-locked'),true);
  h.shell.close(p);const final=h.animations.slice(-2);final[1].finish();await tick();assert.equal(p.open,true);final[0].finish();await tick();assert.equal(p.open,false);assert.equal(h.root.classList.contains('ui-modal-locked'),false);assert.equal(h.scrolls.length,1);
 }
});

test('C26-02 modal geometry role is independent of content motion variant',()=>{
 const h=harness({reduced:true}),compact=h.dialog('confirm'),selection=h.dialog('selection'),editor=h.dialog('editor');compact.classList.add('ui-compact-confirm');
 h.shell.open(compact);h.shell.open(selection,{variant:'copy'});h.shell.open(editor,{variant:'compact',role:'editor'});
 assert.equal(compact.dataset.modalRole,'confirm');assert.equal(selection.dataset.modalRole,'selection');assert.equal(editor.dataset.modalRole,'editor');
});

test('A07 native cancel and backdrop are consumed only by top modal',()=>{
 const h=harness({reduced:true}),parent=h.dialog('parent'),child=h.dialog('child');let p=0,c=0,prevent=0,stop=0;
 h.shell.bind(parent,()=>p++);h.shell.bind(child,()=>c++);h.shell.open(parent);h.shell.open(child);
 const event={preventDefault(){prevent++;},stopPropagation(){stop++;}};parent.fire('cancel',event);child.fire('cancel',event);
 parent.fire('click',{target:parent,clientX:0,clientY:0});child.fire('click',{target:child,clientX:0,clientY:0});
 // A standalone click has no safe outside pointer origin; native cancel still
 // reaches only the top dialog. Full pointer gestures are covered below.
 assert.equal(p,0);assert.equal(c,1);assert.equal(prevent,2);assert.equal(stop,2);
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

test('A05 viewport shrink and content animation reveal focused control inside child scroll only',async()=>{
 const h=harness(),parent=h.dialog('parent'),d=h.dialog('child',200),input=h.focus(element());h.shell.open(parent,{variant:'editor'});h.shell.open(d,{variant:'editor'});
 d.querySelector=selector=>selector.endsWith('.q4-regular-scroll')?d.scroll:d.panel;d.scroll.contains=el=>el===input;d.scroll.getBoundingClientRect=()=>({top:100,bottom:300});d.scroll.scrollHeight=1000;d.scroll.clientHeight=200;d.scroll.scrollTop=40;input.getBoundingClientRect=()=>({top:340,bottom:380});h.document.activeElement=input;
 h.window.visualViewport.height=400;h.window.visualViewport.fire('resize');h.flush();assert.equal(d.scroll.scrollTop,120);assert.equal(parent.scroll.scrollTop,0);assert.equal(h.scrolls.length,0);assert.equal(h.document.activeElement,input);
 d.scroll.scrollTop=40;h.shell.resize(d,()=>{d.panel.natural=250;});const motion=h.animations.at(-1);assert.equal(d.scroll.scrollTop,40);motion.finish();await tick();assert.equal(d.scroll.scrollTop,120);assert.equal(h.document.activeElement,input);assert.equal(h.scrolls.length,0);
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

test('A07 real history structure reserves child and parent Back without replacing original form state',()=>{
 const h=harness({reduced:true,withHistory:true}),p=h.dialog('parent'),c=h.dialog('child');let parentCancels=0,childCancels=0,routeEvents=0;
 h.shell.bind(p,reason=>{assert.equal(reason,'back');parentCancels++;h.shell.close(p);});h.shell.bind(c,reason=>{assert.equal(reason,'back');childCancels++;h.shell.close(c);});
 h.window.addEventListener('popstate',()=>routeEvents++);h.shell.open(p,{history:true});h.shell.open(c,{history:true});assert.equal(h.historyStack.length,3);
 h.window.history.back();h.stepHistory();assert.equal(c.open,false);assert.equal(p.open,true);assert.equal(childCancels,1);assert.equal(parentCancels,0);assert.equal(h.historyIndex,1);
 h.window.history.back();h.stepHistory();assert.equal(p.open,false);assert.equal(parentCancels,1);assert.equal(h.historyIndex,0);assert.equal(routeEvents,0);assert.deepEqual(h.window.history.state,{route:'form',untouched:'keep'});assert.equal(h.window.location.href,'https://order.test/#/form');assert.equal(h.historyBacks,2);
});

test('A07 button close then rapid reopen defers new history token until old Back settles',()=>{
 const h=harness({reduced:true,withHistory:true}),p=h.dialog('parent'),c=h.dialog('child');let cancels=0;h.shell.bind(c,()=>{cancels++;h.shell.close(c);});
 h.shell.open(p,{history:true});h.shell.open(c,{history:true});const originalToken=h.window.history.state.__orderModal0519;
 h.shell.close(c);h.shell.open(c,{history:true});assert.equal(h.window.history.state.__orderModal0519,originalToken);h.stepHistory();
 assert.equal(c.open,true);assert.equal(p.open,true);assert.equal(cancels,0);assert.notEqual(h.window.history.state.__orderModal0519,originalToken);assert.equal(h.historyIndex,2);
 h.window.history.back();h.stepHistory();assert.equal(c.open,false);assert.equal(p.open,true);assert.equal(cancels,1);assert.equal(h.historyIndex,1);
});

test('A07 simultaneous child/parent close serializes two owned traversals and preserves queued new parent',()=>{
 const h=harness({reduced:true,withHistory:true}),p=h.dialog('parent'),c=h.dialog('child');h.shell.open(p,{history:true});h.shell.open(c,{history:true});
 h.shell.close(c);h.shell.close(p);h.shell.open(p,{history:true});assert.equal(h.historyBacks,1);h.stepHistory();assert.equal(h.historyBacks,2);h.stepHistory();
 assert.equal(p.open,true);assert.equal(c.open,false);assert.equal(h.historyIndex,1);assert.equal(h.historyStack.length,2);assert.equal(h.stepHistory(),false);
 h.shell.close(p);h.stepHistory();assert.equal(h.historyIndex,0);assert.deepEqual(h.window.history.state,{route:'form',untouched:'keep'});
});

test('A07 Forward into discarded history cannot resurrect draft or strand parent history',()=>{
 const h=harness({reduced:true,withHistory:true}),p=h.dialog('parent'),c=h.dialog('child');h.shell.open(p,{history:true});h.shell.open(c,{history:true});h.shell.close(c);h.stepHistory();
 h.window.history.forward();h.stepHistory();assert.equal(c.open,false);assert.equal(p.open,true);h.stepHistory();assert.equal(h.historyIndex,1);
 h.shell.close(p);h.stepHistory();assert.equal(h.historyIndex,0);assert.equal(h.stepHistory(),false);assert.deepEqual(h.window.history.state,{route:'form',untouched:'keep'});
});

test('A07 non-opted dialogs do not write history and cleanup never traverses an unrelated URL',()=>{
 const h=harness({reduced:true,withHistory:true}),p=h.dialog('parent');h.shell.open(p);h.shell.close(p);assert.equal(h.historyStack.length,1);assert.equal(h.historyBacks,0);
 h.shell.open(p,{history:true});h.window.history.pushState({route:'other'},'','https://order.test/#/other');h.shell.close(p);assert.equal(h.historyBacks,0);assert.equal(h.window.location.href,'https://order.test/#/other');assert.deepEqual(h.window.history.state,{route:'other'});
});

const pointer=(target,x,y)=>({target,clientX:x,clientY:y,pointerId:1,detail:1,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediateStopped=true;}});
const settleHistory=h=>{for(let i=0;i<12&&h.stepHistory();i++);};

test('R01 editor backdrop and both drag directions preserve draft without a discard prompt',()=>{
 const h=harness({reduced:true}),d=h.dialog('editor');let disposals=0,dirty=true;
 h.shell.bind(d,()=>disposals++,{editable:true,isDirty:()=>dirty});h.shell.open(d);
 for(const [start,end] of [[[0,0],[0,0]],[[200,200],[0,0]],[[0,0],[200,200]]]){
  h.document.fire('pointerdown',pointer(d,...start));h.document.fire('pointerup',pointer(d,...end));d.fire('click',pointer(d,...end));
 }
 dirty=false;h.document.fire('pointerdown',pointer(d,0,0));h.document.fire('pointerup',pointer(d,0,0));d.fire('click',pointer(d,0,0));
 assert.equal(disposals,0);assert.equal(d.open,true);assert.equal(h.discardDialog,undefined);
});

test('R01 explicit dirty exit offers one confirmation; continue retains input/focus and discard disposes once',()=>{
 const h=harness({reduced:true,withHistory:true}),d=h.dialog('editor'),input=h.focus(element());d.children=[input];input.value='unsaved';let disposals=0;
 h.shell.bind(d,()=>{disposals++;h.shell.close(d);},{editable:true,isDirty:()=>input.value==='unsaved'});h.shell.open(d,{history:true});input.focus();
 assert.equal(h.shell.requestClose(d,'close'),false);const prompt=h.discardDialog;assert.equal(prompt.open,true);assert.equal(d.open,true);assert.equal(disposals,0);
 h.shell.requestClose(d,'close');assert.deepEqual([...h.shell.activeIds],['editor','order-discard-dialog']);
 prompt.querySelector('[data-discard-continue]').fire('click');settleHistory(h);h.flush();assert.equal(d.open,true);assert.equal(disposals,0);assert.equal(input.value,'unsaved');assert.equal(h.document.activeElement,input);
 h.shell.requestClose(d,'cancel');prompt.querySelector('[data-discard-confirm]').fire('click');prompt.querySelector('[data-discard-confirm]').fire('click');settleHistory(h);
 assert.equal(disposals,1);assert.equal(d.open,false);assert.equal(prompt.open,false);assert.equal(h.historyIndex,0);
});

test('R02 dirty child Back is reversible and never cascades to parent; prompt Back means continue',()=>{
 const h=harness({reduced:true,withHistory:true}),p=h.dialog('parent'),c=h.dialog('child');let parentDiscards=0,childDiscards=0;
 h.shell.bind(p,()=>{parentDiscards++;h.shell.close(p);},{editable:true,isDirty:()=>true});h.shell.bind(c,()=>{childDiscards++;h.shell.close(c);},{editable:true,isDirty:()=>true});h.shell.open(p,{history:true});h.shell.open(c,{history:true});
 h.window.history.back();h.stepHistory();assert.equal(h.discardDialog.open,true);assert.equal(c.open,true);assert.equal(p.open,true);assert.equal(childDiscards,0);
 h.window.history.back();settleHistory(h);assert.equal(h.discardDialog.open,false);assert.equal(c.open,true);assert.equal(p.open,true);
 h.window.history.back();h.stepHistory();h.discardDialog.querySelector('[data-discard-confirm]').fire('click');settleHistory(h);
 assert.equal(childDiscards,1);assert.equal(parentDiscards,0);assert.equal(c.open,false);assert.equal(p.open,true);assert.equal(h.historyIndex,1);
});

test('R02 exit intent invalidates a pending transaction before discard choice without clearing draft',()=>{
 const h=harness({reduced:true}),d=h.dialog('editor');let revision=4,draft='modified',commits=0;
 const reviewedRevision=revision,canCommit=()=>revision===reviewedRevision;
 h.shell.bind(d,()=>{draft='';h.shell.close(d);},{editable:true,isDirty:()=>true,onExitIntent:()=>revision++});h.shell.open(d);
 h.shell.requestClose(d,'escape');if(canCommit())commits++;assert.equal(commits,0);assert.equal(draft,'modified');
 h.discardDialog.querySelector('[data-discard-continue]').fire('click');assert.equal(draft,'modified');assert.equal(d.open,true);
});

test('R02 save/forced cleanup closes pending guard and stale confirmation cannot close a reopened session',()=>{
 const h=harness({reduced:true,withHistory:true}),d=h.dialog('editor');let disposals=0;
 h.shell.bind(d,()=>{disposals++;h.shell.close(d);},{editable:true,isDirty:()=>true});h.shell.open(d,{history:true});h.shell.requestClose(d,'close');const prompt=h.discardDialog;
 h.shell.close(d);h.shell.open(d,{history:true});settleHistory(h);prompt.querySelector('[data-discard-confirm]').fire('click');assert.equal(disposals,0);assert.equal(d.open,true);assert.equal(prompt.open,false);assert.equal(h.shell.inspect().pendingDiscard,null);
});

test('R01 pointer gesture from a closed child cannot click through to parent or page',()=>{
 const h=harness({reduced:true}),p=h.dialog('parent'),c=h.dialog('child');h.shell.open(p);h.shell.open(c);
 h.document.fire('pointerdown',pointer(c,200,200));h.shell.close(c);const up=pointer(p,200,200);h.document.fire('pointerup',up);const click=pointer(p,200,200);h.document.fire('click',click);assert.equal(up.prevented,true);assert.equal(click.immediateStopped,true);assert.equal(p.open,true);
 const next=pointer(p,200,200);h.document.fire('pointerdown',next);h.document.fire('pointerup',next);h.document.fire('click',next);assert.equal(next.prevented,undefined);
});

test('R02 inner popup dismissal precedes dirty guard and keeps browser history armed',()=>{
 const h=harness({reduced:true,withHistory:true}),d=h.dialog('editor');let inner=true,disposals=0;
 h.shell.bind(d,()=>disposals++,{editable:true,isDirty:()=>true,beforeClose:()=>{if(inner){inner=false;return false;}}});h.shell.open(d,{history:true});
 h.window.history.back();settleHistory(h);assert.equal(inner,false);assert.equal(d.open,true);assert.equal(h.discardDialog,undefined);assert.equal(h.historyIndex,1);
 h.window.history.back();h.stepHistory();assert.equal(h.discardDialog.open,true);assert.equal(disposals,0);
});
