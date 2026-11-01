import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {browserDomainToASCII,createBrowserDnsResolver} from '../../src/engine/adapters/dns-browser.mjs';
import {verifyBrowserIana,createBrowserIanaProvider} from '../../src/engine/adapters/iana-browser.mjs';
import {createBrowserEmailService} from '../../src/engine/adapters/email-browser.mjs';
import {validateEmailDomain} from '../../src/engine/validation/email-dns.mjs';
import {buildBrowserReference} from '../../scripts/engine/build-browser-reference.mjs';
const sourceManifest=JSON.parse(await readFile(new URL('../../src/engine/reference/iana-manifest.json',import.meta.url),'utf8'));
const time=Date.parse(sourceManifest.collectedAt)+3600000;
const envelope=await buildBrowserReference({now:time});
const snapshot=await verifyBrowserIana(envelope,{crypto:webcrypto});
const types={A:1,AAAA:28,MX:15};
const response=(name,type,answers=[],extra={})=>new Response(JSON.stringify({Status:0,TC:false,Question:[{name:name+'.',type:types[type]}],Answer:answers,...extra}),{status:200,headers:{'content-type':'application/dns-json'}});
const record=(name,type,data,ttl=60)=>({name:name+'.',type:types[type],TTL:ttl,data});
const fixtureFetch=(handlers,calls=[])=>async(url,options)=>{const u=new URL(url),name=u.searchParams.get('name'),type=u.searchParams.get('type');calls.push({name,type,options,url:u.href});const value=handlers[`${name}/${type}`];return typeof value==='function'?value(url,options):response(name,type,value??[]);};

test('I02 browser URL IDNA supports Korean/Russian domains and rejects malformed A-labels and URL injection',()=>{
  assert.equal(browserDomainToASCII('пример.рф'),'xn--e1afmkfd.xn--p1ai');
  assert.equal(browserDomainToASCII('예시.한국'),'xn--vv4b11d.xn--3e0b707e');
  assert.equal(browserDomainToASCII('EXAMPLE.OOO'),'example.ooo');
  for(const value of ['xn--a.com','xn--0.com','example.com:443','user@example.com','x.com/path','127.1','x%2ecom','[::1]'])assert.equal(browserDomainToASCII(value),'',value);
});
test('I02 browser import graph has no Node globals or node imports',async()=>{
  for(const file of ['dns-browser.mjs','iana-browser.mjs','email-browser.mjs']){
    const text=await readFile(new URL('../../src/engine/adapters/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(text,/from\s+['"]node:|\bBuffer\b|\bprocess\./);
  }
});
test('I04 DoH sends domain only with CORS/omitted credentials and preserves NullMX semantics',async()=>{
  const calls=[];const resolver=createBrowserDnsResolver({fetcher:fixtureFetch({'example.com/MX':[record('example.com','MX','0 .')]},calls),now:()=>time});
  const result=await validateEmailDomain('example.com',{resolver,now:()=>time});
  assert.equal(result.reasonCodes[0],'DNS_NULL_MX');assert.equal(calls.length,1);
  assert.equal(calls[0].options.mode,'cors');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');
  assert.equal(calls[0].url.includes('@'),false);
});
test('I04 DoH sixth-MX route and bounded HTTP budget are independent',async()=>{
  const answers=Array.from({length:6},(_,i)=>record('example.com','MX',`${i+1} mx${i+1}.example.com.`));
  const fetcher=fixtureFetch({'example.com/MX':answers,'mx6.example.com/A':[record('mx6.example.com','A','192.0.2.60')]});
  const enough=createBrowserDnsResolver({fetcher,now:()=>time,maxRequests:13});
  const good=await validateEmailDomain('example.com',{resolver:enough,now:()=>time});
  assert.equal(good.status,'VALID');assert.equal(enough.requests,12);
  const limited=createBrowserDnsResolver({fetcher,now:()=>time,maxRequests:11});
  assert.equal((await validateEmailDomain('example.com',{resolver:limited,now:()=>time})).status,'UNKNOWN');assert.equal(limited.requests,11);
});
test('I04 DoH implicit IPv6 and all absent routes remain distinct',async()=>{
  const ipv6=createBrowserDnsResolver({now:()=>time,fetcher:fixtureFetch({'example.com/AAAA':[record('example.com','AAAA','2001:db8::1')]})});
  assert.equal((await validateEmailDomain('example.com',{resolver:ipv6,now:()=>time})).reasonCodes[0],'DNS_IMPLICIT_MX_ADDRESS');
  const absent=createBrowserDnsResolver({now:()=>time,fetcher:fixtureFetch({})});
  assert.equal((await validateEmailDomain('example.com',{resolver:absent,now:()=>time})).reasonCodes[0],'DNS_ALL_ROUTES_ABSENT');
});
test('I04 DoH HTTP retry obeys budget; timeout and abort settle ignored fetch promises',async()=>{
  let calls=0;
  const resolver=createBrowserDnsResolver({now:()=>time,retries:1,maxRequests:2,fetcher:async()=>++calls===1?new Response('',{status:503}):response('example.com','A',[record('example.com','A','192.0.2.1')])});
  assert.equal((await resolver('example.com','A')).status,'NOERROR');assert.equal(calls,2);
  assert.equal((await resolver('example.com','A')).resolverCode,'DOH_REQUEST_BUDGET');
  const hanging=createBrowserDnsResolver({now:()=>time,timeoutMs:5,fetcher:()=>new Promise(()=>{})});
  assert.equal((await hanging('example.com','MX')).status,'TIMEOUT');
  const controller=new AbortController();controller.abort();
  assert.equal((await hanging('example.com','MX',{signal:controller.signal})).status,'ABORTED');
});
test('I04 mismatched question, truncation and unrelated answer cannot prove absence or success',async()=>{
  for(const bad of [{Status:0,TC:true,Question:[{name:'example.com.',type:15}]},{Status:0,Question:[{name:'other.com.',type:15}]},{Status:0,Question:[{name:'example.com.',type:15}],Answer:[record('other.com','MX','1 mail.other.com.')]}]){
    const resolver=createBrowserDnsResolver({now:()=>time,fetcher:async()=>new Response(JSON.stringify(bad),{headers:{'content-type':'application/dns-json'}})});
    assert.equal((await resolver('example.com','MX')).status,'TEMPFAIL');
  }
});
test('I04 CNAME route TTL includes alias and cached HTTP Age',async()=>{
  const resolver=createBrowserDnsResolver({now:()=>time,fetcher:async()=>new Response(JSON.stringify({Status:0,Question:[{name:'example.com.',type:1}],Answer:[{name:'example.com.',type:5,TTL:10,data:'alias.example.com.'},record('alias.example.com','A','192.0.2.1',60)]}),{headers:{'content-type':'application/dns-json','age':'2'}})});
  const result=await resolver('example.com','A');assert.equal(result.status,'NOERROR');assert.equal(result.ttl,8);
});
test('I04 IANA browser validates exact bytes/hash; stale build fails and stale runtime retains raw',async()=>{
  assert.equal(snapshot.sourceSha256,envelope.manifest.sourceSha256);assert.equal(snapshot.tlds.length,envelope.manifest.tldCount);
  await assert.rejects(()=>verifyBrowserIana({...envelope,rawText:envelope.rawText.replace('COM\n','COMM\n')},{crypto:webcrypto}));
  await assert.rejects(()=>buildBrowserReference({now:time+8*86400000}),/STALE/);
  const provider=createBrowserIanaProvider({pinnedEnvelope:envelope,now:()=>time+8*86400000,origin:'https://order-ooo.pages.dev',crypto:webcrypto,fetcher:async()=>{throw TypeError('offline');}});
  const service=createBrowserEmailService({provider:'cloudflare',retries:0,referenceProvider:provider,now:()=>time+8*86400000,fetcher:async()=>{throw Error('must not query DNS');}});
  const result=await service.validate('site-email','Case@example.com');
  assert.equal(result.result.status,'UNKNOWN');assert.equal(result.raw,'Case@example.com');assert.equal(result.result.normalized.address,'Case@example.com');assert.equal(result.gate.finalCompletionAllowed,false);
  assert.equal((await provider.inspect()).version,envelope.manifest.version);service.close();provider.close();
});
test('I04 IANA refresh is same-origin/single-flight/cooldown; timed-out late snapshot cannot replace current',async()=>{
  assert.throws(()=>createBrowserIanaProvider({origin:'https://order-ooo.pages.dev',refreshPath:'https://other.example/assets/iana-reference.json'}),/SAME_ORIGIN/);
  let done,calls=0;
  const provider=createBrowserIanaProvider({pinnedEnvelope:envelope,now:()=>time,crypto:webcrypto,origin:'https://order-ooo.pages.dev',timeoutMs:5,fetcher:()=>{calls++;return new Promise(resolve=>{done=resolve;});}});
  await Promise.all([provider.refresh(),provider.refresh()]);assert.equal(calls,1);assert.equal((await provider.inspect()).lastError,'IANA_REFRESH_TIMEOUT');
  done(new Response(JSON.stringify(envelope),{headers:{'content-type':'application/json'}}));await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal((await provider.inspect()).lastError,'IANA_REFRESH_TIMEOUT');
  await provider.refresh();assert.equal(calls,1);provider.close();
});
test('I04 same-domain parallel fields share DNS; cancelling one cannot cancel the other',async()=>{
  let release,calls=0;const fetcher=async(url)=>{calls++;const u=new URL(url),name=u.searchParams.get('name'),type=u.searchParams.get('type');if(type==='MX')await new Promise(resolve=>{release=resolve;});return response(name,type,type==='A'?[record(name,'A','192.0.2.1')]:[]);};
  const service=createBrowserEmailService({provider:'cloudflare',retries:0,referenceProvider:{get:async()=>snapshot},fetcher,now:()=>time});
  const a=service.validate('a','A@example.com'),b=service.validate('b','B@example.com');
  await new Promise(resolve=>setTimeout(resolve,0));service.cancel('a');release();
  assert.equal((await a).apply,false);assert.equal((await b).result.status,'VALID');assert.equal(calls,2);service.close();
});
test('I04 same-field local-part edits deduplicate pending domain and apply only newest input',async()=>{
  let release,calls=0;const applied=[];
  const fetcher=async(url)=>{calls++;const u=new URL(url),name=u.searchParams.get('name'),type=u.searchParams.get('type');if(type==='MX')await new Promise(resolve=>{release=resolve;});return response(name,type,type==='A'?[record(name,'A','192.0.2.1')]:[]);};
  const service=createBrowserEmailService({provider:'cloudflare',retries:0,referenceProvider:{get:async()=>snapshot},fetcher,now:()=>time,onResult:r=>applied.push(r.raw)});
  const first=service.validate('email','First@example.com');await new Promise(resolve=>setTimeout(resolve,0));
  const second=service.validate('email','Second@example.com');await new Promise(resolve=>setTimeout(resolve,0));release();
  assert.equal((await first).apply,false);assert.equal((await second).apply,true);assert.deepEqual(applied,['Second@example.com']);assert.equal(calls,2);service.close();
});
test('I04 fresh TTL reuse and explicit cancel prevent late writes',async()=>{
  let clock=time,calls=0;
  const fetcher=async(url)=>{calls++;const u=new URL(url),name=u.searchParams.get('name'),type=u.searchParams.get('type');return response(name,type,type==='MX'?[record(name,'MX','1 mail.example.com.',10)]:[record(name,'A','192.0.2.1',60)]);};
  const service=createBrowserEmailService({provider:'cloudflare',retries:0,referenceProvider:{get:async()=>snapshot},fetcher,now:()=>clock});
  await service.validate('a','A@example.com');await service.validate('b','B@example.com');assert.equal(calls,2);
  clock+=10000;await service.validate('b','B@example.com');assert.equal(calls,4);service.close();
});
