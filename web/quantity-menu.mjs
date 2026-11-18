// Shared Q2 unit popup. The hidden select remains the model/change event adapter;
// only this listbox owns pointer/keyboard presentation, never an OS option menu.
export function getMenuPlacement(anchor, size, viewport, {gap = 4, inset = 8, align = 'start'} = {}) {
 const leftEdge = viewport.left + inset;
 const rightEdge = viewport.left + viewport.width - inset;
 const topEdge = viewport.top + inset;
 const bottomEdge = viewport.top + viewport.height - inset;
 const below = Math.max(0, bottomEdge - anchor.bottom - gap);
 const above = Math.max(0, anchor.top - gap - topEdge);
 const up = size.height > below && above > below;
 const width = Math.min(size.width, Math.max(0, rightEdge - leftEdge));
 const height = Math.min(size.height, up ? above : below);
 const left = align === 'end' ? anchor.right - width : anchor.left;
 return {width, height, up, left: Math.max(leftEdge, Math.min(left, rightEdge - width)),
  top: up ? anchor.top - gap - height : anchor.bottom + gap};
}
export function menuViewport(view) {
 const v = view.visualViewport;
 return {left: v?.offsetLeft ?? 0, top: v?.offsetTop ?? 0,
  width: v?.width ?? view.innerWidth, height: v?.height ?? view.innerHeight};
}
export function bindQuantityMenu(root){
 const document=root.ownerDocument,view=document.defaultView,menu=document.createElement('div');
 menu.id='order-quantity-menu';menu.className='ui-quantity-menu';menu.hidden=true;menu.setAttribute('role','listbox');menu.setAttribute('aria-label','월 구매량 단위');document.body.append(menu);
 const origin=document.createElement('span');origin.className='ui-fixed-origin';origin.setAttribute('aria-hidden','true');document.body.append(origin);
 let owner=null,index=0;
 const button=choice=>choice.querySelector('[data-unit-trigger]'),control=choice=>choice.querySelector('select');
 const options=()=>[...control(owner).options].filter(option=>!option.disabled);
 function close({focus=false}={}){const old=owner;owner=null;menu.hidden=true;menu.replaceChildren();if(old){old.dataset.open='false';button(old).setAttribute('aria-expanded','false');button(old).removeAttribute('aria-activedescendant');if(focus){const id=button(old).id;document.getElementById(id)?.focus({preventScroll:true});}}}
 function sync(choice){const select=control(choice),trigger=button(choice),label=select.options[select.selectedIndex]?.textContent||'단위 확인';choice.querySelector('.ui-quantity-label').textContent=label;trigger.setAttribute('aria-label','월 구매량 단위: '+label);trigger.dataset.value=select.value;}
 function position(){
  if(!owner?.isConnected){close();return;}
  const rect=button(owner).getBoundingClientRect(),o=origin.getBoundingClientRect();
  const placement=getMenuPlacement(rect,{width:menu.offsetWidth,height:menu.scrollHeight+menu.offsetHeight-menu.clientHeight},menuViewport(view),{align:'end'});
  menu.style.maxHeight=placement.height+'px';menu.style.overflowY='auto';
  menu.style.left=(placement.left-o.left)+'px';menu.style.top=(placement.top-o.top)+'px';
  menu.style.transformOrigin=placement.up?'bottom right':'top right';
 }
 function highlight(next){const nodes=[...menu.children];index=Math.max(0,Math.min(nodes.length-1,next));nodes.forEach((node,i)=>node.dataset.active=String(i===index));button(owner).setAttribute('aria-activedescendant',nodes[index]?.id||'');}
 function open(choice,next){close();owner=choice;sync(choice);const select=control(choice);options().forEach((option,i)=>{const node=document.createElement('div');node.id='order-unit-option-'+i;node.setAttribute('role','option');node.setAttribute('aria-selected',String(select.value===option.value));node.dataset.index=String(i);const label=document.createElement('span');label.textContent=option.textContent;node.append(label);const mark=document.createElementNS('http://www.w3.org/2000/svg','svg');mark.setAttribute('viewBox','0 0 16 16');mark.setAttribute('class','ui-quantity-selected-mark');mark.setAttribute('aria-hidden','true');const path=document.createElementNS('http://www.w3.org/2000/svg','path');for(const [key,value]of Object.entries({d:'m3.5 8 3 3 6-6',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round'}))path.setAttribute(key,value);mark.append(path);node.append(mark);menu.append(node);});choice.dataset.open='true';button(choice).setAttribute('aria-expanded','true');menu.hidden=false;highlight(next??Math.max(0,options().findIndex(option=>option.selected)));position();button(choice).focus({preventScroll:true});}
 function commit(){if(!owner)return;const choice=owner,select=control(choice),option=options()[index];if(!option)return;const triggerId=button(choice).id;close();select.value=option.value;select.dispatchEvent(new view.Event('change',{bubbles:true}));document.getElementById(triggerId)?.focus({preventScroll:true});}
 root.addEventListener('click',event=>{const trigger=event.target.closest?.('[data-unit-trigger]');if(!trigger||!root.contains(trigger))return;const choice=trigger.closest('.ui-quantity-choice');if(owner===choice)close();else open(choice);});
 root.addEventListener('keydown',event=>{const trigger=event.target.closest?.('[data-unit-trigger]');if(!trigger)return;const choice=trigger.closest('.ui-quantity-choice');if(event.key==='Tab'){close();return;}if(event.key==='Escape'){if(owner){event.preventDefault();event.stopPropagation();close({focus:true});}return;}if(!['Enter',' ','ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const opened=owner===choice;if(event.key==='Enter'||event.key===' '){opened?commit():open(choice);return;}if(event.key==='Home'||event.key==='End'){const next=event.key==='Home'?0:[...control(choice).options].filter(option=>!option.disabled).length-1;opened?highlight(next):open(choice,next);return;}if(!opened)open(choice);else highlight((index+(event.key==='ArrowDown'?1:-1)+options().length)%options().length);});
 menu.addEventListener('pointerdown',event=>event.preventDefault());menu.addEventListener('pointermove',event=>{const option=event.target.closest('[role="option"]');if(option)highlight(Number(option.dataset.index));});menu.addEventListener('click',event=>{const option=event.target.closest('[role="option"]');if(option){highlight(Number(option.dataset.index));commit();}});
 document.addEventListener('pointerdown',event=>{if(owner&&!owner.contains(event.target)&&!menu.contains(event.target))close();});document.addEventListener('focusin',event=>{if(owner&&!owner.contains(event.target)&&!menu.contains(event.target))close();});document.addEventListener('scroll',event=>{if(owner&&!menu.contains(event.target))close();},true);view.addEventListener('resize',()=>close());
 return {close,refresh(){close();root.querySelectorAll('.ui-quantity-choice').forEach(sync);}};
}
