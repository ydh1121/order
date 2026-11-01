/** Non-identifying failure snapshot. No raw storage, IDs, emails, or DOM text. */
export async function storageDiagnostics({key='order_q1_q4_v1',window:providedWindow}={}){
 const view=providedWindow??globalThis,code=value=>typeof value==='string'&&/^[A-Z0-9_:-]{1,100}$/.test(value)?value:null;
 const dataset=view.document?.documentElement?.dataset??{};
 const result={capturedAt:new Date().toISOString(),document:{readyState:view.document?.readyState??null,visibilityState:view.document?.visibilityState??null},
  storage:{ready:dataset.storageReady==='true',pending:dataset.storagePending==='true',status:code(dataset.storageStatus),record:'UNREAD'},
  iana:null,email:null,lifecycle:null};
 try{const raw=view.localStorage.getItem(key);if(raw===null)result.storage.record='ABSENT';else{
   let envelope;try{envelope=JSON.parse(raw);}catch{result.storage.record='CORRUPT_JSON';}
   if(envelope&&typeof envelope==='object'&&!Array.isArray(envelope))Object.assign(result.storage,{record:'PRESENT',schemaVersion:Number.isSafeInteger(envelope.schemaVersion)?envelope.schemaVersion:null,
    revision:Number.isSafeInteger(envelope.revision)?envelope.revision:null,state:['data','reset'].includes(envelope.state)?envelope.state:'UNSUPPORTED',
    counts:Object.fromEntries(['lines','locations','allocations'].map(name=>[name,Array.isArray(envelope.data?.[name])?envelope.data[name].length:null]))});
   else if(result.storage.record!=='CORRUPT_JSON')result.storage.record='INVALID_SHAPE';
  }}catch{result.storage.record='UNAVAILABLE';}
 try{if(view.OrderEmailDomain?.inspect){const details=await view.OrderEmailDomain.inspect();result.iana=details.reference;result.email={service:details.service,proofStates:details.proofStates,pendingDomains:details.pendingDomains,pendingConsumers:details.pendingConsumers,startedRequests:details.startedRequests};}
  else result.email={status:'SERVICE_NOT_INITIALIZED'};}catch{result.email={status:'INSPECTION_FAILED'};}
 try{result.lifecycle=view.OrderEmailLifecycle?.inspect?.()??{status:'LIFECYCLE_NOT_INITIALIZED'};}catch{result.lifecycle={status:'INSPECTION_FAILED'};}
 return result;
}
