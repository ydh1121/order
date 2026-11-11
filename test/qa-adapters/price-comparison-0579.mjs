// Test-only binding for the approved QA shell. It has no UI, independent
// calculator, business state machine, automatic completion or network client.
import {calculateQuote} from '../../src/engine/calculation/quote.mjs';
import {periodQuantity} from '../../src/engine/calculation/period.mjs';
import {customerQuoteResponse} from '../../src/engine/contracts/quote-response.mjs';
import {createQuoteRequestService} from '../../src/engine/adapters/quote-request.mjs';
import {researchCase,fixtureTime} from '../fixtures/qa-price-comparison-0579.mjs';

export function executeResearchCalculation(id) {
  const fixture=researchCase(id);
  if(fixture.kind==='request')throw new TypeError('REQUEST_CASE_REQUIRES_PRODUCT_REQUEST_SERVICE');
  return fixture.kind==='period' ? periodQuantity(fixture.periodInput) : calculateQuote(fixture.request);
}

/** Controlled transport only; every transition remains in the product owner.
 * A shell must construct this separately for each frame and each reset.
 * Calls finish/fail/partial require an explicit research action. They do not
 * claim that an external provider, backend cancellation or real API ran.
 */
export function createResearchRequestSession({caseId='PC-01',onChange=()=>{}}={}) {
  const fixture=researchCase(caseId),pending=new Map(),calls=[];
  let nextId=0,clock=Date.parse(fixtureTime);
  const provider={query(call){
    calls.push(call);
    return new Promise((resolve,reject)=>pending.set(call.requestId,{call,resolve,reject}));
  }};
  const service=createQuoteRequestService({provider,clock:()=>clock,requestId:()=>`research-${++nextId}`,onChange});
  const find=id=>{const item=pending.get(id);if(!item)throw new Error('RESEARCH_REQUEST_NOT_STARTED');return item;};
  function response(id,{empty=false,resultCase='PC-01',completion='COMPLETE'}={}) {
    const {call}=find(id);
    return customerQuoteResponse({requestId:id,inputRevision:call.inputRevision,completion,
      results:empty?[]:[executeResearchCalculation(resultCase)]});
  }
  return {
    fixture,service,calls,
    start(inputRevision=1){return service.start({input:structuredClone(fixture.request.input),inputRevision});},
    partial(id,options={}){find(id).call.onPartial(response(id,{...options,completion:'PARTIAL'}));return service.snapshot();},
    finish(id,options={}){find(id).resolve(response(id,options));},
    fail(id){find(id).reject(new Error('SYNTHETIC_TRANSPORT_FAILURE'));},
    setClock(value){if(!Number.isFinite(value))throw new TypeError('INVALID_RESEARCH_CLOCK');clock=value;},
  };
}
