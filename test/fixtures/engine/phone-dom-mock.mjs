// Bounded event/selection harness. This is not a browser implementation or OS verification.
export function phoneDOMHarness() {
  const previous = {document:globalThis.document,CustomEvent:globalThis.CustomEvent};
  class Element {
    constructor(tag) { this.tagName=tag;this.value='';this.hidden=false;this.attributes=new Map();this.dataset={};this.children=[];this.listeners=new Map();this.selectionStart=0;this.selectionEnd=0;this.selectionDirection='none'; }
    append(...children){for(const child of children){child.parent=this;this.children.push(child);}}
    replaceWith(el){const parent=this.parent;if(parent){const index=parent.children.indexOf(this);parent.children[index]=el;el.parent=parent;}this.parent=null;}
    setAttribute(k,v){this.attributes.set(k,String(v));} getAttribute(k){return this.attributes.get(k)??null;}
    removeAttribute(k){this.attributes.delete(k);} toggleAttribute(k,flag){if(flag)this.setAttribute(k,'');else this.removeAttribute(k);}
    closest(){return null;} querySelector(){return null;} contains(el){return el===this||this.children.some(c=>c.contains(el));}
    addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn);}
    dispatchEvent(event){if(!event.target)event.target=this;for(const handler of this.listeners.get(event.type)??[])handler(event);if(event.bubbles&&this.parent)this.parent.dispatchEvent(event);return !event.defaultPrevented;}
    fire(type,extra={}){const e={type,bubbles:true,cancelable:true,target:this,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.bubbles=false;},...extra};this.dispatchEvent(e);return e;}
    focus(){const old=globalThis.document.activeElement;if(old===this)return;old?.fire('focusout',{relatedTarget:this});globalThis.document.activeElement=this;this.fire('focusin');}
    setSelectionRange(start,end,direction='none'){this.selectionStart=Math.min(start,this.value.length);this.selectionEnd=Math.min(end,this.value.length);this.selectionDirection=direction;}
    select(){this.setSelectionRange(0,this.value.length);}
  }
  globalThis.document={activeElement:null,createElement:tag=>new Element(tag)};
  globalThis.CustomEvent=class{constructor(type,options){Object.assign(this,{type,...options});}};
  const root=new Element('main');
  return {root,input(id,value='',required=true){const input=new Element('input');input.id=id;input.value=value;if(required)input.setAttribute('aria-required','true');root.append(input);return input;},
    cleanup(){globalThis.document=previous.document;globalThis.CustomEvent=previous.CustomEvent;}};
}
