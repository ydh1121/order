import {customerQuoteResponse,readCustomerQuoteResponse,quoteProofGate,validQuoteRequestId,validQuoteRevision} from '../contracts/quote-response.mjs';

/** One request owner, shared by the product and test adapters. No transport is invented. */
const deadlineTimer=(callback,delay)=>{const timer=setTimeout(callback,delay);timer?.unref?.();return timer;};
export function createQuoteRequestService({provider=null,clock=()=>Date.now(),requestId=()=>globalThis.crypto.randomUUID(),onChange=()=>{},longPendingAfterMs=15000,schedule=deadlineTimer,unschedule=clearTimeout}={}) {
  if ([clock,requestId,onChange,schedule,unschedule].some(fn=>typeof fn!=='function') || !Number.isFinite(longPendingAfterMs) || longPendingAfterMs < 0) throw new TypeError('INVALID_QUOTE_SERVICE_OPTIONS');
  let attempt=null, revision=null, lastInput=null, wake=null;
  let state={status:'IDLE',requestId:null,inputRevision:null,startedAt:null,endedAt:null,backendCancellation:'NONE',response:null};
  const ids=new Set();
  const now=()=>{const value=clock();if(!Number.isFinite(value))throw new TypeError('INVALID_CLOCK');return value;};
  function snapshot() {
    const time=now(), elapsedMs=state.startedAt === null ? 0 : Math.max(0,(state.endedAt ?? time)-state.startedAt);
    let status=state.status;
    if (status==='PENDING' && elapsedMs>=longPendingAfterMs) status='LONG_PENDING';
    if (['COMPLETE','PARTIAL'].includes(status) && state.response?.quotes.some(quote=>quote.validUntil!==null && Date.parse(quote.validUntil)<=time)) status='EXPIRED';
    const value={...state,status,elapsedMs};
    return structuredClone({...value,proof:quoteProofGate(value)});
  }
  function armDeadline() {
    if(wake!==null){unschedule(wake);wake=null;}
    const deadlines=[];
    if(state.status==='PENDING')deadlines.push(state.startedAt+longPendingAfterMs);
    if(['PARTIAL','COMPLETE'].includes(state.status))for(const quote of state.response?.quotes||[])if(quote.validUntil!==null)deadlines.push(Date.parse(quote.validUntil));
    if(deadlines.length)wake=schedule(()=>{wake=null;publish();},Math.max(0,Math.min(2147483647,Math.min(...deadlines)-now())));
  }
  const publish=()=>{const value=snapshot();state.status=value.status;armDeadline();onChange(value);return value;};
  const settle=(a,value)=>{a.resolve(value);return value;};
  const current=a=>attempt===a && a.accepting && revision===a.inputRevision;
  function invalidate(status) {
    const invalidated=attempt;
    if(invalidated){invalidated.accepting=false;invalidated.controller.abort();}
    state={...state,status,endedAt:now()};
    const value=publish();return invalidated?settle(invalidated,value):value;
  }
  function receive(a,raw,partial) {
    if(!current(a))return snapshot();
    let response;
    try {response=readCustomerQuoteResponse(raw);} catch {return fail(a,'INVALID_RESPONSE');}
    if(response.requestId!==a.requestId || response.inputRevision!==a.inputRevision || response.completion!==(partial?'PARTIAL':'COMPLETE'))return fail(a,'INVALID_RESPONSE');
    // Candidate failures inside an explicitly unfinished response do not finish
    // the request. Only the provider's final response/rejection is terminal.
    const status=partial?'PARTIAL':response.status==='FAILED'?'FAILED':response.status==='UNAVAILABLE'?'UNAVAILABLE':response.status==='EXPIRED'?'EXPIRED':response.quotes.length?'COMPLETE':'EMPTY';
    state={...state,status,response,endedAt:partial?null:now()};
    if(!partial)a.accepting=false;
    const value=publish();return partial?value:settle(a,value);
  }
  function fail(a,code) {
    if(!current(a))return snapshot();
    a.accepting=false;
    state={...state,status:'FAILED',endedAt:now(),response:customerQuoteResponse({requestId:a.requestId,inputRevision:a.inputRevision,status:'FAILED',reasonCodes:[code]})};
    return settle(a,publish());
  }
  function start({input,inputRevision}={}) {
    if(!validQuoteRevision(inputRevision))throw new TypeError('INVALID_INPUT_REVISION');
    const id=requestId();
    if(!validQuoteRequestId(id)||ids.has(id))throw new TypeError('NEW_REQUEST_ID_REQUIRED');
    const data=structuredClone(input);
    if(attempt){attempt.accepting=false;attempt.controller.abort();attempt.resolve({...snapshot(),status:'STALE',proof:quoteProofGate({status:'STALE'})});}
    ids.add(id);revision=inputRevision;lastInput=data;
    let resolve;const settled=new Promise(done=>{resolve=done;});
    const a={requestId:id,inputRevision,controller:new AbortController(),accepting:true,resolve};attempt=a;
    const time=now();
    state={status:'PENDING',requestId:id,inputRevision,startedAt:time,endedAt:null,backendCancellation:'NONE',response:null};
    if(!provider || typeof provider.query!=='function'){
      a.accepting=false;
      state={...state,status:'UNAVAILABLE',endedAt:time,response:customerQuoteResponse({requestId:id,inputRevision,status:'UNAVAILABLE',reasonCodes:['APPROVED_SOURCE_NOT_CONNECTED']})};
      settle(a,publish());return {requestId:id,inputRevision,settled};
    }
    publish();
    Promise.resolve().then(()=>{
      if(!current(a))return snapshot();
      return provider.query({requestId:id,inputRevision,input:structuredClone(data),signal:a.controller.signal,onPartial:value=>receive(a,value,true)});
    }).then(value=>current(a)?receive(a,value,false):snapshot(),()=>fail(a,'NETWORK_FAILURE'));
    return {requestId:id,inputRevision,settled};
  }
  function retry() {
    if(state.inputRevision===null || lastInput===null || revision!==state.inputRevision)throw new TypeError('CURRENT_INPUT_REQUIRED');
    return start({input:structuredClone(lastInput),inputRevision:revision});
  }
  function reconcileRevision(value) {
    if(!validQuoteRevision(value))throw new TypeError('INVALID_INPUT_REVISION');
    if(revision===value)return snapshot();
    revision=value;
    return state.status==='IDLE'?snapshot():invalidate('STALE');
  }
  function detach() {
    if(!attempt || ['DETACHED','CANCELLED','STALE'].includes(state.status))return snapshot();
    state={...state,backendCancellation:attempt.accepting?'UNKNOWN':state.backendCancellation};
    return invalidate('DETACHED');
  }
  async function cancel() {
    const a=attempt;
    if(!a || !a.accepting)return snapshot();
    detach();
    if(typeof provider?.cancel!=='function')return snapshot();
    let ack;try {ack=await provider.cancel({requestId:a.requestId,inputRevision:a.inputRevision});}catch{return snapshot();}
    if(attempt===a && revision===a.inputRevision && state.status==='DETACHED' && ack?.requestId===a.requestId && ack?.inputRevision===a.inputRevision && ack?.cancelled===true){state={...state,status:'CANCELLED',backendCancellation:'CONFIRMED'};return publish();}
    return snapshot();
  }
  return Object.freeze({start,retry,reconcileRevision,cancel,detach,snapshot});
}
