/** Read-only exact-source VM comparison. Never a DOM/OS/browser acceptance test. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { validateEmailDomain } from '../../src/engine/validation/email-dns.mjs';
import { validatePhone, createPhoneState, editPhone, finalizePhone } from '../../src/engine/validation/phone.mjs';
import { UX_COMPARISON_FIXTURE_VERSION, OBSERVED_AT, DOMAIN, phoneInputs, dnsCases, dnsObservation } from '../../test/fixtures/engine/ux-comparison.mjs';

const expected = [
  {id:'MSG0494',bytes:482496,sha256:'226e3594c7460299e78558bb8c96a917d33d2d56725a7fc05cb64ff7cb80a529'},
  {id:'MSG0497',bytes:489172,sha256:'eab0194284dc79634a82c26cc420c9ed52232d4ab6983be906a773780810fcce'},
];
const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath || !outputPath) throw new Error('Usage: node scripts/engine/compare-ux.mjs MSG0494.html MSG0497.html output.json');
const json = value => JSON.parse(JSON.stringify(value));
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [OBSERVED_AT])); }
  static now() { return OBSERVED_AT; }
}
function event(type,target,fields={}) {return {type,target,cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){},...fields};}
function sandbox(source) {
  let document;
  class El {
    constructor(tag) {this.tagName=tag;this.value='';this.id='';this.dataset={};this.attributes=new Map();this.children=[];this.listeners=new Map();this.hidden=false;this.selectionStart=0;this.selectionEnd=0;this.selectionDirection='none';}
    getAttribute(k){return this.attributes.get(k)??null;} setAttribute(k,v){this.attributes.set(k,String(v));} removeAttribute(k){this.attributes.delete(k);}
    toggleAttribute(k,flag){if(flag)this.setAttribute(k,'');else this.removeAttribute(k);} closest(){return null;} querySelector(){return null;}
    replaceWith(el){this.replacement=el;} append(...els){for(const el of els){this.children.push(el);el.parent=this;}}
    contains(el){return el===this||this.children.some(c=>c.contains(el));}
    addEventListener(k,listener){const a=this.listeners.get(k)||[];a.push(listener);this.listeners.set(k,a);}
    dispatchEvent(e){for(const cb of this.listeners.get(e.type)||[])cb(e);return !e.defaultPrevented;}
    focus(){document.activeElement=this;if(this.parent)this.parent.dispatchEvent(event('focusin',this));}
    setSelectionRange(a,b,d='none'){this.selectionStart=a;this.selectionEnd=b;this.selectionDirection=d;}
    select(){this.setSelectionRange(0,this.value.length);}
  }
  document={activeElement:null,createElement:tag=>new El(tag)};
  class CustomEvent {constructor(type,fields={}){this.type=type;Object.assign(this,fields);}}
  const c=vm.createContext({URL,TextEncoder,AbortController,Date:FixedDate,setTimeout,clearTimeout,document,CustomEvent,navigator:{onLine:true},console});
  c.window=c;c.__ORDER_LOWFI_TEST_ONLY__=true;c.fetch=()=>{throw new Error('LIVE_NETWORK_FORBIDDEN');};
  const start=source.indexOf('window.OrderPhone='),end=source.indexOf('window.OrderEmailUI=',start);
  if(start<0||end<start)throw new Error('Source module boundaries not found');
  vm.runInContext(source.slice(start,end),c,{timeout:1000});
  return {c,document,El};
}
function phoneDom({c,document,El}) {
  const control=raw=>{document.activeElement=null;const input=new El('input');input.id='syntheticPhone';input.value=raw;return c.OrderPhone.mount(input);};
  const state=x=>json({get:x.get(),parts:x.parts.map(p=>({value:p.value,hidden:p.hidden})),valid:x.parse().valid,datasetValid:x.shell.dataset.valid,sourceReview:x.shell.dataset.sourceReview});
  const focus=(x,i,start,end=start)=>{const el=x.parts[i];el.focus();el.setSelectionRange(start,end);x.shell.dispatchEvent(event('select',el));};
  const type=(x,i,text)=>x.shell.dispatchEvent(event('beforeinput',x.parts[i],{inputType:'insertText',data:text}));
  const paste=(x,i,text)=>x.shell.dispatchEvent(event('paste',x.parts[i],{clipboardData:{getData:()=>text}}));
  const cases=[];const run=(id,fn)=>cases.push({id,...fn()});
  run('restore_overlength',()=>({after:state(control('010-1234-12345678'))}));
  for(const [id,raw,i,text] of [['area_prefix_append','02-2345-6789',0,'2'],['representative_prefix_append','1588-1234',0,'5'],['area_three_prefix_append','02-234-5678',0,'2']])run(id,()=>{const x=control(raw);focus(x,i,x.parts[i].value.length);const before=state(x);type(x,i,text);return{before,after:state(x)};});
  run('unseparated_nine_complete',()=>{const x=control('');for(const digit of '022345678'){const el=x.parts.includes(document.activeElement)?document.activeElement:x.parts[0];const i=x.parts.indexOf(el);focus(x,i,el.value.length);type(x,i,digit);}const beforeComplete=state(x);x.shell.dispatchEvent(event('keydown',x.parts[2],{key:'Enter'}));return{beforeComplete,after:state(x)};});
  run('explicit_three_then_last',()=>{const x=control('');for(const digit of '02234'){const el=x.parts.includes(document.activeElement)?document.activeElement:x.parts[0];const i=x.parts.indexOf(el);focus(x,i,el.value.length);type(x,i,digit);}x.shell.dispatchEvent(event('keydown',x.parts[1],{key:'Tab'}));focus(x,2,0);for(const d of '5678')type(x,2,d);return{after:state(x)};});
  for(const [id,text] of [['partial_paste','12345678'],['whole_representative_paste','15881234']])run(id,()=>{const x=control('02-2345-6789');focus(x,2,0,4);const before=state(x);paste(x,2,text);return{before,after:state(x)};});
  return cases;
}
function oldDns(id,name,type) {
  if(type==='NS')return{Status:0,Answer:[{name,type:2,data:'ns.example.test.',TTL:60}]};
  const r=dnsObservation(id,name,type);return{Status:r.status==='NXDOMAIN'?3:0,Answer:r.records.map(x=>({name,type:{MX:15,A:1,AAAA:28}[type],data:type==='MX'?`${x.priority} ${x.exchange}`:x,TTL:60}))};
}
const sources=[];
for(const [i,file] of [beforePath,afterPath].entries()) {
  const bytes=fs.readFileSync(file),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(bytes.length,expected[i].bytes,'source byte count');assert.equal(sha256,expected[i].sha256,'source hash');
  const s=sandbox(bytes.toString('utf8')),dns=[];
  for(const id of dnsCases){const queries=[];s.c.OrderEmailDomain.setQAResolver(async(name,type)=>{queries.push({name,type});return oldDns(id,name,type);});const r=await s.c.OrderEmailDomain.validate(DOMAIN);dns.push({id,result:json(r),queries});}
  sources.push({...expected[i],path:path.resolve(file),emailReference:json(s.c.OrderEmailDomain.metadata.snapshot),phone:phoneInputs.map(raw=>({raw,result:json(s.c.OrderPhone.parse(raw))})),phoneDom:phoneDom(s),dns});
}
const phone=phoneInputs.map(raw=>({raw,result:validatePhone(raw)}));
const dns=[];
for(const id of dnsCases){const r=await validateEmailDomain(DOMAIN,{resolver:async(name,type)=>dnsObservation(id,name,type),now:()=>OBSERVED_AT});dns.push({id,result:r});}
dns.push({id:'sixth_mx_budget_11',result:await validateEmailDomain(DOMAIN,{resolver:async(name,type)=>dnsObservation('sixth_mx_only_a',name,type),now:()=>OBSERVED_AT,maxQueries:11})});
const phoneEdits=[];
for(const [id,raw,text] of [['area_prefix_append','02-2345-6789','022'],['representative_prefix_append','1588-1234','15885'],['area_three_prefix_append','02-234-5678','022']])phoneEdits.push({id,...editPhone(createPhoneState(raw),{type:'replaceSegment',index:0,text})});
const restored=createPhoneState('010-1234-12345678');phoneEdits.push({id:'restore_overlength',state:restored,result:finalizePhone(restored)});
let explicit=createPhoneState('02');explicit=editPhone(explicit,{type:'replaceSegment',index:1,text:'234'}).state;explicit=editPhone(explicit,{type:'move',cause:'explicit',from:1,to:2}).state;explicit=editPhone(explicit,{type:'replaceSegment',index:2,text:'5678'}).state;phoneEdits.push({id:'explicit_three_then_last',state:explicit,result:finalizePhone(explicit)});
for(const [id,text,scope]of [['partial_paste','12345678','segment'],['whole_representative_paste','15881234','field']])phoneEdits.push({id,...editPhone(createPhoneState('02-2345-6789'),{type:'paste',scope,index:2,text})});

// Fixed independent expected outcomes. This asserts evidence boundaries, not all UI behavior.
const oldResult=id=>sources[0].dns.find(x=>x.id===id).result.state;
const newResult=id=>sources[1].dns.find(x=>x.id===id).result.state;
const coreResult=id=>dns.find(x=>x.id===id).result.status;
assert.equal(oldResult('sixth_mx_only_a'),'NO_MAIL_ROUTE');assert.equal(newResult('sixth_mx_only_a'),'UNKNOWN');assert.equal(coreResult('sixth_mx_only_a'),'VALID');
assert.equal(newResult('all_six_mx_absent'),'UNKNOWN');assert.equal(coreResult('all_six_mx_absent'),'INVALID');
assert.equal(newResult('all_five_mx_absent'),'NO_MAIL_ROUTE');assert.equal(coreResult('all_five_mx_absent'),'INVALID');
assert.equal(coreResult('sixth_mx_budget_11'),'UNKNOWN');assert.equal(coreResult('null_mx'),'INVALID');assert.equal(coreResult('implicit_a'),'VALID');assert.equal(coreResult('implicit_aaaa'),'VALID');
for(const id of ['area_prefix_append','representative_prefix_append','area_three_prefix_append']){const x=sources[1].phoneDom.find(x=>x.id===id);assert.equal(x.after.get,x.before.get);assert.equal(phoneEdits.find(x=>x.id===id).accepted,false);}
assert.equal(sources[0].phoneDom.find(x=>x.id==='unseparated_nine_complete').after.valid,false);
assert.equal(sources[1].phoneDom.find(x=>x.id==='unseparated_nine_complete').after.get,'02-234-5678');
const result={fixtureVersion:UX_COMPARISON_FIXTURE_VERSION,observedAt:new FixedDate().toISOString(),scope:'Exact unmodified UX modules in Node VM with DOM/DNS doubles. No real browser, OS, live DNS, mailbox or product acceptance.',sources,astra:{phone,phoneEdits,dns},assertions:'PASS'};
fs.mkdirSync(path.dirname(path.resolve(outputPath)),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'PASS',fixtureVersion:result.fixtureVersion,sources:sources.map(({id,bytes,sha256})=>({id,bytes,sha256})),dns:dns.map(x=>({id:x.id,status:x.result.status,reason:x.result.reasonCodes[0],queries:x.result.evidence.queries})),phoneDomScenariosPerHtml:sources[0].phoneDom.length,output:path.resolve(outputPath)},null,2));
