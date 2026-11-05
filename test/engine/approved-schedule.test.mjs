import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyCadence,monthlyEstimate,weeklyEstimate,editQuantityCadence,selectCadence,availableCadences,quantityIssue,fixedFrequencyPresentation,weekdayState} from '../../web/approved-schedule.mjs';
const date='2026-11-05';
test('C55 raw weekly frequency domain supersedes former 12–22 monthly example band',()=>{
 for(const [M,Q,p] of [['120','10','매주'],['119','10','매주'],['220','10','매주'],['221','10','매주'],['30','20','2주'],['29','20','협의'],['50','20','2주'],['51','20','협의'],['40','40','매월'],['40','41','협의'],['600','40','매주'],['600','300','2주'],['600','227','협의'],['999999999999','1','협의']])assert.equal(classifyCadence(M,Q,date),p,`${M}/${Q}`);
});
test('monthly and weekly estimates round exact ratio without 4-week assumption',()=>{
 assert.equal(monthlyEstimate('600','40').text,'월 15회');assert.equal(monthlyEstimate('600','227').text,'월 약 3회');
 assert.equal(weeklyEstimate('600','40',date).text,'약 4회');assert.equal(weeklyEstimate('600','44',date).text,'약 3회');assert.equal(weeklyEstimate('120','7','2026-11-05').text,'4회');
});
test('M/Q edits classify immediately and monthly edits preserve per-order quantity',()=>{
 const repeat={period:'매월',cadence:{version:'3.0.0',kind:'MONTHLY',dayRule:31,preferredDate:'',nominalAnchor:''}};
 const down=editQuantityCadence({repeat,monthly:'600',quantity:'600',field:'monthly',value:'599',asOfLocalDate:date});assert.equal(down.quantity,'600');assert.equal(down.repeat.period,'협의');assert.equal(quantityIssue({monthly:down.monthly,quantity:down.quantity}).code,'QUANTITY_ABOVE_MONTHLY');
 const direct=editQuantityCadence({repeat,monthly:'600',quantity:'40',field:'base',value:'601',asOfLocalDate:date});assert.equal(direct.quantity,'600');assert.equal(direct.repeat.period,'매월');assert.equal(direct.adjusted,true);
});
test('explicit monthly projection remembers/restores Q and validates restored cadence',()=>{
 const before={period:'협의',frequency:'협의',weekdays:{}};
 const monthly=selectCadence({repeat:before,monthly:'1000',quantity:'100',period:'매월',asOfLocalDate:date});assert.equal(monthly.quantity,'1000');assert.deepEqual(monthly.repeat.monthlyMemory,{quantity:'100',period:'협의',frequency:'협의',preferredDate:''});
 assert.deepEqual(availableCadences('1000','1000',monthly.repeat,date),['협의','매주','매월']);assert.equal(selectCadence({repeat:monthly.repeat,monthly:'1000',quantity:'1000',period:'2주',asOfLocalDate:date}).accepted,false);
 const restored=selectCadence({repeat:monthly.repeat,monthly:'1000',quantity:'1000',period:'협의',asOfLocalDate:date});assert.equal(restored.quantity,'100');assert.equal(restored.repeat.monthlyMemory,undefined);
 const edited=editQuantityCadence({repeat:monthly.repeat,monthly:'1000',quantity:'1000',field:'base',value:'500',asOfLocalDate:date});assert.equal(edited.quantity,'500');assert.equal(edited.repeat.period,'2주');assert.equal(edited.repeat.monthlyMemory,undefined);
 assert.deepEqual(before,{period:'협의',frequency:'협의',weekdays:{}});
});
test('weekday cap retains chosen order and negotiated frequency has no invented cap',()=>{
 const repeat={frequency:'약 3회',weeklyCheck:true,weekdays:{'1:월':true,'1:수':true,'1:금':true,'1:화':true},weekdayOrder:['1:금','1:수','1:월','1:화']};assert.deepEqual(weekdayState(repeat).excess,['1:화']);assert.equal(weekdayState({...repeat,frequency:'협의'}).fixed,false);assert.equal(weekdayState({...repeat,frequency:'협의'}).over,false);
});
test('range errors and missing monthly estimates have independent expected text',()=>{
 assert.equal(quantityIssue({monthly:'600',quantity:'40',variable:true,min:'40',max:'999999999999'}).valid,true);
 assert.equal(quantityIssue({monthly:'600',quantity:'40',variable:true,min:'50',max:'45'}).code,'RANGE_REVERSED');
 assert.equal(quantityIssue({monthly:'600',quantity:'40',variable:true,min:'50',max:'60'}).code,'Q_BELOW_MIN');
 assert.equal(quantityIssue({monthly:'600',quantity:'40',variable:true,min:'20',max:'30'}).code,'Q_ABOVE_MAX');
 assert.equal(fixedFrequencyPresentation({monthly:'',quantity:''}).text,'수량 입력 필요');assert.equal(fixedFrequencyPresentation({monthly:'600',quantity:''}).text,'회당 수량 입력');assert.equal(fixedFrequencyPresentation({monthly:'',quantity:'40'}).text,'월 수량 입력');assert.equal(fixedFrequencyPresentation({monthly:'600',quantity:'0'}).text,'수량 확인 필요');assert.equal(fixedFrequencyPresentation({monthly:'600',quantity:'40',variable:true,min:'',max:'50'}).text,'최소·최대 확인');
});
test('monthly derived date does not replace the prior editable start date or negotiated weekly frequency',()=>{
 const original={period:'매주',frequency:'협의',cadence:{version:'3.0.0',kind:'WEEKLY',preferredDate:'2026-11-08',nominalAnchor:'2026-11-08'}};
 const monthly=selectCadence({repeat:original,monthly:'600',quantity:'40',period:'매월',asOfLocalDate:date});assert.equal(monthly.repeat.monthlyMemory.preferredDate,'2026-11-08');monthly.repeat.cadence={version:'3.0.0',kind:'MONTHLY',dayRule:31,preferredDate:'2026-11-30',nominalAnchor:'2026-11-30'};
 const back=selectCadence({repeat:monthly.repeat,monthly:'600',quantity:'600',period:'매주',asOfLocalDate:date});assert.equal(back.quantity,'40');assert.equal(back.repeat.frequency,'협의');assert.equal(back.repeat.cadence.preferredDate,'2026-11-08');
 const consult=selectCadence({repeat:original,monthly:'600',quantity:'40',period:'협의',asOfLocalDate:date});assert.equal(consult.repeat.cadence.preferredDate,'2026-11-08');
});
