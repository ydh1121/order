import test from 'node:test';
import assert from 'node:assert/strict';
import {validateEmailDomain} from '../../src/engine/validation/email-dns.mjs';
import {createDnsCacheResolver} from '../../src/engine/adapters/dns-cache.mjs';
import {FIXED_TIME, observation as rr, mxList, fixtureResolver} from '../fixtures/engine/dns-fixtures.mjs';
const check = (entries, options = {}) => validateEmailDomain('example.com', {resolver:fixtureResolver(entries), now:()=>FIXED_TIME, ...options});

test('E06 sixth MX alone has A: 12 queries finds route, budget 11 is UNKNOWN', async () => {
  const entries = {'example.com/MX': rr('NOERROR', mxList(6)), 'mx6.example.com/A': rr('NOERROR', ['192.0.2.60'])};
  const good = await check(entries);
  assert.equal(good.status, 'VALID'); assert.equal(good.evidence.queries, 12);
  assert.deepEqual(good.evidence.route, {host:'mx6.example.com',addressType:'A'});
  const limited = await check(entries, {maxQueries:11});
  assert.equal(limited.status, 'UNKNOWN'); assert.equal(limited.reasonCodes[0], 'DNS_BUDGET_EXHAUSTED');
  assert.equal(limited.evidence.queries, 11);
});
test('E06 every MX A/AAAA absent is INVALID, not a blanket UNKNOWN', async () => {
  const r = await check({'example.com/MX': rr('NOERROR', mxList(6))});
  assert.equal(r.status, 'INVALID'); assert.equal(r.reasonCodes[0], 'DNS_ALL_ROUTES_ABSENT');
  assert.equal(r.evidence.queries, 13);
});
test('E06 Null MX is definitive, mixed Null MX is uncertain and no fallback', async () => {
  const r = await check({'example.com/MX': rr('NOERROR',[{priority:0,exchange:'.'}]), 'example.com/A':rr('NOERROR',['192.0.2.1'])});
  assert.equal(r.reasonCodes[0],'DNS_NULL_MX'); assert.equal(r.evidence.queries,1);
  assert.equal((await check({'example.com/MX':rr('NOERROR',[{priority:0,exchange:'.'},...mxList(1)])})).status,'UNKNOWN');
});
test('E06 no MX allows implicit A or IPv6-only AAAA, NXDOMAIN rejects immediately', async () => {
  assert.equal((await check({'example.com/A':rr('NOERROR',['192.0.2.1'])})).reasonCodes[0],'DNS_IMPLICIT_MX_ADDRESS');
  const r = await check({'example.com/AAAA':rr('NOERROR',['2001:db8::1'])});
  assert.equal(r.status,'VALID'); assert.equal(r.evidence.queries,3);
  assert.equal((await check({'example.com/MX':rr('NXDOMAIN')})).reasonCodes[0],'DNS_NXDOMAIN');
});
test('E06 malformed addresses and responses cannot become route success', async () => {
  for (const records of [['999.1.1.1'],['not-an-address'],['1.2.3.4.5']]) assert.equal((await check({'example.com/A':rr('NOERROR',records)})).status,'UNKNOWN');
  for (const records of [['1:2:3'],['2001:::1'],['::ffff:999.1.1.1']]) assert.equal((await check({'example.com/AAAA':rr('NOERROR',records)})).status,'UNKNOWN');
  assert.equal((await check({'example.com/MX':{status:'NOERROR',observedAt:FIXED_TIME}})).reasonCodes[0],'DNS_MALFORMED_MX');
});
test('E07 temporary failure does not erase later working paths; if none works result UNKNOWN', async () => {
  assert.equal((await check({'example.com/MX':rr('TEMPFAIL')})).status,'UNKNOWN');
  assert.equal((await check({'example.com/A':rr('TEMPFAIL'),'example.com/AAAA':rr('NOERROR',['2001:db8::1'])})).status,'VALID');
  assert.equal((await check({'example.com/A':rr('TEMPFAIL')})).status,'UNKNOWN');
});
test('E07 timeout and cancellation bounded, hanging resolver cannot stall', async () => {
  let aborted = false;
  const r = await check({}, {timeoutMs:10,totalTimeoutMs:100,resolver:(_n,_t,{signal})=>new Promise(()=>signal.addEventListener('abort',()=>{aborted=true;}))});
  assert.equal(r.reasonCodes[0],'DNS_TIMEOUT'); assert.equal(aborted,true);
  const controller = new AbortController(); controller.abort();
  const cancelled = await check({}, {signal:controller.signal});
  assert.equal(cancelled.reasonCodes[0],'DNS_ABORTED'); assert.equal(cancelled.evidence.queries,0);
});
test('E07 late stale response rejected, query limit validated, MX record budget disclosed', async () => {
  assert.equal((await check({'example.com/MX':{...rr('NOERROR',mxList(1)),observedAt:FIXED_TIME-61000}})).reasonCodes[0],'DNS_STALE_RESPONSE');
  assert.equal((await check({}, {maxQueries:0})).status,'INVALID');
  assert.equal((await check({'example.com/MX':rr('NOERROR',mxList(3))},{maxMxRecords:2})).reasonCodes[0],'DNS_MX_RECORD_BUDGET');
});
test('E07 TTL cache hits before expiration, refreshes at boundary, avoids unknown TTL', async () => {
  let clock=0,calls=0;
  const resolve=createDnsCacheResolver(async()=>({status:'NOERROR',records:['192.0.2.1'],ttl:2,observedAt:clock,count:++calls}),{now:()=>clock});
  assert.equal((await resolve('example.com','A')).count,1);
  clock=1999; assert.equal((await resolve('example.com','A')).count,1);
  clock=2000; assert.equal((await resolve('example.com','A')).count,2);
  let noTtlCalls=0;
  const noTtl=createDnsCacheResolver(async()=>({status:'NODATA',observedAt:clock,count:++noTtlCalls}),{now:()=>clock});
  await noTtl('example.com','MX'); await noTtl('example.com','MX'); assert.equal(noTtlCalls,2);
});
test('E07 older in-flight response cannot overwrite newer response or invalidation', async () => {
  const pending=[];
  const resolve=createDnsCacheResolver(()=>new Promise(done=>pending.push(done)),{now:()=>FIXED_TIME});
  const first=resolve('example.com','A'),second=resolve('example.com','A');
  pending[1]({...rr('NOERROR',['192.0.2.2']),tag:'new'}); await second;
  pending[0]({...rr('NOERROR',['192.0.2.1']),tag:'old'}); await first;
  assert.equal((await resolve('example.com','A')).tag,'new');
  resolve.invalidate('example.com','A');
  const third=resolve('example.com','A'); resolve.invalidate('example.com','A');
  pending[2]({...rr('NOERROR',['192.0.2.3']),tag:'invalidated'}); await third;
  const fourth=resolve('example.com','A'); assert.equal(pending.length,4);
  pending[3]({...rr('NOERROR',['192.0.2.4']),tag:'fresh'}); assert.equal((await fourth).tag,'fresh');
});
