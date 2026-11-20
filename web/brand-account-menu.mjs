/**
 * Shared ORDER brand/account navigation. The caller owns authentication, data and
 * writes; this module only presents the supplied account and panels.
 *
 * Sources: Figma 2009012434 / 2009013511 / 2009173058 / 2009016192;
 * QA R2 140c60ec-278f-43f3-8476-98aa7c57cb03 and fad85e4c-6c98-464d-bab2-90f4993fbe84.
 * The supplied CODE1 paths are retained. Point-to-row travel follows the archived
 * 12-second kebab video, SHA256 9dbb282f3d4c950ba7e53e40bcc78253a14e81b5fd5370730b5e5158e58736d0.
 * Account panel lifecycle/keyboard handling: KokonutUI Account Menu / Stack Panel
 * (Dorian Baffier, MIT). CSS recipes below: Transitions.dev page-side-by-side,
 * card-resize, notification-badge and the exact dropdown-menu-morph recipe
 * (Transitions.dev commit add5b467b13be16664d10fd888330ce2f3288b07).
 * No sample accounts or transport live here.
 */
export function mountBrandAccountMenu(brand, initial = {}) {
  if (!brand?.ownerDocument) throw new TypeError('Pass the existing ORDER brand element.');
  if (brand.__orderAccountMenu) { brand.__orderAccountMenu.update(initial); return brand.__orderAccountMenu; }
  if (brand.matches('button,a')) throw new TypeError('The brand container must not itself be an interactive element.');
  const doc=brand.ownerDocument, win=doc.defaultView, options={...initial};
  const svg=brand.querySelector('svg.brand-mark,svg[data-code1-jelly],svg');
  const paths=svg&&[...svg.querySelectorAll('g > path')];
  if (!svg || paths.length!==3) throw new TypeError('The original three-path CODE1 SVG is required.');
  paths.forEach((path,index)=>path.setAttribute('data-jelly',String(index)));
  const controller=new win.AbortController(), signal=controller.signal;
  const on=(target,event,handler,settings={})=>target.addEventListener(event,handler,{...settings,signal});
  const preference=win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced=()=>options.reducedMotion===true||(typeof options.reducedMotion==='function'&&options.reducedMotion()===true)||preference?.matches===true;
  const original={parent:svg.parentNode,next:svg.nextSibling,role:brand.getAttribute('role'),tabindex:brand.getAttribute('tabindex'),label:brand.getAttribute('aria-label')};
  // Figma measures the visible three-circle group, not the padded SVG canvas.
  // Preserve that original canvas and its paths; offset its padding inside the
  // hit area so a right-aligned trigger also right-aligns the actual logo.
  const centers=paths.map(path=>/^translate\(\s*([-+.\d]+)[,\s]+([-+.\d]+)\s*\)$/.exec(path.parentNode.getAttribute('transform')||''));
  const native=centers.every(Boolean)?{x:Math.min(...centers.map(p=>Number(p[1])))-100,y:Math.min(...centers.map(p=>Number(p[2])))-100,width:Math.max(...centers.map(p=>Number(p[1])))-Math.min(...centers.map(p=>Number(p[1])))+200,height:Math.max(...centers.map(p=>Number(p[2])))-Math.min(...centers.map(p=>Number(p[2])))+200}:{x:0,y:0,width:500.045,height:200};
  const viewBox=(svg.getAttribute('viewBox')||'0 0 500.045 200').trim().split(/[\s,]+/).map(Number);
  if(viewBox.length!==4||viewBox.some(value=>!Number.isFinite(value))||viewBox[2]<=0||viewBox[3]<=0)throw new TypeError('The original CODE1 viewBox is required.');
  const markWidth=51.87400817871094,scale=markWidth/native.width,markHeight=native.height*scale;
  const sizing={'--obm-mark-w':markWidth+'px','--obm-mark-h':markHeight+'px','--obm-trigger-w':markWidth+'px','--obm-svg-w':viewBox[2]*scale+'px','--obm-svg-h':viewBox[3]*scale+'px','--obm-svg-x':(viewBox[0]-native.x)*scale+'px','--obm-svg-y':(viewBox[1]-native.y)*scale+'px'};
  original.sizing=Object.fromEntries(Object.keys(sizing).map(key=>[key,brand.style.getPropertyValue(key)]));
  for(const [key,value] of Object.entries(sizing))brand.style.setProperty(key,value);
  const word=options.wordmark||brand.querySelector('.brand-word,[data-brand-word],:scope > span:not(:has(svg)),:scope > strong');
  const period=word?.querySelector('.brand-dot,.ob-period')||brand.querySelector(':scope > .brand-dot');
  const periodOrigin=period?{parent:period.parentNode,next:period.nextSibling}:null;
  if(period&&word&&!word.contains(period))word.append(period);
  const unique='order-account-'+(win.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));
  const create=(tag,className,text)=>{const el=doc.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;};
  const button=(text,id)=>{const el=create('button','obm-row',text);el.type='button';el.dataset.obmItem=id;el.setAttribute('role','menuitem');return el;};
  brand.classList.add('obm-brand');word?.classList.add('obm-wordmark');
  brand.removeAttribute('role');brand.removeAttribute('tabindex');
  const trigger=create('button','obm-trigger');trigger.type='button';trigger.dataset.orderAccountTrigger='';
  trigger.append(svg);brand.append(trigger);
  const panel=create('div','obm-panel ds');panel.id=unique;panel.hidden=true;panel.dataset.orderAccountPanel='';
  panel.setAttribute('popover','manual');panel.setAttribute('role','menu');panel.setAttribute('aria-label','내 계정 메뉴');
  const surface=create('div','obm-surface t-morph');surface.dataset.open='false';
  const contents=create('div','obm-menu t-morph-menu');
  const slider=create('div','obm-stack t-page-slide t-resize');slider.dataset.page='1';contents.append(slider);surface.append(contents);panel.append(surface);doc.body.append(panel);
  trigger.setAttribute('aria-controls',unique);
  // Use the installed semantic tokens. Only absent tokens receive the pinned
  // recipe defaults on this surface; the global token block is never duplicated.
  const defaults={'--page-slide-dur':'250ms','--page-fade-dur':'250ms','--page-slide-distance':'8px','--page-blur':'3px','--page-stagger':'0ms','--page-exit-enabled':'1','--page-slide-ease':'cubic-bezier(0.22, 1, 0.36, 1)','--page-fade-ease':'cubic-bezier(0.22, 1, 0.36, 1)','--resize-dur':'300ms','--resize-ease':'cubic-bezier(0.22, 1, 0.36, 1)','--badge-slide-dur':'260ms','--badge-pop-dur':'500ms','--badge-pop-close-dur':'180ms','--badge-fade-dur':'400ms','--badge-fade-close-dur':'180ms','--badge-blur':'2px','--badge-offset-x':'-8.2px','--badge-offset-y':'12.4px','--badge-slide-ease':'cubic-bezier(0.22, 1, 0.36, 1)','--badge-pop-ease':'cubic-bezier(0.34, 1.36, 0.64, 1)','--badge-close-ease':'cubic-bezier(0.4, 0, 0.2, 1)'};
  Object.assign(defaults,{'--morph-open-dur':'350ms','--morph-close-dur':'250ms','--morph-ease':'cubic-bezier(0.34, 1.25, 0.64, 1)','--morph-close-ease':'cubic-bezier(0.22, 1, 0.36, 1)','--morph-r-closed':'40px','--morph-r-open':'16px','--morph-fade-dur':'200ms','--morph-slide':'40px','--morph-rotate':'45deg','--morph-scale':'0.97','--morph-blur':'2px'});
  Object.assign(defaults,{'--stack-push-dur':'420ms','--stack-height-dur':'380ms','--stack-ease':'cubic-bezier(0.23, 1, 0.32, 1)'});
  const computed=win.getComputedStyle(panel);for(const [key,value] of Object.entries(defaults))if(!computed.getPropertyValue(key).trim())panel.style.setProperty(key,value);
  const time=(name,fallback)=>{const raw=win.getComputedStyle(panel).getPropertyValue(name).trim(),n=Number.parseFloat(raw);return Number.isFinite(n)?n*(raw.endsWith('ms')?1:1000):fallback;};
  const easing=(name,fallback='cubic-bezier(.22,1,.36,1)')=>win.getComputedStyle(panel).getPropertyValue(name).trim()||fallback;
  let player=null;
  const jelly=options.jelly||win.Code1Jelly;
  if(jelly?.mount)player=jelly.mount(svg,{auto:!reduced(),interactive:false,minDelay:10000,maxDelay:15000});
  let authenticated=false,phase='closed',generation=0,navigation=0,arrivalGeneration=0,destroyed=false,paused=false,pageTimer=null,motionTimer=null,arrivalTimer=null,frame=null;
  let animations=[],authAnimations=[],pageAnimations=[],titleFlights=[],flights=[],lastRootRects=[],pages=[],unread=0,arrivalCount=0,swipe=null,blockClickUntil=0;
  const titleById={root:'내 계정',profile:'프로필',notifications:'알림',manage:'관리','profile.account':'계정','profile.personal':'개인정보','profile.connections':'연결된 계정','manage.delivery':'납품일정','manage.payments':'결제 및 정산','manage.quotes':'내 견적','manage.business':'사업장 정보','manage.dashboard':'대시보드'};
  const structure={profile:['profile.account','profile.personal','profile.connections'],manage:['manage.delivery','manage.payments','manage.quotes','manage.business','manage.dashboard']};
  const badges=[];
  function allowed(id){
    if(typeof options.canAccess!=='function')return true;
    const parts=String(id).split('.');
    try{return parts.every((_,index)=>options.canAccess(parts.slice(0,index+1).join('.'))!==false);}catch{return false;}
  }
  function notify(){options.onStateChange?.(inspect());}
  function inspect(){return {authenticated,phase,page:pages.at(-1)?.id||'root',stack:pages.map(page=>page.id),arrival:brand.dataset.accountArrival||'rest',arrivalCount,unread,source:'CODE1',destroyed};}
  function dot(index){
    const copy=doc.createElementNS('http://www.w3.org/2000/svg','svg');copy.setAttribute('viewBox','-100 -100 200 200');copy.setAttribute('aria-hidden','true');copy.classList.add('obm-point');copy.append(paths[index].cloneNode(true));return copy;
  }
  function makePage(id,title=titleById[id]||id){
    const node=create('section','t-page obm-page');node.dataset.obmPage=id;node.setAttribute('aria-label',title);
    const abort=new win.AbortController(),entry={id,node,abort,dispose:null,focus:null};
    if(id==='root'){
      for(const [index,key] of ['profile','notifications','manage'].entries()){
        const item=button('',key),point=create('span','obm-row-point'),label=create('span','obm-label',titleById[key]);point.dataset.obmPoint='';point.append(dot(index));item.append(point,label);
        if(key==='notifications'){
          const badge=create('span','t-badge'),value=create('span','t-badge-dot');badge.dataset.open='false';badge.setAttribute('aria-hidden','true');badge.append(value);item.append(badge);badges.push(badge);
        }
        item.append(create('span','obm-chevron','›'));item.hidden=!allowed(key);item.onclick=()=>push(key,item);node.append(item);
      }
    }else{
      const head=create('header','obm-panel-head'),back=create('button','obm-back','‹');back.type='button';back.setAttribute('aria-label','이전 메뉴');back.dataset.obmBack='';back.onclick=()=>pop();
      const heading=create('h2','obm-heading',title);heading.tabIndex=-1;head.append(back,heading);node.append(head);
      const content=create('div','obm-panel-content');node.append(content);
      if(structure[id])for(const key of structure[id]){const item=button('',key);item.hidden=!allowed(key);item.append(create('span','obm-label',titleById[key]),create('span','obm-chevron','›'));item.onclick=()=>push(key,item);content.append(item);}
      else{
        content.setAttribute('aria-busy','true');
        const pending=create('div','obm-pending');pending.setAttribute('role','status');pending.setAttribute('aria-label','불러오는 중');content.append(pending);
        Promise.resolve().then(()=>{
          if(abort.signal.aborted)return;
          if(typeof options.renderPanel!=='function')throw Error('PANEL_ADAPTER_UNAVAILABLE');
          content.replaceChildren();
          return options.renderPanel({id,container:content,signal:abort.signal,close:()=>close(),back:()=>pop(),push:(nextId,nextTitle)=>push(nextId,null,nextTitle),navigate:target=>options.navigate?.(target),setUnread});
        }).then(dispose=>{
          if(abort.signal.aborted){if(typeof dispose==='function')dispose();return;}
          entry.dispose=typeof dispose==='function'?dispose:null;content.removeAttribute('aria-busy');resize();
        }).catch(error=>{
          if(abort.signal.aborted)return;
          content.removeAttribute('aria-busy');const message=create('p','obm-load-error','정보를 불러오지 못했어요.');message.setAttribute('role','alert');
          const retry=create('button','obm-retry','다시 시도');retry.type='button';retry.onclick=()=>{pop({focus:false,animate:false});push(id);};content.replaceChildren(message,retry);
          options.onError?.({id,error});resize();
        });
      }
    }
    return entry;
  }
  const root=makePage('root');pages=[root];root.node.dataset.pageId='1';slider.append(root.node);
  function measure(node){return Math.max(144,node.scrollHeight||node.getBoundingClientRect().height||144);}
  function resize(){if(phase==='closed'||destroyed)return;const current=pages.at(-1),height=measure(current.node)+'px';if(slider.style.height!==height)slider.style.height=height;position();}
  function position(){
    if(panel.hidden)return;const r=trigger.getBoundingClientRect(),view=win.visualViewport;
    const x=view?.offsetLeft||0,y=view?.offsetTop||0,width=view?.width||win.innerWidth,height=view?.height||win.innerHeight;
    const w=Math.max(1,Math.min(320,width-24)),h=Math.min(measure(pages.at(-1).node)+20,Math.max(120,height-24));
    panel.style.width=w+'px';panel.style.height=h+'px';
    const left=Math.max(x+12,Math.min(r.right-w,x+width-w-12));
    const below=r.bottom+8,top=below+h<=y+height-12?below:r.top-h-8>=y+12?r.top-h-8:Math.max(y+12,Math.min(below,y+height-h-12));
    panel.style.left=left+'px';panel.style.top=top+'px';
    for(const [key,value] of Object.entries({'--obm-open-w':w,'--obm-open-h':h,'--obm-closed-w':r.width||Math.max(44,markWidth+8),'--obm-closed-h':r.height||44,'--obm-start-x':r.right-left-w,'--obm-start-y':r.top-top}))panel.style.setProperty(key,value+'px');
  }
  function restoreIdle(){if(!destroyed&&!paused&&!reduced()&&phase==='closed')player?.startRandom?.({minDelay:10000,maxDelay:15000});}
  function rootPointsAtRest(){
    return [...root.node.querySelectorAll('[data-obm-point]')].map(point=>{
      let x=0,y=0,node=point;
      while(node&&node!==surface){x+=node.offsetLeft||0;y+=node.offsetTop||0;node=node.offsetParent;}
      return {left:parseFloat(panel.style.left)+x,top:parseFloat(panel.style.top)+y,width:point.offsetWidth||12,height:point.offsetHeight||12};
    });
  }
  function halt(){
    win.clearTimeout(motionTimer);motionTimer=null;
    for(const animation of animations)animation.cancel();animations=[];
    for(const flight of flights)flight.remove();flights=[];
  }
  function animate(element,keyframes,timing){if(reduced()||!element.animate)return null;const animation=element.animate(keyframes,timing);animations.push(animation);return animation;}
  function points(){return flights.length?flights.map(el=>el.getBoundingClientRect()):phase==='closed'?paths.map(path=>path.getBoundingClientRect()):lastRootRects;}
  function pointTravel(from,to,duration){
    if(reduced())return;
    for(let index=0;index<3;index++){
      const a=from[index],b=to[index];if(!a?.width||!b?.width)continue;
      const flight=dot(index);flight.classList.add('obm-flight');
      Object.assign(flight.style,{left:b.left+'px',top:b.top+'px',width:b.width+'px',height:b.height+'px'});panel.append(flight);flights.push(flight);
      const dx=a.left-b.left,dy=a.top-b.top,sx=a.width/b.width,sy=a.height/b.height;
      animate(flight,[{transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`},{transform:'translate(0,0) scale(1,1)'}],{duration,delay:index*time('--duration-stagger',40),easing:easing(phase==='closing'?'--morph-close-ease':'--morph-ease'),fill:'both'});
    }
  }
  function completeMotion(version,duration,done){
    const finish=()=>{if(!destroyed&&generation===version){halt();done();}};
    if(reduced()){finish();return;}
    // CSS owns width/height/radius and menu reveal. The completion fence also
    // includes the last original-logo point, so rapid reversals cannot settle
    // an older open/close over the current state.
    const cssFinished=new Promise(resolve=>{motionTimer=win.setTimeout(resolve,duration);});
    Promise.allSettled([...animations.map(animation=>animation.finished),cssFinished]).then(finish);
  }
  function clearPageMotion(){
    for(const animation of pageAnimations)animation.cancel();pageAnimations=[];
    for(const flight of titleFlights){flight.target.style.visibility=flight.visibility;flight.node.remove();}titleFlights=[];
    delete panel.dataset.stackMoving;
  }
  function settlePages(){
    win.clearTimeout(pageTimer);pageTimer=null;clearPageMotion();const previousSwipe=swipe;swipe=null;delete slider.dataset.obmDragging;
    if(previousSwipe?.armed)try{slider.releasePointerCapture?.(previousSwipe.id);}catch{}
    const current=pages.at(-1);slider.replaceChildren(current.node);current.node.dataset.pageId='1';slider.dataset.page='1';current.node.inert=false;current.node.removeAttribute('aria-hidden');
    for(const item of current.node.querySelectorAll('[data-obm-selected]'))delete item.dataset.obmSelected;
    observer?.disconnect();observer?.observe(current.node);
  }
  function stackLayers(from,to,back){
    const fromLayer=create('div','obm-stack-layer'),toLayer=create('div','obm-stack-layer');
    fromLayer.dataset.obmLayer='outgoing';toLayer.dataset.obmLayer='incoming';fromLayer.append(from.node);toLayer.append(to.node);
    slider.replaceChildren(...(back?[toLayer,fromLayer]:[fromLayer,toLayer]));return {fromLayer,toLayer};
  }
  function stackAnimate(element,keyframes,timing){
    if(reduced()||!element.animate)return null;const animation=element.animate(keyframes,timing);animation.finished.catch(()=>{});pageAnimations.push(animation);return animation;
  }
  function flyTitle(origin,heading,duration){
    if(!origin||!heading||!origin.width||!origin.height)return;
    // Read final layout coordinates, excluding the incoming page's transform.
    // Its live client rect already includes the stack's full-width entrance.
    let x=0,y=0,node=heading;while(node&&node!==surface){x+=node.offsetLeft||0;y+=node.offsetTop||0;node=node.offsetParent;}
    const target={left:parseFloat(panel.style.left)+x,top:parseFloat(panel.style.top)+y,width:heading.offsetWidth,height:heading.offsetHeight};if(!target.width||!target.height)return;
    const style=win.getComputedStyle(heading),flight=create('span','obm-title-flight',heading.textContent);flight.setAttribute('aria-hidden','true');
    Object.assign(flight.style,{left:target.left+'px',top:target.top+'px',width:target.width+'px',height:target.height+'px',fontFamily:style.fontFamily,fontSize:style.fontSize,fontWeight:style.fontWeight,lineHeight:style.lineHeight,color:style.color});panel.append(flight);
    const prior=heading.style.visibility;heading.style.visibility='hidden';titleFlights.push({node:flight,target:heading,visibility:prior});
    const fontSize=Number.parseFloat(style.fontSize)||16,scale=(origin.fontSize||fontSize)/fontSize;
    stackAnimate(flight,[{transform:`translate(${origin.left-target.left}px,${origin.top+origin.height/2-target.top-target.height/2}px) scale(${scale})`},{transform:'translate(0,0) scale(1)'}],{duration,easing:easing('--stack-ease'),fill:'both'});
  }
  function pageTransition(from,to,back=false,focus=true,enabled=true,progress=0){
    win.clearTimeout(pageTimer);clearPageMotion();const version=++navigation;
    const label=back?null:from.focus?.querySelector?.('.obm-label'),labelBox=label?.getBoundingClientRect(),origin=labelBox?{left:labelBox.left,top:labelBox.top,width:labelBox.width,height:labelBox.height,fontSize:Number.parseFloat(win.getComputedStyle(label).fontSize)}:null;
    const fromHeight=measure(from.node);from.node.dataset.pageId=back?'2':'1';to.node.dataset.pageId=back?'1':'2';
    from.node.inert=true;from.node.setAttribute('aria-hidden','true');to.node.inert=false;to.node.removeAttribute('aria-hidden');
    for(const item of to.node.querySelectorAll('[data-obm-selected]'))delete item.dataset.obmSelected;
    const width=slider.getBoundingClientRect().width||Math.max(1,parseFloat(panel.style.width)-20)||300,{fromLayer,toLayer}=stackLayers(from,to,back);
    slider.dataset.page=back?'2':'1';slider.style.height=fromHeight+'px';
    slider.style.setProperty('--page-exit-enabled',enabled&&!reduced()?'1':'0');
    void slider.offsetHeight;slider.dataset.page=back?'1':'2';resize();
    const end=()=>{if(version!==navigation||destroyed)return;settlePages();if(focus){const target=back?(to.focus||to.node.querySelector('[data-obm-item]')):to.node.querySelector('h2,[data-obm-item]');target?.focus({preventScroll:true});}notify();};
    if(reduced()||!enabled)end();else{
      panel.dataset.stackMoving='true';const duration=Math.max(90,time('--stack-push-dur',420)*(1-progress)),timing={duration,easing:easing('--stack-ease'),fill:'both'};
      stackAnimate(fromLayer,[{transform:`translateX(${back?width*progress:0}px)`},{transform:`translateX(${back?width:-width*.3}px)`}],timing);
      stackAnimate(toLayer,[{transform:`translateX(${back?-width*.3*(1-progress):width}px)`},{transform:'translateX(0)'}],timing);
      flyTitle(origin,to.node.querySelector('.obm-heading'),duration);
      pageTimer=win.setTimeout(end,Math.max(duration,time('--page-slide-dur',250),time('--page-fade-dur',250))+20);
    }
    notify();
  }
  function disposePage(page){page.abort.abort();page.dispose?.();page.node.remove();}
  function push(id,source=null,title=null){
    const extra=typeof title==='string'&&title.trim().length>0&&title.length<=80&&/^(profile|notifications|manage)\.[a-z0-9.-]{1,100}$/.test(id);
    if(!authenticated||phase==='closed'||destroyed||!allowed(id)||(!Object.hasOwn(titleById,id)&&!extra)||id==='root')return false;
    settlePages();const from=pages.at(-1);if(from.id===id)return true;from.focus=source||doc.activeElement;
    if(source)source.dataset.obmSelected='true';
    const next=makePage(id,title||titleById[id]);pages.push(next);pageTransition(from,next);return true;
  }
  function pop(settings={}){
    if(pages.length<2)return false;settlePages();const from=pages.pop(),to=pages.at(-1);
    from.abort.abort();from.dispose?.();pageTransition(from,to,true,settings.focus!==false,settings.animate!==false);return true;
  }
  function finishSwipe(event,cancel=false){
    if(!swipe||event.pointerId!==swipe.id)return;const gesture=swipe;swipe=null;
    if(gesture.armed)try{slider.releasePointerCapture?.(gesture.id);}catch{}
    if(!gesture.armed)return;
    event.preventDefault();blockClickUntil=win.performance.now()+400;
    const progress=gesture.offset/gesture.width,velocity=event.timeStamp-gesture.lastTime<100?gesture.velocity:0;
    if(!cancel&&(progress>=.35||(progress>.03&&velocity>500))){
      delete slider.dataset.obmDragging;const from=pages.pop(),to=pages.at(-1);from.abort.abort();from.dispose?.();pageTransition(from,to,true,true,true,progress);return;
    }
    const version=++navigation,duration=Math.max(90,time('--stack-push-dur',420)*progress),timing={duration,easing:easing('--stack-ease'),fill:'both'};
    panel.dataset.stackMoving='true';
    stackAnimate(gesture.fromLayer,[{transform:`translateX(${gesture.offset}px)`},{transform:'translateX(0)'}],timing);
    stackAnimate(gesture.toLayer,[{transform:`translateX(${-gesture.width*.3*(1-progress)}px)`},{transform:`translateX(${-gesture.width*.3}px)`}],timing);
    pageTimer=win.setTimeout(()=>{if(version===navigation&&!destroyed){settlePages();notify();}},duration+20);
  }
  function resetPages(){++navigation;win.clearTimeout(pageTimer);while(pages.length>1)disposePage(pages.pop());settlePages();}
  function open(section=null,{last=false}={}){
    if(!authenticated||destroyed||paused||(section&&!allowed(section)))return false;
    if(phase==='open'||phase==='opening'){if(section)push(section);return true;}
    const from=points(),version=++generation;cancelArrival();halt();
    phase='opening';brand.dataset.accountOpen='true';trigger.setAttribute('aria-expanded','true');trigger.setAttribute('aria-label','계정 메뉴 닫기');
    panel.hidden=false;panel.inert=false;try{if(panel.showPopover&&!panel.matches(':popover-open'))panel.showPopover();else if(!panel.showPopover)panel.removeAttribute('popover');}catch{panel.removeAttribute('popover');}
    resetPages();slider.style.height=measure(root.node)+'px';position();
    player?.stopRandom?.();player?.stop?.();svg.style.opacity='0';root.node.dataset.pointsMoving='true';
    const duration=time('--morph-open-dur',350);void surface.offsetWidth;surface.dataset.open='true';
    // Measure the final row positions without freezing layout or scaling text.
    lastRootRects=rootPointsAtRest();
    pointTravel(from,lastRootRects,duration);
    completeMotion(version,duration+2*time('--duration-stagger',40),()=>{phase='open';delete root.node.dataset.pointsMoving;lastRootRects=rootPointsAtRest();if(section)push(section);else{const items=[...root.node.querySelectorAll('[data-obm-item]')].filter(item=>!item.hidden);items[last?items.length-1:0]?.focus({preventScroll:true});}notify();});notify();return true;
  }
  function close({focus=true,immediate=false}={}){
    if(phase==='closed'||destroyed)return false;
    const from=points(),to=paths.map(path=>path.getBoundingClientRect()),version=++generation;settlePages();halt();
    phase='closing';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-label',authenticated?'계정 메뉴 열기':'Order 로고');panel.inert=true;root.node.dataset.pointsMoving='true';
    const finish=()=>{surface.dataset.open='false';try{if(panel.matches(':popover-open'))panel.hidePopover();}catch{}panel.hidden=true;panel.inert=false;phase='closed';brand.dataset.accountOpen='false';svg.style.opacity='';delete root.node.dataset.pointsMoving;resetPages();restoreIdle();if(focus)trigger.focus({preventScroll:true});notify();};
    if(immediate||reduced()){finish();return true;}
    const duration=time('--morph-close-dur',250);surface.dataset.open='false';
    pointTravel(from,to,duration);completeMotion(version,duration+2*time('--duration-stagger',40),finish);notify();return true;
  }
  function setAuthenticated(value,{animate:shouldAnimate=true}={}){
    const next=value===true,changed=next!==authenticated,before=trigger.getBoundingClientRect();
    if(changed)cancelArrival();
    if(!next&&phase!=='closed')close({focus:false,immediate:true});authenticated=next;brand.dataset.authenticated=String(next);
    trigger.setAttribute('aria-label',next?(phase==='closed'?'계정 메뉴 열기':'계정 메뉴 닫기'):'Order 로고');
    if(next){trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded',String(['open','opening'].includes(phase)));}else{trigger.removeAttribute('aria-haspopup');trigger.removeAttribute('aria-expanded');}
    if(changed&&shouldAnimate)arrival({left:before.left,top:before.top},next);
    notify();return authenticated;
  }
  function cancelArrival(){
    ++arrivalGeneration;win.clearTimeout(arrivalTimer);arrivalTimer=null;
    for(const motion of authAnimations)motion.cancel();authAnimations=[];delete brand.dataset.accountArrival;
  }
  function arrival(origin,next=authenticated){
    cancelArrival();
    if(destroyed||paused||reduced()||!trigger.animate)return false;
    const target=trigger.getBoundingClientRect(),from=typeof origin==='number'?{left:target.left+origin,top:target.top}:origin&&Number.isFinite(origin.left)?origin:{left:(word?.getBoundingClientRect().right||target.left)+8,top:target.top};
    const dx=from.left-target.left,dy=(Number.isFinite(from.top)?from.top:target.top)-target.top,version=arrivalGeneration;
    if(Math.abs(dx)<.25&&Math.abs(dy)<.25)return false;
    const direction=dx<0?1:-1,duration=620;
    brand.dataset.accountArrival='moving';brand.dataset.accountArrivalCount=String(++arrivalCount);player?.stopRandom?.();player?.stop?.();
    // Accelerate along the measured route, then settle on both sides of the
    // target. The original CODE1 simulation supplies the jelly deformation.
    const motion=trigger.animate([
      {transform:`translate(${dx}px,${dy}px)`,offset:0,easing:'cubic-bezier(.42,0,.68,.55)'},
      {transform:`translate(${7*direction}px,0)`,offset:.64,easing:'cubic-bezier(.22,1,.36,1)'},
      {transform:`translate(${-3*direction}px,0)`,offset:.82,easing:'cubic-bezier(.22,1,.36,1)'},
      {transform:'translate(0,0)',offset:1}
    ],{duration,fill:'both',easing:'linear'});
    motion.id='order-brand-arrival';
    const fade=period?.animate?.([{opacity:next?1:0},{opacity:next?0:1}],{duration:300,fill:'both'});
    if(fade)fade.id='order-brand-period';
    authAnimations=[motion,fade].filter(Boolean);for(const animation of authAnimations)animation.finished.catch(()=>{});
    arrivalTimer=win.setTimeout(()=>{arrivalTimer=null;if(!destroyed&&!paused&&arrivalGeneration===version&&!reduced())player?.gather?.();},duration*.48);
    Promise.allSettled(authAnimations.map(animation=>animation.finished)).then(()=>{
      if(destroyed||arrivalGeneration!==version)return;cancelArrival();restoreIdle();notify();
    });
    notify();return true;
  }
  function pause(){paused=true;cancelArrival();close({focus:false,immediate:true});trigger.disabled=true;player?.stopRandom?.();player?.stop?.();}
  function resume(){paused=false;trigger.disabled=false;restoreIdle();}
  function setUnread(value){
    if(!Number.isSafeInteger(value)||value<0)return false;const changed=value!==unread;unread=value;
    for(const badge of badges){badge.firstElementChild.textContent=value>99?'99+':String(value);if(changed&&value>0){badge.dataset.open='false';void badge.offsetWidth;}badge.dataset.open=String(value>0);}
    root.node.querySelector('[data-obm-item=notifications]')?.setAttribute('aria-label',value?'알림 · 읽지 않은 알림 '+value+'개':'알림');return true;
  }
  function update(next={}){
    Object.assign(options,next);
    if(Object.hasOwn(next,'authenticated'))setAuthenticated(next.authenticated,{animate:next.animate!==false});
    if(Object.hasOwn(next,'unread'))setUnread(next.unread);
    if(Object.hasOwn(next,'canAccess')){
      for(const page of pages)for(const item of page.node.querySelectorAll('[data-obm-item]'))item.hidden=!allowed(item.dataset.obmItem);
      while(pages.length>1&&!allowed(pages.at(-1).id))pop({animate:false,focus:false});
      resize();
    }
  }
  function destroy(){
    if(destroyed)return;close({focus:false,immediate:true});destroyed=true;++generation;++navigation;halt();cancelArrival();controller.abort();preference?.removeEventListener?.('change',preferenceChanged);win.clearTimeout(pageTimer);win.cancelAnimationFrame?.(frame);observer?.disconnect();for(const page of pages)disposePage(page);player?.destroy?.();panel.remove();
    original.parent.insertBefore(svg,original.next?.parentNode===original.parent?original.next:null);trigger.remove();svg.style.opacity='';brand.classList.remove('obm-brand');word?.classList.remove('obm-wordmark');delete brand.dataset.authenticated;delete brand.dataset.accountOpen;delete brand.dataset.accountArrivalCount;
    if(periodOrigin&&period.parentNode!==periodOrigin.parent)periodOrigin.parent.insertBefore(period,periodOrigin.next?.parentNode===periodOrigin.parent?periodOrigin.next:null);
    for(const [key,value] of Object.entries(original.sizing))if(value)brand.style.setProperty(key,value);else brand.style.removeProperty(key);
    for(const [name,value] of [['role',original.role],['tabindex',original.tabindex],['aria-label',original.label]])if(value===null)brand.removeAttribute(name);else brand.setAttribute(name,value);
    delete brand.__orderAccountMenu;
  }
  on(trigger,'click',()=>{if(authenticated){if(phase==='closed'||phase==='closing')open();else close();}else if(!reduced()){if(Math.random()<.5)player?.gather?.();else player?.play?.();}});
  on(trigger,'keydown',event=>{if(authenticated&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();open(null,{last:event.key==='ArrowUp'});}});
  // Stack Panel's edge swipe uses the same retained parent page and the same
  // 30% parallax as the back button. Vertical scrolling and form edits remain
  // native; a short/cancelled drag restores the current page without popping.
  on(slider,'pointerdown',event=>{
    if(phase!=='open'||pages.length<2||event.button!==0||event.isPrimary===false||event.target.closest('input,textarea,select,[contenteditable=true]'))return;
    const bounds=slider.getBoundingClientRect();if(!bounds.width||event.clientX<bounds.left||event.clientX>bounds.left+32)return;
    swipe={id:event.pointerId,startX:event.clientX,startY:event.clientY,lastX:event.clientX,lastTime:event.timeStamp,width:bounds.width,offset:0,velocity:0,armed:false};
  });
  on(slider,'pointermove',event=>{
    const gesture=swipe;if(!gesture||event.pointerId!==gesture.id)return;
    const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;
    if(!gesture.armed){
      if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){swipe=null;return;}
      if(dx<6||Math.abs(dx)<Math.abs(dy))return;
      settlePages();swipe=gesture;gesture.armed=true;const from=pages.at(-1),to=pages.at(-2);Object.assign(gesture,stackLayers(from,to,true));
      slider.dataset.obmDragging='true';to.node.inert=true;to.node.setAttribute('aria-hidden','true');
      try{slider.setPointerCapture?.(gesture.id);}catch{}
    }
    event.preventDefault();gesture.offset=Math.min(gesture.width,Math.max(0,dx));
    const elapsed=event.timeStamp-gesture.lastTime;if(elapsed>0)gesture.velocity=(event.clientX-gesture.lastX)/elapsed*1000;
    gesture.lastX=event.clientX;gesture.lastTime=event.timeStamp;
    gesture.fromLayer.style.transform=`translateX(${gesture.offset}px)`;
    gesture.toLayer.style.transform=`translateX(${-gesture.width*.3*(1-gesture.offset/gesture.width)}px)`;
  });
  on(slider,'pointerup',event=>finishSwipe(event));on(slider,'pointercancel',event=>finishSwipe(event,true));on(slider,'lostpointercapture',event=>finishSwipe(event,true));
  on(slider,'click',event=>{if(event.detail!==0&&win.performance.now()<blockClickUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
  on(panel,'keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if(event.target.matches('input,textarea,select,[contenteditable=true]'))return;
    if(event.key==='ArrowLeft'&&pages.length>1){event.preventDefault();pop();return;}
    const items=[...pages.at(-1).node.querySelectorAll('[data-obm-item], [data-obm-back]')].filter(el=>!el.disabled&&!el.closest('[hidden],[inert]'));
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)&&items.length){event.preventDefault();const current=items.indexOf(doc.activeElement),target=event.key==='Home'?0:event.key==='End'?items.length-1:(current+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;items[target].focus();}
  });
  on(doc,'pointerdown',event=>{if(phase!=='closed'&&!panel.contains(event.target)&&!trigger.contains(event.target))close({focus:false});});
  on(doc,'focusin',event=>{if(['open','opening'].includes(phase)&&!panel.contains(event.target)&&!trigger.contains(event.target))close({focus:false});});
  const updatePosition=()=>{win.cancelAnimationFrame?.(frame);frame=win.requestAnimationFrame?.(()=>{if(phase!=='closed')position();});};
  on(win,'resize',updatePosition);on(doc,'scroll',updatePosition,{capture:true,passive:true});if(win.visualViewport){on(win.visualViewport,'resize',updatePosition);on(win.visualViewport,'scroll',updatePosition);}
  const observer=win.ResizeObserver?new win.ResizeObserver(()=>resize()):null;observer?.observe(root.node);
  function preferenceChanged(){if(reduced()){cancelArrival();settlePages();if(phase==='opening'){++generation;halt();phase='open';delete root.node.dataset.pointsMoving;}else if(phase==='closing')close({immediate:true});player?.stopRandom?.();player?.stop?.();}else restoreIdle();}
  preference?.addEventListener?.('change',preferenceChanged);
  const api={setAuthenticated,setUnread,update,open,close,back:pop,show:push,pause,resume,arrival,destroy,inspect,trigger,panel};brand.__orderAccountMenu=api;
  setAuthenticated(options.authenticated===true,{animate:false});setUnread(options.unread||0);
  if(authenticated&&options.animateInitial===true)arrival(options.arrivalOrigin);
  return api;
}

export const brandAccountMenuCss=String.raw`
.obm-brand{position:relative;display:flex!important;align-items:center!important;gap:8px;min-width:0;flex:1;overflow:visible!important}
.obm-brand .obm-wordmark{flex:none;line-height:1;white-space:nowrap}
.obm-brand .obm-wordmark{background:none;color:inherit}
.obm-brand[data-authenticated=true] :is(.brand-dot,.ob-period){display:inline-block;width:0;overflow:hidden;opacity:0}
.obm-brand[data-authenticated=false] :is(.brand-dot,.ob-period){opacity:1}
.obm-brand .obm-trigger{position:relative;display:block;flex:none;width:var(--obm-trigger-w,51.874px);height:44px;min-height:44px;padding:0;border:0;border-radius:22px;background:transparent;box-shadow:none;color:inherit;cursor:pointer;touch-action:manipulation;translate:0 var(--obm-mark-offset-y,0px)}
.obm-brand[data-authenticated=true] .obm-trigger{margin-inline-start:auto}
.obm-brand[data-account-open=true] .obm-trigger{background:var(--surface,#f2f4f6)}
.obm-brand .obm-trigger>svg{display:block!important;width:var(--obm-svg-w,59.343px)!important;height:var(--obm-svg-h,29.047px)!important;max-width:none;margin:0!important;left:var(--obm-svg-x,-3.7346px)!important;top:calc(50% - var(--obm-mark-h,20.7478px)/2 + var(--obm-svg-y,-4.1496px))!important;position:absolute!important;pointer-events:none;overflow:visible}
.obm-brand .obm-trigger:focus-visible,.obm-panel button:focus-visible{outline:2px solid var(--blue,#315dde);outline-offset:3px}
.obm-panel.ds{position:fixed;inset:auto;margin:0;padding:0;width:min(320px,calc(100vw - 24px));min-height:0;container-type:normal;box-sizing:border-box;max-height:calc(100dvh - 24px);border:0;background:transparent;color:var(--ink,#20272a);overflow:visible;z-index:1000;isolation:isolate}
.obm-panel::-webkit-scrollbar{display:none}.obm-panel[hidden],.obm-panel [hidden]{display:none!important}.obm-panel *{box-sizing:border-box}
.obm-stack{position:relative;min-height:144px;overflow:hidden;touch-action:pan-y pinch-zoom;--resize-dur:var(--stack-height-dur,380ms)}.obm-page{width:100%;padding:2px;background:var(--paper,#fff)}
.obm-stack-layer{position:absolute;inset:0;will-change:transform}.obm-stack[data-obm-dragging=true] .obm-page{opacity:1!important;transform:none!important;filter:none!important;transition:none!important}
.obm-panel .obm-row{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:12px 10px;border:0;border-radius:10px;background:transparent;box-shadow:none;text-align:left;color:var(--ink,#20272a);font:inherit;font-weight:600;cursor:pointer}
.obm-panel .obm-row:is(:hover,:focus-visible){background:var(--surface,#f2f4f6)}.obm-label{min-width:0;flex:1}.obm-chevron{font-size:24px;font-weight:400;line-height:1;color:var(--muted,#6b7684)}
.obm-row-point{display:block;width:12px;height:12px;flex:none}.obm-point{display:block;width:12px;height:12px;flex:none;overflow:visible}.obm-page[data-points-moving=true] .obm-point{visibility:hidden}
.obm-row-point>.obm-point{transition:transform var(--morph-fade-dur) var(--morph-ease);transform-origin:center}.obm-row[data-obm-selected=true] .obm-row-point>.obm-point{transform:scale(1.5)}
.obm-flight{position:fixed;z-index:2147483646;margin:0;padding:0;transform-origin:0 0;pointer-events:none;overflow:visible}
.obm-panel-head{display:flex;align-items:center;gap:10px;min-height:44px;margin:0 0 8px;padding:0;background:transparent}
.obm-panel .obm-back{display:grid;place-items:center;min-width:40px;min-height:40px;padding:0;border:0;border-radius:12px;background:var(--surface,#f2f4f6);color:var(--ink,#20272a);font:inherit;font-size:28px;line-height:1;cursor:pointer}
.obm-heading{margin:0!important;font-size:16px!important;line-height:1.4;font-weight:700;color:var(--ink,#20272a)}
.obm-title-flight{position:fixed;z-index:2147483646;pointer-events:none;transform-origin:left center;white-space:nowrap}
.obm-panel-content{min-width:0;min-height:100px}.obm-panel-content:empty{min-height:100px}.obm-pending{min-height:100px;border-radius:12px;background:var(--surface,#f2f4f6)}
.obm-load-error{margin:12px 10px;color:var(--muted,#6b7684);font-size:14px}.obm-retry{min-height:44px;padding:10px 14px;border:0;border-radius:10px;background:var(--surface,#f2f4f6);color:var(--blue,#315dde);font:inherit;cursor:pointer}
.obm-panel .obm-row .t-badge{top:8px;right:28px}.obm-panel .obm-row .t-badge-dot{min-width:19px;height:19px;padding:0 4px;border-radius:10px;background:var(--danger,#e23e57);color:white;text-align:center;font-size:11px;line-height:19px;font-weight:700}
/* Transitions.dev dropdown-menu-morph, scoped to this account panel.
   Recipe timing and tokens are retained; the existing CODE1 paths replace the
   plus drawing. Shared .t-* classes elsewhere in the product are untouched. */
/* Transitions.dev — Plus to menu morph */

/*
  Usage:
    <div class="t-morph" data-open="false">
      <div class="t-morph-menu"> … menu items … </div>
      <button class="t-morph-plus" aria-expanded="false">+</button>
    </div>

  Toggle data-open on the container (and aria-expanded
  on the button). CSS animates the surface size + corner
  radius and cross-fades the plus ↔ menu. Wrap the morph in
  a relatively-positioned anchor sized to the OPEN footprint
  if you want it to grow out of a fixed corner.
*/

/* Closed: a small circular button. Open: a rounded panel.
   Width/height/border-radius animate; the open state uses a
   bouncier ease than the close. */
.obm-panel .t-morph {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: var(--morph-r-closed);
  overflow: hidden;
  transition:
    width var(--morph-close-dur) var(--morph-close-ease),
    height var(--morph-close-dur) var(--morph-close-ease),
    border-radius var(--morph-close-dur) var(--morph-close-ease);
}
.obm-panel .t-morph[data-open="true"] {
  width: 183px;
  height: 172px;
  border-radius: var(--morph-r-open);
  transition:
    width var(--morph-open-dur) var(--morph-ease),
    height var(--morph-open-dur) var(--morph-ease),
    border-radius var(--morph-open-dur) var(--morph-ease);
}
/* Plus fades + slides out and the icon rotates into an ×. */
.obm-panel .t-morph-plus {
  position: absolute;
  inset: auto 0 0 auto;
  width: 40px; height: 40px;
  display: grid; place-items: center;
  border: 0; background: transparent; cursor: pointer;
  transition:
    opacity var(--morph-fade-dur) var(--morph-close-ease),
    transform var(--morph-open-dur) var(--morph-close-ease),
    filter var(--morph-fade-dur) var(--morph-close-ease);
}
.obm-panel .t-morph-plus svg {
  transition: transform var(--morph-open-dur) var(--morph-close-ease);
}
.obm-panel .t-morph[data-open="true"] .t-morph-plus {
  opacity: 0;
  transform: translateX(calc(-1 * var(--morph-slide)));
  filter: blur(var(--morph-blur));
  pointer-events: none;
}
.obm-panel .t-morph[data-open="true"] .t-morph-plus svg {
  transform: scale(var(--morph-scale)) rotate(var(--morph-rotate));
}
/* Menu starts slid in + scaled + blurred; reveals on open. */
.obm-panel .t-morph-menu {
  position: absolute;
  inset: 0;
  opacity: 0;
  transform: translateX(var(--morph-slide)) scale(var(--morph-scale));
  filter: blur(var(--morph-blur));
  pointer-events: none;
  transition:
    opacity var(--morph-fade-dur) var(--morph-close-ease),
    transform var(--morph-open-dur) var(--morph-close-ease),
    filter var(--morph-fade-dur) var(--morph-close-ease);
}
.obm-panel .t-morph[data-open="true"] .t-morph-menu {
  opacity: 1;
  transform: translateX(0) scale(1);
  filter: blur(0);
  pointer-events: auto;
}

@media (prefers-reduced-motion: reduce) {
  .obm-panel .t-morph, .obm-panel .t-morph-plus, .obm-panel .t-morph-menu, .obm-row-point>.obm-point { transition: none !important; }
}
/* ORDER geometry and surfaces; all recipe timing/shape/reveal hooks remain. */
.obm-panel .obm-surface.t-morph{position:absolute;inset:0 0 auto auto;width:var(--obm-closed-w);height:var(--obm-closed-h);transform:translate(var(--obm-start-x),var(--obm-start-y));background:var(--paper,#fff);box-shadow:0 12px 40px #182b4829;transition:width var(--morph-close-dur) var(--morph-close-ease),height var(--morph-close-dur) var(--morph-close-ease),border-radius var(--morph-close-dur) var(--morph-close-ease),transform var(--morph-close-dur) var(--morph-close-ease)}
.obm-panel .obm-surface.t-morph[data-open="true"]{width:var(--obm-open-w);height:var(--obm-open-h);transform:translate(0,0);transition:width var(--morph-open-dur) var(--morph-ease),height var(--morph-open-dur) var(--morph-ease),border-radius var(--morph-open-dur) var(--morph-ease),transform var(--morph-open-dur) var(--morph-ease)}
.obm-panel .obm-menu.t-morph-menu{width:var(--obm-open-w);height:var(--obm-open-h);padding:10px;overflow:auto;overscroll-behavior:contain;scrollbar-width:none}.obm-panel .obm-menu::-webkit-scrollbar{display:none}
/* Transitions.dev 08-page-side-by-side.md, scoped to this account panel. */
.obm-panel .t-page-slide {
  position: relative;
}
.obm-panel .t-page-slide .t-page[data-page-id="1"] {
  --t-page-from-x: calc(var(--page-slide-distance) * -1);
}
.obm-panel .t-page-slide .t-page[data-page-id="2"] {
  --t-page-from-x: var(--page-slide-distance);
}
.obm-panel .t-page-slide .t-page {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
  transform: translateX(calc(var(--t-page-from-x, 0px) * var(--page-exit-enabled)));
  filter: blur(calc(var(--page-blur) * var(--page-exit-enabled)));
  transition:
    opacity   var(--page-fade-dur)  var(--page-fade-ease),
    transform var(--page-slide-dur) var(--page-slide-ease),
    filter    var(--page-slide-dur) var(--page-slide-ease);
  will-change: opacity, transform, filter;
}
.obm-panel .t-page-slide[data-page="1"] .t-page[data-page-id="1"],
.obm-panel .t-page-slide[data-page="2"] .t-page[data-page-id="2"] {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(0);
  filter: blur(0);
  transition-delay: var(--page-stagger);
}
@media (prefers-reduced-motion: reduce) {
  .obm-panel .t-page-slide .t-page { transition: none !important; }
}
/* Transitions.dev 01-card-resize.md, scoped to this account panel. */
.obm-panel .t-resize {
  transition:
    width  var(--resize-dur) var(--resize-ease),
    height var(--resize-dur) var(--resize-ease);
  will-change: width, height;
}
@media (prefers-reduced-motion: reduce) {
  .obm-panel .t-resize { transition: none !important; }
}
/* Transitions.dev 03-notification-badge.md, with a panel-owned animation name. */
@keyframes obm-badge-slide-in {
  from { transform: translate(var(--badge-offset-x), var(--badge-offset-y)); }
  to   { transform: translate(0, 0); }
}
.obm-panel .t-badge {
  position: absolute;
  top: -6px;
  right: -8px;
  pointer-events: none;
  will-change: transform;
}
.obm-panel .t-badge[data-open="true"] {
  animation: obm-badge-slide-in var(--badge-slide-dur) var(--badge-slide-ease);
}
.obm-panel .t-badge-dot {
  display: block;
  transform-origin: center;
  transform: scale(1);
  opacity: 1;
  filter: blur(0);
  transition:
    transform var(--badge-pop-dur)  var(--badge-pop-ease),
    opacity   var(--badge-fade-dur) var(--badge-pop-ease),
    filter    var(--badge-pop-dur)  var(--badge-pop-ease);
  will-change: transform, opacity, filter;
}
.obm-panel .t-badge[data-open="false"] .t-badge-dot {
  transform: scale(0);
  opacity: 0;
  filter: blur(var(--badge-blur));
  transition:
    transform var(--badge-pop-close-dur)  var(--badge-close-ease),
    opacity   var(--badge-fade-close-dur) var(--badge-close-ease),
    filter    var(--badge-pop-close-dur)  var(--badge-close-ease);
}
@media (prefers-reduced-motion: reduce) {
  .obm-panel .t-badge, .obm-panel .t-badge-dot { animation: none !important; transition: none !important; }
}
.obm-panel .obm-stack .obm-page{inset:0 0 auto;height:auto}
`;
