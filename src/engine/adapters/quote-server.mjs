// SERVER ONLY. Do not export through src/browser or copy into public build output.
import {calculateQuote} from '../calculation/quote.mjs';
import {customerQuoteResponse,validQuoteRequestId,validQuoteRevision} from '../contracts/quote-response.mjs';
const id=value=>typeof value==='string' && value.length>0 && value.length<=200;
const copyLine=line=>Object.fromEntries(['id','siteId','productId','region','quantity','unit','offerId','periodId','cadenceId','deliveryTermsId','costBasisId'].filter(key=>Object.hasOwn(line,key)).map(key=>[key,structuredClone(line[key])]));

/**
 * Injection boundary for an existing authorized server provider, not an HTTP API.
 * authorizeSites and verifyApproval must use server-owned authority; metadata alone
 * is not approval. No caller URL, provider key, logger, analytics or auth system.
 */
export function createQuoteServerProvider({authorizeSites,loadApprovedSource,verifyApproval,clock=()=>Date.now()}={}) {
  return Object.freeze({async query({requestId,inputRevision,input,signal}={}) {
    if(!validQuoteRequestId(requestId)||!validQuoteRevision(inputRevision))throw new TypeError('INVALID_QUOTE_IDENTITY');
    const unavailable=code=>customerQuoteResponse({requestId,inputRevision,status:'UNAVAILABLE',reasonCodes:[code]});
    if([authorizeSites,loadApprovedSource,verifyApproval].some(fn=>typeof fn!=='function'))return unavailable('APPROVED_SOURCE_NOT_CONNECTED');
    if(!Array.isArray(input?.lines)||!input.lines.length||input.lines.length>1000||input.lines.some(line=>!line||!id(line.siteId)))return unavailable('CONDITIONS_INVALID');
    const sites=[...new Set(input.lines.map(line=>line.siteId))].sort();
    const publicInput={lines:input.lines.map(copyLine),...(input.comparisonTotal!=null?{comparisonTotal:structuredClone(input.comparisonTotal)}:{})};
    try {
      // A request body cannot supply this decision, the source or comparison context.
      if(await authorizeSites({siteIds:[...sites],requestId,inputRevision})!==true)return unavailable('SITE_NOT_AUTHORIZED');
      if(signal?.aborted)return unavailable('SOURCE_UNAVAILABLE');
      const source=await loadApprovedSource({input:structuredClone(publicInput),siteIds:[...sites],requestId,inputRevision,signal});
      if(!source)return unavailable('SOURCE_UNAVAILABLE');
      if(await verifyApproval({source,siteIds:[...sites],requestId,inputRevision})!==true)return unavailable('SOURCE_APPROVAL_REQUIRED');
      if(signal?.aborted)return unavailable('SOURCE_UNAVAILABLE');
      const asOf=new Date(clock()).toISOString();
      const result=calculateQuote({input:{...publicInput,asOf,...(source.comparisonContext?{comparisonContext:structuredClone(source.comparisonContext)}:{})},catalog:source.catalog,priceBook:source.priceBook,rules:source.rules});
      return customerQuoteResponse({requestId,inputRevision,results:[result]});
    } catch {
      // No raw exception, provider response, keys or private terms reach the client.
      return customerQuoteResponse({requestId,inputRevision,status:'FAILED',reasonCodes:['SOURCE_UNAVAILABLE']});
    }
  }});
}
