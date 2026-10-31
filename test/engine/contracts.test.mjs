import test from 'node:test';
import assert from 'node:assert/strict';
import {engineResult, completionGate} from '../../src/engine/contracts/result.mjs';

test('unknown completion is neutral, draft-preserving and never grants authority', () => {
  assert.deepEqual(completionGate(engineResult({status:'UNKNOWN'})), {
    policyVersion:'ux-completion-1.0.0',draftAllowed:true,fieldEligible:false,finalCompletionAllowed:false,
    presentation:'NEUTRAL',reasonCodes:['FIELD_COMPLETION_BLOCKED'],
    grants:{registration:false,order:false,payment:false,ownership:false}});
});
test('optional explicit clear differs from automatic empty replacement', () => {
  const empty=engineResult({status:'EMPTY'});
  assert.equal(completionGate(empty,{required:false}).fieldEligible,false);
  assert.equal(completionGate(empty,{required:false,explicitClear:true}).fieldEligible,true);
  assert.equal(completionGate(empty,{required:true,explicitClear:true}).fieldEligible,false);
});
test('generic gate cannot approve syntax-only email validation', () => {
  const gate=completionGate(engineResult({status:'VALID',field:'email'}));
  assert.equal(gate.finalCompletionAllowed,false);
  assert.deepEqual(gate.reasonCodes,['EMAIL_DOMAIN_GATE_REQUIRED']);
});
test('returned snapshot is independent of subsequent input mutation', () => {
  const raw={line:{quantity:'3'}}; const evidence={input:raw};
  const value=engineResult({status:'VALID',raw,evidence}); raw.line.quantity='999';
  assert.equal(value.raw.line.quantity,'3'); assert.equal(value.evidence.input.line.quantity,'3');
  assert.deepEqual(value.versions,{engine:'0.1.0',contract:'1.0.0',rules:'unspecified',data:null});
});
