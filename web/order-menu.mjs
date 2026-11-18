// Both destinations use the product's existing atomic mode-switch dialog.
export function mountOrderMenu({simple, switchMode}) {
  const header=globalThis.document?.querySelector?.('header.header');
  const brand=header?.querySelector('.brand');
  if(!brand)return;
  const container=document.createElement('div');
  container.className='order-menu';container.hidden=true;
  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='order-menu-trigger';
  trigger.textContent='▾';trigger.setAttribute('aria-label','Order 견적 모드 선택');
  trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
  const panel=document.createElement('div');panel.id='order-mode-menu';panel.hidden=true;
  panel.setAttribute('role','menu');panel.setAttribute('aria-label','Order 견적 모드');trigger.setAttribute('aria-controls',panel.id);
  const title=document.createElement('strong');title.textContent='Order';panel.append(title);
  function close(returnFocus=false){panel.hidden=true;trigger.setAttribute('aria-expanded','false');if(returnFocus)trigger.focus();}
  const items=[['간편 견적',true],['상세 견적',false]].map(([label,targetSimple])=>{
    const item=document.createElement('button');item.type='button';item.textContent=label;
    item.setAttribute('role','menuitemradio');item.setAttribute('aria-checked',String(simple===targetSimple));
    item.onclick=()=>{close(true);if(simple!==targetSimple)switchMode();};panel.append(item);return item;
  });
  function open(last=false){panel.hidden=false;trigger.setAttribute('aria-expanded','true');items[last?1:0].focus();}
  trigger.onclick=()=>panel.hidden?open():close(true);
  trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open(e.key==='ArrowUp');}};
  panel.onkeydown=e=>{
    if(e.key==='Escape'){e.preventDefault();close(true);return;}
    const index=items.indexOf(document.activeElement);
    const destination={ArrowUp:(index+1)%2,ArrowDown:(index+1)%2,Home:0,End:1}[e.key];
    if(destination!==undefined){e.preventDefault();items[destination].focus();}
  };
  document.addEventListener('pointerdown',e=>{if(!container.contains(e.target))close();});
  container.addEventListener('focusout',e=>{if(!container.contains(e.relatedTarget))close();});
  window.addEventListener('popstate',()=>close());
  container.append(trigger,panel);brand.after(container);
  let generation=0;
  async function check(){
    const id=++generation;let enabled=false;
    try{const res=await fetch('/api/order/features',{credentials:'omit',redirect:'error',cache:'no-store'});
      enabled=res.ok && (await res.json()).orderMenu===true;
    }catch{/* Default remains closed. */}
    if(id===generation){container.hidden=!enabled;if(!enabled)close();}
  }
  window.addEventListener('pageshow',check);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  check();
}
