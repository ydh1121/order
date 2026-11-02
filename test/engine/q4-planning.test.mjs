import test from 'node:test';import assert from 'node:assert/strict';
import {frequencyText,repeatVisitPlan,deliverySuggestion,distributionText,nominalQuantity,sumNominalQuantities} from '../../web/q4-planning.mjs';
const reference={year:2026,month:11,anchorDate:'',nominal:true};
const repeat={period:'매주',frequency:'2회',weeklyCheck:true,weekdays:{'1:월':true,'1:목':true}};
test('FLEX exact average uses the MSG0526 integer display without changing quantities',()=>{assert.equal(frequencyText({monthlyPlan:'167',quantity:'25'}),'월 약7회');assert.equal(frequencyText({monthlyPlan:'167',quantity:'25',variable:true,min:'20',max:'30'}),'월 약5~9회');for(const quantity of ['', '10가20','0','605/3'])assert.equal(frequencyText({monthlyPlan:'167',quantity}),'—');});
test('November 2026 Mon/Thu yields 9 actual calendar nominal dates, never 4 weeks',()=>{const r=repeatVisitPlan(repeat,reference);assert.equal(r.visits,9);assert.deepEqual(r.dates,['2026-11-02','2026-11-05','2026-11-09','2026-11-12','2026-11-16','2026-11-19','2026-11-23','2026-11-26','2026-11-30']);assert.equal(r.result.evidence.holidayAdjustmentsApplied,false);});
test('optional weekdays require explicit monthly count; cyclic plans require starting Monday',()=>{assert.equal(repeatVisitPlan({...repeat,weeklyCheck:false},reference).resolved,false);assert.equal(repeatVisitPlan({...repeat,weeklyCheck:false},reference,'8').visits,8);const cycle={...repeat,period:'2주',weekdays:{...repeat.weekdays,'2:월':true,'2:목':true}};assert.equal(repeatVisitPlan(cycle,reference).resolved,false);assert.equal(repeatVisitPlan(cycle,{...reference,anchorDate:'2026-10-26'}).visits,9);assert.equal(repeatVisitPlan(cycle,{...reference,anchorDate:'2026-10-27'}).resolved,false);});
test('167/8 is 21×7+20×1 only after variable permission and feasible range',()=>{const input={monthlyPlan:'167',repeat:{...repeat,weeklyCheck:false},reference,count:'8'};assert.equal(deliverySuggestion(input).feasible,false);assert.equal(deliverySuggestion({...input,variable:true,min:'21',max:'25'}).feasible,false);const plan=deliverySuggestion({...input,variable:true,min:'20',max:'21'});assert.equal(plan.feasible,true);assert.equal(distributionText(plan,'판'),'21판 7회 + 20판 1회');assert.equal(deliverySuggestion({...input,monthlyPlan:'168'}).constantQuantity,'21');});
test('per-site partial nominal totals retain exact quantities and reject invalid ranges',()=>{const a=nominalQuantity({quantity:'10',visits:9}),b=nominalQuantity({quantity:'20',visits:8,variable:true,min:'18',max:'22'});const total=sumNominalQuantities([a,b]);assert.equal(total.low.n,234n);assert.equal(total.high.n,266n);assert.equal(nominalQuantity({quantity:'10',visits:8,variable:true,min:'20',max:'30'}),null);});
test('restored accepted plan requires original M/links/cadence evidence and matching P/reference/visits/range',async()=>{
 const {planningInputSignature,deliveryPlanIsCurrent}=await import('../../web/q4-planning.mjs');
 const signature=planningInputSignature({M:'5000',P:'167',targets:['A'],repeat,reference,range:{min:'20',max:'21'}});
 const plan={version:'1.0.0',monthlyPlan:'167',visits:8,unit:'tray',distribution:[{quantity:'21',visits:7},{quantity:'20',visits:1}],range:{min:'20',max:'21'},reference,source:'derived',reviewed:true,inputSignature:signature};
 const input={signature,monthlyPlan:'167',unit:'tray',reference,visits:8,variable:true,range:{min:'20',max:'21'},quantity:'21'};
 assert.equal(deliveryPlanIsCurrent(plan,input),true);
 for(const patch of [{signature:planningInputSignature({M:'5001',P:'167',targets:['A'],repeat,reference,range:{min:'20',max:'21'}})},{signature:planningInputSignature({M:'5000',P:'167',targets:['A','B'],repeat,reference,range:{min:'20',max:'21'}})},{monthlyPlan:'168'},{visits:9},{reference:{...reference,month:12}},{range:{min:'19',max:'21'}},{quantity:'22'}])assert.equal(deliveryPlanIsCurrent(plan,{...input,...patch}),false);
 assert.equal(deliveryPlanIsCurrent({...plan,inputSignature:undefined},input),false);
 assert.equal(deliveryPlanIsCurrent({...plan,distribution:[{quantity:'20',visits:8}]},input),false);
 assert.equal(planningInputSignature({a:1,b:2}),planningInputSignature({b:2,a:1}));
});
test('per-site nominal values retain their own months without a hidden matching-month requirement',async()=>{
 const {sumNominalByReference}=await import('../../web/q4-planning.mjs');
 const a={reference:{year:2026,month:11},value:nominalQuantity({quantity:'10',visits:9})};
 const b={reference:{year:2026,month:12},value:nominalQuantity({quantity:'20',visits:8})};
 const mixed=sumNominalByReference([a,b]);
 assert.equal(mixed.sameReference,false);assert.equal(mixed.complete,true);assert.equal(mixed.total.low.n,250n);
 assert.deepEqual(mixed.groups.map(group=>[group.month,group.total.low.n]),[[11,90n],[12,160n]]);
 const sameMonth=sumNominalByReference([a,{...b,reference:a.reference}]);
 assert.equal(sameMonth.complete,true);assert.equal(sameMonth.total.low.n,250n);
 const partial=sumNominalByReference([a,{reference:a.reference,value:null}]);
 assert.equal(partial.sameReference,true);assert.equal(partial.complete,false);assert.equal(partial.total.low.n,90n);
 assert.equal(sumNominalByReference([a,{...b,reference:{year:2027,month:11}}]).total.low.n,250n);
 assert.equal(sumNominalByReference([a,{reference:{year:2026,month:''},value:b.value}]).total.low.n,250n);
});
test('restored mode is authoritative over stale common profile and dormant draft mode',async()=>{
 const {restoredDeliveryModes}=await import('../../web/q4-planning.mjs');
 for(const profile of ['ONCE','FLEX','FIXED','MIXED']){
  const allocations=[{id:'A1',mode:'ONCE',qty:'9',q4Review:{profile,draft:{mode:'FLEX',values:{base:'12',once:'9'}}}},{id:'B1',mode:'FLEX',qty:'',q4Review:{draft:{mode:'ONCE',values:{once:'4'}}}}];
  const before=structuredClone(allocations),restored=restoredDeliveryModes(allocations);
  assert.deepEqual(restored,{profile:'MIXED',modes:['ONCE','FLEX']});assert.deepEqual(allocations,before);
 }
 assert.deepEqual(restoredDeliveryModes([{mode:'ONCE',q4Review:{profile:'FLEX',draft:{mode:'FIXED'}}}]),{profile:'ONCE',modes:['ONCE']});
 assert.deepEqual(restoredDeliveryModes([{mode:'FLEX',q4Review:{profile:'FLEX'}},{mode:'FLEX'}]),{profile:'FLEX',modes:['FLEX','FLEX']});
 assert.equal(restoredDeliveryModes([{mode:'FLEX',q4Review:{profile:'MIXED'}},{mode:'FLEX'}]).profile,'MIXED');
});
test('adding a new recurring site beside saved ONCE preserves modes and recurring allocation scope at open',async()=>{
 const {restoredDeliveryModes}=await import('../../web/q4-planning.mjs');
 const {createMonthlyAllocationDraft}=await import('../../web/allocation-ui.mjs');
 for(const profile of ['ONCE','FLEX']){
  const context={revision:1,line:{id:'L',qty:'200',qtyUnit:'tray',pack:'30'},locations:[{id:'A'},{id:'B'}],allocations:[{id:'A1',lineId:'L',locationId:'A',mode:'ONCE',oneTimeDeliveryQty:'9',monthlyDemandQty:'',monthlyDemandBasis:'package-plan',monthlyPlanQty:'50',monthlyPlanUnit:'tray',monthlyPlanSource:'manual',q4Review:{profile,draft:{mode:'FIXED',values:{base:'12'}}}},{id:'B1',lineId:'L',locationId:'B',mode:'FLEX',modeExplicit:false,monthlyDemandQty:'',monthlyDemandBasis:'unknown',monthlyPlanQty:'',monthlyPlanUnit:'tray',monthlyPlanSource:'derived'}]};
  const before=structuredClone(context),ui=restoredDeliveryModes(context.allocations),draft=createMonthlyAllocationDraft(context),revision=draft.session.revision;
  for(let i=0;i<ui.modes.length;i++)if(draft.rows[i].mode!==ui.modes[i])draft.setMode(context.allocations[i].locationId,ui.modes[i]);
  assert.equal(draft.session.revision,revision,'Opening never runs a mode change');assert.deepEqual(draft.rows.map(row=>row.mode),['ONCE','FLEX']);
  assert.deepEqual(draft.evaluate().normalized.excludedLocationIds,['A']);assert.equal(draft.rows[1].quantity.raw,'200');
  draft.cancel();assert.deepEqual(context,before,'No persisted values or dormant delivery fields change');
 }
});
test('active contact/quality and recurring holiday/repeat/process override dormant fields without mutating them',async()=>{
 const {restoredDeliverySettings}=await import('../../web/q4-planning.mjs');
 const activeHoliday={days:[],none:true,irregular:false,conflict:'협의 후 조정',request:'active'},dormantHoliday={...activeHoliday,request:'dormant'};
 const activeRepeat={...repeat,frequency:'2회',weekOpen:1},dormantRepeat={...repeat,frequency:'1회',weekOpen:0};
 const projectors={holidayFromAllocation:a=>structuredClone(a.q4Review.activeHoliday),repeatFromAllocation:a=>structuredClone(a.q4Review.activeRepeat)};
 const base={mode:'FIXED',qualityTest:true,advanced:{contactChannels:['email'],fixedOrderProcess:'auto'},q4Review:{profile:'FIXED',activeHoliday,activeRepeat,draft:{mode:'ONCE',contact:{phone:true,email:false},quality:false,holiday:dormantHoliday,repeat:dormantRepeat,process:'contact'}}};
 const before=structuredClone(base),fixed=restoredDeliverySettings([base],projectors).sites[0];
 assert.equal(fixed.contact.email,true);assert.equal(fixed.contact.phone,false);assert.equal(fixed.quality,true);assert.equal(fixed.holiday.request,'active');assert.equal(fixed.repeat.frequency,'2회');assert.equal(fixed.process,'auto');
 const once=restoredDeliverySettings([{...base,mode:'ONCE'}],projectors).sites[0];assert.equal(once.contact.email,true);assert.equal(once.quality,true);assert.equal(once.holiday.request,'dormant');assert.equal(once.repeat.frequency,'1회');assert.equal(once.process,'contact');
 const flex=restoredDeliverySettings([{...base,mode:'FLEX'}],projectors).sites[0];assert.equal(flex.holiday.request,'active');assert.equal(flex.repeat.frequency,'1회');
 assert.deepEqual(base,before);
});
test('single ONCE email plus newly linked FLEX keeps email; mismatched common fields demote to individual',async()=>{
 const {restoredDeliverySettings}=await import('../../web/q4-planning.mjs');
 const holiday={days:[],none:true,irregular:false,conflict:'협의 후 조정'},activeRepeat={...repeat,weekOpen:1};
 const projectors={holidayFromAllocation:a=>structuredClone(a.q4Review?.activeHoliday||holiday),repeatFromAllocation:a=>structuredClone(a.q4Review?.activeRepeat||activeRepeat)};
 const a={mode:'ONCE',qualityTest:true,advanced:{contactChannels:['email']},q4Review:{profile:'ONCE',activeHoliday:holiday,activeRepeat,draft:{contact:{phone:true,email:false},quality:false},common:{contact:{phone:true,email:false},quality:false}}};
 const b={mode:'FLEX',qualityTest:false,advanced:{contactChannels:['phone']}};
 const mixed=restoredDeliverySettings([a,b],projectors);assert.equal(mixed.profile,'MIXED');assert.equal(mixed.sites[0].contact.email,true);assert.equal(mixed.sites[0].contact.phone,false);assert.equal(mixed.sites[0].quality,true);assert.equal(mixed.sites[1].contact.phone,true);
 const commonBase={mode:'FIXED',qualityTest:false,advanced:{contactChannels:['email'],fixedOrderProcess:'auto'},q4Review:{profile:'FIXED',activeHoliday:holiday,activeRepeat}};
 assert.equal(restoredDeliverySettings([commonBase,structuredClone(commonBase)],projectors).profile,'FIXED');
 assert.equal(restoredDeliverySettings([commonBase,{...commonBase,advanced:{contactChannels:['email'],fixedOrderProcess:'contact'}}],projectors).profile,'FIXED','Removed process control is inactive for shared-form grouping');
 for(const changed of [{advanced:{contactChannels:['phone'],fixedOrderProcess:'auto'}},{q4Review:{...commonBase.q4Review,activeHoliday:{...holiday,none:false,days:['월']}}},{q4Review:{...commonBase.q4Review,activeRepeat:{...activeRepeat,frequency:'1회'}}}])assert.equal(restoredDeliverySettings([commonBase,{...commonBase,...changed}],projectors).profile,'MIXED');
 const staleCommon={...commonBase,q4Review:{...commonBase.q4Review,common:{contact:{phone:true,sms:false,kakao:false,email:false}}}};assert.equal(restoredDeliverySettings([staleCommon,commonBase],projectors).profile,'MIXED');
 const sameWithUiState={...commonBase,q4Review:{...commonBase.q4Review,activeRepeat:{...activeRepeat,weekOpen:0}}};assert.equal(restoredDeliverySettings([commonBase,sameWithUiState],projectors).profile,'FIXED');
});
test('inactive common recurrence remains available without overriding active contact or holiday',async()=>{
 const {restoredDeliverySettings}=await import('../../web/q4-planning.mjs');
 const holiday={days:[],none:true},dormant={...repeat,frequency:'3회'},a={mode:'FLEX',qualityTest:true,advanced:{contactChannels:['email']},q4Review:{profile:'FLEX',activeHoliday:holiday,activeRepeat:repeat,draft:{repeat:{...repeat,frequency:'1회'}},common:{contact:{phone:true},repeat:dormant,process:'auto'}}};
 const restored=restoredDeliverySettings([a],{holidayFromAllocation:x=>x.q4Review.activeHoliday,repeatFromAllocation:x=>x.q4Review.activeRepeat});
 assert.equal(restored.common.contact.email,true);assert.equal(restored.common.contact.phone,false);assert.deepEqual(restored.common.holiday,holiday);assert.equal(restored.common.repeat.frequency,'3회');assert.equal(restored.common.process,'auto');
});
test('production serialization updates only active mode settings and preserves dormant saved owners',async()=>{
 const [{readFile},{parse},{default:vm}]=await Promise.all([import('node:fs/promises'),import('acorn'),import('node:vm')]);
 const source=await readFile(new URL('../../web/q4-review.mjs',import.meta.url),'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
 const find=node=>{if(!node||typeof node!=='object')return null;if(node.type==='FunctionDeclaration'&&node.id?.name==='serializedAllocations')return node;for(const value of Object.values(node)){for(const child of Array.isArray(value)?value:[value]){const hit=find(child);if(hit)return hit;}}return null;},node=find(ast);assert.ok(node);
 const oldHoliday={days:['월'],none:false,irregular:false,conflict:'협의 후 조정',request:'confirmed'},oldRepeat={period:'2주',frequency:'2회'},dormantRepeat={period:'매주',frequency:'3회'};
 const original={id:'A1',lineId:'L',locationId:'A',mode:'ONCE',qty:'9',advanced:{contactChannels:['email'],fixedOrderProcess:'auto',storeOffDays:['월'],memo:'confirmed'},q4Review:{activeHoliday:oldHoliday,activeRepeat:oldRepeat}};
 const state={count:1,mode:'ONCE',pack:'30',values:[{once:'9',base:'12'}],qtySources:['user'],variable:[true],siteQuality:[true],siteModes:['ONCE'],siteProcess:['contact'],siteContacts:[{email:true}],contact:{email:true},process:'contact',quality:true,siteHolidays:[{...oldHoliday,request:'dormant'}],siteRepeat:[dormantRepeat],holidayDays:['화'],holidayNone:false,holidayIrregular:false,holiday:{conflict:'협의 후 조정'},request:'dormant',period:'매주',frequency:'3회',datesByAllocation:{aa:{}},planningReferences:[reference],nominalVisitCounts:[''],deliveryPlans:[null],deliveryPlanFingerprints:['']};
 const context={state,regularContext:{line:{id:'L',pack:'30'},allocations:[original]},monthlyEditor:null,clone:value=>JSON.parse(JSON.stringify(value)),siteMode:()=>state.mode,isIndividual:()=>false,dateData:()=>({}),dateKey:()=>'aa',legacyPolicy:()=> 'ask',OrderRepeatContract:{snapshot:r=>({period:r.period,frequency:r.frequency}),serialize:()=>({ok:true,value:{}})}};
 const serialize=vm.runInNewContext(source.slice(node.start,node.end)+'\nserializedAllocations',context),before=structuredClone(original);
 const once=JSON.parse(JSON.stringify(serialize(true)))[0];assert.deepEqual(once.advanced.contactChannels,['email']);assert.equal(once.qualityTest,true);assert.deepEqual(once.advanced.storeOffDays,['월']);assert.equal(once.advanced.memo,'confirmed');assert.equal(once.advanced.fixedOrderProcess,'auto');assert.deepEqual(once.q4Review.activeHoliday,oldHoliday);assert.deepEqual(once.q4Review.activeRepeat,oldRepeat);assert.deepEqual(once.q4Review.draft.repeat,dormantRepeat);
 state.mode='FLEX';const flex=JSON.parse(JSON.stringify(serialize(true)))[0];assert.deepEqual(flex.advanced.storeOffDays,['화']);assert.equal(flex.advanced.memo,'dormant');assert.equal(flex.advanced.fixedOrderProcess,'auto');assert.deepEqual(flex.q4Review.activeRepeat,oldRepeat);assert.deepEqual(original,before);
});
