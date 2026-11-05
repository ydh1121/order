import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarForecast} from '../../src/engine/calculation/calendar-forecast.mjs';

const base = {year: 2026, month: 5, mode: 'FIXED', quantity: '2.5', calendarPolicy: {kind: 'UNADJUSTED'}};
const forecast = schedule => calendarForecast({...base, schedule});
const ratio = (numerator, denominator = '1') => ({numerator, denominator});

test('actual month weekdays and exact range totals use independent literal dates, not four weeks', () => {
  const result = forecast({kind: 'WEEKLY', weekdays: [1, 4]});
  assert.equal(result.status, 'VALID');
  assert.deepEqual(result.normalized.dates, ['2026-05-04', '2026-05-07', '2026-05-11', '2026-05-14', '2026-05-18', '2026-05-21', '2026-05-25', '2026-05-28']);
  assert.equal(result.normalized.visits, 8);
  assert.deepEqual(result.normalized.low, ratio('20'));
  const five = calendarForecast({...base, quantity: '0.2', range: {min: '0.1', max: '0.3'}, schedule: {kind: 'WEEKLY', weekdays: [5]}});
  assert.deepEqual(five.normalized.dates, ['2026-05-01', '2026-05-08', '2026-05-15', '2026-05-22', '2026-05-29']);
  assert.deepEqual(five.normalized.low, ratio('1', '2'));
  assert.deepEqual(five.normalized.high, ratio('3', '2'));
});

test('multiweek cycle retains phase across month boundary and never back-projects before anchor', () => {
  const schedule = {kind: 'CYCLE', weekPlans: [[1], [2]], anchorDate: '2026-01-26'};
  const result = calendarForecast({...base, month: 2, schedule});
  assert.deepEqual(result.normalized.dates, ['2026-02-03', '2026-02-09', '2026-02-17', '2026-02-23']);
  assert.deepEqual(result.normalized.low, ratio('10'));
  assert.deepEqual(calendarForecast({...base, month: 1, schedule}).normalized.dates, ['2026-01-26']);
  const before = calendarForecast({...base, year: 2025, month: 12, schedule});
  assert.equal(before.status, 'VALID'); assert.equal(before.normalized.visits, 0);
  assert.deepEqual(before.normalized.low, ratio('0'));
  assert.deepEqual(calendarForecast({...base, month: 2, schedule: {...schedule, weekPlans: [[1], []]}}).normalized.dates, ['2026-02-09', '2026-02-23']);
});

test('monthly numeric 31 is never clamped; last-day intent honors Gregorian century rules', () => {
  const input = {...base, month: 2, schedule: {kind: 'MONTHLY', day: 31}};
  const unresolved = calendarForecast(input);
  assert.equal(unresolved.status, 'POLICY_UNRESOLVED');
  assert.deepEqual(unresolved.reasonCodes, ['SHORT_MONTH_POLICY_REQUIRED']);
  assert.equal(unresolved.raw.schedule.day, 31); assert.equal(unresolved.normalized, null);
  for (const [year, date] of [[2000, '2000-02-29'], [2100, '2100-02-28'], [1, '0001-02-28'], [99, '0099-02-28']]) {
    assert.deepEqual(calendarForecast({...input, year, schedule: {kind: 'MONTHLY', day: 'last'}}).normalized.dates, [date]);
  }
  assert.equal(calendarForecast({...input, year: 2100, schedule: {kind: 'MONTHLY', day: 29}}).status, 'POLICY_UNRESOLVED');
  assert.deepEqual(calendarForecast({...base, year: 1, month: 1, schedule: {kind: 'WEEKLY', weekdays: [1]}}).normalized.dates, ['0001-01-01', '0001-01-08', '0001-01-15', '0001-01-22', '0001-01-29']);
});

test('unknown recurrence and calendar policy produce needs, never fabricated counts', () => {
  const cases = [
    [{...base, mode: 'FLEX'}, 'FLEX_SCHEDULE_UNDETERMINED'],
    [{...base, mode: 'ONCE'}, 'ONCE_NOT_MONTHLY_RECURRENCE'],
    [{...base, schedule: {kind: 'COUNT', frequency: 2}}, 'CALENDAR_SCHEDULE_UNSUPPORTED'],
    [{...base, schedule: {kind: 'WEEKLY', weekdays: []}}, 'WEEKDAYS_REQUIRED'],
    [{...base, schedule: {kind: 'CYCLE', weekPlans: [[1], [2]]}}, 'CYCLE_ANCHOR_REQUIRED'],
    [{...base, schedule: {kind: 'CYCLE', weekPlans: [[1], [2]], anchorDate: '2026-01-27'}}, 'CYCLE_MONDAY_ANCHOR_REQUIRED'],
    [{...base, calendarPolicy: undefined, schedule: {kind: 'WEEKLY', weekdays: [1]}}, 'CALENDAR_POLICY_REQUIRED'],
    [{...base, calendarPolicy: {kind: 'SKIP_HOLIDAYS'}, schedule: {kind: 'WEEKLY', weekdays: [1]}}, 'CALENDAR_POLICY_UNSUPPORTED'],
    [{...base, schedule: {kind: 'WEEKLY', weekdays: [1], intervalWeeks: 2}}, 'SCHEDULE_POLICY_CONFLICT']
  ];
  for (const [input, reason] of cases) {
    const result = calendarForecast(input);
    assert.equal(result.status, 'POLICY_UNRESOLVED', reason);
    assert.deepEqual(result.reasonCodes, [reason]); assert.equal(result.needs[0].reason, reason);
    assert.equal(result.normalized, null);
  }
});

test('invalid quantities, duplicates, date and range cannot yield a forecast', () => {
  const input = {...base, schedule: {kind: 'WEEKLY', weekdays: [1]}};
  for (const patch of [{quantity: '0'}, {quantity: '-1'}, {quantity: 0.1}, {quantity: 'NaN'}, {range: {min: '3', max: '2'}}, {month: 13}, {year: 0}, {schedule: {kind: 'WEEKLY', weekdays: [1, 1]}}, {schedule: {kind: 'WEEKLY', weekdays: [0]}}, {schedule: {kind: 'CYCLE', weekPlans: [[1]], anchorDate: '2026-02-30'}}, {schedule: {kind: 'MONTHLY', day: '31'}}]) {
    const result = calendarForecast({...input, ...patch});
    assert.equal(result.status, 'INVALID', JSON.stringify(patch)); assert.equal(result.normalized, null);
  }
  assert.equal(calendarForecast({...input, quantity: 1n}).status, 'INVALID');
  assert.equal(calendarForecast({...input, schedule: {kind: 'WEEKLY', weekdays: [1], bad: () => {}}}).status, 'INVALID');
  for (const quantity of ['0.9', '3.1']) {
    const result = calendarForecast({...input, quantity, range: {min: '1', max: '3'}});
    assert.equal(result.status, 'INVALID'); assert.deepEqual(result.reasonCodes, ['QUANTITY_OUTSIDE_RANGE']);
  }
  for (const quantity of ['1', '3']) assert.equal(calendarForecast({...input, quantity, range: {min: '1', max: '3'}}).status, 'VALID');
});

test('versioned replay and source/result snapshots are independent, without clock reads', () => {
  const input = {...base, quantity: ratio('1', '3'), schedule: {kind: 'WEEKLY', weekdays: [5]}};
  const result = calendarForecast(input);
  assert.deepEqual(result.normalized.low, ratio('5', '3'));
  assert.equal(result.versions.rules, 'calendar-forecast-1.2.0');
  assert.equal(result.versions.data, 'proleptic-gregorian-calendar-1');
  assert.deepEqual(calendarForecast(JSON.parse(JSON.stringify(result.raw))), result);
  input.schedule.weekdays.push(1);
  assert.deepEqual(result.raw.schedule.weekdays, [5]);
  result.normalized.schedule.weekdays.push(2);
  assert.deepEqual(result.raw.schedule.weekdays, [5]);
  assert.equal(result.evidence.clockDependency, 'NONE');
  assert.equal(result.evidence.holidayAdjustmentsApplied, false);
});
