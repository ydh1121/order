import {mount} from './code1-jelly.mjs';

/** Mount the supplied CODE1 v2 logo without coupling it to the quote engine. */
export function mountOrderBrand(root=document){
 const motions=[...root.querySelectorAll('.brand-mark[data-code1-jelly]')].map(svg=>mount(svg,{auto:true,interactive:false,minDelay:10000,maxDelay:15000}));
 return {destroy(){motions.forEach(motion=>motion.destroy());}};
}
