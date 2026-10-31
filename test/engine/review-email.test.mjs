// Independent review regressions: synthetic domains/records, never live DNS.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEmailSyntax, emailCompletionGate } from '../../src/engine/validation/email.mjs';
import { validateEmailDomain } from '../../src/engine/validation/email-dns.mjs';
import { domainToASCII } from '../../src/engine/adapters/dns-node.mjs';
import { FIXED_TIME, tldFixture } from '../fixtures/engine/dns-fixtures.mjs';

test('E07 review: unknown-TTL historic DNS observations cannot prove a current route', async () => {
  const result = await validateEmailDomain('example.com', {
    now: () => FIXED_TIME,
    resolver: async (_name, type) => type === 'MX'
      ? { status: 'NODATA', records: [], observedAt: FIXED_TIME - 86400000, ttl: null }
      : { status: 'NOERROR', records: ['192.0.2.50'], observedAt: FIXED_TIME - 86400000 },
  });
  assert.equal(result.status, 'UNKNOWN');
});

test('E07 review: broken clock after resolver invocation cannot establish DNS validity', async () => {
  let broken = false;
  const result = await validateEmailDomain('example.com', {
    now: () => broken ? Number.NaN : FIXED_TIME,
    resolver: async (_name, type) => {
      broken = true;
      return type === 'MX'
        ? { status: 'NODATA', records: [], observedAt: FIXED_TIME, ttl: 60 }
        : { status: 'NOERROR', records: ['192.0.2.50'], observedAt: FIXED_TIME, ttl: 60 };
    },
  });
  assert.equal(result.status, 'UNKNOWN');
});

test('E07 review: contradictory negative DNS response cannot prove route absence', async () => {
  const result = await validateEmailDomain('example.com', {
    now: () => FIXED_TIME,
    resolver: async () => ({ status: 'NXDOMAIN', records: ['192.0.2.50'], observedAt: FIXED_TIME, ttl: 60 }),
  });
  assert.equal(result.status, 'UNKNOWN');
});

test('E07 review: each DNS observation is snapshotted before the next query mutates shared data', async () => {
  const records = [{ priority: 10, exchange: 'mx.example.com' }];
  const result = await validateEmailDomain('example.com', {
    now: () => FIXED_TIME,
    resolver: async (_name, type) => {
      if (type === 'MX') return { status: 'NOERROR', records, observedAt: FIXED_TIME, ttl: 60 };
      records[0].exchange = 'mutated.example.com';
      return { status: 'NOERROR', records: ['192.0.2.50'], observedAt: FIXED_TIME, ttl: 60 };
    },
  });
  assert.equal(result.status, 'VALID');
  assert.equal(result.evidence.observations[0].records[0].exchange, 'mx.example.com');
});

test('E05 review: malformed reference entries return UNKNOWN rather than throwing', () => {
  const result = validateEmailSyntax({ raw: 'Name@example.com' }, {
    nowMs: FIXED_TIME, tldData: { ...tldFixture, tlds: [null] },
  });
  assert.equal(result.status, 'UNKNOWN');
});

test('E05 review: ASCII-looking punycode needs IDNA verification when adapter is absent', () => {
  const result = validateEmailSyntax({ raw: 'Name@xn--a.com' }, {
    nowMs: FIXED_TIME, tldData: tldFixture,
  });
  assert.notEqual(result.status, 'VALID');
});

test('E07 review: final gate binds to the same normalized domain', () => {
  const syntax = validateEmailSyntax({ raw: 'Name@example.com' }, { nowMs: FIXED_TIME, tldData: tldFixture });
  assert.equal(emailCompletionGate(syntax, { status: 'VALID', normalized: { domain: 'changed.example.com' } }).finalCompletionAllowed, false);
});

test('E05 review: concrete IDNA adapter rejects malformed A-labels and retains valid IDN', () => {
  for (const domain of ['xn--a.com', 'xn--0.com']) {
    const result = validateEmailSyntax({ raw: `Name@${domain}` }, { nowMs: FIXED_TIME, tldData: tldFixture, domainToASCII });
    assert.notEqual(result.status, 'VALID', domain);
  }
  const result = validateEmailSyntax({ raw: 'Name@пример.рф' }, { nowMs: FIXED_TIME, tldData: tldFixture, domainToASCII });
  assert.equal(result.status, 'VALID');
  assert.equal(result.normalized.domain, 'xn--e1afmkfd.xn--p1ai');
});

test('E07 review: MX dependency expiring during address lookup cannot establish current route', async () => {
  let clock = FIXED_TIME;
  const result = await validateEmailDomain('example.com', {
    now: () => clock,
    resolver: async (_name, type) => {
      if (type === 'MX') return { status: 'NOERROR', records: [{ priority: 10, exchange: 'mx.example.com' }], observedAt: clock, ttl: 1 };
      clock += 1001;
      return { status: 'NOERROR', records: ['192.0.2.50'], observedAt: clock, ttl: 60 };
    },
  });
  assert.equal(result.status, 'UNKNOWN');
});
