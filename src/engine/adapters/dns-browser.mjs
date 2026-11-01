// Browser-only adapters: no Node imports, no SMTP probe, no mailbox sent to DNS.
export const DOH_PROVIDERS = Object.freeze({cloudflare:'https://cloudflare-dns.com/dns-query',google:'https://dns.google/resolve'});
const TYPES = Object.freeze({A:1,MX:15,AAAA:28});
const host = value => typeof value === 'string' && value.length <= 253 && value.split('.').every(v=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(v));
const clean = value => String(value).toLowerCase().replace(/\.$/,'');

// RFC 3492 decoder only for A-label round-trip guards. WHATWG URL owns IDNA mapping.
function decodeALabel(label) {
  const input=label.slice(4); let n=128,i=0,bias=72,position=0;
  const output=[]; const delimiter=input.lastIndexOf('-');
  if(delimiter>=0){for(const c of input.slice(0,delimiter)){if(c.charCodeAt(0)>=128)throw Error();output.push(c.charCodeAt(0));}position=delimiter+1;}
  const adapt=(delta,count,first)=>{delta=first?Math.floor(delta/700):Math.floor(delta/2);delta+=Math.floor(delta/count);let k=0;while(delta>455){delta=Math.floor(delta/35);k+=36;}return k+Math.floor(36*delta/(delta+38));};
  while(position<input.length){const old=i;let weight=1;
    for(let k=36;;k+=36){if(position>=input.length)throw Error();const c=input.charCodeAt(position++);const digit=c>=48&&c<=57?c-22:c>=97&&c<=122?c-97:36;if(digit>=36)throw Error();i+=digit*weight;if(!Number.isSafeInteger(i))throw Error();const threshold=k<=bias?1:k>=bias+26?26:k-bias;if(digit<threshold)break;weight*=36-threshold;if(!Number.isSafeInteger(weight))throw Error();}
    const count=output.length+1;bias=adapt(i-old,count,old===0);n+=Math.floor(i/count);i%=count;if(n>0x10ffff||n>=0xd800&&n<=0xdfff)throw Error();output.splice(i++,0,n);
  }
  const decoded=String.fromCodePoint(...output);
  if(!decoded||!/[^\x00-\x7f]/.test(decoded)||/[\p{Cc}\p{Z}]/u.test(decoded))throw Error();
  return decoded;
}

/** WHATWG URL mapping plus strict hostname and Punycode round-trip guards. */
export function browserDomainToASCII(input) {
  if(typeof input!=='string'||!input||/[\s\/:?#@\\%\[\]]/.test(input)||input.endsWith('.'))return '';
  try {
    const url=new URL(`https://${input}/`); const ascii=url.hostname.toLowerCase();
    if(url.port||url.username||url.password||!host(ascii)||/^\d+(?:\.\d+)*$/.test(ascii))return '';
    for(const label of ascii.split('.'))if(label.startsWith('xn--')){
      const decoded=decodeALabel(label);
      if(new URL(`https://${decoded}/`).hostname.toLowerCase()!==label)return '';
    }
    return ascii;
  }catch{return '';}
}

export async function readBoundedJson(response,maxBytes=131072) {
  const declared=response.headers?.get?.('content-length');
  if(declared!=null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))throw Error('RESPONSE_SIZE');
  if(!response.body?.getReader){const text=await response.text();if(new TextEncoder().encode(text).length>maxBytes)throw Error('RESPONSE_SIZE');return JSON.parse(text);}
  const reader=response.body.getReader(),parts=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>maxBytes)throw Error('RESPONSE_SIZE');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  const joined=new Uint8Array(length);let offset=0;for(const part of parts){joined.set(part,offset);offset+=part.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
}

function normalizeDoh(data,name,type,observedAt,ageSeconds) {
  const fail=code=>({status:'TEMPFAIL',resolverCode:code,observedAt});
  if(!data||!Number.isInteger(data.Status)||data.TC===true||!Array.isArray(data.Question)||data.Question.length!==1||clean(data.Question[0].name)!==name||data.Question[0].type!==TYPES[type])return fail('DOH_RESPONSE_CONTRACT');
  const answers=data.Answer??[],authority=data.Authority??[];
  if(!Array.isArray(answers)||!Array.isArray(authority)||answers.length>1024||authority.length>128)return fail('DOH_RECORD_LIMIT');
  if(data.Status!==0&&data.Status!==3)return fail(`DOH_RCODE_${data.Status}`);
  if(answers.some(r=>!r||typeof r.data!=='string'||!Number.isInteger(r.type)||!Number.isInteger(r.TTL)||r.TTL<0||r.TTL>2147483647||typeof r.name!=='string'))return fail('DOH_RECORD_CONTRACT');
  let target=name; const chain=[],seen=new Set([name]);
  for(let depth=0;depth<9;depth++){
    const cnames=answers.filter(r=>r.type===5&&clean(r.name)===target);
    if(!cnames.length)break;
    if(depth===8||cnames.length!==1)return fail('DOH_CNAME_LIMIT');
    const next=clean(cnames[0].data);if(!host(next)||seen.has(next))return fail('DOH_CNAME_INVALID');
    seen.add(next);chain.push(cnames[0]);target=next;
  }
  const negative=(status)=>{
    const values=authority.filter(r=>{
      if(r?.type!==6||typeof r.name!=='string'||!Number.isInteger(r.TTL)||r.TTL<0||typeof r.data!=='string')return false;
      const zone=clean(r.name);return zone===''||target===zone||target.endsWith('.'+zone);
    }).map(r=>{const fields=r.data.trim().split(/\s+/),minimum=Number(fields.at(-1));return fields.length===7&&Number.isSafeInteger(minimum)&&minimum>=0?Math.min(r.TTL,minimum):null;}).filter(v=>v!=null);
    const ttl=values.length?Math.min(...values,...chain.map(r=>r.TTL)):null;
    if(ageSeconds>0&&(ttl==null||ageSeconds>=ttl))return fail('DOH_HTTP_AGE_EXPIRED');
    return {status,records:[],ttl:ttl==null?null:ttl-ageSeconds,observedAt};
  };
  if(data.Status===3){if(answers.some(r=>r.type===TYPES[type]))return fail('DOH_NEGATIVE_CONTRADICTION');return negative('NXDOMAIN');}
  const selected=answers.filter(r=>r.type===TYPES[type]&&clean(r.name)===target);
  if(!selected.length){if(chain.length||answers.some(r=>r.type===TYPES[type]))return fail('DOH_INCOMPLETE_ANSWER');return negative('NODATA');}
  let records;
  if(type==='MX'){
    records=selected.map(r=>{const match=/^(\d{1,5})\s+(\S+)$/.exec(r.data.trim());return match?{priority:Number(match[1]),exchange:match[2]==='.'?'.':clean(match[2])}:null;});
    if(records.some(r=>!r||r.priority>65535||r.exchange!=='.'&&!host(r.exchange)))return fail('DOH_MX_INVALID');
  }else records=selected.map(r=>r.data.trim());
  const ttl=Math.min(...selected.concat(chain).map(r=>r.TTL));
  if(ageSeconds>0&&ageSeconds>=ttl)return fail('DOH_HTTP_AGE_EXPIRED');
  return {status:'NOERROR',records,ttl:ttl-ageSeconds,observedAt};
}

/** One resolver is one bounded validation session. Retries count against HTTP budget. */
export function createBrowserDnsResolver({fetcher=globalThis.fetch,now=Date.now,provider='cloudflare',maxRequests=32,timeoutMs=1200,retries=0}={}) {
  if(!Object.hasOwn(DOH_PROVIDERS,provider)||typeof fetcher!=='function'||typeof now!=='function'||!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>256||!Number.isInteger(retries)||retries<0||retries>1||!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw TypeError('DOH_CONFIG');
  let requests=0;
  async function resolver(name,type,{signal}={}){
    if(!host(name)||name!==name.toLowerCase()||!Object.hasOwn(TYPES,type))return {status:'TEMPFAIL',resolverCode:'DOH_INPUT',observedAt:now()};
    let response;
    for(let attempt=0;attempt<=retries;attempt++){
      if(signal?.aborted)return {status:'ABORTED',observedAt:now()};
      if(requests>=maxRequests)return {status:'TEMPFAIL',resolverCode:'DOH_REQUEST_BUDGET',observedAt:now(),requests};
      requests++;const controller=new AbortController();let timer,onAbort;
      const bounded=new Promise(resolve=>{onAbort=()=>{controller.abort();resolve({status:'ABORTED',observedAt:now()});};signal?.addEventListener('abort',onAbort,{once:true});timer=setTimeout(()=>{controller.abort();resolve({status:'TIMEOUT',observedAt:now()});},timeoutMs);});
      const request=(async()=>{
        const url=new URL(DOH_PROVIDERS[provider]);url.searchParams.set('name',name);url.searchParams.set('type',type);url.searchParams.set('cd','false');
        if(provider==='google')url.searchParams.set('edns_client_subnet','0.0.0.0/0');
        try {
          const http=await fetcher(url.href,{method:'GET',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',cache:'no-store',headers:{accept:'application/dns-json'},signal:controller.signal});
          if(!http.ok)return {status:'TEMPFAIL',resolverCode:`DOH_HTTP_${http.status}`,retryable:http.status===429||http.status>=500,observedAt:now()};
          const mime=http.headers?.get?.('content-type')??'';
          if(!/application\/(?:dns-)?json/i.test(mime))return {status:'TEMPFAIL',resolverCode:'DOH_MIME',observedAt:now()};
          const age=Number(http.headers?.get?.('age')??0);
          if(!Number.isFinite(age)||age<0)return {status:'TEMPFAIL',resolverCode:'DOH_AGE',observedAt:now()};
          return normalizeDoh(await readBoundedJson(http),name,type,now(),age);
        }catch(error){return {status:signal?.aborted?'ABORTED':'TEMPFAIL',resolverCode:error?.name==='TypeError'?'DOH_NETWORK_OR_CORS':'DOH_RESPONSE_ERROR',retryable:error?.name==='TypeError',observedAt:now()};}
      })();
      try{response=await Promise.race([request,bounded]);}finally{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);controller.abort();}
      response={...response,provider,requests,attempts:attempt+1};
      if(response.status!=='TIMEOUT'&&!response.retryable)return response;
    }
    return response;
  }
  Object.defineProperty(resolver,'requests',{get:()=>requests});
  return resolver;
}
