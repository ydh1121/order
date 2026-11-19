/** Figma 2009019251, selected video 2 Magnetic Pull. The pointer target and its
 * native action stay on the stationary button. Only its material and label move. */
export function mountMagneticAction(button,{reducedMotion=()=>false,fill}={}) {
  const owner=Symbol.for('order.magnetic-action');
  if(button[owner])return button[owner];
  const doc=button.ownerDocument,view=doc.defaultView,media=view.matchMedia('(prefers-reduced-motion: reduce)');
  const surface=doc.createElement('span'),label=doc.createElement('span');
  const original={position:button.style.position,background:button.style.background};
  const appearance=view.getComputedStyle(button);
  surface.dataset.magneticMaterial='';surface.setAttribute('aria-hidden','true');
  surface.style.cssText='position:absolute;inset:0;border-radius:inherit;pointer-events:none;';
  surface.style.background=fill||appearance.background;
  label.dataset.magneticLabel='';
  label.style.cssText='position:relative;pointer-events:none;transform-origin:center;';
  label.style.display=appearance.display.includes('flex')?'inline-flex':'inline-block';
  if(label.style.display==='inline-flex'){label.style.alignItems='center';label.style.gap='inherit';}
  label.append(...Array.from(button.childNodes));button.append(surface,label);
  if(appearance.position==='static'||!appearance.position)button.style.position='relative';
  button.style.background='transparent';button.dataset.magneticAction='rest';
  const listeners=new view.AbortController();
  let px=0,py=0,surfaceAnim=null,labelAnim=null,pressed=false,pressId=null;
  const quiet=()=>media.matches||reducedMotion()||doc.documentElement.hasAttribute('data-review-reduced');
  const shift=(x,y,scale=1)=>`translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${scale})`;
  function stopAnimations(){surfaceAnim?.cancel();labelAnim?.cancel();surfaceAnim=labelAnim=null;}
  function reset(){stopAnimations();px=py=0;pressed=false;pressId=null;surface.style.transform=label.style.transform='';button.dataset.magneticAction='rest';}
  function coords(e){
    const r=button.getBoundingClientRect();
    const normal=(at,start,size)=>Math.max(-1,Math.min(1,(at-start-size/2)/Math.max(1,size/2)));
    px=normal(e.clientX,r.left,r.width);py=normal(e.clientY,r.top,r.height);
  }
  function lean(e){
    if(button.disabled||pressed||e.pointerType==='touch'||quiet())return;
    coords(e);stopAnimations();surface.style.transform=shift(px*6,py*6);label.style.transform=shift(px*8,py*8);
    button.dataset.magneticAction='hover';
  }
  function down(e){
    if(button.disabled||quiet()||e.isPrimary===false||e.button!==0)return;
    coords(e);pressed=true;pressId=e.pointerId;stopAnimations();
    const a=surface.style.transform||'none',b=label.style.transform||'none';
    surface.style.transform=shift(px*7,py*7,.98);label.style.transform=shift(px*13,py*13,.73);
    surfaceAnim=surface.animate?.([{transform:a},{transform:surface.style.transform}],{duration:100,easing:'ease-out'});
    labelAnim=label.animate?.([{transform:b},{transform:label.style.transform}],{duration:110,easing:'ease-out'});
    button.dataset.magneticAction='pressed';
  }
  function release(e){
    if(e?.pointerId!==undefined&&pressId!==null&&e.pointerId!==pressId)return;
    if(button.dataset.magneticAction==='rest')return;
    const a=view.getComputedStyle(surface).transform,b=view.getComputedStyle(label).transform;
    stopAnimations();pressed=false;pressId=null;surface.style.transform=label.style.transform='';
    if(!quiet()){
      surfaceAnim=surface.animate?.([{transform:a||'none'},{transform:shift(-px*1.2,-py*1.2),offset:.72},{transform:'none'}],{duration:215,easing:'ease-out'});
      labelAnim=label.animate?.([{transform:b||'none'},{transform:shift(-px*1.6,-py*1.6,1.025),offset:.72},{transform:'none'}],{duration:220,easing:'ease-out'});
    }
    button.dataset.magneticAction='rest';
  }
  function setLabel(value){
    if(label.textContent===value)return;
    const changing=label.textContent!=='';
    label.textContent=value;
    if(changing&&!quiet()){
      labelAnim?.cancel();labelAnim=label.animate?.([{transform:shift(px*13,py*13,.45),opacity:.5},{transform:'scale(1.035)',opacity:1,offset:.78},{transform:'none',opacity:1}],{duration:205,easing:'ease-out'});
    }
  }
  const opts={signal:listeners.signal};
  button.addEventListener('pointermove',lean,opts);button.addEventListener('pointerdown',down,opts);
  button.addEventListener('pointerleave',release,opts);button.addEventListener('pointercancel',reset,opts);
  view.addEventListener('pointerup',e=>{if(pressed)release(e);},opts);button.addEventListener('blur',reset,opts);
  doc.addEventListener('visibilitychange',()=>{if(doc.hidden)reset();},opts);view.addEventListener('pagehide',reset,opts);
  media.addEventListener?.('change',reset);
  const control={setLabel,reset,destroy(){
    reset();listeners.abort();media.removeEventListener?.('change',reset);
    label.replaceWith(...Array.from(label.childNodes));surface.remove();button.style.position=original.position;
    button.style.background=original.background;delete button.dataset.magneticAction;delete button[owner];
  }};
  button[owner]=control;return control;
}
