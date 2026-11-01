import {readBoundedJson} from './dns-browser.mjs';
export const BROWSER_IANA_SOURCE='https://data.iana.org/TLD/tlds-alpha-by-domain.txt';
export const BROWSER_IANA_MAX_AGE=7*86400000;

export function browserIanaFreshness(snapshot,nowMs){
  const collected=Date.parse(snapshot?.collectedAt),updated=Date.parse(snapshot?.sourceUpdatedAt),limit=snapshot?.maxAgeMs;
  if(!Number.isSafeInteger(nowMs)||!Number.isFinite(collected)||!Number.isFinite(updated)||!Number.isSafeInteger(limit)||limit<=0||limit>BROWSER_IANA_MAX_AGE||updated>collected||collected>nowMs)return {state:'UNKNOWN',reason:'REFERENCE_METADATA_INVALID'};
  const ageMs=Math.max(nowMs-collected,nowMs-updated);
  return {state:ageMs<=limit?'FRESH':'STALE',ageMs,maxAgeMs:limit};
}

/** Same-origin deployment integrity check, not a claim of a digital signature. */
export async function verifyBrowserIana(envelope,{crypto=globalThis.crypto}={}){
  if(envelope?.schemaVersion!==1||typeof envelope.rawText!=='string'||!crypto?.subtle)throw Error('IANA_BROWSER_CONTRACT');
  const text=envelope.rawText,manifest=envelope.manifest,bytes=new TextEncoder().encode(text);
  if(bytes.length<1000||bytes.length>65536||/[^\x00-\x7f]/.test(text)||!text.endsWith('\n'))throw Error('IANA_SOURCE_SIZE_OR_ENCODING');
  const lines=text.replace(/\r\n/g,'\n').split('\n'),header=lines.shift();lines.pop();
  const match=/^# Version (\d{10}), Last Updated (.+ UTC)$/.exec(header);
  if(!match||!Number.isFinite(Date.parse(match[2]))||lines.length<1000||lines.length>3000||new Set(lines).size!==lines.length||lines.some((v,i)=>!/^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/.test(v)||i>0&&lines[i-1]>=v))throw Error('IANA_SOURCE_RECORDS');
  for(const sentinel of ['COM','NET','ORG','KR','OOO','XN--3E0B707E','ZW'])if(!lines.includes(sentinel))throw Error('IANA_SOURCE_INCOMPLETE');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  const values={version:match[1],sourceHeader:header,sourceUpdatedAt:new Date(match[2]).toISOString(),sourceSha256:hash,sourceBytes:bytes.length,tldCount:lines.length};
  for(const [key,value]of Object.entries(values))if(manifest?.[key]!==value)throw Error(`IANA_MANIFEST_MISMATCH:${key}`);
  if(manifest.schemaVersion!==1||manifest.sourceUrl!==BROWSER_IANA_SOURCE||!Number.isFinite(Date.parse(manifest.collectedAt))||Date.parse(manifest.sourceUpdatedAt)>Date.parse(manifest.collectedAt)||!Number.isSafeInteger(manifest.maxAgeMs)||manifest.maxAgeMs<=0||manifest.maxAgeMs>BROWSER_IANA_MAX_AGE)throw Error('IANA_MANIFEST_INVALID');
  return Object.freeze({...manifest,tlds:Object.freeze(lines.map(v=>v.toLowerCase()))});
}

/** Only a fixed same-origin deployment asset can refresh the pinned reference. */
export function createBrowserIanaProvider({pinnedEnvelope=null,fetcher=globalThis.fetch,crypto=globalThis.crypto,now=Date.now,origin=globalThis.location?.origin,refreshPath='/assets/iana-reference.json',timeoutMs=2500,cooldownMs=60000,failureCooldownMs=Math.min(cooldownMs,1500),allowLocalOrigin=false}={}){
  const base=new URL(origin);
  if(base.protocol!=='https:'&&!(allowLocalOrigin&&base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)))throw TypeError('IANA_HTTPS_ORIGIN_REQUIRED');
  const target=new URL(refreshPath,base);
  if(target.origin!==base.origin||target.pathname!=='/assets/iana-reference.json'||target.search||target.hash||target.username||target.password)throw TypeError('IANA_SAME_ORIGIN_ASSET_REQUIRED');
  if(typeof fetcher!=='function'||typeof now!=='function'||!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000||!Number.isFinite(cooldownMs)||cooldownMs<1000||cooldownMs>3600000||!Number.isFinite(failureCooldownMs)||failureCooldownMs<1000||failureCooldownMs>cooldownMs)throw TypeError('IANA_PROVIDER_CONFIG');
  let snapshot=null,pending=null,lastAttempt=null,lastError=null,closed=false,generation=0,controller=null;
  const ready=pinnedEnvelope?verifyBrowserIana(pinnedEnvelope,{crypto}).then(value=>{if(!closed)snapshot=value;}).catch(error=>{lastError=error.message;}):Promise.resolve();
  async function refresh(){
    await ready;if(closed)return snapshot;if(pending)return pending;
    const current=now();if(!Number.isFinite(current)){lastError='CLOCK_UNAVAILABLE';return snapshot;}
    const delay=lastError?failureCooldownMs:cooldownMs;
    if(lastAttempt!=null&&current>=lastAttempt&&current-lastAttempt<delay)return snapshot;
    lastAttempt=current;const lease=++generation;controller=new AbortController();const active={value:true};let timer;
    const request=(async()=>{const response=await fetcher(target.href,{mode:'same-origin',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{accept:'application/json'},signal:controller.signal});if(!response.ok)throw Error(`IANA_HTTP_${response.status}`);const next=await verifyBrowserIana(await readBoundedJson(response,131072),{crypto});
      if(browserIanaFreshness(next,now()).state!=='FRESH')throw Error('IANA_REFRESH_STALE');
      if(snapshot&&(next.version<snapshot.version||next.tldCount<snapshot.tldCount*0.95||next.version===snapshot.version&&next.sourceSha256!==snapshot.sourceSha256))throw Error('IANA_REFRESH_REGRESSION');
      if(active.value&&!closed&&lease===generation){snapshot=next;lastError=null;}return snapshot;})();
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{active.value=false;controller.abort();reject(Error('IANA_REFRESH_TIMEOUT'));},timeoutMs);});
    pending=Promise.race([request,timeout]).catch(error=>{if(lease===generation)lastError=error.message;return snapshot;}).finally(()=>{active.value=false;clearTimeout(timer);if(lease===generation){controller.abort();pending=null;}});
    return pending;
  }
  return {
    async get({refreshIfStale=true}={}){await ready;if(refreshIfStale&&browserIanaFreshness(snapshot,now()).state!=='FRESH')await refresh();return snapshot;},
    refresh,
    async inspect(){await ready;return {version:snapshot?.version??null,sourceSha256:snapshot?.sourceSha256??null,freshness:browserIanaFreshness(snapshot,now()),lastAttempt,lastError,refreshPending:!!pending,cooldownMs,failureCooldownMs,refreshOwner:'BUILD_MAINTENANCE_AND_SAME_ORIGIN_DEPLOYMENT'};},
    close(){closed=true;generation++;controller?.abort();},
  };
}
