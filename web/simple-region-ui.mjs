/* MSG0583 candidate only. Local catalog queries are not saved selections.
 * The parent keeps the single draft/storage/transaction owner. No API or address
 * proof is created by this two-level legal-region catalog control. */
import {listRegionRoots,listRegionLeaves,filterRegionOptions,regionSelection,inspectRegionSelection} from './region-reference.mjs';

const owners=new WeakMap();
const copy=value=>value?Object.freeze({...value}):null;
const key=value=>JSON.stringify(value??null);

export function bindSimpleRegion(host,{idPrefix,label='사업장 1',value=null,legacyText='',onSelect=()=>{},onDraftChange=()=>{}}={}){
 if(owners.has(host))return owners.get(host);
 if(!host?.ownerDocument||!idPrefix)throw TypeError('REGION_HOST_AND_ID_REQUIRED');
 const doc=host.ownerDocument,view=doc.defaultView,listeners=[],fields={};
 let accepted=null,acceptedKey='null',legacy='',rootChoice=null,leafChoice=null,baseline=null,openLevel=null,generation=0,destroyed=false,lastNotice='';
 const node=(tag,className='',text='')=>{const el=doc.createElement(tag);el.className=className;if(text)el.textContent=text;return el;};
 const on=(el,type,fn)=>{el.addEventListener(type,fn);listeners.push([el,type,fn]);};
 host.classList.add('simple-region-field');host.dataset.simpleRegion='true';
 const title=node('label','ui-field-title',label),pair=node('div','simple-region-pair');title.htmlFor=idPrefix+'-root';host.replaceChildren(title,pair);
 for(const [level,caption]of [['root','시·도'],['leaf','시·군·구']]){
  const wrap=node('div','qa-combo'),control=node('div','qa-combo-trigger qa-combo-editable'),input=node('input'),toggle=node('button'),arrow=node('span','t-acc-chevron'),list=node('div','qa-combo-menu'),empty=node('p','muted');
  wrap.dataset.simpleRegionLevel=level;control.dataset.variant='editable';control.dataset.selected='false';
  input.id=idPrefix+'-'+level;input.type='text';input.autocomplete='off';input.maxLength=1024;input.placeholder=caption;input.dataset.regionQuery=level;
  input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');input.setAttribute('aria-label',label+' '+caption);input.setAttribute('spellcheck','false');
  list.id=input.id+'-list';list.dataset.regionList=level;list.setAttribute('role','listbox');list.setAttribute('aria-label',label+' '+caption);list.hidden=true;input.setAttribute('aria-controls',list.id);
  toggle.type='button';toggle.dataset.regionToggle=level;toggle.dataset.combo=input.id;toggle.setAttribute('aria-label',label+' '+caption+' 선택 목록');toggle.setAttribute('aria-controls',list.id);toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-haspopup','listbox');
  arrow.setAttribute('aria-hidden','true');arrow.innerHTML=view?.OrderAccordionView?.chevron||'';toggle.append(arrow);control.append(input,toggle);
  empty.dataset.regionEmpty=level;empty.setAttribute('role','status');empty.textContent='일치하는 지역이 없습니다.';empty.hidden=true;
  wrap.append(control,list,empty);pair.append(wrap);fields[level]={wrap,control,input,toggle,list,empty,composing:false,index:-1,options:[]};
 }
 function inspect(){return Object.freeze({editing:editing(),composing:fields.root.composing||fields.leaf.composing,selection:copy(accepted),rootQuery:fields.root.input.value,leafQuery:fields.leaf.input.value,openLevel});}
 function editing(){return !!baseline&&(fields.root.input.value!==baseline.rootQuery||fields.leaf.input.value!==baseline.leafQuery||rootChoice?.code!==baseline.rootCode||leafChoice?.code!==baseline.leafCode);}
 function notify(){if(destroyed)return;const snapshot=inspect(),signature=JSON.stringify(snapshot);if(signature!==lastNotice){lastNotice=signature;onDraftChange(snapshot);}}
 function leafAvailable(){return !!rootChoice&&!fields.root.composing&&fields.root.input.value===rootChoice.label&&!regionSelection(rootChoice.code,rootChoice.code);}
 function paint(){
  const direct=rootChoice&&!!regionSelection(rootChoice.code,rootChoice.code);
  fields.leaf.wrap.hidden=!!direct;fields.leaf.input.disabled=!leafAvailable();fields.leaf.toggle.disabled=!leafAvailable();
  fields.root.control.dataset.selected=String(!!rootChoice&&fields.root.input.value===rootChoice.label);
  fields.leaf.control.dataset.selected=String(!!leafChoice&&fields.leaf.input.value===leafChoice.label);
  host.dataset.editing=String(editing());host.dataset.composing=String(fields.root.composing||fields.leaf.composing);
 }
 function close({notifyChange=true}={}){
  openLevel=null;
  for(const f of Object.values(fields)){f.list.hidden=true;f.empty.hidden=true;f.index=-1;f.input.setAttribute('aria-expanded','false');f.input.removeAttribute('aria-activedescendant');f.toggle.setAttribute('aria-expanded','false');}
  if(notifyChange)notify();
 }
 function highlight(level,index){
  const f=fields[level];f.index=index;
  [...f.list.children].forEach((option,i)=>{option.dataset.active=String(i===index);option.setAttribute('aria-selected',String(i===index));});
  const option=f.list.children[index];if(option){f.input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView?.({block:'nearest'});}else f.input.removeAttribute('aria-activedescendant');
 }
 function open(level,{all=false}={}){
  const f=fields[level];if(destroyed||f.input.disabled||f.composing||level==='leaf'&&!leafAvailable())return;
  close({notifyChange:false});openLevel=level;
  f.options=filterRegionOptions(level==='root'?listRegionRoots():listRegionLeaves(rootChoice?.code),all?'':f.input.value);
  f.list.replaceChildren(...f.options.map(option=>{const b=node('button','',option.label);b.type='button';b.tabIndex=-1;b.id=f.list.id+'-option-'+option.code;b.dataset.regionOption=option.code;b.dataset.regionLevel=level;b.dataset.active='false';b.setAttribute('role','option');b.setAttribute('aria-selected','false');return b;}));
  f.list.hidden=false;f.empty.hidden=!!f.options.length;f.input.setAttribute('aria-expanded','true');f.toggle.setAttribute('aria-expanded','true');highlight(level,-1);notify();
 }
 function isChosenLabel(level){const chosen=level==='root'?rootChoice:leafChoice;return !!chosen&&fields[level].input.value===chosen.label;}
 function accept(selection,source){
  const changed=key(selection)!==acceptedKey;accepted=copy(selection);acceptedKey=key(selection);legacy='';
  rootChoice=listRegionRoots().find(row=>row.code===selection.rootCode)||null;
  leafChoice=listRegionLeaves(selection.rootCode).find(row=>row.code===selection.leafCode)||null;
  fields.root.input.value=selection.rootLabel;fields.leaf.input.value=selection.leafLabel;
  baseline={rootQuery:fields.root.input.value,leafQuery:fields.leaf.input.value,rootCode:rootChoice?.code,leafCode:leafChoice?.code};
  generation++;close({notifyChange:false});paint();if(changed)onSelect(copy(selection),Object.freeze({source,generation}));notify();
 }
 function choose(level,code,source){
  const f=fields[level];if(destroyed||f.input.disabled||f.composing||level==='leaf'&&!leafAvailable()||openLevel!==level||!f.options.some(option=>option.code===code))return;
  generation++;
  if(level==='root'){
   const choice=listRegionRoots().find(row=>row.code===code);if(!choice)return;
   const same=rootChoice?.code===code;rootChoice=choice;f.input.value=choice.label;
   if(!same){leafChoice=null;fields.leaf.input.value='';}
   const direct=regionSelection(code,code);if(direct){accept(direct,source);f.input.focus({preventScroll:true});return;}
   const retained=leafChoice&&regionSelection(code,leafChoice.code);if(retained)accept(retained,source);
   else{close({notifyChange:false});paint();notify();}
   fields.leaf.input.focus({preventScroll:true});open('leaf',{all:true});
  }else{
   const selection=regionSelection(rootChoice?.code,code);if(!selection)return;
   accept(selection,source);f.input.focus({preventScroll:true});
  }
 }
 function setValue(next,{legacyText:raw='',force=false}={}){
  if(destroyed)return false;const verdict=inspectRegionSelection(next??null),selection=copy(verdict.selection),nextKey=key(selection),text=String(raw??'');
  if(!force&&nextKey===acceptedKey&&(selection||text===legacy))return true;
  if(!force&&(editing()||fields.root.composing||fields.leaf.composing))return false;
  generation++;accepted=selection;acceptedKey=nextKey;legacy=text;
  rootChoice=verdict.valid?listRegionRoots().find(row=>row.code===selection.rootCode)||null:null;
  leafChoice=verdict.valid?listRegionLeaves(selection.rootCode).find(row=>row.code===selection.leafCode)||null:null;
  fields.root.input.value=selection?.rootLabel||text;fields.leaf.input.value=selection?.leafLabel||'';
  fields.root.composing=false;fields.leaf.composing=false;
  baseline={rootQuery:fields.root.input.value,leafQuery:fields.leaf.input.value,rootCode:rootChoice?.code,leafCode:leafChoice?.code};
  close({notifyChange:false});paint();lastNotice=JSON.stringify(inspect());return true;
 }
 for(const level of ['root','leaf']){
  const f=fields[level];
  on(f.input,'input',()=>{if(destroyed)return;generation++;paint();if(!f.composing)open(level);else notify();});
  on(f.input,'compositionstart',()=>{if(destroyed)return;generation++;f.composing=true;close({notifyChange:false});paint();notify();});
  on(f.input,'compositionend',()=>{if(destroyed)return;generation++;f.composing=false;paint();open(level);});
  on(f.input,'keydown',event=>{
   if(destroyed||f.composing||event.isComposing||event.keyCode===229)return;
   if(event.key==='Escape'&&openLevel){event.preventDefault();event.stopPropagation();close();return;}
   if(event.key==='Tab'){close();return;}
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();const forward=event.key==='ArrowDown';
    if(openLevel!==level)open(level,{all:isChosenLabel(level)});
    if(f.options.length)highlight(level,f.index<0?(forward?0:f.options.length-1):(f.index+(forward?1:-1)+f.options.length)%f.options.length);
    return;
   }
   if(event.key==='Enter'){
    event.preventDefault();event.stopPropagation();if(openLevel===level&&f.index>=0)choose(level,f.options[f.index].code,'keyboard');
   }
  });
  on(f.toggle,'click',()=>{if(destroyed||f.input.disabled||f.composing)return;if(openLevel===level)close();else open(level,{all:isChosenLabel(level)});f.input.focus({preventScroll:true});});
  on(f.list,'pointerdown',event=>{if(event.target.closest?.('[data-region-option]'))event.preventDefault();});
  on(f.list,'pointermove',event=>{const option=event.target.closest?.('[data-region-option]');if(option&&f.list.contains(option))highlight(level,f.options.findIndex(row=>row.code===option.dataset.regionOption));});
  on(f.list,'click',event=>{const option=event.target.closest?.('[data-region-option]');if(option&&f.list.contains(option))choose(level,option.dataset.regionOption,'pointer');});
 }
 const outside=event=>{if(openLevel&&!host.contains(event.target))close();};on(doc,'pointerdown',outside);on(doc,'focusin',outside);
 const destroy=()=>{if(destroyed)return;generation++;close({notifyChange:false});destroyed=true;listeners.forEach(([el,type,fn])=>el.removeEventListener(type,fn));owners.delete(host);};
 setValue(value,{legacyText,force:true});
 const api=Object.freeze({setValue,close,inspect,destroy});owners.set(host,api);return api;
}
