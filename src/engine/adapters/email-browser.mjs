import {validateEmailSyntax,emailCompletionGate} from '../validation/email.mjs';
import {validateEmailDomain} from '../validation/email-dns.mjs';
import {browserDomainToASCII,createBrowserDnsResolver} from './dns-browser.mjs';

/** Field-scoped latest-result ownership, domain-scoped single-flight and TTL cache. */
export function createBrowserEmailService({referenceProvider,fetcher=globalThis.fetch,now=Date.now,provider='cloudflare',maxQueries=32,maxHttpRequests=32,queryTimeoutMs=1500,totalTimeoutMs=10000,retries=0,maxCachedDomains=128,onResult=null}={}){
  if(!referenceProvider?.get||typeof now!=='function'||!Number.isInteger(maxCachedDomains)||maxCachedDomains<1||maxCachedDomains>10000)throw TypeError('BROWSER_EMAIL_CONFIG');
  const fields=new Map(),flights=new Map(),cache=new Map();let sequence=0,closed=false;
  const detach=(entry,token)=>{entry.consumers.delete(token);if(!entry.consumers.size&&!entry.settled){entry.controller.abort();if(flights.get(entry.domain)===entry)flights.delete(entry.domain);}};
  async function getDns(domain,signal,token){
    const hit=cache.get(domain),time=now();
    if(hit&&Number.isFinite(time)&&time>=hit.evidence.evaluatedAt&&time<hit.evidence.validUntil)return structuredClone(hit);
    cache.delete(domain);
    let entry=flights.get(domain);
    if(!entry){entry={domain,controller:new AbortController(),consumers:new Set(),settled:false};flights.set(domain,entry);
      const resolver=createBrowserDnsResolver({fetcher,now,provider,maxRequests:maxHttpRequests,timeoutMs:queryTimeoutMs,retries});
      entry.promise=validateEmailDomain(domain,{resolver,now,maxQueries,timeoutMs:queryTimeoutMs+50,totalTimeoutMs,signal:entry.controller.signal}).then(result=>{
        if(flights.get(domain)===entry&&!entry.controller.signal.aborted&&Number.isFinite(result.evidence.validUntil)&&result.evidence.validUntil>now()&&['VALID','INVALID'].includes(result.status)){
          if(cache.size>=maxCachedDomains)cache.delete(cache.keys().next().value);cache.set(domain,structuredClone(result));
        }
        return result;
      }).finally(()=>{entry.settled=true;if(flights.get(domain)===entry)flights.delete(domain);});
    }
    entry.consumers.add(token);
    let onAbort;
    const cancelled=new Promise(resolve=>{onAbort=()=>{detach(entry,token);resolve(null);};signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();});
    try{return await Promise.race([entry.promise,cancelled]);}finally{signal.removeEventListener('abort',onAbort);detach(entry,token);}
  }
  const cancel=fieldId=>{const prior=fields.get(fieldId);if(prior)prior.controller.abort();fields.delete(fieldId);};
  return {
    async validate(fieldId,raw,{phase='complete'}={}){
      if(closed)throw Error('EMAIL_SERVICE_CLOSED');
      if(typeof fieldId!=='string'||!fieldId)throw TypeError('EMAIL_FIELD_ID');
      const prior=fields.get(fieldId);const requestId=++sequence,controller=new AbortController(),lease={requestId,controller};fields.set(fieldId,lease);
      const snapshot=await referenceProvider.get();
      let syntax=validateEmailSyntax({raw,phase},{domainToASCII:browserDomainToASCII,tldData:snapshot,nowMs:now()});
      const dnsPromise=syntax.status==='VALID'&&!controller.signal.aborted?getDns(syntax.normalized.domain,controller.signal,lease):Promise.resolve(null);
      prior?.controller.abort();
      const dns=await dnsPromise;
      // Reference data can expire while an otherwise valid DNS request is pending.
      syntax=validateEmailSyntax({raw,phase},{domainToASCII:browserDomainToASCII,tldData:snapshot,nowMs:now()});
      const current=!closed&&!controller.signal.aborted&&fields.get(fieldId)===lease;
      const packet={fieldId,requestId,raw,apply:current,syntax,dns,gate:emailCompletionGate(syntax,dns),result:dns&&syntax.status==='VALID'?{...syntax,status:dns.status,reasonCodes:dns.reasonCodes,versions:{...syntax.versions,rules:`${syntax.versions.rules}+${dns.versions.rules}`},evidence:{...syntax.evidence,dns:dns.evidence}}:syntax};
      if(current&&typeof onResult==='function')onResult(structuredClone(packet));
      return packet;
    },
    cancel,
    invalidateDomain(domain){cache.delete(domain);const entry=flights.get(domain);entry?.controller.abort();flights.delete(domain);},
    clear(){for(const id of fields.keys())cancel(id);for(const entry of flights.values())entry.controller.abort();flights.clear();cache.clear();},
    close(){this.clear();closed=true;},
    inspect(){return {activeFields:fields.size,inFlightDomains:flights.size,cachedDomains:cache.size};},
  };
}
