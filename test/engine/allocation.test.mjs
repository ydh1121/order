import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAllocation,beginAllocationEdit,editAllocation,confirmAllocation,cancelAllocation,evaluateOnceAllocation,changeAllocationTopology} from '../../src/engine/calculation/allocation.mjs';
import {allocationState,entry,quantity} from '../fixtures/engine/allocation.mjs';
const lineId='line-eggs';
const rat=(numerator,denominator=1)=>({numerator:String(numerator),denominator:String(denominator)});
const start=(state,options={})=>beginAllocationEdit(state,{lineId,scope:['a','b'],transactionId:'TEST-TX-1',...options}).session;
const evaluate=(state,session)=>evaluateAllocation({state,lineId,draft:session});

test('200 each, saved50 plus exactly one blank yields150 proposal without saving or completion',()=>{
  const state=allocationState(),before=structuredClone(state),session=start(state);
  const result=evaluate(state,session);
  assert.equal(result.status,'INCOMPLETE');assert.deepEqual(result.normalized.fixedSum,rat(50));
  assert.deepEqual(result.normalized.residualBeforeSuggestions,rat(150));
  assert.deepEqual(result.normalized.proposals[0].quantity,quantity(150));
  assert.equal(result.normalized.projectedComplete,true);assert.equal(result.normalized.storedComplete,false);
  assert.deepEqual(state,before);assert.equal(result.evidence.storageCommitPerformed,false);
});
test('draft replaces saved amount: A50 -> A60 gives derived B140, no duplicate subtraction',()=>{
  const state=allocationState();state.allocations.push(entry('b',150,'derived'));
  const session=editAllocation(state,start(state),{type:'set',locationId:'a',quantity:quantity(60)}).session;
  const result=evaluate(state,session);
  assert.deepEqual(result.normalized.fixedSum,rat(60));assert.deepEqual(result.normalized.proposals[0].quantity,quantity(140));
  assert.deepEqual(result.normalized.sites.find(s=>s.locationId==='a').currentMaximum,rat(200));
  assert.deepEqual(result.normalized.sites.find(s=>s.locationId==='a').additionalCapacity,rat(140));
  assert.deepEqual(result.normalized.sites.find(s=>s.locationId==='b').currentMaximum,rat(140));
  assert.deepEqual(result.normalized.sites.find(s=>s.locationId==='b').additionalCapacity,rat(0));
});
test('refreshDerived materializes suggestion into draft only, and user typing same value turns manual',()=>{
  const state=allocationState();let session=editAllocation(state,start(state),{type:'refreshDerived'}).session;
  assert.equal(session.entries.find(e=>e.locationId==='b').quantity.raw,'150');assert.equal(session.entries.find(e=>e.locationId==='b').source,'derived');assert.equal(state.allocations.length,1);
  session=editAllocation(state,session,{type:'set',locationId:'b',quantity:quantity(150)}).session;
  session=editAllocation(state,session,{type:'set',locationId:'a',quantity:quantity(60)}).session;
  assert.deepEqual(evaluate(state,session).normalized.excess,rat(10));
});
test('manual B150 stays150 after A60, reports excess10 without auto rewriting',()=>{
  const state=allocationState();state.allocations.push(entry('b',150));
  const session=editAllocation(state,start(state),{type:'set',locationId:'a',quantity:quantity(60)}).session;
  const result=evaluate(state,session);
  assert.equal(result.status,'INVALID');assert.deepEqual(result.normalized.excess,rat(10));assert.deepEqual(result.normalized.proposals,[]);
  assert.equal(session.entries.find(e=>e.locationId==='b').quantity.raw,'150');
  assert.deepEqual(result.normalized.sites.find(s=>s.locationId==='a').currentMaximum,rat(50));
  assert.deepEqual(result.normalized.sites.find(s=>s.locationId==='a').additionalCapacity,rat(-10));
});
test('saved derived B150 outside current edit scope remains fixed',()=>{
  const state=allocationState();state.allocations.push(entry('b',150,'derived'));
  const session=editAllocation(state,start(state,{scope:['a']}),{type:'set',locationId:'a',quantity:quantity(60)}).session;
  const result=evaluate(state,session);assert.equal(result.status,'INVALID');assert.deepEqual(result.normalized.excess,rat(10));assert.deepEqual(result.normalized.proposals,[]);
});
test('three sites show total residual150 and per-site max150, no75/75 split',()=>{
  const state=allocationState();state.lines[0].locationIds.push('c');
  const result=evaluate(state,start(state,{scope:['a','b','c']}));
  assert.deepEqual(result.normalized.residualBeforeSuggestions,rat(150));assert.deepEqual(result.normalized.proposals,[]);
  assert.deepEqual(result.normalized.sites.filter(s=>s.locationId!=='a').map(s=>s.currentMaximum),[rat(150),rat(150)]);
  assert.equal(result.normalized.canConfirm,false);
});
test('explicit other-site minimum is reserved; current amount never subtracted twice',()=>{
  const state=allocationState();state.lines[0].locationIds.push('c');state.locations.find(l=>l.locationId==='c').minimum=quantity(20);
  const result=evaluate(state,start(state,{scope:['a','b','c']}));
  const a=result.normalized.sites.find(s=>s.locationId==='a'),b=result.normalized.sites.find(s=>s.locationId==='b');
  assert.deepEqual(a.currentMaximum,rat(180));assert.deepEqual(a.additionalCapacity,rat(130));assert.deepEqual(b.currentMaximum,rat(130));
});
test('zero, corruption and editing input never become a numeric zero or invented residual',()=>{
  for(const raw of ['0','not-a-number','-1']){
    const state=allocationState();state.allocations[0].quantity.raw=raw;
    const result=evaluate(state,start(state));assert.equal(result.status,'INVALID');assert.equal(result.normalized.fixedSum,null);assert.equal(result.normalized.residualBeforeSuggestions,null);assert.equal(result.normalized.sites[1].currentMaximum,null);
  }
  const state=allocationState();state.allocations[0].quantity={raw:'5.',unit:'each',phase:'editing'};
  const result=evaluate(state,start(state));assert.equal(result.status,'INCOMPLETE');assert.equal(result.normalized.residualBeforeSuggestions,null);
  const composing=allocationState();composing.allocations[0].quantity={raw:'',unit:'each',phase:'editing',composing:true};
  assert.equal(evaluate(composing,start(composing)).status,'INCOMPLETE');assert.deepEqual(evaluate(composing,start(composing)).normalized.proposals,[]);
});
test('zero residual with required blank produces no zero proposal',()=>{
  const state=allocationState();state.allocations[0].quantity.raw='200';
  const result=evaluate(state,start(state));assert.deepEqual(result.normalized.residualBeforeSuggestions,rat(0));assert.deepEqual(result.normalized.proposals,[]);assert.equal(result.normalized.canConfirm,false);
});
test('Q2 total 240/100 recalculates derived draft only and preserves manual entries',()=>{
  const state=allocationState();state.allocations.push(entry('b',150,'derived'));const session=start(state);
  for(const [total,expected] of [[240,190],[100,50]]){const current=structuredClone(state);current.lines[0].total.raw=String(total);assert.deepEqual(evaluate(current,session).normalized.proposals[0].quantity,quantity(expected));}
  const manual=structuredClone(state);manual.allocations[1].source='manual';manual.lines[0].total.raw='100';
  assert.deepEqual(evaluate(manual,start(manual)).normalized.excess,rat(100));
});
test('single linked site reuses Q2 total, while unlinked Q3 sites have no effect',()=>{
  const state=allocationState();state.lines[0].locationIds=['b'];state.allocations=[];
  const session=start(state,{scope:['b']});const result=evaluate(state,session);
  assert.equal(result.normalized.sites.length,1);assert.equal(result.normalized.proposals[0].reason,'SINGLE_SITE_TOTAL_REUSE');assert.deepEqual(result.normalized.proposals[0].quantity,quantity(200));
});
test('two SKU quantities and duplicate display names remain independent through stable IDs',()=>{
  const state=allocationState();state.lines.push({...structuredClone(state.lines[0]),lineId:'line-other',total:quantity(999)});state.allocations.push(entry('a',999,'manual','line-other'));
  const result=evaluate(state,start(state));assert.deepEqual(result.normalized.fixedSum,rat(50));assert.deepEqual(result.normalized.proposals[0].quantity,quantity(150));
  const confirmed=confirmAllocation(state,start(state),{expectedDraftRevision:0,acceptProposals:true});assert.equal(confirmed.state.allocations.find(a=>a.lineId==='line-other').quantity.raw,'999');
});
test('30-count pack does not reject50 each or reinterpret200 each as200 trays',()=>{
  const state=allocationState();const result=evaluate(state,start(state));assert.deepEqual(result.normalized.totalBase,rat(200));
  let session=start(state);session=editAllocation(state,session,{type:'convertUnit',locationId:'a',unit:'tray',reviewed:true}).session;
  assert.equal(session.entries[0].quantity.raw,'5/3');assert.equal(session.entries[0].quantity.unit,'tray');
  const converted=evaluate(state,session);assert.deepEqual(converted.normalized.fixedSum,rat(50));assert.deepEqual(converted.normalized.proposals[0].quantity,quantity(150));
  assert.equal(editAllocation(state,session,{type:'set',locationId:'a',quantity:quantity(50)}).status,'INVALID');
});
test('clone is draft-only, rechecks sum and does not grow Q2 total',()=>{
  const state=allocationState();state.allocations[0].quantity.raw='150';
  const cloned=editAllocation(state,start(state),{type:'clone',from:'a',targets:['b']});
  assert.deepEqual(cloned.evaluation.normalized.excess,rat(100));assert.equal(state.lines[0].total.raw,'200');assert.equal(state.allocations.length,1);
  assert.equal(confirmAllocation(state,cloned.session,{expectedDraftRevision:cloned.session.revision,acceptProposals:true}).writes,0);
});
test('confirm atomically persists only scope once; duplicate confirm is idempotent',()=>{
  const state=allocationState(),session=start(state);
  assert.equal(confirmAllocation(state,session,{expectedDraftRevision:0}).writes,0);
  const first=confirmAllocation(state,session,{expectedDraftRevision:0,acceptProposals:true});assert.equal(first.committed,true);assert.equal(first.writes,1);assert.equal(first.state.revision,2);assert.equal(first.state.allocations.find(e=>e.locationId==='b').quantity.raw,'150');
  const again=confirmAllocation(first.state,session,{expectedDraftRevision:0,acceptProposals:true});assert.equal(again.committed,false);assert.equal(again.writes,0);assert.equal(again.idempotent,true);assert.deepEqual(again.state,first.state);
  const restored=JSON.parse(JSON.stringify(first.state));assert.equal(evaluateAllocation({state:restored,lineId}).normalized.storedComplete,true);
  assert.deepEqual(confirmAllocation(restored,JSON.parse(JSON.stringify(session)),{expectedDraftRevision:0,acceptProposals:true}).state,restored);
});
test('cancel/Esc/back caller path restores exposure and keeps current saved state unchanged',()=>{
  const state=allocationState();let session=start(state,{exposure:{a:true,b:false}});
  session=editAllocation(state,session,{type:'set',locationId:'a',quantity:quantity(60)}).session;
  session=editAllocation(state,session,{type:'exposure',value:{a:false,b:true}}).session;
  const cancelled=cancelAllocation(state,session);assert.equal(cancelled.writes,0);assert.deepEqual(cancelled.state,state);assert.deepEqual(cancelled.exposure,{a:true,b:false});assert.equal(cancelled.session.closed,true);
  const tampered=structuredClone(session);tampered.exposureBefore={a:false,b:true};
  assert.deepEqual(cancelAllocation(state,tampered).reasonCodes,['DRAFT_CONTENT_STALE']);assert.equal(cancelAllocation(state,tampered).writes,0);
});
test('stale total, same-revision source changes, and old reviewed draft cannot commit',()=>{
  const state=allocationState(),session=start(state);
  const concurrent=structuredClone(state);concurrent.lines[0].total.raw='240';
  assert.deepEqual(confirmAllocation(concurrent,session,{expectedDraftRevision:0,acceptProposals:true}).reasonCodes,['ALLOCATION_SNAPSHOT_STALE']);
  concurrent.revision++;assert.equal(confirmAllocation(concurrent,session,{expectedDraftRevision:0,acceptProposals:true}).writes,0);
  const edited=editAllocation(state,session,{type:'set',locationId:'a',quantity:quantity(60)}).session;
  assert.deepEqual(confirmAllocation(state,edited,{expectedDraftRevision:0,acceptProposals:true}).reasonCodes,['DRAFT_REVISION_STALE']);
});
test('topology1→2→3, unlink/delete/reorder only change stable matching links',()=>{
  let state=allocationState();state.lines[0].locationIds=['a'];
  state=changeAllocationTopology(state,{type:'link',lineId,locationId:'b'}).state;
  state=changeAllocationTopology(state,{type:'link',lineId,locationId:'c'}).state;
  const reordered=changeAllocationTopology(state,{type:'reorder',lineId,locationIds:['c','b','a']}).state;
  const result=evaluate(reordered,start(reordered,{scope:['a','b','c']}));assert.deepEqual(result.normalized.fixedSum,rat(50));assert.deepEqual(result.normalized.residualBeforeSuggestions,rat(150));
  const deleted=changeAllocationTopology(reordered,{type:'deleteLocation',locationId:'c'}).state;assert.deepEqual(deleted.lines[0].locationIds,['b','a']);assert.equal(deleted.allocations[0].quantity.raw,'50');
  const unlinked=changeAllocationTopology(deleted,{type:'unlink',lineId,locationId:'a'}).state;assert.deepEqual(unlinked.lines[0].locationIds,['b']);assert.equal(unlinked.allocations.length,0);
});
test('topology rejects malformed source before deletion and cannot normalize negative revision',()=>{
  const cases=[
    [state=>{state.revision=-1;},{type:'unlink',lineId,locationId:'b'},'ALLOCATION_STATE_INVALID'],
    [state=>{state.receipts=[{transactionId:''}];},{type:'deleteLine',lineId},'ALLOCATION_RECEIPTS_INVALID'],
    [state=>{state.lines[0].specVersion='';},{type:'deleteLine',lineId},'LINE_LINKS_INVALID'],
    [state=>{state.allocations.push(entry('a',1,'manual','orphan'));},{type:'deleteLine',lineId},'ORPHAN_ALLOCATION'],
  ];
  for(const [mutate,operation,reason] of cases){const state=allocationState();mutate(state);const before=structuredClone(state);const result=changeAllocationTopology(state,operation);assert.equal(result.status,'INVALID');assert.deepEqual(result.reasonCodes,[reason]);assert.deepEqual(result.state,before);assert.equal(result.writes,0);}
  const deleted=changeAllocationTopology(allocationState(),{type:'deleteLine',lineId});
  assert.equal(deleted.status,'VALID');assert.deepEqual(deleted.state.lines,[]);assert.deepEqual(deleted.state.allocations,[]);
  const emptyBad=structuredClone(deleted.state);emptyBad.receipts=[{transactionId:''}];
  assert.deepEqual(changeAllocationTopology(emptyBad,{type:'deleteLocation',locationId:'a'}).reasonCodes,['ALLOCATION_RECEIPTS_INVALID']);
});
test('ONCE sum>=monthly requires exact review fingerprint but never monthly cap',()=>{
  const state=allocationState(),entries=[{locationId:'a',quantity:quantity(150)},{locationId:'b',quantity:quantity(100)}];
  const first=evaluateOnceAllocation({state,lineId,entries});assert.equal(first.status,'INCOMPLETE');assert.equal(first.normalized.monthlyHardCapApplied,false);assert.deepEqual(first.normalized.sum,rat(250));
  const confirmed=evaluateOnceAllocation({state,lineId,entries,confirmedFingerprint:first.normalized.fingerprint});assert.equal(confirmed.status,'VALID');
  entries[1].quantity.raw='110';assert.equal(evaluateOnceAllocation({state,lineId,entries,confirmedFingerprint:first.normalized.fingerprint}).status,'INCOMPLETE');
  state.allocations[0].mode='ONCE';assert.equal(evaluate(state,start(state)).status,'POLICY_UNRESOLVED');
});
