import {validateEmailSyntax,emailCompletionGate} from '../validation/email.mjs';
import {validateEmailDomain} from '../validation/email-dns.mjs';
import {browserDomainToASCII,createBrowserDnsResolver,DOH_PROVIDERS} from './dns-browser.mjs';

export const EMAIL_PROVIDER_POLICY='bounded-independent-doh-1.0.0';

/** Domain-only diagnostics reusable by a future authorized operations screen. */
export function emailDomainDiagnostic(packet){
  const result=packet?.result,dns=packet?.dns,syntax=packet?.syntax;
  return {schemaVersion:1,domain:syntax?.normalized?.domain??null,status:result?.status??'UNKNOWN',
    reasonCodes:[...(result?.reasonCodes??[])],versions:result?.versions??null,
    reference:{version:syntax?.versions?.data??null,sha256:syntax?.evidence?.sourceSha256??null},
    dns:dns?{policy:dns.evidence?.providerPolicy??null,queries:dns.evidence?.queries??0,
      httpRequests:dns.evidence?.httpRequests??0,observedAt:dns.evidence?.observedAt??null,
      evaluatedAt:dns.evidence?.evaluatedAt??null,validUntil:dns.evidence?.validUntil??null,
      decisionScope:dns.evidence?.decisionScope??null,providers:dns.evidence?.providers??[]}:null,
    ownershipVerified:false,mailboxVerified:false};
}

/** Wait for both independent observations; a fast success cannot erase a conflict. */
function reconcileProviders(results,{now,queries,httpRequests,maxQueries,maxHttpRequests}){
  const evaluatedAt=now();
  const live=results.map(item=>{
    const result=item.result,expiry=result.evidence.validUntil;
    if(['VALID','INVALID'].includes(result.status)&&Number.isFinite(expiry)&&expiry<=evaluatedAt)
      return {...item,result:{...result,status:'UNKNOWN',reasonCodes:['DNS_DEPENDENCY_EXPIRED']}};
    return item;
  });
  const valid=live.filter(x=>x.result.status==='VALID'),invalid=live.filter(x=>x.result.status==='INVALID');
  let selected=live[0].result,status='UNKNOWN',code;
  if(valid.length&&invalid.length)code='DNS_PROVIDER_CONFLICT';
  else if(valid.length){selected=valid[0].result;status='VALID';code=selected.reasonCodes[0];}
  else if(invalid.length===live.length&&new Set(invalid.map(x=>x.result.reasonCodes[0])).size===1){selected=invalid[0].result;status='INVALID';code=selected.reasonCodes[0];}
  else if(invalid.length)code=invalid.length===live.length?'DNS_PROVIDER_CONFLICT':'DNS_NEGATIVE_UNCONFIRMED';
  else code=new Set(live.map(x=>x.result.reasonCodes[0])).size===1?selected.reasonCodes[0]:'DNS_PROVIDERS_UNAVAILABLE';
  if(status==='UNKNOWN'&&code!=='DNS_PROVIDER_CONFLICT'){
    const observations=live.flatMap(x=>x.result.evidence.observations);
    if(queries>=maxQueries&&(live.some(x=>x.result.reasonCodes.includes('DNS_BUDGET_EXHAUSTED'))||observations.some(x=>x.resolverCode==='DOH_QUERY_BUDGET')))code='DNS_BUDGET_EXHAUSTED';
    else if(httpRequests>=maxHttpRequests&&observations.some(x=>x.resolverCode==='DOH_REQUEST_BUDGET'))code='DNS_HTTP_BUDGET_EXHAUSTED';
  }
  const supporting=status==='VALID'?valid:status==='INVALID'?invalid:[];
  const expires=supporting.map(x=>x.result.evidence.validUntil);
  const validUntil=expires.length&&expires.every(Number.isFinite)?Math.min(...expires):null;
  const times=supporting.map(x=>x.result.evidence.observedAt).filter(Number.isFinite);
  return {...selected,status,reasonCodes:[code],versions:{...selected.versions,rules:`${selected.versions.rules}+${EMAIL_PROVIDER_POLICY}`},
    evidence:{...selected.evidence,queries,httpRequests,maxQueries,maxHttpRequests,evaluatedAt,
      observedAt:times.length?Math.min(...times):null,validUntil,revalidationRequired:validUntil==null,
      decisionScope:validUntil==null?'CURRENT_VALIDATION_ONLY':'TTL_BOUND_OBSERVATION',
      providerPolicy:EMAIL_PROVIDER_POLICY,agreement:code==='DNS_PROVIDER_CONFLICT'?'CONFLICT':supporting.length===live.length?'CONSISTENT':supporting.length?'PARTIAL_POSITIVE_OBSERVATION':'UNCONFIRMED',
      observations:live.flatMap(x=>x.result.evidence.observations),
      providers:live.map(x=>({provider:x.provider,status:x.result.status,reasonCodes:x.result.reasonCodes,
        observedAt:x.result.evidence.observedAt,validUntil:x.result.evidence.validUntil,
        route:x.result.evidence.route??null,observations:x.result.evidence.observations})),ownershipVerified:false,mailboxVerified:false}};
}

async function referenceWithin(provider,{signal,timeoutMs}){
  let timer,onAbort;
  const stopped=new Promise(resolve=>{
    onAbort=()=>resolve(null);signal.addEventListener('abort',onAbort,{once:true});
    if(signal.aborted)onAbort();timer=setTimeout(()=>resolve(null),timeoutMs);
  });
  try{return await Promise.race([Promise.resolve().then(()=>provider.get()).catch(()=>null),stopped]);}
  finally{clearTimeout(timer);signal.removeEventListener('abort',onAbort);}
}

/** Field-scoped latest-result ownership, domain-scoped single-flight and TTL cache. */
export function createBrowserEmailService({referenceProvider,fetcher=globalThis.fetch,now=Date.now,provider=null,
  providers=provider?[provider]:['cloudflare','google'],maxQueries=32,maxHttpRequests=32,queryTimeoutMs=2500,
  totalTimeoutMs=12000,referenceTimeoutMs=3000,retries=1,maxCachedDomains=128,onResult=null}={}){
  if(!referenceProvider?.get||typeof now!=='function'||!Number.isInteger(maxCachedDomains)||maxCachedDomains<1||maxCachedDomains>10000||
      !Array.isArray(providers)||!providers.length||providers.length>2||new Set(providers).size!==providers.length||providers.some(p=>!Object.hasOwn(DOH_PROVIDERS,p))||
      !Number.isInteger(maxQueries)||maxQueries<1||maxQueries>256||!Number.isInteger(maxHttpRequests)||maxHttpRequests<1||maxHttpRequests>256||
      !Number.isFinite(referenceTimeoutMs)||referenceTimeoutMs<1||referenceTimeoutMs>10000||!Number.isFinite(queryTimeoutMs)||queryTimeoutMs<1||queryTimeoutMs>10000||
      !Number.isFinite(totalTimeoutMs)||totalTimeoutMs<1||totalTimeoutMs>60000||!Number.isInteger(retries)||retries<0||retries>1)throw TypeError('BROWSER_EMAIL_CONFIG');
  const fields=new Map(),flights=new Map(),cache=new Map();let sequence=0,closed=false;
  const detach=(entry,token)=>{entry.consumers.delete(token);if(!entry.consumers.size&&!entry.settled){entry.controller.abort();if(flights.get(entry.domain)===entry)flights.delete(entry.domain);}};
  async function getDns(domain,signal,token){
    const hit=cache.get(domain),time=now();
    if(hit&&Number.isFinite(time)&&time>=hit.evidence.evaluatedAt&&time<hit.evidence.validUntil)return structuredClone(hit);
    cache.delete(domain);
    let entry=flights.get(domain);
    if(!entry){
      entry={domain,controller:new AbortController(),consumers:new Set(),settled:false};flights.set(domain,entry);
      let queries=0,httpRequests=0;
      const reserveRequest=()=>httpRequests<maxHttpRequests?(httpRequests++,true):false;
      entry.promise=Promise.all(providers.map(async providerName=>{
        const base=createBrowserDnsResolver({fetcher,now,provider:providerName,maxRequests:maxHttpRequests,timeoutMs:queryTimeoutMs,retries,reserveRequest});
        const resolver=(name,type,options)=>{
          if(queries>=maxQueries)return {status:'TEMPFAIL',resolverCode:'DOH_QUERY_BUDGET',provider:providerName,observedAt:now()};
          queries++;return base(name,type,options);
        };
        return {provider:providerName,result:await validateEmailDomain(domain,{resolver,now,maxQueries,timeoutMs:Math.min(10000,queryTimeoutMs*(retries+1)+100),totalTimeoutMs,signal:entry.controller.signal})};
      })).then(results=>reconcileProviders(results,{now,queries,httpRequests,maxQueries,maxHttpRequests})).then(result=>{
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
      const prior=fields.get(fieldId),requestId=++sequence,controller=new AbortController(),lease={requestId,controller};fields.set(fieldId,lease);
      const snapshot=await referenceWithin(referenceProvider,{signal:controller.signal,timeoutMs:referenceTimeoutMs});
      let syntax=validateEmailSyntax({raw,phase},{domainToASCII:browserDomainToASCII,tldData:snapshot,nowMs:now()});
      const dnsPromise=syntax.status==='VALID'&&!controller.signal.aborted?getDns(syntax.normalized.domain,controller.signal,lease):Promise.resolve(null);
      // Attach the replacement same-domain consumer before cancelling its predecessor.
      prior?.controller.abort();
      const dns=await dnsPromise;
      syntax=validateEmailSyntax({raw,phase},{domainToASCII:browserDomainToASCII,tldData:snapshot,nowMs:now()});
      const current=!closed&&!controller.signal.aborted&&fields.get(fieldId)===lease;
      const packet={fieldId,requestId,raw,apply:current,syntax,dns,gate:emailCompletionGate(syntax,dns),result:dns&&syntax.status==='VALID'?{...syntax,status:dns.status,reasonCodes:dns.reasonCodes,versions:{...syntax.versions,rules:`${syntax.versions.rules}+${dns.versions.rules}`},evidence:{...syntax.evidence,dns:dns.evidence}}:syntax};
      packet.diagnostic=emailDomainDiagnostic(packet);
      if(current&&typeof onResult==='function')onResult(structuredClone(packet));
      return packet;
    },
    cancel,
    invalidateDomain(domain){cache.delete(domain);const entry=flights.get(domain);entry?.controller.abort();flights.delete(domain);},
    clear(){for(const id of fields.keys())cancel(id);for(const entry of flights.values())entry.controller.abort();flights.clear();cache.clear();},
    close(){this.clear();closed=true;},
    inspect(){return {activeFields:fields.size,inFlightDomains:flights.size,cachedDomains:cache.size,providerPolicy:EMAIL_PROVIDER_POLICY,providers:[...providers],maxQueries,maxHttpRequests,queryTimeoutMs,totalTimeoutMs,retries};},
  };
}
