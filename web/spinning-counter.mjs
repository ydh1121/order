/* Transitions.dev — Spinning counter, adapted for ORDER display only.
 * Source: Jakubantalik/transitions.dev@20d70c1262bf721c0300c2946cbe1fc7605a555c
 * Transitions.dev License (not tooling MIT); see docs/licenses/transitions-dev.txt.
 * Exact formatted amounts are strings. This module never calculates money,
 * writes a model, starts a request, or treats an animation as a saved result. */
const instances = new WeakMap();
const STEP = (50 * Math.PI) / 180;
const ENTER_MS = 120, FADE_END = 1.8, LAND_AT = 0.6, ARRIVE_AT = 0.29, CLEAR_MS = 200;
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const wave = s => s >= 1 ? 0 : Math.exp(-3 * s) * Math.cos(3 * Math.PI * s) * (1 - s);
const WAVE_TROUGH = -Math.min(...Array.from({length:399}, (_, i) => wave((i + 1) / 400)));

function bezier([x1, y1, x2, y2]) {
  const at = (a, b, t) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) { if (at(x1, x2, t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return at(y1, y2, t);
  };
}
function readTokens(el, view) {
  const css = view.getComputedStyle(el.ownerDocument.documentElement);
  const number = (name, fallback) => { const n = parseFloat(css.getPropertyValue(name)); return Number.isFinite(n) ? n : fallback; };
  const length = (name, fallbackEm) => {
    const probe = el.ownerDocument.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`;
    el.appendChild(probe); const px = probe.getBoundingClientRect().width; probe.remove();
    return px || fallbackEm * (parseFloat(view.getComputedStyle(el).fontSize) || 24);
  };
  const match = css.getPropertyValue('--reel-ease').match(/cubic-bezier\(([^)]+)\)/);
  const curve = match?.[1].split(',').map(Number);
  return {
    stepDur: Math.max(1, number('--reel-step-dur',130)), stagger: Math.max(0, number('--reel-stagger',90)),
    ease: bezier(curve?.length === 4 && curve.every(Number.isFinite) ? curve : [0.35,-0.02,0.43,1]),
    offset:length('--reel-side-offset',0.52), sideScale:number('--reel-side-scale',0.7),
    sideBlur:length('--reel-side-blur',0.083), sideOpacity:number('--reel-side-opacity',0.17),
    centerScale:number('--reel-center-scale',0.9), centerBlur:length('--reel-center-blur',0.042),
    anticDur:Math.max(1,number('--reel-antic-dur',100)), anticScale:number('--reel-antic-scale',0.94),
    anticLift:length('--reel-antic-lift',0.125), landDur:Math.max(1,number('--reel-land-dur',740)),
    landPeak:number('--reel-land-peak',1.03),
  };
}
function rest(col) {
  col.cells.forEach((cell,d) => {
    cell.style.transform='none'; cell.style.filter='none'; cell.style.zIndex='';
    cell.style.opacity=d===col.digit?'1':'0';
  });
  col.el.dataset.counterMoving='false';
}
function look(dist,middle,o) {
  const angle=Math.min(dist*STEP,Math.PI/2), face=(Math.cos(angle)-Math.cos(STEP))/(1-Math.cos(STEP));
  return {angle,scale:o.sideScale+(middle-o.sideScale)*face,
    back:dist<=1?1+(o.sideOpacity-1)*dist:o.sideOpacity*(1-(dist-1)/(FADE_END-1))};
}
function place(col,pos,spread,middle,o,land) {
  const radius=o.offset/Math.sin(STEP);
  col.cells.forEach((cell,d) => {
    let p=(((d-pos)%10)+10)%10; if(p>5)p-=10;
    const dist=Math.abs(p); if(dist>=FADE_END){cell.style.opacity='0';return;}
    const l=look(dist,middle,o);
    let y=(p<0?1:-1)*radius*Math.sin(l.angle),scale=l.scale,z=100-Math.round(dist*10);
    const blur=(o.centerBlur+(o.sideBlur-o.centerBlur)*Math.min(dist,1))*spread;
    const away=Math.max(0,Math.min(1,(dist-0.3)/0.5)); let opacity=l.back*(1-(1-spread)*away);
    if(land&&d===col.digit){y=y*land.arrive+land.lift;scale=land.scale;opacity=land.opacity;z=200;}
    cell.style.transform=`translateY(${y.toFixed(2)}px) scale(${scale.toFixed(4)})`;
    cell.style.filter=blur>0.01?`blur(${blur.toFixed(2)}px)`:'none';
    cell.style.opacity=opacity.toFixed(3);cell.style.zIndex=String(z);
  });
}
function validAmount(value) {
  // Only the existing formatter's positive integer currency text is accepted.
  // BigInt/Number conversion is intentionally absent, including for validation.
  return typeof value==='string' && /^(?:₩\s*)?(?:[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\s*원)?$/.test(value);
}

/** Attach to an existing <output>; caller owns cost-row visibility and validity.
 * set() changes only this output. hide() clears/cancels, settle() cancels to the
 * current exact target (e.g. route exit), destroy() releases the owner/listener.
 * A test-only view injection supplies the same DOM/rAF/media APIs, no calculator. */
export function createSpinningCounter(output,{view=output?.ownerDocument?.defaultView||globalThis}={}) {
  if(!output?.ownerDocument?.createElement)throw new TypeError('Counter output element required');
  if(instances.has(output))return instances.get(output);
  const doc=output.ownerDocument, semantic=doc.createElement('span'), reel=doc.createElement('span');
  semantic.className='order-counter-value';reel.className='t-reel';reel.setAttribute('aria-hidden','true');
  output.classList.add('order-spinning-counter');output.replaceChildren(semantic,reel);
  output.removeAttribute('aria-label');output.hidden=true;
  let value=null,columns=[],generation=0,raf=0,destroyed=false,state='hidden';
  const media=view.matchMedia?.('(prefers-reduced-motion: reduce)');
  const publishState=next=>{state=next;output.dataset.counterState=next;output.dataset.counterGeneration=String(generation);};
  const cancel=()=>{generation++;if(raf)view.cancelAnimationFrame(raf);raf=0;};
  function settle(){if(destroyed)return;cancel();columns.forEach(rest);publishState(value===null?'hidden':'settled');}
  function hide(){if(destroyed)return;cancel();value=null;semantic.textContent='';reel.replaceChildren();columns=[];output.hidden=true;delete output.dataset.counterTarget;publishState('hidden');}
  function destroy(){if(destroyed)return;settle();destroyed=true;media?.removeEventListener?.('change',onMotion);view.removeEventListener?.('pagehide',settle);instances.delete(output);publishState('destroyed');}
  function onMotion(){if(media.matches)settle();}
  function set(next){
    if(destroyed)return false;
    if(!validAmount(next)){hide();return false;}
    if(next===value)return true;
    const previous=value;cancel();value=next;semantic.textContent=next;output.dataset.counterTarget=next;output.hidden=false;
    const digits=next.replace(/\D/g,''),fromDigits=(previous?.replace(/\D/g,'')||'').padStart(digits.length,'0').slice(-digits.length);
    const old=new Map(columns.map(col=>[col.place,col])), pieces=[];columns=[];let index=0;
    for(const ch of next){
      if(ch<'0'||ch>'9'){const sep=doc.createElement('span');sep.className='t-reel-sep';sep.textContent=ch;pieces.push(sep);continue;}
      const position=digits.length-1-index;let col=old.get(position);
      if(!col){
        const el=doc.createElement('span'),sizer=doc.createElement('span');el.className='t-reel-col';sizer.className='t-reel-sizer';sizer.textContent='0';el.appendChild(sizer);
        const cells=Array.from({length:10},(_,d)=>{const cell=doc.createElement('span');cell.className='t-reel-digit';cell.textContent=String(d);el.appendChild(cell);return cell;});
        col={el,cells,place:position};
      }
      col.digit=ch.charCodeAt(0)-48;col.from=fromDigits.charCodeAt(index)-48;col.done=col.from===col.digit;delete col.landAt;delete col.landFrom;
      col.el.dataset.counterPlace=String(position);col.el.dataset.counterFrom=String(col.from);col.el.dataset.counterTarget=ch;
      col.cells.forEach((cell,d)=>{cell.style.transform='none';cell.style.filter='none';cell.style.zIndex='';cell.style.opacity=d===col.from?'1':'0';});
      col.el.dataset.counterMoving=String(!col.done);columns.push(col);pieces.push(col.el);index++;
    }
    reel.replaceChildren(...pieces);
    if(media?.matches || !view.requestAnimationFrame || columns.every(col=>col.done)){settle();return true;}
    const o=readTokens(reel,view), token=generation, started=view.performance.now();publishState('rolling');
    const tick=()=>{
      if(destroyed||token!==generation)return;
      if(output.isConnected===false){cancel();publishState('settled');return;}
      const t=view.performance.now()-started;let running=false;
      columns.forEach((col,i)=>{
        if(col.done)return;
        const local=t-i*o.stagger;if(local<=0){running=true;return;}
        const total=(col.digit-col.from+10)%10,pos=col.from+total*o.ease(local/(total*o.stepDur)),enter=Math.min(1,local/ENTER_MS);
        if(col.landAt===undefined&&col.from+total-pos<LAND_AT)col.landAt=t;
        const since=col.landAt===undefined?-1:t-col.landAt;
        if(since>=o.anticDur+o.landDur){rest(col);col.done=true;return;}
        running=true;const middle=1+(o.centerScale-1)*enter;let spread=enter,land=null;
        if(since>=0){
          if(!col.landFrom)col.landFrom=look(col.from+total-pos,middle,o);
          const arrive=1-smooth(since/(o.anticDur+o.landDur*ARRIVE_AT));
          if(since<o.anticDur){const a=smooth(since/o.anticDur);land={scale:col.landFrom.scale+(o.anticScale-col.landFrom.scale)*a,lift:-o.anticLift*a,opacity:col.landFrom.back+(1-col.landFrom.back)*a,arrive};}
          else{const sp=since-o.anticDur,sn=sp/o.landDur,w=wave(sn);land={scale:sn<1/6?1+(o.anticScale-1)*w:1-((o.landPeak-1)*w)/WAVE_TROUGH,lift:-o.anticLift*w,opacity:1,arrive};spread=1-Math.min(1,sp/CLEAR_MS);}
        }
        place(col,pos,spread,middle,o,land);
      });
      if(running)raf=view.requestAnimationFrame(tick);else{raf=0;publishState('settled');}
    };
    tick();return true;
  }
  media?.addEventListener?.('change',onMotion);view.addEventListener?.('pagehide',settle);publishState('hidden');
  const api=Object.freeze({set,hide,settle,destroy,inspect:()=>Object.freeze({value,state,generation,active:!!raf,destroyed})});
  instances.set(output,api);return api;
}
