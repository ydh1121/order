import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePhone, createPhoneState, editPhone, finalizePhone } from '../../src/engine/validation/phone.mjs';
import { completionGate } from '../../src/engine/contracts/result.mjs';
import { phoneCases } from '../fixtures/engine/phone-cases.mjs';

for (const [id, raw, status, formatted] of phoneCases) test(`phone fixture ${id}`, () => {
  const got = validatePhone(raw);
  assert.equal(got.status, status);
  assert.equal(got.normalized?.formatted ?? null, formatted);
  assert.equal(got.raw, raw);
  assert.equal(got.evidence.activation, 'NOT_CHECKED');
});

test('explicit 02 middle-three departure preserves 234 then 5678', () => {
  let state = createPhoneState('02');
  let step = editPhone(state, { type: 'replaceSegment', index: 1, text: '234' });
  assert.equal(step.accepted, true);
  state = editPhone(step.state, { type: 'move', cause: 'explicit', from: 1, to: 2 }).state;
  assert.deepEqual(state.intent, { kind: 'explicit', middleWidth: 3 });
  state = editPhone(state, { type: 'replaceSegment', index: 2, text: '5678' }).state;
  const got = finalizePhone(state);
  assert.equal(got.status, 'VALID');
  assert.deepEqual(got.normalized.segments, ['02', '234', '5678']);
  assert.equal(got.normalized.digits, '022345678');
});

test('automatic focus records no explicit middle-three intent', () => {
  let state = editPhone(createPhoneState('02'), { type: 'replaceSegment', index: 1, text: '234' }).state;
  state = editPhone(state, { type: 'move', cause: 'automatic', from: 1, to: 2 }).state;
  assert.deepEqual(state.intent, { kind: 'automatic' });
  const got = validatePhone({ raw: '02-2345-678', segments: ['02', '2345', '678'], intent: state.intent });
  assert.equal(got.normalized.formatted, '02-234-5678');
});

test('automatic focus preserves prior explicit intent; extra last digit cannot be reflowed', () => {
  let state = createPhoneState('02-234-5678');
  state = editPhone(state, { type: 'move', cause: 'automatic', from: 1, to: 2 }).state;
  const before = structuredClone(state);
  const got = editPhone(state, { type: 'replaceSegment', index: 2, text: '56789' });
  assert.equal(got.accepted, false);
  assert.equal(got.result.reasonCodes[0], 'PHONE_SEGMENT_TOO_LONG');
  assert.deepEqual(got.state, before);
  assert.equal(got.candidate.raw, '02-234-56789');
});

test('first segment edits revalidate shape and whole length', () => {
  const state = createPhoneState('02-2345-6789');
  assert.equal(editPhone(state, { type: 'replaceSegment', index: 0, text: '010' }).result.status, 'VALID');
  const wrong = editPhone(state, { type: 'replaceSegment', index: 0, text: '1588' });
  assert.equal(wrong.accepted, false);
  assert.equal(wrong.result.reasonCodes[0], 'PHONE_SEGMENT_COUNT');
  assert.equal(wrong.state.raw, state.raw);
});

test('representative prefix edits do not synthesize missing third segment', () => {
  const got = editPhone(createPhoneState('1588-1234'), { type: 'replaceSegment', index: 0, text: '010' });
  assert.equal(got.accepted, false);
  assert.equal(got.result.reasonCodes[0], 'PHONE_SEGMENT_COUNT');
  assert.equal(got.state.raw, '1588-1234');
});

test('restored corruption remains exact and can be repaired by explicit replacement', () => {
  const raw = '010-1234-12345678';
  const state = createPhoneState(raw);
  assert.equal(state.raw, raw);
  assert.equal(state.originalRaw, raw);
  assert.equal(finalizePhone(state).normalized, null);
  const repaired = editPhone(state, { type: 'replaceSegment', index: 2, text: '5678' });
  assert.equal(repaired.accepted, true);
  assert.equal(repaired.state.originalRaw, raw);
  assert.equal(finalizePhone(repaired.state).normalized.formatted, '010-1234-5678');
  assert.equal(state.raw, raw, 'no mutation of caller state');
});

test('partial paste cannot be mistaken for full representative number', () => {
  const state = createPhoneState('010-2345-6789');
  const partial = editPhone(state, { type: 'paste', scope: 'segment', index: 2, text: '12345678' });
  assert.equal(partial.accepted, false);
  assert.equal(partial.candidate.raw, '010-2345-12345678');
  assert.equal(partial.state.raw, state.raw);
  const whole = editPhone(state, { type: 'paste', scope: 'field', text: '15881234' });
  assert.equal(whole.accepted, true);
  assert.equal(finalizePhone(whole.state).normalized.formatted, '1588-1234');
});

test('paste scope must be specified; illegal paste leaves existing digits intact', () => {
  const state = createPhoneState('022345678');
  for (const operation of [
    { type: 'paste', text: '15881234' },
    { type: 'paste', scope: 'segment', index: 1, text: 'ab' },
    { type: 'paste', scope: 'field', text: '010x23456789' },
  ]) {
    const got = editPhone(state, operation);
    assert.equal(got.accepted, false);
    assert.deepEqual(got.state, state);
  }
});

test('optional explicit clear and automatic empty replacement have different gate outcomes', () => {
  const state = createPhoneState('010-1234-12345678', { required: false });
  assert.equal(editPhone(state, { type: 'clear', explicit: false }).accepted, false);
  const cleared = editPhone(state, { type: 'clear', explicit: true });
  assert.equal(cleared.accepted, true);
  assert.equal(cleared.state.originalRaw, state.raw);
  const verdict = finalizePhone(cleared.state);
  assert.equal(verdict.status, 'EMPTY');
  assert.equal(completionGate(verdict, { required: false, explicitClear: true }).fieldEligible, true);
  assert.equal(completionGate(verdict, { required: false, explicitClear: false }).fieldEligible, false);
});

test('blank required, incomplete prefix, unsupported domestic type, invalid characters differ', () => {
  assert.equal(validatePhone('').status, 'EMPTY');
  assert.equal(validatePhone('03').status, 'INCOMPLETE');
  assert.equal(validatePhone('0801234567').status, 'UNSUPPORTED');
  assert.equal(validatePhone('010x12345678').status, 'INVALID');
});

test('no number coercion; leading zeroes must be supplied as a string', () => {
  assert.equal(validatePhone({ raw: 1023456789 }).status, 'INVALID');
  assert.equal(validatePhone(1023456789).status, 'INVALID');
  assert.equal(validatePhone(null).status, 'INVALID');
  assert.equal(validatePhone({raw:'02',segments:{0:'02'}}).status, 'INVALID');
  assert.equal(validatePhone({ raw: '02-234-5678', segments: ['02', '999', '5678'] }).reasonCodes[0], 'PHONE_RAW_SEGMENTS_MISMATCH');
});

test('partial formatted raw can omit final group, while supplied shape is never expanded', () => {
  for (const raw of ['02-', '02-234', '02-234-', '070-234', '1588-']) {
    assert.equal(validatePhone(raw).status, 'INCOMPLETE', raw);
  }
  assert.equal(validatePhone({raw:'010-2345',segments:['010','2345']}).reasonCodes[0], 'PHONE_SEGMENT_COUNT');
  assert.equal(validatePhone({raw:'02-234-56789',segments:['02','234','56789'],intent:{kind:'automatic'}}).status, 'INVALID');
});

test('supplied segments cannot bypass raw separator validity', () => {
  const raw = '0)2-234-5678';
  assert.equal(validatePhone(raw).status, 'INVALID');
  assert.equal(validatePhone({raw,segments:['02','234','5678']}).status, 'INVALID');
  assert.equal(validatePhone({raw:'(02)-234-5678',segments:['02','234','5678']}).status, 'VALID');
});

test('unsegmented source and normalized storage/display parse agree', () => {
  for (const [, raw, status] of phoneCases) {
    if (status !== 'VALID') continue;
    const result = validatePhone(raw);
    assert.deepEqual(validatePhone(result.normalized.formatted).normalized, result.normalized);
    assert.deepEqual(validatePhone(result.normalized.digits).normalized, result.normalized);
  }
});

test('deterministic seed invariant: no valid result loses or reorders digits', () => {
  let seed = 499;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  const prefixes = ['02', '031', '010', '070', '1588'];
  for (let i = 0; i < 500; i++) {
    let raw = prefixes[next() % prefixes.length];
    const length = next() % 15;
    for (let j = 0; j < length; j++) raw += String(next() % 10);
    const first = validatePhone(raw);
    assert.deepEqual(validatePhone(raw), first);
    assert.equal(first.raw, raw);
    if (first.status === 'VALID') assert.equal(first.normalized.digits, raw);
    else assert.equal(first.normalized, null);
  }
});

test('syntax does not imply assignment, activated service, ownership, or an order grant', () => {
  const result = validatePhone('070-1234-5678');
  assert.equal(result.status, 'VALID');
  assert.equal(result.evidence.assignment.status, 'UNKNOWN');
  assert.equal(result.evidence.activation, 'NOT_CHECKED');
  assert.equal(result.evidence.ownership, 'NOT_CHECKED');
  assert.equal(completionGate(result).grants.order, false);
});
