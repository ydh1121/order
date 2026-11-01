import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {createBrowserDnsResolver} from '../../src/engine/adapters/dns-browser.mjs';
import {createBrowserEmailService,EMAIL_PROVIDER_POLICY} from '../../src/engine/adapters/email-browser.mjs';
import {createBrowserIanaProvider,verifyBrowserIana} from '../../src/engine/adapters/iana-browser.mjs';
import {buildBrowserReference} from '../../scripts/engine/build-browser-reference.mjs';

// Synthetic protocol responses. These assertions are not online, OS or user acceptance.
const manifest=JSON.parse(await readFile(new URL('../../src/engine/reference/iana-manifest.json',import.meta.url),'utf8'));
const time=Date.parse(manifest.collectedAt)+1000;
const envelope=await buildBrowserReference({now:time}),snapshot=await verifyBrowserIana(envelope,{crypto:webcrypto});
const types={A:1,AAAA:28,MX:15,CNAME:5,SOA:6,NS:2};
const rr=(name,type,data,ttl=60)=>({name:name+'.',type:types[type],data,TTL:ttl});
const soa=(name='example.com',ttl=60)=>rr(name,'SOA','ns.example.com. hostmaster.example.com. 1 2 3 4 60',ttl);
const response=(name,type,Answer=[],Authority=[],Status=0)=>new Response(JSON.stringify({Status,Question:[{name:name+'.',type:types[type]}],Answer,Authority}),{headers:{'content-type':'application/dns-json'}});
const route=(name,type,ttl=60)=>response(name,type,type==='MX'?[rr(name,'MX','10 mail.example.com.',ttl)]:[rr(name,'A','192.0.2.51',ttl)]);
function service(handler,options={}){
 const calls=[];const instance=createBrowserEmailService({referenceProvider:{get:async()=>snapshot},now:()=>time,...options,fetcher:async(url,request)=>{
  const u=new URL(url),entry={name:u.searchParams.get('name'),type:u.searchParams.get('type'),provider:u.hostname==='dns.google'?'google':'cloudflare',url:u.href,request};calls.push(entry);return handler(entry,calls);
 }});return {instance,calls};
}

test('R02 CNAME + final-name SOA NODATA follows canonical implicit IPv6 and minimum alias TTL',async()=>{
 const {instance,calls}=service(({name,type})=>type==='MX'?response(name,type,[rr(name,'CNAME','canonical.example.com.',15)],[soa()]):response(name,type,type==='AAAA'?[rr(name,'AAAA','2001:db8::51')]:[],[soa()]));
 try{const packet=await instance.validate('field','Private.Local+0521@example.com');
  assert.equal(packet.result.status,'VALID');assert.equal(packet.result.reasonCodes[0],'DNS_IMPLICIT_MX_ADDRESS');
  assert.equal(packet.dns.evidence.validUntil,time+15000);assert.equal(packet.dns.evidence.providers.length,2);
  assert.deepEqual(calls.map(c=>c.name),['example.com','example.com','canonical.example.com','canonical.example.com','canonical.example.com','canonical.example.com']);
  assert.equal(packet.dns.evidence.route.addressType,'AAAA');
 }finally{instance.close();}
});

test('R02 bare alias, referral, alias loop and CNAME/data contradiction remain UNKNOWN',async()=>{
 const scenarios=[
  {answer:[rr('example.com','CNAME','alias.example.com.')],authority:[],code:'DOH_CNAME_INCOMPLETE'},
  {answer:[],authority:[rr('example.com','NS','ns.example.com.')],code:'DOH_REFERRAL'},
  {answer:[rr('example.com','CNAME','alias.example.com.'),rr('alias.example.com','CNAME','example.com.')],authority:[],code:'DOH_CNAME_INVALID'},
  {answer:[rr('example.com','CNAME','alias.example.com.'),rr('example.com','A','192.0.2.1')],authority:[soa()],code:'DOH_CNAME_DATA_CONFLICT'},
  {answer:[rr('example.com','CNAME','alias.other.com.')],authority:[soa()],code:'DOH_CNAME_INCOMPLETE'},
 ];
 for(const scenario of scenarios){const {instance}=service(({name,type})=>response(name,type,scenario.answer,scenario.authority));try{
  const packet=await instance.validate('field','Keep@example.com');assert.equal(packet.result.status,'UNKNOWN',scenario.code);
  assert.ok(packet.dns.evidence.observations.every(o=>o.resolverCode===scenario.code));assert.equal(packet.gate.finalCompletionAllowed,false);assert.equal(packet.gate.preserveDraft,true);
 }finally{instance.close();}}
});

test('R02 actual default observes both providers, keeps domain-only diagnostics and minimum positive TTL',async()=>{
 const {instance,calls}=service(({name,type,provider})=>route(name,type,provider==='cloudflare'?30:12));
 try{const packet=await instance.validate('field','NeverSendThis+Case@EXAMPLE.COM');
  assert.equal(packet.result.status,'VALID');assert.equal(packet.dns.evidence.validUntil,time+12000);
  assert.equal(packet.dns.evidence.providerPolicy,EMAIL_PROVIDER_POLICY);assert.equal(packet.dns.evidence.agreement,'CONSISTENT');
  assert.deepEqual(new Set(calls.map(c=>c.provider)),new Set(['cloudflare','google']));assert.equal(calls.length,4);
  for(const call of calls){assert.ok(!call.url.includes('NeverSendThis')&&!call.url.includes('@'));assert.equal(call.request.credentials,'omit');assert.equal(call.request.referrerPolicy,'no-referrer');}
  assert.ok(!JSON.stringify(packet.diagnostic).includes('NeverSendThis'));assert.equal(packet.diagnostic.domain,'example.com');assert.equal(packet.diagnostic.mailboxVerified,false);
  await instance.validate('second','Other@example.com');assert.equal(calls.length,4);
 }finally{instance.close();}
});

test('R02 fast positive never hides slower provider negative; negative plus failure is neutral',async()=>{
 for(const mode of ['conflict','negative+failure','positive+failure']){
  const {instance}=service(async({name,type,provider})=>{
   if(provider==='google'){await new Promise(resolve=>setTimeout(resolve,2));if(mode!=='conflict')throw TypeError('synthetic network failure');return response(name,type,[],[soa()],3);}
   return mode==='negative+failure'?response(name,type,[],[soa()],3):route(name,type);
  });try{const packet=await instance.validate('field','Keep@example.com');
   assert.equal(packet.result.status,mode==='positive+failure'?'VALID':'UNKNOWN');
   assert.equal(packet.dns.evidence.agreement,mode==='conflict'?'CONFLICT':mode==='positive+failure'?'PARTIAL_POSITIVE_OBSERVATION':'UNCONFIRMED');
   if(mode==='conflict')assert.equal(packet.result.reasonCodes[0],'DNS_PROVIDER_CONFLICT');
   if(mode==='negative+failure')assert.equal(packet.result.reasonCodes[0],'DNS_NEGATIVE_UNCONFIRMED');
  }finally{instance.close();}
 }
});

test('R02 sixth MX IPv6 route is reachable across both providers under one shared budget',async()=>{
 const {instance,calls}=service(({name,type})=>type==='MX'?response(name,type,Array.from({length:7},(_,i)=>rr(name,'MX',`${i+1} mx${i+1}.example.com.`))):response(name,type,name==='mx6.example.com'&&type==='AAAA'?[rr(name,'AAAA','2001:db8::6')]:[],[soa()]));
 try{const packet=await instance.validate('field','Keep@example.com');assert.equal(packet.result.status,'VALID');assert.equal(packet.dns.evidence.route.host,'mx6.example.com');assert.equal(calls.length,26);assert.equal(packet.dns.evidence.queries,26);assert.equal(packet.dns.evidence.httpRequests,26);assert.ok(calls.every(c=>c.name!=='mx7.example.com'));}finally{instance.close();}
});

test('R02 bounded transient retries recover SERVFAIL/429; shared request and query budgets stay neutral',async()=>{
 for(const transient of ['servfail','429']){
  const counts=new Map(),{instance,calls}=service(({name,type,provider})=>{const key=provider+'/'+name+'/'+type,n=(counts.get(key)??0)+1;counts.set(key,n);return type==='MX'&&n===1?(transient==='429'?new Response('',{status:429}):response(name,type,[],[],2)):route(name,type);});
  try{const packet=await instance.validate('field','Keep@example.com');assert.equal(packet.result.status,'VALID');assert.equal(calls.length,6);assert.equal(packet.dns.evidence.httpRequests,6);assert.equal(packet.dns.evidence.queries,4);}finally{instance.close();}
 }
 for(const options of [{maxHttpRequests:1},{maxQueries:1}]){
  const {instance,calls}=service(({name,type})=>route(name,type),options);try{const packet=await instance.validate('field','Keep@example.com');assert.equal(packet.result.status,'UNKNOWN');assert.equal(calls.length,1);assert.equal(packet.gate.tone,'neutral');assert.equal(packet.gate.finalCompletionAllowed,false);}finally{instance.close();}
 }
});

test('R02 zero TTL observation has no cache lifetime; late consumers and cancellation are independent',async()=>{
 let release;const blocked=new Promise(resolve=>{release=resolve;});
 const {instance,calls}=service(async({name,type})=>{if(type==='MX')await blocked;return route(name,type,0);});
 try{const first=instance.validate('first','First@example.com'),second=instance.validate('second','Second@example.com');await new Promise(resolve=>setTimeout(resolve,0));instance.cancel('first');release();
  assert.equal((await first).apply,false);const packet=await second;assert.equal(packet.apply,true);assert.equal(packet.result.status,'VALID');assert.equal(packet.dns.evidence.validUntil,null);assert.equal(instance.inspect().cachedDomains,0);assert.equal(calls.length,4);
  await instance.validate('third','Third@example.com');assert.equal(calls.length,8);
 }finally{instance.close();}
});

test('R02 transient IANA failure retries after bounded cooldown, while stale/hash/404 never grant DNS PASS',async()=>{
 let clock=time,count=0;
 const provider=createBrowserIanaProvider({origin:'https://order-ooo.pages.dev',now:()=>clock,crypto:webcrypto,fetcher:async()=>++count===1?new Response('',{status:404}):new Response(JSON.stringify(envelope))});
 try{assert.equal(await provider.get(),null);assert.equal((await provider.inspect()).lastError,'IANA_HTTP_404');clock+=1499;assert.equal(await provider.get(),null);assert.equal(count,1);clock++;assert.equal((await provider.get()).version,manifest.version);assert.equal(count,2);assert.equal((await provider.inspect()).lastError,null);}finally{provider.close();}
 for(const bad of ['hash','stale']){
  const badProvider=createBrowserIanaProvider({origin:'https://order-ooo.pages.dev',now:()=>bad==='stale'?time+8*86400000:time,crypto:webcrypto,fetcher:async()=>new Response(JSON.stringify(bad==='hash'?{...envelope,rawText:envelope.rawText.replace('COM\n','COMM\n')}:envelope))});
  const instance=createBrowserEmailService({referenceProvider:badProvider,now:()=>bad==='stale'?time+8*86400000:time,fetcher:async()=>assert.fail('untrusted reference must not query DNS')});
  try{const packet=await instance.validate('field','Preserve@example.com');assert.equal(packet.result.status,'UNKNOWN');assert.equal(packet.raw,'Preserve@example.com');assert.equal(packet.gate.finalCompletionAllowed,false);}finally{instance.close();badProvider.close();}
 }
});

test('R02 bounded reference loading and cancelled reentry preserve latest field ownership',async()=>{
 let release;const referenceProvider={get:()=>new Promise(resolve=>{release=resolve;})};
 const instance=createBrowserEmailService({referenceProvider,referenceTimeoutMs:5,fetcher:async()=>assert.fail('not loaded')});
 try{const packet=await instance.validate('field','Keep@example.com');assert.equal(packet.result.status,'UNKNOWN');assert.equal(packet.result.reasonCodes[0],'TLD_DATA_UNAVAILABLE');release(snapshot);}finally{instance.close();}
 let clock=time;const {instance:next}=service(({name,type})=>route(name,type),{now:()=>clock});
 try{assert.equal((await next.validate('field','Keep@example.com')).result.status,'VALID');clock=time-2000;assert.equal((await next.validate('field','Keep@example.com')).result.status,'UNKNOWN');}finally{next.close();}
});
