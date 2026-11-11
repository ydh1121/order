// CI-only composition entry. The runner substitutes this for /main.mjs in its
// loopback server; it is not part of the production build or approved QA shell.
import {createOrderApp} from '/app.mjs';
import {createQ4Review} from '/q4-review.mjs';
import {createBrowserStorage} from '/storage.mjs';

const configuration=await (await fetch('/__quote0579-config.json')).json();
const params=new URL(location.href).searchParams;
const data=structuredClone(configuration.seed);
if(params.get('seed')==='invalid')data.lines[0].qty='';
const storage=createBrowserStorage();
const before=await storage.load();
const seeded=await storage.commit(data,{expectedRevision:before.revision,expectedToken:before.versionToken,transactionId:'quote0579-seed-'+crypto.randomUUID()});
if(!seeded.ok)throw new Error('QUOTE0579_SEED_FAILED:'+seeded.status);
const pending=new Map(),calls=[];
let mode=params.get('provider')||'controlled';
function envelope(call,kind='valid',partial=false) {
  const response=structuredClone(configuration.responses[kind]);
  if(!response)throw new Error('QUOTE0579_UNKNOWN_RESPONSE');
  response.requestId=call.requestId;response.inputRevision=call.inputRevision;
  response.completion=partial?'PARTIAL':'COMPLETE';response.coverage.complete=!partial;
  return response;
}
const provider={query(call){
  calls.push(call);
  if(mode==='immediate')return envelope(call);
  return new Promise((resolve,reject)=>pending.set(call.requestId,{call,resolve,reject}));
}};
const app=createOrderApp({quoteProvider:mode==='absent'?null:provider});
app.connectQ4(createQ4Review({bridge:app.regularBridge}));
await app.boot();
window.__quote0579=Object.freeze({
  source:'ACTUAL_APP_FACTORY_WITH_SYNTHETIC_PROVIDER',app,
  calls:()=>calls.map(({requestId,inputRevision,input,signal})=>({requestId,inputRevision,input:structuredClone(input),aborted:signal.aborted})),
  current:()=>app.quoteService.snapshot(),
  storage:()=>storage.load(),
  mode(value){mode=value;},
  partial(id,kind='valid'){const item=pending.get(id);if(!item)throw new Error('UNKNOWN_QUOTE0579_REQUEST');item.call.onPartial(envelope(item.call,kind,true));},
  finish(id,kind='valid'){const item=pending.get(id);if(!item)throw new Error('UNKNOWN_QUOTE0579_REQUEST');item.resolve(envelope(item.call,kind));},
  fail(id){const item=pending.get(id);if(!item)throw new Error('UNKNOWN_QUOTE0579_REQUEST');item.reject(new Error('SYNTHETIC_QUOTE_TRANSPORT_FAILURE'));},
});
document.documentElement.dataset.quote0579Ready='true';
