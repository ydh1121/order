import test from 'node:test';
import assert from 'node:assert/strict';
import {domainToASCII} from '../../src/engine/adapters/dns-node.mjs';
import {validateEmailSyntax, validateEmail, emailCompletionGate} from '../../src/engine/validation/email.mjs';
import {FIXED_TIME, tldFixture, fixtureResolver, observation} from '../fixtures/engine/dns-fixtures.mjs';
const check = (raw, options = {}, phase = 'complete') => validateEmailSyntax({raw, phase}, {nowMs: FIXED_TIME, tldData: tldFixture, domainToASCII, ...options});

test('E05 preserves case-sensitive local-part and normalizes domain only', () => {
  const r = check('Mixed.Tag+filter@EXAMPLE.OOO');
  assert.equal(r.status, 'VALID');
  assert.deepEqual(r.normalized, {address: 'Mixed.Tag+filter@example.ooo', local: 'Mixed.Tag+filter', domain: 'example.ooo'});
  assert.equal(r.raw, 'Mixed.Tag+filter@EXAMPLE.OOO');
  assert.equal(r.evidence.ownershipVerified, false);
});
test('E05 IDN domain is punycode; Unicode local, quoted local and address literals are unsupported', () => {
  assert.equal(check('Case@пример.рф').normalized.address, 'Case@xn--e1afmkfd.xn--p1ai');
  for (const raw of ['이름@example.com', '"name space"@example.com', 'name@[192.0.2.1]']) assert.equal(check(raw).status, 'UNSUPPORTED');
  for (const domain of ['xn--a.com','xn--0.com']) assert.equal(check(`Case@${domain}`).reasonCodes[0], 'IDNA_INVALID');
});
test('E05 empty, editing, malformed and unsupported remain separate', () => {
  assert.equal(check('').status, 'EMPTY');
  assert.equal(check('a@', {}, 'editing').status, 'INCOMPLETE');
  assert.equal(check('a@').status, 'INVALID');
  for (const raw of ['a..b@example.com', ' a@example.com', 'a@example.com ', 'a@-x.com', 'a@x-.com', 'a@x_.com', 'a\n@example.com', 'a@@example.com']) assert.equal(check(raw).status, 'INVALID', raw);
});
test('E05 independent byte boundaries: 64/65 local, 63/64 label, 254/255 mailbox', () => {
  assert.equal(check('a'.repeat(64) + '@example.com').status, 'VALID');
  assert.equal(check('a'.repeat(65) + '@example.com').reasonCodes[0], 'LOCAL_TOO_LONG');
  assert.equal(check('x@' + 'a'.repeat(63) + '.com').status, 'VALID');
  assert.equal(check('x@' + 'a'.repeat(64) + '.com').reasonCodes[0], 'DOMAIN_TOO_LONG');
  const domain = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(58), 'com'].join('.'); // 190 bytes
  assert.equal(check('a'.repeat(63) + '@' + domain).status, 'VALID'); // 254
  assert.equal(check('a'.repeat(64) + '@' + domain).reasonCodes[0], 'MAILBOX_TOO_LONG');
});
test('E05 missing/stale/future source is UNKNOWN, never falsely INVALID', () => {
  for (const tldData of [null, {...tldFixture, tlds: []}, {...tldFixture, collectedAt: '2026-10-01', sourceUpdatedAt: '2026-10-01'}, {...tldFixture, collectedAt: '2027-01-01'}]) assert.equal(check('a@new.museum', {tldData}).status, 'UNKNOWN');
  assert.equal(check('a@example.nonexistent').reasonCodes[0], 'TLD_NOT_DELEGATED');
  assert.equal(check('a@example.nonexistent', {nowMs: FIXED_TIME + 86400001}).status, 'UNKNOWN');
});
test('E07 UNKNOWN gate preserves drafts and blocks final completion; syntax alone is insufficient', () => {
  const syntax = check('a@example.com');
  assert.equal(emailCompletionGate(syntax).finalCompletionAllowed, false);
  assert.deepEqual(emailCompletionGate(syntax, {status:'UNKNOWN'}), {policyVersion:'email-final-gate-1.0.0', preserveDraft:true, finalCompletionAllowed:false, tone:'neutral', ownershipVerified:false, orderApproved:false});
  assert.equal(emailCompletionGate(syntax, {status:'VALID', normalized:{domain:'example.com'}}).finalCompletionAllowed, true);
  assert.equal(emailCompletionGate(syntax, {status:'VALID', normalized:{domain:'other.com'}}).finalCompletionAllowed, false);
});
test('E02 complete email path preserves raw and versions; malformed syntax never queries DNS', async () => {
  const calls=[];
  const dependencies={syntax:{nowMs:FIXED_TIME,tldData:tldFixture,domainToASCII},dns:{now:()=>FIXED_TIME,resolver:fixtureResolver({'example.com/A':observation('NOERROR',['192.0.2.1'])},calls)}};
  const result=await validateEmail({raw:'Case@EXAMPLE.COM'},dependencies);
  assert.equal(result.status,'VALID'); assert.equal(result.raw,'Case@EXAMPLE.COM');
  assert.equal(result.normalized.address,'Case@example.com'); assert.equal(result.versions.data,'SYNTHETIC_TLDS_1');
  assert.deepEqual(calls,['example.com/MX','example.com/A']);
  calls.length=0;
  assert.equal((await validateEmail({raw:'bad@@example.com'},dependencies)).status,'INVALID');
  assert.equal(calls.length,0);
  const replay=await validateEmail({raw:'Case@EXAMPLE.COM'},dependencies);
  assert.deepEqual(replay,result);
});
