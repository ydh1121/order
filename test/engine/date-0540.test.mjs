import test from 'node:test';
import assert from 'node:assert/strict';
import {createDatePolicy,dateBounds,todayKST,normalizeDateDraft,normalizeDateParts,evaluateDate,nearestMonthly,dayInfo,validDate,holidayVersion,validateApprovedStart} from '../../web/order-date.mjs';
import {dateFieldMarkup} from '../../web/date-field.mjs';
const now='2026-11-05T10:00:00+09:00';
const parts=(year,month,day)=>({year:String(year),month:String(month),day:String(day)});
const evaluate=(date,clock=now,extra={})=>evaluateDate({date,now:clock,...extra});

test('C54-16 D1R6 row has only three editable date segments and a single common calendar trigger',()=>{
 const html=dateFieldMarkup({id:'approved-date',now:new Date(now)});
 assert.equal((html.match(/data-order-date-part=/g)||[]).length,3);assert.equal((html.match(/data-order-calendar-open/g)||[]).length,1);
 assert.match(html,/value="2026"/);assert.match(html,/value="11"/);assert.match(html,/value="" placeholder="00"/);assert.doesNotMatch(html,/1회차|2회차|date-card/);
});
test('C54-16 MONTHLY uses the same single row disabled, and has no calendar trigger',()=>{
 const html=dateFieldMarkup({id:'monthly',value:'2026-11-30',readOnly:true,now:new Date(now)});
 assert.equal((html.match(/disabled readonly/g)||[]).length,3);assert.doesNotMatch(html,/data-order-calendar-open/);
 const empty=dateFieldMarkup({id:'monthly-empty',readOnly:true,now:new Date(now)});assert.match(empty,/납품일을 선택해주세요\./);
});
test('C54-18 bounds include today and all next-month dates without preparation-day exclusion',()=>{
 assert.deepEqual(dateBounds(now),{minimum:'2026-11-05',maximum:'2026-12-31',minimumMonth:'2026-11',maximumMonth:'2026-12'});
 assert.equal(dateBounds('2026-12-31T23:59:59+09:00').maximum,'2027-01-31');
 assert.equal(dateBounds('2027-01-31T23:59:59+09:00').maximum,'2027-02-28');
 assert.equal(dateBounds('2028-01-31T09:00:00+09:00').maximum,'2028-02-29');
});
test('C54-18 Seoul day boundary is independent of the browser timezone',()=>{
 assert.equal(todayKST('2026-11-04T14:59:59Z'),'2026-11-04');assert.equal(todayKST('2026-11-04T15:00:00Z'),'2026-11-05');
});
test('C54-17 impossible year/month/day drafts correct on input before blur',()=>{
 for(const p of [parts(3333,11,33),parts(2026,22,33),parts(2026,'00','00')]){
  const result=normalizeDateDraft(p,now);assert.equal(result.status,'valid');assert.ok(result.date>='2026-11-05'&&result.date<='2026-12-31');assert.notEqual(result.code,'UNCHANGED');
 }
 assert.equal(normalizeDateDraft(parts(2026,22,33),now).date,'2026-12-31');
});
test('C54-17 a selectable year/month/day prefix is not prematurely replaced',()=>{
 assert.equal(normalizeDateDraft(parts(2,11,''),now,{editingPart:'year'}).parts.year,'2');
 assert.equal(normalizeDateDraft(parts(2026,1,''),now,{editingPart:'month'}).parts.month,'1');
 const april='2027-04-01T10:00:00+09:00';
 assert.equal(normalizeDateDraft(parts(2027,'0',''),april,{editingPart:'month'}).parts.month,'0');
 assert.equal(normalizeDateDraft(parts(2027,'04',''),april,{editingPart:'month'}).parts.month,'4');
 assert.equal(normalizeDateDraft(parts(2027,4,'0'),april,{editingPart:'day'}).parts.day,'0');
 assert.equal(normalizeDateDraft(parts(2027,4,'04'),april,{editingPart:'day'}).date,'2027-04-04');
 assert.equal(normalizeDateDraft(parts(2027,4,'00'),april,{editingPart:'day'}).date,'2027-04-01');
});
test('C54-17 all days10 through31 remain directly editable where valid',()=>{
 for(let d=10;d<=31;d++)assert.equal(normalizeDateDraft(parts(2026,12,d),now,{editingPart:'day'}).date,`2026-12-${d}`);
 for(const m of [10,11,12])assert.equal(normalizeDateDraft(parts(2026,m,15),`2026-${String(m).padStart(2,'0')}-01T09:00:00+09:00`,{editingPart:'month'}).parts.month,String(m));
});
test('C54-17 completed out-of-range dates clamp, while day deletion remains incomplete',()=>{
 assert.equal(normalizeDateParts(parts(2026,11,1),now).date,'2026-11-05');assert.equal(normalizeDateParts(parts(2027,1,1),now).date,'2026-12-31');
 const empty=normalizeDateDraft(parts(2026,11,''),now,{final:true});assert.equal(empty.status,'incomplete');assert.equal(empty.date,null);
});
test('C54-17 month ends normalize including leap February',()=>{
 assert.equal(normalizeDateDraft(parts(2027,2,31),'2027-02-01T00:00:00+09:00').date,'2027-02-28');
 assert.equal(normalizeDateDraft(parts(2028,2,31),'2028-02-01T00:00:00+09:00').date,'2028-02-29');
 assert.equal(normalizeDateDraft(parts(2027,4,31),'2027-04-01T00:00:00+09:00').date,'2027-04-30');
});
test('C54-17 mixed/IME text is invalid, never stripped into a different date',()=>{
 for(const day of ['1가0','1e1','1/1','1.2','-1'])assert.equal(normalizeDateDraft(parts(2026,11,day),now).code,'NON_NUMERIC');
});
test('C54-19 same-day notice changes at Seoul noon without blocking the date',()=>{
 const morning=evaluate('2026-11-05','2026-11-05T11:59:59+09:00'),afternoon=evaluate('2026-11-05','2026-11-05T12:00:00+09:00');
 assert.equal(morning.selectable,true);assert.equal(afternoon.selectable,true);
 assert.deepEqual(morning.messages,['당일 납품은 납품사 확인이 필요합니다.']);assert.deepEqual(afternoon.messages,['당일 납품은 시간이 촉박해 어려울 수 있습니다.']);
});
test('C54-19 tomorrow and2–3 days are notices, not delivery commitments or exclusions',()=>{
 assert.deepEqual(evaluate('2026-11-06').codes,['NEXT_DAY']);assert.deepEqual(evaluate('2026-11-07').codes,['NEAR_TERM','SATURDAY']);assert.deepEqual(evaluate('2026-11-08').codes,['NEAR_TERM','SUNDAY']);
 assert.deepEqual(evaluate('2026-11-09').messages,[]);
});
test('C54-19 official Christmas/NewYear/LunarNewYear/Chuseok dates are selectable with their own notices',()=>{
 const cases=[['2026-12-25','2026-12-01T09:00:00+09:00','PUBLIC_HOLIDAY'],['2027-01-01','2026-12-01T09:00:00+09:00','NEW_YEAR'],['2027-02-07','2027-02-01T09:00:00+09:00','SEOLLAL'],['2027-09-15','2027-09-01T09:00:00+09:00','CHUSEOK']];
 for(const [date,clock,code] of cases){const r=evaluate(date,clock);assert.equal(r.selectable,true);assert.ok(r.codes.includes(code));}
 assert.equal(holidayVersion,'ORDER-KR-PUBLIC-20261103-v2');
});
test('C54-19 only explicitly supplied unavailable dates prevent provider-date selection',()=>{
 assert.equal(evaluate('2026-11-09').selectable,true);assert.equal(evaluate('2026-11-09',now,{unavailable:['2026-11-09']}).code,'PROVIDER_UNAVAILABLE');
 assert.equal(evaluate('2026-11-09',now,{unavailable:[{date:'2026-11-09',available:true}]}).selectable,true);
});
test('C54-19 snapshot coverage outside2026/27 stays an explicit limitation',()=>{
 const r=evaluate('2028-01-03','2028-01-01T09:00:00+09:00');assert.equal(r.selectable,true);assert.equal(r.covered,false);assert.ok(r.codes.includes('HOLIDAY_DATA_OUTSIDE_SNAPSHOT'));assert.ok(r.messages.includes('해당 연도 휴일 일정은 추가 확인이 필요합니다.'));
 const nearWeekend=evaluate('2028-01-02','2028-01-01T09:00:00+09:00');assert.ok(nearWeekend.messages.includes('해당 연도 휴일 일정은 추가 확인이 필요합니다.'));
});
test('C54-19 invalid/past/after-range retain specific diagnostics',()=>{
 assert.equal(evaluate('2026-02-30').code,'INVALID_DATE');assert.equal(evaluate('2026-11-04').code,'PAST');assert.equal(evaluate('2027-01-01').code,'AFTER_RANGE');assert.equal(validDate('2027-02-29'),false);
});
test('C54-20 monthly chooses nearest current or next-month rule occurrence and preserves rule intent',()=>{
 assert.equal(nearestMonthly('',now),null);assert.equal(nearestMonthly('last',now),'2026-11-30');assert.equal(nearestMonthly(31,now),'2026-11-30');assert.equal(nearestMonthly(4,now),'2026-12-04');assert.equal(nearestMonthly(5,now),'2026-11-05');
 assert.equal(nearestMonthly(31,'2027-02-01T09:00:00+09:00'),'2027-02-28');assert.equal(nearestMonthly(31,'2028-02-01T09:00:00+09:00'),'2028-02-29');assert.equal(nearestMonthly(1,'2026-12-31T09:00:00+09:00'),'2027-01-01');
});
test('C54-19 snapshot records are consumed, not fixture dates injected into production policy',()=>{
 assert.equal(dayInfo('2027-02-09').holiday.kind,'substitute');const isolated=createDatePolicy([],[]);assert.equal(isolated.dayInfo('2026-12-25').holiday,null);assert.equal(isolated.dayInfo('2026-12-25').covered,false);
});

test('C54-17 immediate-clamp invariant covers partial/impossible date drafts at month/year/leap boundaries',()=>{
 const clocks=[['2026-11-30T23:59:59+09:00','2026-11-30','2026-12-31'],['2026-12-31T10:00:00+09:00','2026-12-31','2027-01-31'],['2027-01-31T10:00:00+09:00','2027-01-31','2027-02-28'],['2028-02-28T10:00:00+09:00','2028-02-28','2028-03-31']];
 for(const [clock,min,max]of clocks)for(const year of ['','0','2','20','202','2026','2027','2028','3333'])for(const month of ['','0','00','1','2','11','12','22'])for(const day of ['','0','00','1','2','10','28','29','30','31','33']){
  const r=normalizeDateDraft({year,month,day},clock);if(r.status==='valid')assert.ok(r.date>=min&&r.date<=max);assert.ok(!Object.values(r.parts).some(x=>x==='undefined'||x==='NaN'));
 }
});


test('C54-22 v3 weekly and fortnight final gates reject restored dates outside the same picker range without changing stored input',()=>{
 for(const kind of ['WEEKLY','INTERVAL_DAYS'])for(const value of ['', '2026-11-04','2027-01-01','2026-02-30']){
  const cadence={version:'3.0.0',kind,preferredDate:value,nominalAnchor:value,...(kind==='INTERVAL_DAYS'?{intervalDays:14}:{})},before=structuredClone(cadence);
  assert.equal(validateApprovedStart(cadence,now).valid,false);assert.deepEqual(cadence,before);
 }
 for(const preferredDate of ['2026-11-05','2026-11-08','2026-12-25','2026-12-31'])assert.equal(validateApprovedStart({version:'3.0.0',kind:'WEEKLY',preferredDate,nominalAnchor:preferredDate},now).valid,true);
});
test('C54-22 monthly final gate validates the current derived occurrence and does not rewrite the saved anchor or31/last rule',()=>{
 for(const dayRule of [31,'last']){
  const cadence={version:'3.0.0',kind:'MONTHLY',dayRule,preferredDate:'2026-10-31',nominalAnchor:'2026-10-31'},before=structuredClone(cadence),r=validateApprovedStart(cadence,now);
  assert.equal(r.valid,true);assert.equal(r.value,'2026-11-30');assert.equal(r.derived,true);assert.deepEqual(cadence,before);
 }
 assert.equal(validateApprovedStart({version:'3.0.0',kind:'MONTHLY',dayRule:'',preferredDate:'2026-11-30'},now).code,'DAY_RULE_REQUIRED');
});
test('C54-22 consultation has no date requirement and legacy2.x remains under its own lifecycle contract',()=>{
 assert.equal(validateApprovedStart({version:'3.0.0',kind:'CONSULT',preferredDate:''},now).valid,true);
 const legacy={version:'2.1.0',kind:'INTERVAL_DAYS',intervalDays:21,preferredDate:'2026-01-01',nominalAnchor:'2026-01-01'},before=structuredClone(legacy);
 assert.equal(validateApprovedStart(legacy,now).code,'NOT_APPLICABLE');assert.deepEqual(legacy,before);
});
