import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildBrowserReference} from '../../scripts/engine/build-browser-reference.mjs';
import {verifyBrowserIana} from '../../src/engine/adapters/iana-browser.mjs';
import {browserDomainToASCII} from '../../src/engine/adapters/dns-browser.mjs';
import {createBrowserEmailService} from '../../src/engine/adapters/email-browser.mjs';
import {validateEmailSyntax} from '../../src/engine/validation/email.mjs';

const manifest=JSON.parse(await readFile(new URL('../../src/engine/reference/iana-manifest.json',import.meta.url),'utf8'));
const now=Date.parse(manifest.collectedAt)+1000;
const snapshot=await verifyBrowserIana(await buildBrowserReference({now}),{crypto:webcrypto});
const rr={MX:15,A:1,AAAA:28},record=(name,type,data)=>({name:name+'.',type:rr[type],TTL:60,data});
const response=(name,type,answers=[],status=0)=>new Response(JSON.stringify({Status:status,Question:[{name:name+'.',type:rr[type]}],Answer:answers,
 ...(status===3?{Authority:[{name:name+'.',type:6,TTL:60,data:'ns.example.org. hostmaster.example.org. 1 2 3 4 60'}]}:{})}),{headers:{'content-type':'application/dns-json'}});

async function inspect(raw,handler,options={}){
 const calls=[];
 const service=createBrowserEmailService({provider:'cloudflare',retries:0,referenceProvider:{get:async()=>snapshot},now:()=>now,...options,fetcher:async(url,request)=>{
  const parsed=new URL(url),name=parsed.searchParams.get('name'),type=parsed.searchParams.get('type');calls.push({name,type,url,credentials:request.credentials,referrerPolicy:request.referrerPolicy});return handler(name,type);
 }});
 try{return {packet:await service.validate('synthetic-field',raw),calls};}finally{service.close();}
}

test('F04 official IANA grammar accepts domain classes without a mail-provider allow-list (synthetic DNS)',async()=>{
 const domains=['naver.com','gmail.com','abc.xyz','art.art','nic.technology','proton.me','sbi.co.in','bücher.de','xn--bcher-kva.de','cs.stanford.edu'];
 for(const input of domains){
  const ascii=browserDomainToASCII(input),raw='NeverSendThis.LocalPart+'+'0517@'+input;
  const {packet,calls}=await inspect(raw,(name,type)=>response(name,type,type==='MX'?[record(name,'MX','10 mx.example.org.')]:[record(name,'A','192.0.2.51')]));
  assert.equal(packet.syntax.status,'VALID',input);assert.equal(packet.result.status,'VALID',input);assert.equal(packet.syntax.normalized.domain,ascii);assert.equal(calls[0].name,ascii);assert.equal(packet.gate.ownershipVerified,false);assert.equal(packet.raw,raw);
  assert.equal(calls.length,2);assert.ok(calls.every(call=>!call.url.includes('@')&&!call.url.includes('NeverSendThis')&&call.credentials==='omit'&&call.referrerPolicy==='no-referrer'));
 }
});

test('F04 xyz/art/in delegation cannot override authoritative NXDOMAIN (synthetic replay)',async()=>{
 for(const domain of ['naver.xyz','naver.art','naver.co.in']){
  const {packet,calls}=await inspect('synthetic@'+domain,(name,type)=>response(name,type,[],3));
  assert.equal(packet.syntax.status,'VALID');assert.equal(packet.syntax.evidence.tld,domain.split('.').at(-1));assert.equal(packet.result.status,'INVALID');assert.deepEqual(packet.result.reasonCodes,['DNS_NXDOMAIN']);assert.equal(packet.gate.finalCompletionAllowed,false);assert.equal(calls.length,1);
 }
});

test('F04 Null MX, NODATA implicit IPv4, implicit IPv6 and no route retain separate contracts',async()=>{
 const scenarios=[
  {code:'DNS_NULL_MX',status:'INVALID',handler:(n,t)=>response(n,t,[record(n,'MX','0 .')]),types:['MX']},
  {code:'DNS_IMPLICIT_MX_ADDRESS',status:'VALID',handler:(n,t)=>response(n,t,t==='A'?[record(n,'A','192.0.2.20')]:[]),types:['MX','A']},
  {code:'DNS_IMPLICIT_MX_ADDRESS',status:'VALID',handler:(n,t)=>response(n,t,t==='AAAA'?[record(n,'AAAA','2001:db8::20')]:[]),types:['MX','A','AAAA']},
  {code:'DNS_ALL_ROUTES_ABSENT',status:'INVALID',handler:(n,t)=>response(n,t),types:['MX','A','AAAA']},
 ];
 for(const scenario of scenarios){const {packet,calls}=await inspect('synthetic@example.com',scenario.handler);assert.equal(packet.result.status,scenario.status);assert.equal(packet.result.reasonCodes[0],scenario.code);assert.deepEqual(calls.map(c=>c.type),scenario.types);assert.equal(packet.gate.ownershipVerified,false);}
});

test('F04 CORS/network and SERVFAIL are UNKNOWN with separately traceable resolver codes',async()=>{
 for(const [handler,resolverCode] of [[()=>{throw new TypeError('Synthetic CORS failure');},'DOH_NETWORK_OR_CORS'],[(n,t)=>response(n,t,[],2),'DOH_RCODE_2']]){
  const {packet}=await inspect('Preserve.Case@example.com',handler);assert.equal(packet.result.status,'UNKNOWN');assert.equal(packet.result.evidence.dns.observations[0].resolverCode,resolverCode);assert.equal(packet.raw,'Preserve.Case@example.com');assert.equal(packet.gate.preserveDraft,true);assert.equal(packet.gate.tone,'neutral');assert.equal(packet.gate.finalCompletionAllowed,false);
 }
});

test('F04 timeout and exhausted query/HTTP budgets never turn unknown into a bad address',async()=>{
 const hanging=await inspect('Preserve@example.com',()=>new Promise(()=>{}),{queryTimeoutMs:5,totalTimeoutMs:100});
 assert.equal(hanging.packet.result.status,'UNKNOWN');assert.equal(hanging.packet.result.reasonCodes[0],'DNS_TIMEOUT');assert.equal(hanging.packet.gate.tone,'neutral');
 const mx=(name,type)=>response(name,type,type==='MX'?[record(name,'MX','10 first.example.org.'),record(name,'MX','20 second.example.org.')]:[]);
 for(const options of [{maxQueries:1},{maxHttpRequests:1}]){
  const {packet,calls}=await inspect('Preserve@example.com',mx,options);assert.equal(packet.result.status,'UNKNOWN');assert.equal(packet.gate.finalCompletionAllowed,false);assert.equal(packet.gate.tone,'neutral');assert.equal(calls.length,1);
  if(options.maxQueries)assert.equal(packet.result.reasonCodes[0],'DNS_BUDGET_EXHAUSTED');
  else assert.ok(packet.result.evidence.dns.observations.some(row=>row.resolverCode==='DOH_REQUEST_BUDGET'));
 }
});

test('F04 unlisted public TLD is rejected independently of autocomplete; stale IANA is neutral',()=>{
 const input={raw:'Preserve@example.unlisted-0517'};
 assert.equal(validateEmailSyntax(input,{domainToASCII:browserDomainToASCII,tldData:snapshot,nowMs:now}).reasonCodes[0],'TLD_NOT_DELEGATED');
 const stale=validateEmailSyntax({raw:'Preserve@example.com'},{domainToASCII:browserDomainToASCII,tldData:snapshot,nowMs:now+8*86400000});assert.equal(stale.status,'UNKNOWN');assert.equal(stale.normalized.address,'Preserve@example.com');
});
