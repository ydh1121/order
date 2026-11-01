import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserDnsResolver } from '../../src/engine/adapters/dns-browser.mjs';
import { createBrowserEmailService } from '../../src/engine/adapters/email-browser.mjs';
import { validateEmailDomain } from '../../src/engine/validation/email-dns.mjs';
import { FIXED_TIME, tldFixture } from '../fixtures/engine/dns-fixtures.mjs';

const rrType = { A: 1, MX: 15, AAAA: 28 };
const reply = (name, type, answer, { age = 0, status = 0, authority = [] } = {}) => new Response(JSON.stringify({
  Status: status, TC: false, Question: [{ name: `${name}.`, type: rrType[type] }], Answer: answer, Authority: authority,
}), { headers: { 'content-type': 'application/dns-json', age: String(age) } });
const record = (name, type, data, ttl = 60) => ({ name: `${name}.`, type: rrType[type], data, TTL: ttl });

test('I04 independent: HTTP Age expiry cannot be relabeled a fresh zero-TTL mail route', async () => {
  const resolver = createBrowserDnsResolver({ now: () => FIXED_TIME, fetcher: async url => {
    const query = new URL(url), name = query.searchParams.get('name'), type = query.searchParams.get('type');
    return type === 'MX'
      ? reply(name, type, [record(name, 'MX', '10 mail.example.com.', 60)], { age: 61 })
      : reply(name, type, type === 'A' ? [record(name, 'A', '192.0.2.51')] : []);
  } });
  assert.equal((await validateEmailDomain('example.com', { resolver, now: () => FIXED_TIME })).status, 'UNKNOWN');
});

test('I04 independent: unrelated SOA cannot grant a negative-cache lifetime', async () => {
  const resolver = createBrowserDnsResolver({ now: () => FIXED_TIME, fetcher: async () => reply('example.com', 'MX', [], {
    status: 3, authority: [{ name: 'unrelated.example.', type: 6, TTL: 600, data: 'ns.unrelated.example. hostmaster.unrelated.example. 1 2 3 4 600' }],
  }) });
  const answer = await resolver('example.com', 'MX');
  assert.ok(answer.status === 'TEMPFAIL' || answer.ttl == null, 'unrelated SOA TTL must not be cached');
});

test('I04 independent: reference expiring during DNS blocks final completion without losing input', async () => {
  let clock = FIXED_TIME;
  const service = createBrowserEmailService({
    referenceProvider: { get: async () => ({ ...tldFixture, maxAgeMs: 1000 }) }, now: () => clock,
    fetcher: async url => {
      const query = new URL(url), name = query.searchParams.get('name'), type = query.searchParams.get('type');
      if (type === 'A') clock += 1001;
      return reply(name, type, type === 'A' ? [record(name, 'A', '192.0.2.51')] : []);
    },
  });
  try {
    const answer = await service.validate('site-email', 'Case@example.com');
    assert.equal(answer.result.status, 'UNKNOWN');
    assert.equal(answer.gate.finalCompletionAllowed, false);
    assert.equal(answer.raw, 'Case@example.com');
  } finally { service.close(); }
});
