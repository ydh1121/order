import Code1Jelly from './code1-jelly.mjs';
import {mountBrandAccountMenu,brandAccountMenuCss} from './brand-account-menu.mjs';

/** The canonical product and its result surface share this authenticated brand.
 * Authentication and account transports are supplied by the server adapter.
 * A URL, storage partition or result state never grants a member menu. */
export const orderBrandHeaderCss=String.raw`
.order-product-brand.obm-brand{box-sizing:border-box;width:100%;height:78px;margin:0;padding:0 .1259918213px 0 0;gap:8px;flex:1;--obm-mark-offset-y:2.6406373978px;font:800 26px/1 Arial,sans-serif;letter-spacing:-1.6px;color:var(--ink,#20272b)}
.order-product-brand.obm-brand[data-authenticated=true]{--obm-mark-offset-y:3.3738927841px}
.order-product-brand.obm-brand>.brand-word{position:relative;top:2.5234375px;display:block;box-sizing:border-box;flex:none;width:72px;height:25px;margin:0;font:inherit;line-height:25px;letter-spacing:inherit}
.order-product-brand.obm-brand>.brand-word>.brand-dot{position:absolute;left:70.625px;top:0;margin:0;line-height:inherit;letter-spacing:0}
.order-product-brand.obm-brand>.obm-trigger{margin-inline-end:0}
.order-product-brand.obm-brand .brand-mark{user-select:none}
`;

function installBrandStyles(doc){
 const nonce=doc.querySelector('script[nonce],style[nonce]')?.nonce;
 for(const [attribute,css] of [['data-order-brand-account-css',brandAccountMenuCss],['data-order-brand-header-css',orderBrandHeaderCss]]){
  if(doc.querySelector('style['+attribute+']'))continue;
  const style=doc.createElement('style');style.setAttribute(attribute,'');if(nonce)style.nonce=nonce;
  style.textContent=css;doc.head.append(style);
 }
}

export function createOrderBrand(doc=document){
 const brand=doc.createElement('div');brand.className='brand order-product-brand';brand.setAttribute('aria-label','Order');
 const word=doc.createElement('span');word.className='brand-word';word.dataset.brandWord='';word.setAttribute('aria-hidden','true');word.append(doc.createTextNode('Order'));
 const period=doc.createElement('span');period.className='brand-dot';period.textContent='.';word.append(period);
 const source=new doc.defaultView.DOMParser().parseFromString(Code1Jelly.createSVG(),'image/svg+xml');
 const svg=doc.importNode(source.documentElement,true);svg.classList.add('brand-mark');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
 brand.append(word,svg);return brand;
}

export function mountOrderBrandElement(brand,overrides={}){
 if(!brand?.ownerDocument)throw new TypeError('Pass the product brand element.');
 const doc=brand.ownerDocument,view=doc.defaultView;
 installBrandStyles(doc);brand.classList.add('order-product-brand');brand.dataset.orderBrandSource='canonical';delete brand.dataset.member;
 const context={...(view.ORDER_BRAND_ACCOUNT_CONTEXT||{}),...overrides};
 if(brand.__orderAccountMenu){brand.__orderAccountMenu.update({...context,authenticated:context.authenticated===true});return brand.__orderAccountMenu;}
 // A consumed arrival flag is a UI transition receipt, never authentication.
 // Detached result stages wait until show() mounts them before consuming it.
 const visible=brand.isConnected&&view.getComputedStyle(brand).display!=='none'&&brand.getClientRects().length>0;
 const animateInitial=context.authenticated===true&&visible&&typeof context.consumeArrival==='function'&&context.consumeArrival()===true;
 return mountBrandAccountMenu(brand,{...context,authenticated:context.authenticated===true,animateInitial,jelly:context.jelly||Code1Jelly,reducedMotion:context.reducedMotion||(()=>view.matchMedia('(prefers-reduced-motion: reduce)').matches)});
}

/** Mount existing original SVG nodes without replacing their three paths. */
export function mountOrderBrand(root=document){
 const menus=[];
 for(const svg of root.querySelectorAll('.brand-mark[data-code1-jelly]')){
  const brand=svg.closest('.brand');if(!brand||menus.includes(brand.__orderAccountMenu))continue;
  menus.push(mountOrderBrandElement(brand));
 }
 return {menus,update(context){for(const menu of menus)menu.update(context);},destroy(){menus.forEach(menu=>menu.destroy());}};
}
