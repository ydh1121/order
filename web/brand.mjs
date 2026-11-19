import {mount} from './code1-jelly.mjs';

/** Retain the CODE1 header node across routes. The private page supplies the
 * authenticated partition only after its session and membership check. */
export function mountOrderBrand(root=document){
 const view=root.defaultView||window, cleanups=[];
 for(const svg of root.querySelectorAll('.brand-mark[data-code1-jelly]')){
  const brand=svg.closest('.brand');
  const motion=mount(svg,{auto:true,interactive:false,minDelay:10000,maxDelay:15000});
  const member=Boolean(root.documentElement?.dataset.r3QuotePartition);
  let animation=null;
  const trigger=()=>{if(Math.random()<.5)motion.gather();else motion.play();};
  const key=event=>{if(!event.repeat&&[' ','Enter'].includes(event.key)){event.preventDefault();trigger();}};
  if(brand && !member){
   brand.setAttribute('role','button');brand.setAttribute('aria-label','Order 로고');brand.tabIndex=0;
   brand.addEventListener('click',trigger);brand.addEventListener('keydown',key);
  }else if(brand){
   const first=svg.getBoundingClientRect().left;
   brand.dataset.member='true';
   const offset=first-svg.getBoundingClientRect().left;
   if(offset!==0&&!view.matchMedia('(prefers-reduced-motion: reduce)').matches){
    animation=svg.animate([{transform:'translateX('+offset+'px)'},{transform:'translateX(6px)',offset:.72},{transform:'translateX(-2px)',offset:.87},{transform:'translateX(0)'}],{duration:560,easing:'cubic-bezier(.22,.7,.28,1)'});
    motion.gather();
   }
  }
  cleanups.push(()=>{animation?.cancel();motion.destroy();brand?.removeEventListener('click',trigger);brand?.removeEventListener('keydown',key);});
 }
 return {destroy(){cleanups.forEach(fn=>fn());}};
}
