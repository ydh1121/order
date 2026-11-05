import test from 'node:test';
import assert from 'node:assert/strict';
import {dateBounds,evaluateDate,normalizeDateDraft,inspectDateParts,validateApprovedStart} from '../../web/order-date.mjs';
import {dateModeOptions,inspectOneTimeDate,oneTimeDateValue,oneTimeDateParts} from '../../web/q4-date.mjs';
import {dateFieldMarkup} from '../../web/date-field.mjs';
const now='2026-11-05T10:00:00+09:00';
const parts=value=>Object.fromEntries(['year','month','day'].map((key,i)=>[key,value.split('-')[i]]));
const once=dateModeOptions('ONCE').policyOptions;
const frozen=value=>Object.freeze({...value});

test('C55-15 mode options preserve legacy ONCE horizon and FIXED D1R6 range explicitly',()=>{
 assert.deepEqual(dateBounds(now),{minimum:'2026-11-05',maximum:'2026-12-31',minimumMonth:'2026-11',maximumMonth:'2026-12'});
 assert.deepEqual(dateBounds(now,once),{minimum:'2026-11-05',maximum:'2100-12-31',minimumMonth:'2026-11',maximumMonth:'2100-12'});
 assert.equal(inspectOneTimeDate(frozen(parts('2027-01-10')),now).valid,true);
 assert.equal(validateApprovedStart(frozen({version:'3.0.0',kind:'WEEKLY',preferredDate:'2027-01-10'}),now).valid,false);
 assert.equal(inspectOneTimeDate(parts('2101-01-01'),now).valid,false);
 assert.equal(dateModeOptions('ONCE').required,false);assert.equal(dateModeOptions('FIXED').required,true);
});

test('C55-13 FIXED and ONCE share exact advice for morning afternoon tomorrow near weekend and New Year',()=>{
 const scenarios=[
  ['2026-11-05','2026-11-05T11:59:59+09:00',['SAME_DAY_MORNING']],
  ['2026-11-05','2026-11-05T12:00:00+09:00',['SAME_DAY_AFTERNOON']],
  ['2026-11-06',now,['NEXT_DAY']],['2026-11-07',now,['NEAR_TERM','SATURDAY']],
  ['2026-11-08',now,['NEAR_TERM','SUNDAY']],
  ['2027-01-01','2026-12-31T10:00:00+09:00',['NEXT_DAY','NEW_YEAR']]
 ];
 for(const [date,clock,codes]of scenarios){
  const fixed=evaluateDate({date,now:clock}),single=inspectOneTimeDate(frozen(parts(date)),clock).evaluation;
  assert.equal(single.selectable,true);assert.deepEqual(single.codes,codes);assert.deepEqual(single.messages,fixed.messages);
 }
});

test('C55-13 weekend/public holiday advisory never infers supplier closure',()=>{
 for(const date of ['2026-11-07','2026-11-08','2026-12-25'])assert.equal(inspectOneTimeDate(parts(date),now).valid,true);
 const options={date:'2026-11-08',now,...once};assert.equal(evaluateDate(options).selectable,true);
 assert.equal(evaluateDate({...options,unavailable:['2026-11-08']}).code,'PROVIDER_UNAVAILABLE');
});

test('C55-14 same normalizer immediately corrects completed 3333/22/33 within each mode horizon',()=>{
 const raw=frozen({year:'3333',month:'22',day:'33'});
 assert.equal(normalizeDateDraft(raw,now).date,'2026-12-31');
 const single=normalizeDateDraft(raw,now,once);assert.equal(single.date,'2100-12-31');
 assert.equal(single.changed,true);assert.equal(inspectOneTimeDate(single.parts,now).valid,true);
 assert.deepEqual(raw,{year:'3333',month:'22',day:'33'});
});

test('C55-14 typing first digit is not aggressively clamped and explicit completion corrects it',()=>{
 for(const options of [{},once]){
  const first=normalizeDateDraft({year:'3',month:'11',day:'5'},now,{...options,editingPart:'year'});
  assert.equal(first.parts.year,'3');assert.equal(first.status,'incomplete');
  const full=normalizeDateDraft({...first.parts,year:'3333'},now,{...options,editingPart:'year'});
  assert.equal(full.parts.year,options===once?'2100':'2026');assert.equal(full.status,'valid');
  const completed=normalizeDateDraft(first.parts,now,{...options,final:true});assert.equal(completed.status,'valid');
 }
 assert.equal(normalizeDateDraft({year:'2026',month:'2',day:''},now,{editingPart:'month'}).parts.month,'2');
 assert.equal(normalizeDateDraft({year:'2026',month:'22',day:''},now,{editingPart:'month'}).parts.month,'12');
});

test('C55-14 date gate rejects incomplete/invalid values without silently applying edit normalization',()=>{
 for(const raw of [{year:'3',month:'11',day:'5'},{year:'3333',month:'22',day:'33'},{year:'2026',month:'2',day:'30'},{year:'2026',month:'11',day:'1e1'}]){
  const input=frozen(raw),before=JSON.stringify(input);assert.equal(inspectOneTimeDate(input,now).valid,false);assert.equal(JSON.stringify(input),before);
 }
});

test('C55-15 optional empty date is still accepted; clearing day keeps that contract',()=>{
 for(const raw of [undefined,{year:'',month:'',day:''},{year:'2026',month:'11',day:''}]){
  const result=inspectOneTimeDate(raw,now);assert.equal(result.valid,true);assert.equal(result.empty,true);assert.equal(result.value,'');
 }
 assert.equal(inspectDateParts({year:'2026',month:'11',day:''},now,{required:true}).valid,false);
});

test('C55-15 frozen stored values are pure through display, inspection and repeated reads',()=>{
 for(const value of ['2026-01-10','2027-01-10','2101-01-10']){
  const input=frozen(parts(value)),before=JSON.stringify(input),mode=dateModeOptions('ONCE');
  for(let n=0;n<3;n++){
   assert.equal(oneTimeDateValue(input),value);inspectOneTimeDate(input,now);
   const html=dateFieldMarkup({id:'once',parts:input,value:oneTimeDateValue(input),now:new Date(now),...mode});
   assert.match(html,/aria-required="false"/);assert.doesNotMatch(html,/class="ui-required"/);
   assert.match(html,/value="10"/);assert.match(html,/납품일 달력 열기/);assert.equal(JSON.stringify(input),before);
  }
 }
});

test('C55-15 old Jan 10 fixture beyond FIXED next month remains a legal ONCE value',()=>{
 const raw=frozen({year:2027,month:1,day:10});assert.equal(inspectOneTimeDate(raw,now).valid,true);
 const html=dateFieldMarkup({id:'once-legacy',value:oneTimeDateValue(raw),parts:raw,now:new Date(now),...dateModeOptions('ONCE')});
 assert.match(html,/value="2027"/);assert.match(html,/value="1"/);assert.match(html,/value="10"/);
 assert.deepEqual(raw,{year:2027,month:1,day:10});
});

test('C55-15 durable completion/final allocation gate uses identical ONCE verdict without mutating frozen storage',async()=>{
 const {inspectQ4Allocation}=await import('../../web/q4-validation.mjs');
 for(const deliveryDate of [parts('2027-01-10'),parts('2026-01-10'),parts('2101-01-10'),{year:'2026',month:'11',day:''},{year:'3333',month:'22',day:'33'}]){
  const allocation=Object.freeze({id:'date-fixture',lineId:'date-line',locationId:'date-site',mode:'ONCE',modeExplicit:true,qty:'40',advanced:Object.freeze({contactChannels:Object.freeze(['phone'])}),q4Review:Object.freeze({version:'0460',deliveryDate:frozen(deliveryDate)})});
  const before=JSON.stringify(allocation),expected=inspectOneTimeDate(allocation.q4Review.deliveryDate,now),issues=inspectQ4Allocation(allocation,{now});
  assert.equal(issues.some(issue=>issue.fieldKey==='desired-date'),!expected.valid);
  if(!expected.valid)assert.equal(issues.find(issue=>issue.fieldKey==='desired-date').message,expected.message);
  assert.equal(JSON.stringify(allocation),before);
 }
});


test('C55-13 shared selected/typed ONCE date adapts to strict integer storage and reloads without losing advice',async()=>{
 const {approvedFixture}=await import('../fixtures/qa-lab-0540.mjs');
 const {projectStoredPayload,createBrowserStorage}=await import('../../web/storage.mjs');
 const {webcrypto}=await import('node:crypto');
 const entries=new Map(),local={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};
 const storage=createBrowserStorage({localStorage:local,sessionStorage:local,locks:{request:async(name,options,callback)=>callback({name})},crypto:webcrypto,now:()=>1000});
 for(const [index,raw]of [{year:'2026',month:'11',day:'8'},{year:'2100',month:'12',day:'31'},{year:'2026',month:'11',day:''}].entries()){
  const input=frozen(raw),before=JSON.stringify(input),data=approvedFixture({mode:'ONCE'});
  data.allocations[0].q4Review.deliveryDate=oneTimeDateParts(input);
  const expected={year:Number(raw.year),month:Number(raw.month),day:raw.day===''?'':Number(raw.day)};
  assert.deepEqual(projectStoredPayload(data).allocations[0].q4Review.deliveryDate,expected);
  const loaded=await storage.load(),saved=await storage.commit(data,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'c55-date-integer-'+index});
  assert.equal(saved.ok,true,JSON.stringify(saved));const restored=await storage.load();assert.deepEqual(restored.data.allocations[0].q4Review.deliveryDate,expected);
  const inspected=inspectOneTimeDate(restored.data.allocations[0].q4Review.deliveryDate,now);assert.equal(inspected.valid,true);
  if(index===0)assert.ok(inspected.evaluation.codes.includes('SUNDAY'));assert.equal(JSON.stringify(input),before);
 }
});

test('C55-13 write adaptation does not interpret malformed date text as a valid stored integer',()=>{
 for(const raw of ['1e3','-1','3.3',' 33','9007199254740993'])assert.equal(oneTimeDateParts({year:'2026',month:'11',day:raw}).day,raw);
 assert.deepEqual(oneTimeDateParts(frozen({year:2027,month:1,day:10})),{year:2027,month:1,day:10});
});


test('C54/C55 leading zero preserves only a selectable padded completion in the current range',()=>{
 const november='2026-11-05T10:00:00+09:00',april='2027-04-01T10:00:00+09:00';
 for(const options of [{},once]){
  assert.equal(normalizeDateDraft({year:'2026',month:'0',day:'21'},november,{...options,editingPart:'month'}).parts.month,'11');
  assert.equal(normalizeDateDraft({year:'2026',month:'00',day:'21'},november,{...options,editingPart:'month'}).parts.month,'11');
  assert.equal(normalizeDateDraft({year:'2027',month:'0',day:''},april,{...options,editingPart:'month'}).parts.month,'0');
  assert.equal(normalizeDateDraft({year:'2027',month:'04',day:''},april,{...options,editingPart:'month'}).parts.month,'4');
  assert.equal(normalizeDateDraft({year:'2026',month:'12',day:'0'},november,{...options,editingPart:'day'}).parts.day,'0');
  assert.equal(normalizeDateDraft({year:'2026',month:'12',day:'04'},november,{...options,editingPart:'day'}).parts.day,'4');
  assert.equal(normalizeDateDraft({year:'3',month:'11',day:''},november,{...options,editingPart:'year'}).parts.year,'3');
  assert.equal(normalizeDateDraft({year:'2026',month:'2',day:''},november,{...options,editingPart:'month'}).parts.month,'2');
 }
});
