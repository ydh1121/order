import test from 'node:test';
import assert from 'node:assert/strict';
import {periodQuantity,monthlyDayIntent} from '../../src/engine/calculation/period.mjs';

test('TC0481-17 retains explicit 4 weeks versus 30 day expectation difference',()=>{
  const common={perDelivery:'30',weeklyVisits:'1'};
  const weeks=periodQuantity({...common,period:{kind:'FOUR_WEEKS'}});
  const days=periodQuantity({...common,period:{kind:'THIRTY_DAYS',method:'PRORATED_EXPECTATION'}});
  assert.equal(weeks.status,'VALID');assert.equal(days.status,'VALID');
  assert.deepEqual(weeks.normalized.expectedQuantity,{numerator:'120',denominator:'1'});
  assert.deepEqual(days.normalized.expectedQuantity,{numerator:'900',denominator:'7'});
  assert.deepEqual(days.normalized.expectedVisits,{numerator:'30',denominator:'7'});
  assert.equal(days.normalized.actualCalendarDates,null);
  assert.equal(periodQuantity(common).status,'POLICY_UNRESOLVED');
  assert.equal(periodQuantity({...common,period:{kind:'THIRTY_DAYS'}}).status,'POLICY_UNRESOLVED');
  assert.deepEqual(periodQuantity({perDelivery:'1',period:{kind:'CALENDAR_MONTH'}}).reasonCodes,['PERIOD_POLICY_UNSUPPORTED']);
  assert.deepEqual(periodQuantity({...common,period:{kind:'FOUR_WEEKS',days:30}}).reasonCodes,['PERIOD_POLICY_CONFLICT']);
});
test('explicit visits count and invalid/non-integer count boundaries',()=>{
  assert.deepEqual(periodQuantity({perDelivery:'2.5',period:{kind:'EXPLICIT_VISITS',visits:'3'}}).normalized.expectedQuantity,{numerator:'15',denominator:'2'});
  assert.equal(periodQuantity({perDelivery:'2',period:{kind:'EXPLICIT_VISITS',visits:'1.5'}}).status,'INVALID');
  assert.equal(periodQuantity({perDelivery:'2',weeklyVisits:'8',period:{kind:'FOUR_WEEKS'}}).status,'INVALID');
});
test('numeric 31 and last preserve intent; short month policy remains unresolved',()=>{
  const numeric=monthlyDayIntent({year:2026,month:2,day:31});
  assert.equal(numeric.status,'POLICY_UNRESOLVED');assert.equal(numeric.normalized.intent.day,31);assert.equal(numeric.normalized.resolvedDay,null);
  const last=monthlyDayIntent({year:2026,month:2,day:'last'});
  assert.equal(last.status,'VALID');assert.equal(last.normalized.intent.day,'last');assert.equal(last.normalized.resolvedDay,28);
  assert.equal(monthlyDayIntent({year:2028,month:2,day:'last'}).normalized.resolvedDay,29);
  assert.equal(monthlyDayIntent({year:2100,month:2,day:'last'}).normalized.resolvedDay,28);
  assert.equal(monthlyDayIntent({year:2026,month:4,day:31}).status,'POLICY_UNRESOLVED');
  assert.equal(monthlyDayIntent({year:2026,month:12,day:31}).normalized.resolvedDay,31);
});
