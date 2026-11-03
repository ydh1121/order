import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAllocation,beginAllocationEdit,editAllocation,confirmAllocation,cancelAllocation} from '../../src/engine/calculation/allocation.mjs';
import {demandFrequency,fixedQuantityPlan} from '../../src/engine/calculation/period.mjs';
import {calendarForecast} from '../../src/engine/calculation/calendar-forecast.mjs';
import {quantityDisplayNote,convertMonthlyUnit,baseQuantity,monthlyPlanSnapshot,currentPurchaseCost,moneyDisplay} from '../../web/quantity-contract.mjs';
const ratio=(n,d=1)=>({numerator:String(n),denominator:String(d)});
const q=(raw,unit='tray')=>({raw:String(raw),unit});
const plan=(locationId,raw,{source='manual',demand=null,demandOrigin=demand?'known':raw===''?'unknown':'package-plan',mode='FLEX'}={})=>({lineId:'eggs',locationId,quantity:q(raw),source,demand:demand===null?null:q(demand,'each'),demandOrigin,demandSource:['residual','single-total'].includes(demandOrigin)?'derived':'manual',mode});
const fixture=()=>({revision:0,lines:[{lineId:'eggs',specVersion:'30-count-1',total:q('5000','each'),monthlyPlanning:{version:'2.0.0',unit:'tray'},locationIds:['a','b'],unitTable:{version:'packages-1',baseUnit:'each',factors:{each:'1',tray:'30',pack:'30'}}}],locations:[{locationId:'a'},{locationId:'b'},{locationId:'c'}],allocations:[plan('a','50'),plan('b','')],receipts:[]});
const start=state=>beginAllocationEdit(state,{lineId:'eggs',transactionId:'quantity-0521'}).session;
const evaluate=(state,draft)=>evaluateAllocation({state,lineId:'eggs',draft});
const change=(state,draft,operation)=>{const changed=editAllocation(state,draft,operation);assert.equal(changed.status,'VALID');return changed.session;};
const line=(qty='5000',pack='30')=>({id:'eggs',housing:'4',size:'특란',pack,qty,qtyUnit:'each',price:'10000'});

test('R11/R12 Q2 opposite-unit note uses CEIL and DOWN once while exact demand/cost stay unchanged',()=>{
 const source=line();assert.equal(quantityDisplayNote(source),'포장 기준 167판 (166.6판)');
 const packages=convertMonthlyUnit(source,'tray');assert.equal(quantityDisplayNote(packages),'낱개 기준 총 5,000개');assert.equal(baseQuantity(packages).n,5000n);
 assert.equal(quantityDisplayNote(convertMonthlyUnit(packages,'each')),'포장 기준 167판 (166.6판)');
 assert.equal(quantityDisplayNote(line('6000')),'포장 기준 200판');assert.equal(quantityDisplayNote(line('1')),'포장 기준 1판');
 assert.equal(quantityDisplayNote(line('501','10')),'포장 기준 51팩 (50.1팩)');assert.equal(quantityDisplayNote(line('501','20')),'포장 기준 26팩 (25.0팩)');
 assert.equal(moneyDisplay(currentPurchaseCost(source)),'1,666,667');assert.equal(moneyDisplay(currentPurchaseCost({...source,qty:'167',qtyUnit:'tray'})),'1,670,000');
});
test('R13 5000 each, A50 packages proposes residual3500 and B117 without changing M or recording A observed demand',()=>{
 const state=fixture(),original=structuredClone(state),draft=start(state),result=evaluate(state,draft),n=result.normalized;
 assert.deepEqual(n.totalBase,ratio(5000));assert.deepEqual(n.fixedSum,ratio(1500));assert.deepEqual(n.rawResidualBase,ratio(3500));
 assert.deepEqual(n.proposals.map(p=>[p.locationId,p.quantity,p.demand,p.demandOrigin]),[['b',q(117),q(3500,'each'),'residual']]);
 assert.deepEqual(n.planSumPacks,ratio(167));assert.deepEqual(n.packSlackBase,ratio(10));assert.equal(n.sites[0].demandBase,null);assert.equal(n.allSiteDemandKnown,false);
 assert.equal(n.canConfirm,true);assert.equal(n.storedComplete,false);assert.deepEqual(state,original);
 const accepted=confirmAllocation(state,draft,{expectedDraftRevision:0,acceptProposals:true});assert.equal(accepted.writes,1);
 assert.equal(accepted.state.allocations.find(a=>a.locationId==='b').demand.raw,'3500');assert.equal(accepted.state.lines[0].total.raw,'5000');
 assert.equal(confirmAllocation(accepted.state,draft,{expectedDraftRevision:0,acceptProposals:true}).writes,0);
});
test('R13 200 packages keeps 50+150 and no hidden split when two rows are empty',()=>{
 const state=fixture();state.lines[0].total=q(200);let n=evaluate(state,start(state)).normalized;
 assert.deepEqual(n.proposals[0].quantity,q(150));assert.deepEqual(n.totalBase,ratio(6000));
 state.lines[0].locationIds.push('c');state.allocations.push(plan('c',''));n=evaluate(state,start(state)).normalized;
 assert.deepEqual(n.proposals,[]);assert.deepEqual(n.rawResidualBase,ratio(4500));assert.equal(n.canConfirm,false);
});
test('R13 derived residual recalculates from replacement draft and manual plan remains untouched',()=>{
 const state=fixture();let draft=change(state,start(state),{type:'refreshDerived'});
 assert.equal(draft.entries[1].quantity.raw,'117');assert.equal(draft.entries[1].demand.raw,'3500');
 draft=change(state,draft,{type:'set',locationId:'a',quantity:q(60)});
 let result=evaluate(state,draft);assert.deepEqual(result.normalized.fixedSum,ratio(1800));assert.deepEqual(result.normalized.proposals[0].quantity,q(107));assert.deepEqual(result.normalized.proposals[0].demand,q(3200,'each'));
 draft=change(state,draft,{type:'set',locationId:'b',quantity:q(117)});result=evaluate(state,draft);
 assert.equal(draft.entries[1].quantity.raw,'117');assert.equal(draft.entries[1].demand,null);assert.equal(draft.entries[1].demandOrigin,'package-plan');assert.deepEqual(result.normalized.excessBase,ratio(310));assert.equal(result.normalized.canConfirm,false);
});
test('R13 known2500+2500 requires84+84; manual85 never overwrites known2500 or hits global167 cap',()=>{
 const state=fixture();state.allocations=[plan('a',84,{source:'derived',demand:2500}),plan('b',84,{source:'derived',demand:2500})];
 let draft=start(state),n=evaluate(state,draft).normalized;assert.deepEqual(n.totalPlanPacks,ratio(167));assert.deepEqual(n.planSumPacks,ratio(168));assert.deepEqual(n.displayTotalPacks,ratio(168));assert.deepEqual(n.packSlackBase,ratio(40));assert.equal(n.canConfirm,true);assert.equal(n.monthlyHardCapApplied,false);
 draft=change(state,draft,{type:'set',locationId:'a',quantity:q(85)});n=evaluate(state,draft).normalized;
 assert.equal(draft.entries[0].demand.raw,'2500');assert.equal(draft.entries[0].source,'manual');assert.deepEqual(n.planSumPacks,ratio(169));assert.deepEqual(n.packSlackBase,ratio(70));assert.equal(n.canConfirm,true);
 draft=change(state,draft,{type:'set',locationId:'a',quantity:q(83)});assert.equal(evaluate(state,draft).normalized.canConfirm,false);assert.ok(evaluate(state,draft).reasonCodes.includes('SITE_PACKAGE_PLAN_SHORT'));
});
test('R13 multiple unknown manual package plans never acquire fabricated exact consumption',()=>{
 const state=fixture();state.lines[0].total=q(6000,'each');state.allocations=[plan('a',50),plan('b',150)];
 const n=evaluate(state,start(state)).normalized;assert.equal(n.canConfirm,true);assert.equal(n.allSiteDemandKnown,false);assert.deepEqual(n.knownDemandSum,ratio(0));assert.ok(n.sites.every(row=>row.demandBase===null));assert.deepEqual(n.proposals,[]);
});
test('R13 one recurring site keeps inferred M5000 when manually entering P167, with slack10 and no demand overage',()=>{
 const state=fixture();state.lines[0].locationIds=['a'];state.allocations=[plan('a','')];let draft=change(state,start(state),{type:'refreshDerived'});
 assert.equal(draft.entries[0].quantity.raw,'167');assert.equal(draft.entries[0].demand.raw,'5000');
 draft=change(state,draft,{type:'set',locationId:'a',quantity:q(167)});let n=evaluate(state,draft).normalized;
 assert.deepEqual(n.excessBase,ratio(0));assert.deepEqual(n.packSlackBase,ratio(10));assert.deepEqual(n.sites[0].demandBase,ratio(5000));assert.equal(n.canConfirm,true);
 draft=change(state,draft,{type:'refreshDerived'});assert.equal(draft.entries[0].source,'manual');assert.equal(draft.entries[0].demandSource,'derived');assert.equal(draft.entries[0].demand.raw,'5000');
 const committed=confirmAllocation(state,draft,{expectedDraftRevision:draft.revision,acceptProposals:true});assert.equal(committed.writes,1);assert.equal(committed.state.allocations[0].quantity.raw,'167');assert.equal(committed.state.allocations[0].source,'manual');assert.equal(committed.state.allocations[0].demand.raw,'5000');assert.equal(committed.state.lines[0].total.raw,'5000');
 const changed=structuredClone(state);changed.lines[0].total.raw='6000';assert.equal(evaluate(changed,draft).normalized.canConfirm,false,'manual167 remains below newly required200, never overwritten');
});
test('R13 a single known site demand is never replaced by total M, even if legacy totals disagree',()=>{
 const state=fixture();state.lines[0].locationIds=['a'];state.allocations=[plan('a',84,{source:'manual',demand:2500})];const result=evaluate(state,start(state));assert.deepEqual(result.normalized.sites[0].demandBase,ratio(2500));assert.equal(result.normalized.canConfirm,false);assert.deepEqual(result.normalized.rawResidualBase,ratio(2500));
});
test('R13 single-site inference never hides corrupt stored residual demand',()=>{
 const state=fixture();state.lines[0].locationIds=['a'];state.allocations=[plan('a',167,{source:'manual',demand:'10가20',demandOrigin:'residual'})];const original=structuredClone(state),result=evaluate(state,start(state));assert.equal(result.status,'INVALID');assert.equal(result.normalized.totalBase,null);assert.deepEqual(result.normalized.proposals,[]);assert.deepEqual(state,original);
});
test('R13 single-total provenance expires on added recurring site: P167 manual stays, D5000 is not falsely retained',()=>{
 const state=fixture();state.lines[0].locationIds=['a'];state.allocations=[plan('a',167)];const first=confirmAllocation(state,start(state),{expectedDraftRevision:0,acceptProposals:true});assert.equal(first.committed,true);assert.equal(first.state.allocations[0].demandOrigin,'single-total');
 const changed=structuredClone(first.state);changed.revision++;changed.lines[0].total.raw='6000';changed.lines[0].locationIds.push('b');changed.allocations.push(plan('b',''));const before=structuredClone(changed),draft=start(changed),n=evaluate(changed,draft).normalized;
 assert.equal(draft.entries[0].quantity.raw,'167');assert.equal(draft.entries[0].source,'manual');assert.equal(draft.entries[0].demand,null);assert.equal(draft.entries[0].demandOrigin,'package-plan');
 assert.deepEqual(n.fixedSum,ratio(5010));assert.deepEqual(n.rawResidualBase,ratio(990));assert.deepEqual(n.proposals[0].quantity,q(33));assert.deepEqual(n.proposals[0].demand,q(990,'each'));assert.equal(n.canConfirm,true);assert.deepEqual(changed,before);
});
test('R13 former single-total derived package proposal is invalidated on topology change and remains dormant in ONCE',()=>{
 const state=fixture();state.allocations=[plan('a',167,{source:'derived',demand:5000,demandOrigin:'single-total'}),plan('b',50)];let draft=start(state),n=evaluate(state,draft).normalized;
 assert.equal(draft.entries[0].quantity.raw,'');assert.equal(draft.entries[0].demand,null);assert.deepEqual(n.proposals[0].quantity,q(117));assert.deepEqual(n.proposals[0].demand,q(3500,'each'));assert.equal(state.allocations[0].quantity.raw,'167');
 state.allocations[0].mode='ONCE';draft=start(state);assert.equal(draft.entries[0].quantity.raw,'167');assert.equal(draft.entries[0].demand.raw,'5000');assert.deepEqual(evaluate(state,draft).normalized.excludedLocationIds,['a']);
 draft=change(state,draft,{type:'setMode',locationId:'a',mode:'FLEX'});assert.equal(draft.entries[0].quantity.raw,'');assert.equal(draft.entries[0].demand,null);
});
test('R14 ONCE excludes dormant values from every monthly result, and allONCE is applicable-to-none without mutating Q2',()=>{
 const state=fixture();state.allocations[0].mode='ONCE';let draft=start(state),n=evaluate(state,draft).normalized;
 assert.deepEqual(n.excludedLocationIds,['a']);assert.deepEqual(n.sites.map(x=>x.locationId),['b']);assert.deepEqual(n.fixedSum,ratio(0));assert.deepEqual(n.proposals[0].quantity,q(167));assert.deepEqual(n.proposals[0].demand,q(5000,'each'));
 draft=change(state,draft,{type:'setMode',locationId:'b',mode:'ONCE'});n=evaluate(state,draft).normalized;assert.equal(n.notApplicable,true);assert.equal(n.canConfirm,true);assert.deepEqual(n.totalBase,ratio(5000));assert.deepEqual(n.proposals,[]);assert.deepEqual(n.sites,[]);
 draft=change(state,draft,{type:'refreshDerived'});assert.equal(draft.entries[0].quantity.raw,'50');assert.equal(state.lines[0].total.raw,'5000');
 draft=change(state,draft,{type:'setMode',locationId:'a',mode:'FLEX'});assert.deepEqual(evaluate(state,draft).normalized.excludedLocationIds,['b']);assert.equal(draft.entries[0].quantity.raw,'50');
});
test('R13 package edit remains integer, invalid input stays nonnumeric, stale commits and cancel write zero',()=>{
 const state=fixture(),draft=start(state);for(const raw of ['1.5','10가20','0','1/3']){const edited=change(state,draft,{type:'set',locationId:'a',quantity:q(raw)}),n=evaluate(state,edited).normalized;assert.equal(n.totalBase,null);assert.equal(n.rawResidualBase,null);assert.equal(n.canConfirm,false);}
 assert.equal(editAllocation(state,draft,{type:'convertUnit',locationId:'a',unit:'each',reviewed:true}).status,'INVALID');
 const changed=structuredClone(state);changed.lines[0].total.raw='6000';assert.equal(confirmAllocation(changed,draft,{expectedDraftRevision:0,acceptProposals:true}).writes,0);
 assert.equal(cancelAllocation(state,draft).writes,0);assert.deepEqual(cancelAllocation(state,draft).state,state);
});
test('R13 package10/20 uses SKU factor and exact raw residual independently',()=>{
 for(const [size,wanted,slack]of [[10,450,0],[20,200,0]]){const state=fixture();state.lines[0].monthlyPlanning.unit='pack';state.lines[0].unitTable.factors.pack=String(size);state.allocations.forEach(a=>a.quantity.unit='pack');const n=evaluate(state,start(state)).normalized;assert.equal(n.proposals[0].quantity.raw,String(wanted));assert.deepEqual(n.packSlackBase,ratio(slack));assert.deepEqual(n.totalBase,ratio(5000));}
});
test('R15 depletion frequency keeps exact long-run average/range and rejects zero or incomplete quantities',()=>{
 const result=demandFrequency({monthlyPlan:'167',quantity:'25',range:{min:'20',max:'30'}});assert.equal(result.status,'VALID');assert.deepEqual(result.normalized.average,ratio(167,25));assert.deepEqual(result.normalized.low,ratio(167,30));assert.deepEqual(result.normalized.high,ratio(167,20));assert.equal(result.evidence.actualDeliverySchedule,false);
 for(const input of [{monthlyPlan:'',quantity:'25'},{monthlyPlan:'167',quantity:'0'},{monthlyPlan:'167',quantity:'25',range:{min:'30',max:'20'}},{monthlyPlan:'167',quantity:'25',range:{min:'20',max:'30',percent:5}}])assert.equal(demandFrequency(input).status,'INVALID');
});
test('R17 balanced integer deliveries require variable permission and an attainable explicit range',()=>{
 const input={monthlyPlan:'167',visits:8};assert.equal(fixedQuantityPlan(input).status,'POLICY_UNRESOLVED');
 assert.equal(fixedQuantityPlan({...input,variable:true}).status,'POLICY_UNRESOLVED');assert.equal(fixedQuantityPlan({...input,variable:true,range:{min:'21',max:'25'}}).status,'INVALID');
 const valid=fixedQuantityPlan({...input,variable:true,range:{min:'20',max:'21'}});assert.equal(valid.status,'VALID');assert.deepEqual(valid.normalized.distribution,[{quantity:'21',visits:7},{quantity:'20',visits:1}]);assert.deepEqual(valid.normalized.exactAverage,ratio(167,8));assert.equal(valid.normalized.feasible,true);
 const constant=fixedQuantityPlan({monthlyPlan:'168',visits:8});assert.equal(constant.status,'VALID');assert.equal(constant.normalized.constantQuantity,'21');assert.deepEqual(constant.normalized.distribution,[{quantity:'21',visits:8}]);
});
test('R16 actual November2026 Mon/Thu is nine dates, never an invented four-week count',()=>{
 const result=calendarForecast({year:2026,month:11,mode:'FIXED',quantity:'1',schedule:{kind:'WEEKLY',weekdays:[1,4]},calendarPolicy:{kind:'UNADJUSTED'}});
 assert.deepEqual(result.normalized.dates,['2026-11-02','2026-11-05','2026-11-09','2026-11-12','2026-11-16','2026-11-19','2026-11-23','2026-11-26','2026-11-30']);assert.equal(result.normalized.visits,9);assert.equal(result.evidence.deliveryApproval,false);
});
test('R13 legacy exact demand projection is read-only and returns package plan without fraction leakage',()=>{
 const source=line(),old={monthlyDemandQty:'2500',monthlyDemandUnit:'each',monthlyDemandSource:'manual'},before=structuredClone(old);
 assert.deepEqual(monthlyPlanSnapshot(source,old),{status:'VALID',qty:'84',unit:'tray',source:'derived',demandBase:ratio(2500)});assert.deepEqual(old,before);
 assert.equal(monthlyPlanSnapshot(source,{monthlyDemandQty:'250/3',monthlyDemandUnit:'tray',monthlyDemandSource:'manual',monthlyDemandExact:{representation:'rational',raw:'250/3',unit:'tray',conversionReviewed:true}}).qty,'84');
});
