import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateAllocation,beginAllocationEdit,editAllocation,confirmAllocation,cancelAllocation} from '../../src/engine/calculation/allocation.mjs';
import {demandFrequency} from '../../src/engine/calculation/period.mjs';
import {calendarForecast} from '../../src/engine/calculation/calendar-forecast.mjs';
import {createCadence,inspectCadence,preferredYearPolicy,inspectPreferredDate,clampPreferredDate,syncMonthlyPreferredDate} from '../../web/cadence-contract.mjs';
const ratio=(n,d=1)=>({numerator:String(n),denominator:String(d)});
const quantity=(raw,unit='tray')=>({raw:String(raw),unit});
const plan=(locationId,raw,{source='manual',demand=null,origin=demand===null?'package-plan':'known',mode='FLEX'}={})=>({lineId:'eggs',locationId,quantity:quantity(raw),source,demand:demand===null?null:quantity(demand,'each'),demandOrigin:raw===''?'unknown':origin,demandSource:origin==='residual'?'derived':'manual',mode});
const fixture=allocations=>({revision:0,lines:[{lineId:'eggs',specVersion:'30-count-1',total:quantity('5000','each'),monthlyPlanning:{version:'2.0.0',unit:'tray'},locationIds:allocations.map(a=>a.locationId),unitTable:{version:'packages-1',baseUnit:'each',factors:{each:'1',tray:'30'}}}],locations:allocations.map(a=>({locationId:a.locationId})),allocations,receipts:[]});
const evaluate=(state,draft)=>evaluateAllocation({state,lineId:'eggs',draft});
const begin=state=>beginAllocationEdit(state,{lineId:'eggs',transactionId:'0526-pack-test'}).session;

test('C26 manual, residual-derived and explicitly retyped 67+50+50 have the same completed verdict without inventing D',()=>{
 const manual=fixture([plan('a','67'),plan('b','50'),plan('c','50')]);
 const original=structuredClone(manual),result=evaluate(manual),n=result.normalized;
 assert.equal(result.status,'VALID');assert.equal(n.canConfirm,true);assert.deepEqual(n.totalBase,ratio(5000));assert.deepEqual(n.planSumPacks,ratio(167));
 assert.deepEqual(n.packSlackBase,ratio(10));assert.deepEqual(n.excessBase,ratio(0));assert.deepEqual(n.rawResidualBase,ratio(-10));assert.deepEqual(n.projectedResidual,ratio(0));assert.deepEqual(n.planRoundingSlackBase,ratio(10));assert.ok(n.sites.every(r=>r.demandBase===null));assert.deepEqual(manual,original);
 const derived=fixture([plan('a','67',{source:'derived',demand:2000,origin:'residual'}),plan('b','50'),plan('c','50')]);
 const opened=begin(derived),changed=editAllocation(derived,opened,{type:'set',locationId:'a',quantity:quantity('67')});
 assert.equal(evaluate(derived,opened).normalized.canConfirm,true);assert.equal(evaluate(derived,changed.session).normalized.canConfirm,true);
 assert.equal(changed.session.entries[0].demand,null);assert.equal(changed.session.entries[0].source,'manual');
 const committed=confirmAllocation(derived,changed.session,{expectedDraftRevision:changed.session.revision,acceptProposals:true});
 assert.equal(committed.writes,1);assert.equal(committed.state.lines[0].total.raw,'5000');assert.equal(evaluate(committed.state).normalized.canConfirm,true);
 assert.equal(confirmAllocation(committed.state,changed.session,{expectedDraftRevision:changed.session.revision,acceptProposals:true}).writes,0);
 assert.equal(cancelAllocation(derived,changed.session).writes,0);
});
test('C26 package slack is not arbitrary overage permission, and never hides observed demand overage or missing sites',()=>{
 for(const [packs,wanted] of [[['66','50','50'],false],[['67','50','50'],true],[['68','50','50'],false]])assert.equal(evaluate(fixture(packs.map((v,i)=>plan(String(i),v)))).normalized.canConfirm,wanted);
 const known=fixture([plan('a','84',{demand:2501}),plan('b','84',{demand:2500})]);assert.equal(evaluate(known).normalized.canConfirm,false);assert.deepEqual(evaluate(known).normalized.excessBase,ratio(1));
 const missing=fixture([plan('a','167'),plan('b','')]);assert.equal(evaluate(missing).normalized.canConfirm,false);
 const knownWithResidual=fixture([plan('a','167',{demand:4999}),plan('b','1')]);assert.equal(evaluate(knownWithResidual).normalized.canConfirm,true);
});
test('C26 known2500+2500 retains84+84 and manual plan changes do not rewrite observed demand',()=>{
 const state=fixture([plan('a','84',{demand:2500}),plan('b','84',{demand:2500})]);
 assert.equal(evaluate(state).normalized.canConfirm,true);assert.deepEqual(evaluate(state).normalized.planSumPacks,ratio(168));
 const changed=editAllocation(state,begin(state),{type:'set',locationId:'a',quantity:quantity('85')});assert.equal(changed.session.entries[0].demand.raw,'2500');assert.equal(evaluate(state,changed.session).normalized.canConfirm,true);
 const once=fixture([plan('a','67'),plan('b','50'),plan('c','50'),plan('d','999',{mode:'ONCE'})]);assert.equal(evaluate(once).normalized.canConfirm,true);assert.deepEqual(evaluate(once).normalized.excludedLocationIds,['d']);
 const blanks=fixture([plan('a','50'),plan('b',''),plan('c','')]);assert.deepEqual(evaluate(blanks,begin(blanks)).normalized.proposals,[]);
});
test('C26 FLEX integer display is a separate projection of exact ratios',()=>{
 for(const [M,Q,min,max,low,high] of [['67','15','12','20','3','6'],['67','15','12','200','1','6'],['60','15','15','20','3','4'],['5','15','12','20','1','1'],['60','15',null,null,'4','4'],['67','15',null,null,'4','4'],['50','20',null,null,'3','3'],['60','15','15','15','4','4']]){
  const input={monthlyPlan:M,quantity:Q,...(min?{range:{min,max}}:{})},n=demandFrequency(input).normalized;
  assert.deepEqual([n.display.low,n.display.high],[low,high]);assert.deepEqual(n.monthlyPlan,ratio(M));
 }
 const exact=demandFrequency({monthlyPlan:'67',quantity:'15',range:{min:'12',max:'20'}});assert.deepEqual(exact.normalized.average,ratio(67,15));assert.deepEqual(exact.normalized.low,ratio(67,20));assert.deepEqual(exact.normalized.high,ratio(67,12));assert.equal(exact.evidence.actualDeliverySchedule,false);
 for(const input of [{monthlyPlan:'',quantity:'15'},{monthlyPlan:'67',quantity:'0'},{monthlyPlan:'67',quantity:'15',range:{min:'16',max:'20'}},{monthlyPlan:'67',quantity:'15',range:{min:'12',max:'14'}},{monthlyPlan:'67',quantity:'10가20'}])assert.equal(demandFrequency(input).status,'INVALID');
 const huge=demandFrequency({monthlyPlan:'900719925474099300001',quantity:'2'});assert.equal(huge.normalized.display.low,'450359962737049650001');
});
test('C26 Seoul year policy changes at local boundaries and saved anchors do not expire',()=>{
 for(const [now,years,locked] of [['2026-09-30T14:59:59Z',[2026],true],['2026-09-30T15:00:00Z',[2026,2027],false],['2026-12-31T14:59:59Z',[2026,2027],false],['2026-12-31T15:00:00Z',[2027],true]]){
  const p=preferredYearPolicy(now);assert.deepEqual(p.years,years);assert.equal(p.yearLocked,locked);
 }
 assert.equal(inspectPreferredDate('2027-01-01',{now:'2026-09-30T14:00:00Z'}).code,'YEAR_RANGE');
 assert.equal(inspectPreferredDate('2027-01-01',{now:'2026-10-01T00:00:00Z'}).valid,true);
 assert.equal(inspectPreferredDate('2025-01-31',{now:'2026-11-02',savedAnchor:'2025-01-31'}).valid,true);
 assert.equal(inspectPreferredDate('2025-01-31',{now:'2026-11-02',savedAnchor:'2025-01-31',edited:true}).valid,false);
 assert.equal(inspectPreferredDate('',{now:'2026-11-02'}).empty,true);
 assert.equal(inspectPreferredDate('3000-01-01',{now:'2026-11-02'}).valid,false);assert.equal(inspectPreferredDate('2026-20-01',{now:'2026-11-02'}).valid,false);
});
test('C26 complete month-end clamps and partial input remains incomplete',()=>{
 for(const [year,month,wanted] of [[2026,2,'2026-02-28'],[2028,2,'2028-02-29'],[2026,4,'2026-04-30'],[2026,1,'2026-01-31']])assert.equal(clampPreferredDate({year,month,day:31}).value,wanted);
 assert.equal(clampPreferredDate({year:'202',month:'2',day:''}).valid,false);assert.equal(clampPreferredDate({year:2026,month:20,day:31}).valid,false);
 assert.equal(inspectPreferredDate({year:2028,month:2,day:31},{now:'2028-01-01',clamp:true}).value,'2028-02-29');
 assert.equal(inspectPreferredDate('2028-02-31',{now:'2028-01-01'}).valid,false);
});
test('C26 monthly rule and explicit optional date form one transaction and preserve31/last intent',()=>{
 let c={version:'2.0.0',kind:'MONTHLY',dayRule:31,preferredDate:''};
 c=syncMonthlyPreferredDate(c,{kind:'rule',dayRule:'last'}).value;assert.equal(c.preferredDate,'');
 c=syncMonthlyPreferredDate(c,{kind:'date',value:'2026-11-30'}).value;assert.equal(c.dayRule,'last');assert.equal(inspectCadence(c).valid,true);
 c=syncMonthlyPreferredDate(c,{kind:'date',value:'2026-11-29'}).value;assert.equal(c.dayRule,29);
 c=syncMonthlyPreferredDate(c,{kind:'rule',dayRule:31}).value;assert.equal(c.preferredDate,'2026-11-30');assert.equal(c.dayRule,31);
 c=syncMonthlyPreferredDate(c,{kind:'month',year:2028,month:2}).value;assert.equal(c.preferredDate,'2028-02-29');assert.equal(c.dayRule,31);
 c=syncMonthlyPreferredDate(c,{kind:'clear'}).value;assert.equal(c.preferredDate,'');assert.equal(c.dayRule,31);
 assert.equal(inspectCadence({...c,preferredDate:'2028-02-28'}).valid,false);assert.equal(createCadence('4주'),null);
 assert.deepEqual(createCadence('2주'),{version:'2.0.0',preferredDate:'',kind:'INTERVAL_DAYS',intervalDays:14});
 assert.equal(inspectCadence({...createCadence('2주'),intervalDays:7}).valid,false);assert.equal(inspectCadence(null).valid,false);
});
test('C26 direct February31 clamps the first date while preserving requested31, unlike an explicit calendar28 choice',()=>{
 const before={version:'2.0.0',kind:'MONTHLY',dayRule:15,preferredDate:''};
 const typed=syncMonthlyPreferredDate(before,{kind:'date',value:{year:'2027',month:'2',day:'31'}});
 assert.equal(typed.valid,true);assert.equal(typed.value.preferredDate,'2027-02-28');assert.equal(typed.value.dayRule,31);assert.equal(inspectCadence(typed.value).valid,true);
 const leap=syncMonthlyPreferredDate(before,{kind:'date',value:{year:2028,month:2,day:31}});assert.equal(leap.value.preferredDate,'2028-02-29');assert.equal(leap.value.dayRule,31);
 const clicked=syncMonthlyPreferredDate(typed.value,{kind:'date',value:'2027-02-28'});assert.equal(clicked.value.dayRule,28);
 const last=syncMonthlyPreferredDate({...before,dayRule:'last'},{kind:'date',value:{year:2027,month:2,day:28}});assert.equal(last.value.dayRule,'last');
 assert.deepEqual(before,{version:'2.0.0',kind:'MONTHLY',dayRule:15,preferredDate:''});
});
test('C26 14/21-day recurrences use actual Gregorian intervals, with optional-anchor unresolved distinct from legacy cycles',()=>{
 const input={year:2026,month:11,mode:'FIXED',quantity:'1',calendarPolicy:{kind:'UNADJUSTED'}};
 assert.deepEqual(calendarForecast({...input,schedule:{kind:'INTERVAL_DAYS',intervalDays:14,anchorDate:'2026-11-01'}}).normalized.dates,['2026-11-01','2026-11-15','2026-11-29']);
 assert.deepEqual(calendarForecast({...input,schedule:{kind:'INTERVAL_DAYS',intervalDays:21,anchorDate:'2026-11-01'}}).normalized.dates,['2026-11-01','2026-11-22']);
 assert.equal(calendarForecast({...input,schedule:{kind:'INTERVAL_DAYS',intervalDays:14,anchorDate:''}}).status,'POLICY_UNRESOLVED');
 assert.deepEqual(calendarForecast({...input,month:12,schedule:{kind:'INTERVAL_DAYS',intervalDays:14,anchorDate:'2026-11-01'}}).normalized.dates,['2026-12-13','2026-12-27']);
 assert.deepEqual(calendarForecast({...input,schedule:{kind:'CYCLE',weekPlans:[[1,4],[2,5]],anchorDate:'2026-11-02'}}).normalized.dates,['2026-11-02','2026-11-05','2026-11-10','2026-11-13','2026-11-16','2026-11-19','2026-11-24','2026-11-27','2026-11-30']);
 assert.equal(calendarForecast({...input,month:2,schedule:{kind:'MONTHLY',day:31}}).status,'POLICY_UNRESOLVED');
 assert.deepEqual(calendarForecast({...input,month:2,schedule:{kind:'MONTHLY',day:31,shortMonthPolicy:'CLAMP'}}).normalized.dates,['2026-02-28']);
 assert.deepEqual(calendarForecast({...input,schedule:{kind:'MONTHLY',day:1,shortMonthPolicy:'CLAMP',anchorDate:'2026-12-01'}}).normalized.dates,[]);
});
