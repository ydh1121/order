import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhone, createPhoneState, finalizePhone} from '../../src/engine/validation/phone.mjs';
import {parseBrowserPhone, projectPhone, createOrderPhoneAdapter} from '../../src/engine/adapters/phone-browser.mjs';

const cases = [
  ['+82 10 2345 6789', '010-2345-6789'],
  ['+82 010 2345 6789', '010-2345-6789'],
  ['+82 (0)10-2345-6789', '010-2345-6789'],
  ['+82 2 234 5678', '02-234-5678'],
  ['+82-2-2345-6789', '02-2345-6789'],
  ['+82 31 234 5678', '031-234-5678'],
  ['+82 70 2345 6789', '070-2345-6789'],
];
for (const [raw, expected] of cases) test(`MSG0504 plus82 ${raw}`, () => {
  const core = validatePhone(raw);
  assert.equal(core.status, 'VALID');
  assert.equal(core.raw, raw);
  assert.equal(core.normalized.formatted, expected);
  assert.equal(core.evidence.countryNormalization, 'PLUS82_TO_DOMESTIC_TRUNK');
  assert.deepEqual(parseBrowserPhone(raw).contract, core);
  assert.equal(finalizePhone(createPhoneState(raw)).normalized.formatted, expected);
});

test('plus82 incomplete, unsupported country and corrupt input stay distinct', () => {
  for (const raw of ['+', '+8', '+82', '+82 10']) assert.equal(validatePhone(raw).status, 'INCOMPLETE');
  assert.equal(validatePhone('+81 10 2345 6789').status, 'UNSUPPORTED');
  for (const raw of ['+82 +10 2345 6789', '+82 10 ABCD 6789', '+82--10-2345-6789']) {
    assert.equal(validatePhone(raw).status, 'INVALID');
  }
  assert.equal(validatePhone('+82 1588 1234').status, 'UNSUPPORTED', 'representative numbers are not fabricated into international reachability');
});

test('browser facade preserves caller string and never loads Node builtins', () => {
  const api = createOrderPhoneAdapter();
  assert.equal(api.parse('1588-1234').valid, true);
  assert.equal(api.parse('070-234-5678').valid, false);
  assert.equal(api.parse('010-1234-12345678').original, '010-1234-12345678');
  assert.equal(api.parse(1023456789).valid, false);
});

test('field, parent, badge, CTA/save use one projection without treating editing as red', () => {
  const valid = parseBrowserPhone('+82 2 234 5678');
  const p = projectPhone(valid, {errorExposed:true});
  assert.equal(p.fieldComplete, true); assert.equal(p.parentComplete, true);
  assert.equal(p.saveAllowed, true); assert.equal(p.badgeCount, 0);
  assert.deepEqual(p.contract, valid.contract);
  const draft = projectPhone(parseBrowserPhone('02-234'), {editing:true,errorExposed:true});
  assert.equal(draft.fieldComplete, false); assert.equal(draft.parentComplete, false);
  assert.equal(draft.saveAllowed, false); assert.equal(draft.badgeCount, 0);
  assert.equal(draft.visual, 'NEUTRAL'); assert.equal(draft.exposeError, false);
});

test('optional initial empty and explicit clear differ from automatic empty replacement', () => {
  const blank = parseBrowserPhone('');
  assert.equal(projectPhone(blank,{required:false,initialEmpty:true}).saveAllowed,true);
  assert.equal(projectPhone(blank,{required:false,explicitClear:true}).saveAllowed,true);
  assert.equal(projectPhone(blank,{required:false}).saveAllowed,false);
  assert.equal(projectPhone(blank,{required:true,explicitClear:true}).saveAllowed,false);
});

test('unsupported profile blocks completion while remaining neutral rather than a format-error claim', () => {
  const projection = projectPhone(parseBrowserPhone('+81 10 2345 6789'), {errorExposed:true});
  assert.equal(projection.saveAllowed,false);
  assert.equal(projection.visual,'NEUTRAL');
  assert.equal(projection.exposeError,false);
  assert.equal(projection.contract.status,'UNSUPPORTED');
});
