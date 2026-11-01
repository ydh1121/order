import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildBrowserReference} from '../../scripts/engine/build-browser-reference.mjs';
import {ENGINE_VERSION,CONTRACT_VERSION} from '../../src/engine/contracts/result.mjs';

// This is a synthetic Node compatibility test, not DOM, CORS or online evidence.
test('MSG0504 production contact facade projects one current core verdict without mutable QA hooks',async t=>{
 const manifest=JSON.parse(await readFile(new URL('../../src/engine/reference/iana-manifest.json',import.meta.url),'utf8'));
 let clock=Date.parse(manifest.collectedAt)+3600000;
 const envelope=await buildBrowserReference({now:clock});
 const original=new Map(['window','location','fetch','OrderPhone','OrderEmail','OrderEmailDomain','OrderEmailUI'].map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 t.after(()=>{for(const [name,descriptor]of original)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];});
 t.mock.method(Date,'now',()=>clock);
 globalThis.window=globalThis;globalThis.location=new URL('http://localhost:4173/');
 const calls=[],types={A:1,AAAA:28,MX:15};
 const answer=(name,type,data,ttl=60)=>({name:name+'.',type:types[type],TTL:ttl,data});
 let respond=(name,type)=>({Answer:type==='MX'?[answer(name,'MX','10 mx.example.com.')]:[answer(name,'A','192.0.2.1')]});
 globalThis.fetch=async(url,options)=>{
  const parsed=new URL(url);calls.push({url:parsed.href,options});
  if(parsed.pathname==='/assets/iana-reference.json')return new Response(JSON.stringify(envelope),{headers:{'content-type':'application/json'}});
  assert.ok(['https://cloudflare-dns.com','https://dns.google'].includes(parsed.origin));
  const name=parsed.searchParams.get('name'),type=parsed.searchParams.get('type');
  const data=await respond(name,type,options);
  return new Response(JSON.stringify({Status:0,Question:[{name:name+'.',type:types[type]}],...data}),{headers:{'content-type':'application/dns-json'}});
 };
 await import('../../web/contact-ui.mjs');
 const phone=globalThis.OrderPhone,email=globalThis.OrderEmail,domains=globalThis.OrderEmailDomain;
 t.after(()=>domains.clearCache());

 await t.test('legacy names use shared syntax, preserve local case, and expose no resolver or snapshot setters',()=>{
  assert.equal(phone.parse('+82 2 1234 5678').formatted,'02-1234-5678');
  assert.equal(phone.parse('070-123-4567').valid,false);
  const parsed=email.parse('Case@пример.рф');
  assert.equal(parsed.valid,true);assert.equal(parsed.localPart,'Case');assert.equal(parsed.domain,'xn--e1afmkfd.xn--p1ai');
  assert.equal(email.parse('Case@order.ooo').valid,true);
  assert.equal(email.parse('Case@xn--a.com').valid,false);
  assert.equal(email.parse('Case@order.ooo').contract.normalized.address,'Case@order.ooo');
  assert.equal(domains.setQAResolver,undefined);assert.equal(domains.setSnapshot,undefined);
  assert.equal(domains.metadata.engine,ENGINE_VERSION);assert.equal(domains.metadata.contract,CONTRACT_VERSION);
 });

 await t.test('field, parent/status and same-domain cache consume the identical current proof',async()=>{
  const notifications=[];const unsubscribe=domains.subscribe(domain=>notifications.push(domain));
  const proof=await domains.validate('example.com');
  assert.equal(proof.state,'MX_ROUTE_FOUND');assert.equal(proof.engineResult.status,'VALID');
  assert.equal(proof.syntaxContract.versions.data,manifest.version);
  assert.equal(domains.status('Different@example.com'),proof);assert.equal(domains.peek('example.com'),proof);
  assert.equal(domains.isSuccess(proof),true);assert.equal(proof.mailboxVerified,false);
  const before=calls.length;assert.equal(await domains.validate('example.com'),proof);assert.equal(calls.length,before);
  assert.deepEqual(notifications,['example.com']);unsubscribe();
  assert.equal(calls.length,5);assert.equal(calls[1].url.includes('validation%40'),false);
  assert.equal(calls[1].options.mode,'cors');assert.equal(calls[1].options.credentials,'omit');
 });

 await t.test('fresh undelegated TLD is hard-invalid without sending it to DNS',async()=>{
  const before=calls.length;const proof=await domains.validate('example.invalid');
  assert.equal(proof.state,'INVALID_TLD');assert.equal(domains.isHard(proof),true);
  assert.equal(domains.status('Case@example.invalid'),proof);assert.equal(calls.length,before);
 });

 await t.test('zero-TTL current proof is bound to raw/consumer while global status stays neutral',async()=>{
  domains.clearCache();respond=(name,type)=>({Answer:type==='MX'?[answer(name,'MX','10 mx.example.com.',0)]:[answer(name,'A','192.0.2.1',0)]});
  const controller=new AbortController(),raw='Case@example.com';
  const proof=await domains.validate('example.com',{raw,signal:controller.signal});
  assert.equal(proof.state,'MX_ROUTE_FOUND');assert.equal(proof.reusable,false);assert.equal(proof.currentValidationOnly,true);
  assert.equal(domains.isCurrent(proof,raw),true);assert.equal(domains.isCurrent(proof,'Other@example.com'),false);
  assert.equal(domains.status(raw).state,'UNKNOWN');assert.equal(domains.isSuccess(domains.status(raw)),false);
  assert.equal(domains.isCurrent({...proof},raw),false,'forged proof identity cannot bypass contract');
  controller.abort();assert.equal(domains.isCurrent(proof,raw),false);
  const next=new AbortController(),before=calls.length;
  const fresh=await domains.validate('example.com',{raw,signal:next.signal});
  assert.equal(calls.length-before,4,'no zero-TTL cache reuse');assert.equal(domains.isCurrent(fresh,raw),true);
  domains.clearCache();assert.equal(domains.isCurrent(fresh,raw),false);
  respond=(name,type)=>({Answer:type==='MX'?[answer(name,'MX','0 .',0)]:[]});
  const negative=await domains.validate('example.com',{raw,signal:next.signal});
  assert.equal(negative.state,'MAIL_DISABLED');assert.equal(domains.isHard(negative),true);
  assert.equal(domains.isCurrent(negative,raw),true);assert.equal(domains.status(raw).state,'UNKNOWN');next.abort();
 });

 await t.test('proof expiry invalidates every projection and two consumers share a cancellable request',async()=>{
  domains.clearCache();respond=(name,type)=>({Answer:type==='MX'?[answer(name,'MX','10 mx.example.com.',1)]:[answer(name,'A','192.0.2.1',60)]});
  await domains.validate('example.com');clock+=1001;
  assert.equal(domains.status('Case@example.com').state,'UNCHECKED');
  let release,entered;const waiting=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;});
  respond=async(name,type)=>{if(type==='MX'){entered();await blocked;}return {Answer:type==='MX'?[answer(name,'MX','10 mx.example.com.')]:[answer(name,'A','192.0.2.1')]};};
  const controller=new AbortController(),before=calls.length;
  const first=domains.validate('example.com',{signal:controller.signal});
  const second=domains.validate('example.com');await waiting;
  controller.abort();release();
  assert.equal((await first).state,'UNKNOWN');assert.equal((await second).state,'MX_ROUTE_FOUND');
  assert.equal(calls.length-before,4);assert.equal(domains.status('Case@example.com').state,'MX_ROUTE_FOUND');
 });

 await t.test('reference expiry preserves raw contact and revokes earlier successful parent state',()=>{
  clock+=8*86400000;
  const raw='Case@example.com',parsed=email.parse(raw);
  assert.equal(parsed.raw,raw);assert.equal(parsed.valid,true);
  assert.equal(domains.status(raw).state,'UNKNOWN');assert.equal(domains.isSuccess(domains.status(raw)),false);
 });
});
