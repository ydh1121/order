import test from 'node:test';
import assert from 'node:assert/strict';
import {demandFrequency,orderQuantityBounds,orderQuantityInput,orderMonthContext,inspectStoredOrderQuantity} from '../../src/engine/calculation/period.mjs';
import {frequencyPresentation,repeatVisitPlan} from '../../web/q4-planning.mjs';
import {createMonthlyAllocationDraft,inspectMonthlyAllocations} from '../../web/allocation-ui.mjs';
import {parseNumericText,formatNumericText} from '../../web/numeric-input.mjs';
import {quantityDisplayNote,convertMonthlyUnit,baseQuantity} from '../../web/quantity-contract.mjs';
const ratio=(n,d=1)=>({numerator:String(n),denominator:String(d)});
const date='2026-11-05';
const input=(monthlyPlan,quantity,extra={})=>({mode:'FLEX',monthlyPlan,quantity,asOfLocalDate:date,phase:'commit',...extra});
const frequency=(monthlyPlan,quantity,extra={})=>frequencyPresentation({monthlyPlan,quantity,asOfLocalDate:date,...extra});
function context({total='600',unit='tray',rows=[['200','manual','FLEX'],['','manual','FIXED']]}={}){
 const allocations=rows.map(([qty,source,mode='FLEX',demand],i)=>({id:'allocation-'+i,lineId:'sku',locationId:'site-'+i,mode,monthlyPlanQty:qty,monthlyPlanUnit:'tray',monthlyPlanSource:source,monthlyDemandQty:demand??'',monthlyDemandUnit:'each',monthlyDemandSource:source,monthlyDemandBasis:demand===undefined?(qty===''?'unknown':'package-plan'):'known',qty:'15',advanced:{memo:'TEST-KEEP'}}));
 return {revision:3,line:{id:'sku',qty:total,qtyUnit:unit,pack:'30'},locations:allocations.map(a=>({id:a.locationId,name:a.locationId})),allocations};
}
test('C28 N01 600/30-day month corrects completed Q1 to20 and displays exact daily',()=>{
 const r=orderQuantityInput(input('600','1'));assert.equal(r.quantity,'20');assert.equal(r.min,'20');assert.equal(r.max,'600');assert.equal(r.changed,true);
 const f=frequency('600',r.quantity);assert.equal(f.text,'매일 납품');assert.equal(f.basisText,'(26년 11월 기준)');assert.deepEqual(f.result.normalized.average,ratio(30));
});
test('C28 N02 610/30-day month requires21, then approximately29 rather than daily',()=>{
 const r=orderQuantityInput(input('610','1'));assert.equal(r.quantity,'21');assert.equal(frequency('610',r.quantity).text,'월 약29회');assert.deepEqual(frequency('610',r.quantity).result.normalized.average,ratio(610,21));
});
test('C28 N03 rounding30.5 to31 in a31-day month never becomes daily',()=>{
 const r=orderQuantityInput(input('610','20',{asOfLocalDate:'2026-10-05'}));assert.equal(r.quantity,'20');assert.equal(r.changed,false);
 const f=frequency('610','20',{asOfLocalDate:'2026-10-05'});assert.equal(f.text,'월 약31회');assert.equal(f.result.normalized.representative.kind,'APPROX');assert.deepEqual(f.result.normalized.average,ratio(61,2));
});
test('C28 N04 variable28..30 retains exact representative610/29 and displays approximately21',()=>{
 const f=frequency('610','29',{variable:true,min:'28',max:'30'});assert.equal(f.text,'월 약21회');assert.deepEqual(f.result.normalized.average,ratio(610,29));assert.deepEqual(f.result.normalized.low,ratio(61,3));assert.deepEqual(f.result.normalized.high,ratio(305,14));
});
test('C28 N05 exact600/30 without width is monthly20 with no approximation',()=>{
 assert.equal(frequency('600','30').text,'월 20회');assert.equal(frequency('600','30',{variable:true,min:'30',max:'30'}).text,'월 20회');
});
test('C28 N06 broad variable12..40 preserves exact15..50 but representative600/20 is approximately30',()=>{
 const f=frequency('600','20',{variable:true,min:'12',max:'40'});assert.equal(f.text,'월 약30회');assert.deepEqual(f.result.normalized.low,ratio(15));assert.deepEqual(f.result.normalized.high,ratio(50));assert.equal(f.result.normalized.representative.kind,'APPROX');
 const beyond=frequency('600','20',{variable:true,min:'12',max:'1200'});assert.equal(beyond.valid,true);assert.equal(beyond.text,'월 약30회');assert.deepEqual(beyond.result.normalized.low,ratio(1,2));
});
test('C28 N07 FLEX direct Q201 overM200 caps to200 without cadence side effect or range mutation',()=>{
 const source=input('200','201'),before=structuredClone(source),r=orderQuantityInput(source);assert.equal(r.quantity,'200');assert.equal(r.forceMonthly,false);assert.deepEqual(source,before);
 const invalidRange=frequency('200',r.quantity,{variable:true,min:'201',max:'400'});assert.equal(invalidRange.valid,false);
});
test('C28 N08 only direct FIXED Q201 overM200 requests one private monthly transition',()=>{
 const source=input('200','201',{mode:'FIXED'}),r=orderQuantityInput(source);assert.equal(r.quantity,'200');assert.equal(r.forceMonthly,true);assert.equal(r.changed,true);
 const restored=orderQuantityInput({...source,direct:false});assert.equal(restored.quantity,'201');assert.equal(restored.forceMonthly,false);assert.equal(restored.changed,false);assert.equal(restored.valid,false);
 assert.equal(orderQuantityInput(input('200','1',{mode:'FIXED'})).quantity,'1');assert.equal(orderQuantityInput(input('200','200',{mode:'FIXED'})).forceMonthly,false);
 // The pure helper emits an intent; q4-review owns atomic cadence/date patch,
 // cancellation, and actual persistence. No fake storage writes are claimed here.
});
test('C28 N09 FLEX200 and FIXED remaining400 share one600 budget and direct401 caps400',()=>{
 const c=context(),before=structuredClone(c),d=createMonthlyAllocationDraft(c);assert.deepEqual(d.rows.map(r=>r.quantity.raw),['200','400']);assert.equal(d.inputLimit('site-1').max,'400');
 const edited=d.set('site-1','401',{complete:true});assert.equal(edited.input.quantity,'400');assert.equal(edited.input.changed,true);assert.deepEqual(d.rows.map(r=>r.quantity.raw),['200','400']);assert.deepEqual(c,before);assert.equal(d.confirm().ok,true);
});
test('C28 N10 changing manualA200 to201 recalculates derivedB400 to399 without reserving it',()=>{
 const d=createMonthlyAllocationDraft(context());assert.equal(d.rows[1].source,'derived');assert.equal(d.inputLimit('site-0').max,'600');
 d.set('site-0','201',{complete:true});assert.deepEqual(d.rows.map(r=>[r.quantity.raw,r.source]),[['201','manual'],['399','derived']]);assert.equal(d.confirm().ok,true);
});
test('C28 N11 manualB400 stays400 and directA201 caps200 in the same snapshot',()=>{
 const c=context({rows:[['200','manual','FLEX'],['400','manual','FIXED']]}),d=createMonthlyAllocationDraft(c);assert.equal(d.inputLimit('site-0').max,'200');
 d.set('site-0','201',{complete:true});assert.deepEqual(d.rows.map(r=>[r.quantity.raw,r.source]),[['200','manual'],['400','manual']]);assert.equal(d.confirm().ok,true);assert.equal(c.allocations[0].monthlyPlanQty,'200');
});
test('C28 N12 knownD2500+2500 retains84+84 while raw5000 and generic600 budget stay distinct',()=>{
 const c=context({total:'5000',unit:'each',rows:[['84','manual','FLEX','2500'],['84','manual','FIXED','2500']]}),d=createMonthlyAllocationDraft(c);
 assert.deepEqual(d.rows.map(r=>r.quantity.raw),['84','84']);assert.equal(d.inputLimit('site-0').max,null);d.set('site-0','84',{complete:true});assert.equal(d.confirm().ok,true);assert.equal(d.evaluate().normalized.planSumPacks.numerator,'168');assert.equal(c.line.qty,'5000');
 d.set('site-0','85',{complete:true});assert.deepEqual(d.rows.map(r=>r.quantity.raw),['85','84']);assert.equal(d.confirm().ok,true);assert.deepEqual(d.rows.map(r=>r.demand.raw),['2500','2500']);assert.equal(c.line.qty,'5000','manual package planning never rewrites measured demand or Q2');
 const plain=createMonthlyAllocationDraft(context({rows:[['200','manual'],['400','manual']]}));plain.set('site-1','401',{complete:true});assert.equal(plain.rows[1].quantity.raw,'400');
});
test('C28 N13 intermediate2 then29 never snaps to20; completed1 snaps to20 once',()=>{
 assert.equal(orderQuantityInput(input('600','2',{phase:'input'})).quantity,'2');assert.equal(orderQuantityInput(input('600','29',{phase:'input'})).quantity,'29');
 assert.equal(orderQuantityInput(input('600','1',{phase:'complete'})).quantity,'20');assert.equal(orderQuantityInput(input('600','20',{phase:'complete'})).changed,false);
 assert.equal(orderQuantityInput(input('600','2',{phase:'complete',direct:false})).quantity,'2');
});
test('C28 N14 grouped1200 normalizes to digits and serializes/restores the same private package quantity',()=>{
 const parsed=parseNumericText('1,200',{grouped:true});assert.equal(parsed.value,'1200');assert.equal(formatNumericText(parsed.value,{grouped:true}),'1,200');
 const c=context({total:'1200',rows:[['','manual']]}),d=createMonthlyAllocationDraft(c);d.set('site-0',parsed.value,{complete:true});const confirmed=d.confirm();assert.equal(confirmed.ok,true);assert.equal(confirmed.allocations[0].monthlyPlanQty,'1200');
 const restored=createMonthlyAllocationDraft({...c,allocations:JSON.parse(JSON.stringify(confirmed.allocations))});assert.equal(restored.rows[0].quantity.raw,'1200');assert.equal(restored.rows[0].demand.raw,'36000');
});
test('C28 N15 total decrease does not rewrite existing manual rows and stale revision cannot update or confirm',()=>{
 let c=context({total:'500',rows:[['200','manual','FLEX'],['400','manual','FIXED']]}),d=createMonthlyAllocationDraft(c,{readCurrentContext:()=>c});d.refresh();assert.deepEqual(d.rows.map(r=>r.quantity.raw),['200','400']);assert.equal(d.confirm().ok,false);
 const old=d.inputLimit('site-0').revision;d.set('site-0','100',{complete:true,expectedRevision:old});const before=d.rows;const stale=d.set('site-1','300',{complete:true,expectedRevision:old});assert.equal(stale.input.applied,false);assert.deepEqual(d.rows,before);
 c={...c,revision:4};assert.equal(d.inputLimit('site-1').valid,false);assert.equal(d.confirm().ok,false);assert.equal(d.set('site-1','300',{complete:true}).input.applied,false);
});
test('C28 N16 missing monthly plan, composing and unfinished text retain draft without fake0 or NaN',()=>{
 for(const source of [input('','1'),input('200',''),input('200','1',{composing:true}),input('200','10가20'),input('200','1.')]){const r=orderQuantityInput(source);assert.equal(r.quantity,source.quantity);assert.equal(r.changed,false);assert.equal(r.forceMonthly,false);assert.equal(r.valid,false);assert.equal(JSON.stringify(r).includes('NaN'),false);}
 const d=createMonthlyAllocationDraft(context());d.set('site-1','4',{composing:true});assert.equal(d.inputLimit('site-0').valid,false);d.set('site-0','999',{complete:true});assert.equal(d.rows[0].quantity.raw,'999');assert.equal(d.rows[1].quantity.raw,'4');assert.equal(d.confirm().ok,false);
});
test('C28 monthly cap preserves67+50+50 provenance, excludes ONCE and never evenly splits blanks',()=>{
 const c=context({total:'5000',unit:'each',rows:[['67','manual'],['50','manual'],['50','manual'],['999','manual','ONCE']]}),d=createMonthlyAllocationDraft(c);for(const [i,q] of [['0','67'],['1','50'],['2','50']])d.set('site-'+i,q,{complete:true});assert.equal(d.confirm().ok,true);assert.deepEqual(d.evaluate().normalized.excludedLocationIds,['site-3']);assert.equal(c.line.qty,'5000');
 const blank=createMonthlyAllocationDraft(context({rows:[['200','manual'],['','manual'],['','manual']]}));assert.deepEqual(blank.rows.map(r=>r.quantity.raw),['200','','']);assert.deepEqual(blank.evaluate().normalized.proposals,[]);assert.equal(inspectMonthlyAllocations(c).normalized.canConfirm,true);
});
test('C28 injected actual calendar context is strict, leap-aware, exact and never a fixed30-day approximation',()=>{
 assert.equal(orderMonthContext('2028-02-29').daysInMonth,29);assert.equal(orderMonthContext('2027-02-29'),null);assert.equal(orderMonthContext('2026-11-31'),null);assert.equal(orderMonthContext('2026-13-01'),null);
 assert.equal(orderQuantityBounds({mode:'FLEX',monthlyPlan:'600',asOfLocalDate:'2027-02-01'}).normalized.min,'22');
 const old=orderQuantityInput(input('600','20',{asOfLocalDate:'2027-02-01',direct:false,phase:'commit'}));assert.equal(old.quantity,'22');assert.equal(old.forceMonthly,false);
 const huge=demandFrequency({monthlyPlan:'900719925474099300001',quantity:'2',asOfLocalDate:date});assert.equal(huge.normalized.representative.count,'450359962737049650001');
});
test('C28 Q2 package helper labels preservedraw6050 rather than displayedcapacity6060',()=>{
 const source={qty:'6050',qtyUnit:'each',pack:'30'},shown=convertMonthlyUnit(source,'tray');assert.equal(quantityDisplayNote(shown),'낱개 기준 총 6,050개');assert.equal(baseQuantity(shown).n,6050n);assert.equal(shown.qty,'6050');
});
test('C28 restored per-order gate uses stored month, blocks upper overflow, and never changes saved bytes',()=>{
 const old={mode:'FLEX',monthlyPlan:'600',quantity:'20',asOfLocalDate:'2026-11-05'},before=structuredClone(old);
 assert.equal(inspectStoredOrderQuantity(old).valid,true);assert.deepEqual(old,before);assert.equal(inspectStoredOrderQuantity({...old,asOfLocalDate:'2027-02-01'}).valid,false);
 const overflow=inspectStoredOrderQuantity({...old,mode:'FIXED',monthlyPlan:'200',quantity:'201'});assert.equal(overflow.valid,false);assert.equal(overflow.quantity,'201');assert.equal(overflow.changed,false);assert.equal(overflow.forceMonthly,false);
 const legacy=inspectStoredOrderQuantity({mode:'FLEX',monthlyPlan:'600',quantity:'1'});assert.equal(legacy.valid,true);assert.equal(legacy.lowerBasis,'UNSPECIFIED');assert.equal(legacy.month,null);assert.equal(inspectStoredOrderQuantity({mode:'FLEX',monthlyPlan:'600',quantity:'601'}).valid,false);
 assert.equal(inspectStoredOrderQuantity({...old,asOfLocalDate:'not-a-date'}).valid,false);
});
test('C28 cadence2.1 nominal forecasts keep the original anchor rather than a shifted actual date',()=>{
 const cadence={version:'2.1.0',kind:'INTERVAL_DAYS',intervalDays:14,nominalAnchor:'2026-11-01',preferredDate:'2026-11-02'};
 const before=structuredClone(cadence),forecast=repeatVisitPlan({cadence},{year:2026,month:11});assert.deepEqual(forecast.dates,['2026-11-01','2026-11-15','2026-11-29']);assert.deepEqual(cadence,before);
 const monthly={version:'2.1.0',kind:'MONTHLY',dayRule:31,nominalAnchor:'2026-10-31',preferredDate:'2026-11-02'};
 assert.deepEqual(repeatVisitPlan({cadence:monthly},{year:2026,month:10}).dates,['2026-10-31']);
});
