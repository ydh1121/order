import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {createCadence,inspectCadence,syncMonthlyPreferredDate} from '../../web/cadence-contract.mjs';
import {validMonthlyQuantity} from '../../web/quantity-contract.mjs';
import {inspectMonthlyAllocations,inspectOnceAllocations} from '../../web/allocation-ui.mjs';
import {addressStatus} from '../../web/address-contract.mjs';

// Execute production declarations with domain-only DNS doubles. These tests
// cover the real repeat/root gate; they do not claim browser, DNS or OS results.
const sources={common:await readFile(new URL('../../web/common-ui.mjs',import.meta.url),'utf8'),app:await readFile(new URL('../../web/app.mjs',import.meta.url),'utf8')};
const trees=Object.fromEntries(Object.entries(sources).map(([key,value])=>[key,parse(value,{ecmaVersion:'latest',sourceType:'module'})]));
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const value of Object.values(node))for(const child of Array.isArray(value)?value:[value]){const result=find(child,predicate);if(result)return result;}return null;}
function extract(owner,predicate){const node=find(trees[owner],predicate);assert.ok(node,'Production declaration exists');return sources[owner].slice(node.start,node.end);}
const assignment=name=>extract('common',node=>node.type==='ExpressionStatement'&&node.expression.type==='AssignmentExpression'&&node.expression.left.type==='MemberExpression'&&node.expression.left.property.name===name);
const variable=(owner,name)=>extract(owner,node=>node.type==='VariableDeclaration'&&node.declarations.some(declaration=>declaration.id.name===name));
const fn=name=>extract('app',node=>node.type==='FunctionDeclaration'&&node.id.name===name);
const plain=value=>JSON.parse(JSON.stringify(value));
function repeatOwner(){const context=vm.createContext({window:{},createCadence,inspectCadence,structuredClone});vm.runInContext(assignment('OrderRepeatContract'),context);return context.window.OrderRepeatContract;}
function legacy(weeks=2){return {mode:'FIXED',modeExplicit:true,qty:'15',repeatSemantics:'per-week-v1',intervalWeeks:weeks,frequencyPerWeek:2,freq:2,cycleCount:weeks*2,monthDay:'',scheduleDetail:'days',days:['월','목'],weekPlans:Array.from({length:weeks},()=>({weekdays:['월','목']})),advanced:{fixedOrderProcess:'auto'}};}
function fixture(mode='FLEX'){
 return {lines:[{id:'L',housing:'1',size:'왕란',pack:'30',qty:'67',qtyUnit:'tray',price:'10000'}],locations:[{id:'A',name:'합성 사업장',road:'합성시 가상로 10',postal:'08843',providerId:'1'.repeat(25),addressProvider:'JUSO',detail:'',dropoff:'',contactPhone:'01023456789',email:'test@example.com',storePhone:''}],allocations:[{id:'AL',lineId:'L',locationId:'A',mode,modeExplicit:true,qty:'15',monthlyDemandQty:'67',monthlyDemandUnit:'tray',advanced:{contactChannels:['phone']},q4Review:{version:'0460',activeHoliday:{days:[],none:true,irregular:false,conflict:'',request:''}}}]};
}
function rootOwner(source){
 const context=vm.createContext({S:structuredClone(source),validMonthlyQuantity,inspectMonthlyAllocations,inspectOnceAllocations,addressStatus,structuredClone,JSON,createCadence,inspectCadence,window:{},
  OrderPhone:{parse:value=>({valid:/^0\d{9,10}$/.test(value||'')})},OrderEmail:{parse:value=>({valid:/^[^@]+@[^@]+\.[^@]+$/.test(value||'')})},
  OrderEmailDomain:{status:()=>({state:'VALID'}),isHard:()=>false,isSuccess:proof=>proof.state==='VALID'},
  q4ValidAmount:value=>/^\d+$/.test(String(value))&&Number(value)>0,valid:value=>Number(value)>0});
 vm.runInContext(`${assignment('OrderRepeatContract')};const OrderRepeatContract=window.OrderRepeatContract;
 ${assignment('OrderDatePolicy')};${assignment('OrderSiteContract')};const OrderSiteContract=window.OrderSiteContract;
 ${variable('common','CODE1_ORDER_VALIDATION')}
 ${['q4ReviewIssue','q4ReviewAllocationIssues','monthlyIssues','q4ReviewVerdict'].map(fn).join('\n')}
 const lineById=id=>S.lines.find(line=>line.id===id),locationById=id=>S.locations.find(site=>site.id===id),siteValid=site=>OrderSiteContract.valid(site);
 ${variable('app','allocationValid')}
 globalThis.subject={verdict:()=>q4ReviewVerdict(S),legacyVerdict:()=>CODE1_ORDER_VALIDATION.validateOrderDraft(S),allocationIssues:()=>q4ReviewAllocationIssues(S.allocations[0]),complete:()=>allocationValid(S.allocations[0]),source:()=>structuredClone(S)};`,context);
 return context.subject;
}
function fixedFixture(period='2주',preferredDate=''){
 const source=fixture('FIXED'),owner=repeatOwner(),repeat={period:'매주',frequency:'2회',date:'',weeklyCheck:false,weekdays:{}};
 owner.resetPeriod(repeat,period);if(preferredDate)repeat.cadence.preferredDate=preferredDate;
 Object.assign(source.allocations[0],plain(owner.serialize(repeat).value));
 source.allocations[0].q4Review.activeRepeat=plain(owner.snapshot(repeat));source.allocations[0].q4Review.activeHoliday.conflict='앞당김';return source;
}

test('C26 repeat owner preserves old per-week-v1 2/3/4-week meanings and manual quantities on read/snapshot/serialize',()=>{
 const owner=repeatOwner();
 for(const [weeks,total] of [[2,4],[3,6],[4,8]]){
  const original=legacy(weeks),before=structuredClone(original),repeat=owner.fromAllocation(original),verdict=owner.inspect(repeat);
  assert.equal(repeat.cadence,undefined);assert.equal(repeat.semantics,'per-week-v1');assert.equal(repeat.period,weeks+'주');assert.equal(repeat.frequency,'2회');assert.equal(verdict.total,total);assert.equal(verdict.valid,true);
  const snapshot=owner.snapshot(repeat),serialized=owner.serialize(snapshot);assert.equal(snapshot.cadence,undefined);assert.equal(serialized.ok,true);assert.equal(serialized.value.repeatSemantics,'per-week-v1');assert.equal(serialized.value.intervalWeeks,weeks);assert.equal(serialized.value.frequencyPerWeek,2);assert.equal(serialized.value.cycleCount,total);assert.deepEqual(plain(serialized.value.weekPlans),before.weekPlans);assert.deepEqual(original,before);
 }
});

test('C26 explicit same-period choice creates 14/21-day cadence while retaining old original data and actual quantity',()=>{
 const owner=repeatOwner();
 for(const [weeks,days] of [[2,14],[3,21]]){
  const allocation=legacy(weeks),before=structuredClone(allocation),repeat=owner.fromAllocation(allocation),original=plain(repeat.legacyOriginal);
  assert.equal(owner.resetPeriod(repeat,weeks+'주'),true);assert.equal(repeat.frequency,'1회');assert.equal(repeat.weeklyCheck,false);assert.deepEqual(plain(repeat.weekdays),{});assert.deepEqual(plain(repeat.cadence),{version:'2.0.0',preferredDate:'',kind:'INTERVAL_DAYS',intervalDays:days});assert.deepEqual(plain(repeat.legacyOriginal),original);
  assert.equal(owner.resetPeriod(repeat,weeks+'주'),false,'same new cadence is not a new semantic transition');
  const serialized=owner.serialize(repeat);assert.equal(serialized.ok,true);assert.equal(serialized.value.cycleCount,1);assert.equal(serialized.value.frequencyPerWeek,null);assert.deepEqual(plain(serialized.value.weekPlans),[]);assert.deepEqual(allocation,before,'pure UI draft does not mutate saved allocation/manual quantity');
 }
 const old=owner.fromAllocation(legacy(4)),before=plain(old);assert.equal(owner.resetPeriod(old,'4주'),false);assert.deepEqual(plain(old),before,'removed new option does not rewrite the historical 4-week schedule');
});

test('C26 cadence survives snapshot/allocation roundtrip without inventing a required anchor or reference month',()=>{
 const owner=repeatOwner(),repeat=owner.fromAllocation(legacy(2));owner.resetPeriod(repeat,'2주');
 const snapshot=owner.snapshot(repeat),packed=owner.serialize(snapshot);assert.equal(packed.ok,true);assert.equal(packed.value.cadence.preferredDate,'');
 const restored=owner.fromAllocation({...legacy(2),...plain(packed.value),q4Review:{activeRepeat:plain(snapshot)}});
 assert.equal(owner.inspect(restored).valid,true);assert.deepEqual(plain(restored.cadence),{version:'2.0.0',preferredDate:'',kind:'INTERVAL_DAYS',intervalDays:14});assert.equal(restored.frequency,'1회');assert.equal(restored.semantics,'cadence-v2');assert.equal(restored.legacyReviewRequired,false);
 snapshot.cadence.preferredDate='2026-11-03';assert.equal(repeat.cadence.preferredDate,'','snapshot is independent');
});

test('C26 weekly cadence retains 1/2/7 counts and explicitly chosen weekday validation',()=>{
 const owner=repeatOwner();
 for(const count of [1,2,7]){
  const repeat={period:'매주',frequency:count+'회',date:'',weeklyCheck:false,weekdays:{}};owner.resetPeriod(repeat,'매주');
  assert.equal(owner.inspect(repeat).valid,true);assert.equal(owner.serialize(repeat).value.frequencyPerWeek,count);assert.equal(owner.serialize(repeat).value.cycleCount,count);
  repeat.weeklyCheck=true;repeat.weekdays={};assert.equal(owner.inspect(repeat).issue.kind,'weekdays');
  for(const day of owner.days.slice(0,count))repeat.weekdays['1:'+day]=true;
  assert.equal(owner.inspect(repeat).valid,true);assert.equal(owner.serialize(repeat).value.weekPlans[0].weekdays.length,count);
 }
});

test('C26 monthly 31 and last remain separate through production serialization, optional date selection and clearing',()=>{
 const owner=repeatOwner();
 for(const [rule,label] of [[31,'31일'],['last','말일']]){
  const repeat={period:'매주',frequency:'2회',date:'',weeklyCheck:false,weekdays:{}};owner.resetPeriod(repeat,'매월');assert.equal(owner.inspect(repeat).valid,false);
  repeat.cadence=syncMonthlyPreferredDate(repeat.cadence,{kind:'rule',dayRule:rule}).value;repeat.date=label;assert.equal(repeat.cadence.preferredDate,'');assert.equal(owner.inspect(repeat).valid,true);
  repeat.cadence={...repeat.cadence,preferredDate:'2028-01-31'};repeat.cadence=syncMonthlyPreferredDate(repeat.cadence,{kind:'month',year:2028,month:2}).value;
  assert.equal(repeat.cadence.preferredDate,'2028-02-29');assert.equal(owner.serialize(repeat).value.monthDay,String(rule));
  repeat.cadence=syncMonthlyPreferredDate(repeat.cadence,{kind:'clear'}).value;assert.equal(owner.inspect(repeat).valid,true);assert.equal(owner.serialize(repeat).value.monthDay,String(rule));assert.equal(owner.serialize(repeat).value.cadence.preferredDate,'');
 }
});

test('C26 production FLEX gate ignores removed policies/process/reference but still requires closure choice and quantity',()=>{
 const source=fixture(),allocation=source.allocations[0];allocation.q4Review.activeHoliday={days:[],none:true,irregular:false,conflict:'',weekend:'',holiday:'',substituteHoliday:'',request:'문 앞'};allocation.planningReference={year:1900,month:20};allocation.advanced.fixedOrderProcess='auto';
 const before=structuredClone(source),subject=rootOwner(source);assert.equal(subject.verdict().valid,true,JSON.stringify(subject.verdict().fieldErrors));assert.equal(subject.complete(),true);assert.equal(subject.legacyVerdict().fieldErrors.some(issue=>/process|reference|holiday-conflict/.test(issue.field)),false);assert.deepEqual(subject.source(),before);
 source.allocations[0].q4Review.activeHoliday.none=false;assert.ok(rootOwner(source).allocationIssues().some(issue=>issue.fieldKey==='holiday-days'));
 source.allocations[0].q4Review.activeHoliday.none=true;source.allocations[0].qty='';assert.ok(rootOwner(source).allocationIssues().some(issue=>issue.fieldKey==='qty'));
});

test('C26 production FIXED gate retains holiday response while removed order-process/reference and unselected anchor do not block',()=>{
 for(const period of ['2주','3주']){
  const source=fixedFixture(period),allocation=source.allocations[0];allocation.planningReference={year:1900,month:20};delete allocation.advanced.fixedOrderProcess;
  const subject=rootOwner(source);assert.equal(subject.verdict().valid,true,JSON.stringify(subject.verdict().fieldErrors));assert.equal(subject.complete(),true);assert.equal(subject.legacyVerdict().fieldErrors.some(issue=>/process|reference/.test(issue.field)),false);
  allocation.q4Review.activeHoliday.conflict='';const blocked=rootOwner(source);assert.ok(blocked.verdict().fieldErrors.some(issue=>issue.fieldKey==='holiday-conflict'));assert.equal(blocked.complete(),false);
 }
});

test('C26 production root gate restores old 2/3/4-week patterns without new-anchor or process requirements',()=>{
 for(const weeks of [2,3,4]){
  const source=fixture('FIXED');Object.assign(source.allocations[0],legacy(weeks));source.allocations[0].advanced.contactChannels=['phone'];source.allocations[0].q4Review.activeHoliday.conflict='앞당김';
  const before=structuredClone(source),subject=rootOwner(source);assert.equal(subject.verdict().valid,true,JSON.stringify(subject.verdict().fieldErrors));assert.equal(subject.complete(),true);assert.deepEqual(subject.source(),before);assert.equal(subject.source().allocations[0].qty,'15');assert.equal(subject.source().allocations[0].advanced.fixedOrderProcess,'auto');
 }
});

test('C26 stored past repeat anchors remain valid; malformed cadence and ONCE date errors are not bypassed',()=>{
 const source=fixedFixture('2주','2020-01-01');assert.equal(rootOwner(source).verdict().valid,true);
 source.allocations[0].cadence.intervalDays=28;assert.equal(rootOwner(source).verdict().valid,false);assert.ok(rootOwner(source).allocationIssues().some(issue=>issue.fieldKey==='preferred-date'));
 const once=fixture('ONCE');once.allocations[0].q4Review.deliveryDate={year:3000,month:20,day:1};assert.ok(rootOwner(once).allocationIssues().some(issue=>issue.fieldKey==='desired-date'));
});
