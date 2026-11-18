import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copySimpleLine,bindQuoteModeSwitch} from '../../web/quote-mode-switch.mjs';
import {emptyStoredPayload,projectStoredPayload} from '../../web/storage.mjs';

const line={id:'sku-known',housing:'4',size:'특란',pack:'30',qty:'6050',qtyUnit:'each',qtyDisplayUnit:'tray',price:'10000'};
const source={lines:[line],simpleQuote:{specUnknown:false,consultationInterest:true,sharedRegion:'서울'},locations:[{id:'private-site'}],allocations:[]};
test('explicit transfer preserves raw purchase amounts, existing destination data, and isolation',()=>{
 const destination={...emptyStoredPayload(),locations:[{id:'detail-site',name:'상세 사업장'}]};
 const result=copySimpleLine(source,destination);
 assert.equal(result.status,'READY');
 const stored=projectStoredPayload(result.data);
 assert.deepEqual(stored.lines,[line]);assert.deepEqual(stored.locations,destination.locations);
 assert.equal(stored.allocationRevision,1);assert.equal(stored.current,line.id);assert.equal(stored.open,'q2');
 assert(!Object.hasOwn(stored,'simpleQuote'));assert.deepEqual(destination.lines,[]);
 assert.equal(copySimpleLine(source,stored).status,'ALREADY_COPIED');
});
test('unknown spec, in-progress detail input and conflicting or duplicate manual lines are retained',()=>{
 const blank=emptyStoredPayload();
 assert.equal(copySimpleLine({...source,simpleQuote:{specUnknown:true}},blank).status,'NO_KNOWN_LINE');
 assert.equal(copySimpleLine({...source,lines:[]},blank).status,'NO_KNOWN_LINE');
 assert.equal(copySimpleLine(source,{...blank,bodyCheckpoint:{q1Selection:{housing:'3'}}}).status,'EXISTING_LINE');
 assert.equal(copySimpleLine(source,{...blank,lines:[{...line,qty:'10'}]}).status,'EXISTING_LINE');
 assert.equal(copySimpleLine(source,{...blank,lines:[{...line,id:'different'}]}).status,'EXISTING_LINE');
 const untouched=copySimpleLine(source,{...blank,bodyCheckpoint:{q1Selection:{id:'empty',housing:'',size:'',pack:''}}});assert.equal(untouched.status,'READY');assert(!Object.hasOwn(untouched.data,'bodyCheckpoint'));
});

function harness({simple=true,stale=false,saveResult={ok:true},remembered=false}={}){
 const nodes=new Map(),node=id=>{
  if(!nodes.has(id))nodes.set(id,Object.assign(new EventTarget(),{hidden:false,checked:false,closest:()=>node('row')}));
  return nodes.get(id);
 };
 const dialog=node('dialog');dialog.querySelector=node;
 const trace=[];
 const shell={open(){dialog.open=true;},close(){dialog.open=false;},bind(){}};
 const writer={inspectCurrent:async()=>({ok:true,revision:2,versionToken:'seen'}),load:async()=>({ok:true,data:emptyStoredPayload(),revision:stale?3:2,versionToken:stale?'changed':'seen'}),commit:async(data,opts)=>{trace.push(['copy',data.lines.length,opts.expectedRevision]);return {ok:true};}};
 bindQuoteModeSwitch({simple,dialog,trigger:node('trigger'),shell,source:()=>source,guard:()=>true,saveCurrent:async()=>{trace.push('save');return saveResult;},detailedStore:()=>writer,navigate:mode=>trace.push(['navigate',mode]),preference:{get:()=>remembered,set:()=>trace.push('remember')}});
 return {node,trace,click:key=>node(key).dispatchEvent(new Event('click')),flush:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('cancel and unchecked mode change do not copy; explicit import handles double clicks once',async()=>{
 const h=harness();h.click('trigger');assert.equal(h.node('[data-mode-option]').checked,false);h.click('[data-mode-cancel]');assert.deepEqual(h.trace,[]);
 h.click('trigger');h.click('[data-mode-confirm]');await h.flush();assert.deepEqual(h.trace,['save',['navigate',false]]);
 const copy=harness();copy.click('trigger');copy.node('[data-mode-option]').checked=true;copy.click('[data-mode-confirm]');copy.click('[data-mode-confirm]');await copy.flush();
 assert.deepEqual(copy.trace,['save',['copy',1,2],['navigate',false]]);
});
test('stale destination and failed source preserve both drafts and keep switch open',async()=>{
 for(const options of [{stale:true},{saveResult:{ok:false,status:'CONFLICT'}}]){
  const h=harness(options);h.click('trigger');h.node('[data-mode-option]').checked=true;h.click('[data-mode-confirm]');await h.flush();
  assert.deepEqual(h.trace,['save']);assert.equal(h.node('dialog').open,true);assert.match(h.node('[data-mode-error]').textContent,/다른 탭/);
 }
});
test('detailed notice opt out requires explicit check and successful save',async()=>{
 const h=harness({simple:false});h.click('trigger');assert.equal(h.node('[data-mode-option]').checked,false);h.node('[data-mode-option]').checked=true;h.click('[data-mode-confirm]');await h.flush();assert.deepEqual(h.trace,['save','remember',['navigate',true]]);
 const skip=harness({simple:false,remembered:true});skip.click('trigger');await skip.flush();assert.deepEqual(skip.trace,['save',['navigate',true]]);
});
