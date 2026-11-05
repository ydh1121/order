import {engineResult} from '../contracts/result.mjs';
import {fromRatio, exact, multiply, compare, toJSON} from './exact.mjs';
import {monthlyDayIntent} from './period.mjs';
import {monthDays,validMonth,ordinal,weekday,isoDate,parseDate} from './civil-date.mjs';

export const CALENDAR_FORECAST_RULE_VERSION = 'calendar-forecast-1.2.0';
const DATA_VERSION = 'proleptic-gregorian-calendar-1';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysOnly = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const validWeekdays = days => Array.isArray(days) && days.length <= 7 && days.every(day => Number.isInteger(day) && day >= 1 && day <= 7) && new Set(days).size === days.length;

/**
 * Exact nominal recurrence, independent of DOM, clock, timezone and holiday data.
 * quantity / range.min / range.max: exact decimal strings, safe integers, or JSON ratios.
 * schedule: WEEKLY {weekdays:[ISO day],anchorDate?}, CYCLE {weekPlans:[[ISO day]],anchorDate},
 * INTERVAL_DAYS {intervalDays:14|21,anchorDate}, or MONTHLY {day:1..31|'last',
 * shortMonthPolicy?:'CLAMP',anchorDate?}. CLAMP is an explicit policy; omitted
 * short-month policy remains unresolved. CYCLE anchor is the Monday starting week 1 and
 * the earliest active date; 1..52 weekly plans repeat without projecting before it.
 * calendarPolicy:{kind:'UNADJUSTED'} explicitly requests no holiday/off-day shifts.
 * Unknown policies and count-only/FLEX/ONCE schedules produce no numerical forecast.
 * Replay uses raw + versions; all quantities remain JSON rational objects, unrounded.
 */
export function calendarForecast(input) {
  let raw = null;
  const finish = (status, reasonCodes = [], normalized = null, needs = []) => engineResult({
    status, reasonCodes, raw, normalized, needs, field: 'calendar.forecast',
    ruleVersion: CALENDAR_FORECAST_RULE_VERSION, dataVersion: DATA_VERSION,
    evidence: {interpretation: 'NOMINAL_CALENDAR_RECURRENCE', clockDependency: 'NONE',
      externalCalendarData: 'NONE', holidayAdjustmentsApplied: false, deliveryApproval: false}
  });
  const unresolved = (reason, field) => finish('POLICY_UNRESOLVED', [reason], null, [{field, reason}]);
  try {
    if (!record(input)) return finish('INVALID', ['FORECAST_INPUT_INVALID']);
    // Reject non-serializable caller state rather than silently losing it in replay.
    raw = structuredClone(input);
    JSON.stringify(raw);
  } catch { raw = null; return finish('INVALID', ['FORECAST_INPUT_NOT_SERIALIZABLE']); }
  try {
    if (!keysOnly(raw, ['year', 'month', 'mode', 'quantity', 'range', 'schedule', 'calendarPolicy'])) return finish('INVALID', ['FORECAST_INPUT_CONFLICT']);
    const {year, month, mode, schedule, calendarPolicy} = raw;
    if (!validMonth(year, month)) return finish('INVALID', ['FORECAST_MONTH_INVALID']);
    const quantity = fromRatio(raw.quantity);
    if (quantity.n <= 0n) return finish('INVALID', ['QUANTITY_NOT_POSITIVE']);
    let low = quantity, high = quantity;
    if (raw.range !== undefined) {
      if (!record(raw.range) || !keysOnly(raw.range, ['min', 'max'])) return finish('INVALID', ['QUANTITY_RANGE_INVALID']);
      low = fromRatio(raw.range.min); high = fromRatio(raw.range.max);
      if (low.n <= 0n || high.n <= 0n || compare(low, high) > 0) return finish('INVALID', ['QUANTITY_RANGE_INVALID']);
      if (compare(quantity, low) < 0 || compare(quantity, high) > 0) return finish('INVALID', ['QUANTITY_OUTSIDE_RANGE']);
    }
    if (mode === 'FLEX') return unresolved('FLEX_SCHEDULE_UNDETERMINED', 'schedule');
    if (mode === 'ONCE') return unresolved('ONCE_NOT_MONTHLY_RECURRENCE', 'mode');
    if (mode !== 'FIXED') return finish('INVALID', ['FORECAST_MODE_INVALID']);
    if (!record(calendarPolicy)) return unresolved('CALENDAR_POLICY_REQUIRED', 'calendarPolicy');
    if (calendarPolicy.kind !== 'UNADJUSTED' || !keysOnly(calendarPolicy, ['kind'])) return unresolved('CALENDAR_POLICY_UNSUPPORTED', 'calendarPolicy');
    if (!record(schedule)) return unresolved('CALENDAR_SCHEDULE_REQUIRED', 'schedule');
    const dates = [];
    if (schedule.kind === 'MONTHLY') {
      if (!keysOnly(schedule, ['kind', 'day', 'shortMonthPolicy', 'anchorDate'])) return unresolved('SCHEDULE_POLICY_CONFLICT', 'schedule');
      if (schedule.shortMonthPolicy !== undefined && schedule.shortMonthPolicy !== 'CLAMP') return unresolved('SHORT_MONTH_POLICY_UNSUPPORTED', 'schedule.shortMonthPolicy');
      const dayResult = monthlyDayIntent({year, month, day: schedule.day});
      const clamp = dayResult.status === 'POLICY_UNRESOLVED' && schedule.shortMonthPolicy === 'CLAMP';
      if (dayResult.status === 'POLICY_UNRESOLVED' && !clamp) return unresolved('SHORT_MONTH_POLICY_REQUIRED', 'schedule.day');
      if (dayResult.status !== 'VALID' && !clamp) return finish('INVALID', ['MONTH_DAY_INVALID']);
      const date = isoDate(year, month, clamp ? monthDays(year, month) : dayResult.normalized.resolvedDay);
      const anchor = schedule.anchorDate ? parseDate(schedule.anchorDate) : null;
      if (schedule.anchorDate !== undefined && schedule.anchorDate !== '' && !anchor) return finish('INVALID', ['MONTHLY_ANCHOR_INVALID']);
      if (!anchor || date >= schedule.anchorDate) dates.push(date);
    } else if (schedule.kind === 'INTERVAL_DAYS') {
      if (!keysOnly(schedule, ['kind', 'intervalDays', 'anchorDate'])) return unresolved('SCHEDULE_POLICY_CONFLICT', 'schedule');
      if (![14,21].includes(schedule.intervalDays)) return finish('INVALID', ['INTERVAL_DAYS_INVALID']);
      if (schedule.anchorDate === undefined || schedule.anchorDate === null || schedule.anchorDate === '') return unresolved('INTERVAL_ANCHOR_REQUIRED', 'schedule.anchorDate');
      const anchor = parseDate(schedule.anchorDate);
      if (!anchor) return finish('INVALID', ['INTERVAL_ANCHOR_INVALID']);
      for (let day = 1; day <= monthDays(year, month); day++) {
        const distance = ordinal(year, month, day) - anchor.ordinal;
        if (distance >= 0 && distance % schedule.intervalDays === 0) dates.push(isoDate(year, month, day));
      }
    } else if (schedule.kind === 'WEEKLY' || schedule.kind === 'CYCLE') {
      let plans, anchor = null;
      if (schedule.kind === 'WEEKLY') {
        if (!keysOnly(schedule, ['kind', 'weekdays', 'anchorDate'])) return unresolved('SCHEDULE_POLICY_CONFLICT', 'schedule');
        if (schedule.weekdays === undefined || Array.isArray(schedule.weekdays) && schedule.weekdays.length === 0) return unresolved('WEEKDAYS_REQUIRED', 'schedule.weekdays');
        if (!validWeekdays(schedule.weekdays)) return finish('INVALID', ['WEEKDAYS_INVALID']);
        anchor = schedule.anchorDate ? parseDate(schedule.anchorDate) : null;
        if (schedule.anchorDate !== undefined && schedule.anchorDate !== '' && !anchor) return finish('INVALID', ['WEEKLY_ANCHOR_INVALID']);
        plans = [schedule.weekdays];
      } else {
        if (!keysOnly(schedule, ['kind', 'weekPlans', 'anchorDate'])) return unresolved('SCHEDULE_POLICY_CONFLICT', 'schedule');
        if (!Array.isArray(schedule.weekPlans) || !schedule.weekPlans.length) return unresolved('CYCLE_WEEK_PLANS_REQUIRED', 'schedule.weekPlans');
        if (schedule.weekPlans.length > 52 || !schedule.weekPlans.every(validWeekdays)) return finish('INVALID', ['CYCLE_WEEK_PLANS_INVALID']);
        if (!schedule.weekPlans.some(days => days.length)) return unresolved('WEEKDAYS_REQUIRED', 'schedule.weekPlans');
        if (schedule.anchorDate === undefined || schedule.anchorDate === null || schedule.anchorDate === '') return unresolved('CYCLE_ANCHOR_REQUIRED', 'schedule.anchorDate');
        anchor = parseDate(schedule.anchorDate);
        if (!anchor) return finish('INVALID', ['CYCLE_ANCHOR_INVALID']);
        if (weekday(anchor.ordinal) !== 1) return unresolved('CYCLE_MONDAY_ANCHOR_REQUIRED', 'schedule.anchorDate');
        plans = schedule.weekPlans;
      }
      for (let day = 1; day <= monthDays(year, month); day++) {
        const current = ordinal(year, month, day);
        if (anchor && current < anchor.ordinal) continue;
        const plan = anchor ? Math.floor((current - anchor.ordinal) / 7) % plans.length : 0;
        if (plans[plan].includes(weekday(current))) dates.push(isoDate(year, month, day));
      }
    } else return unresolved('CALENDAR_SCHEDULE_UNSUPPORTED', 'schedule.kind');
    const visits = exact(dates.length);
    return finish('VALID', [], {period: {year, month}, dates, visits: dates.length,
      low: toJSON(multiply(low, visits)), high: toJSON(multiply(high, visits)),
      quantity: toJSON(quantity), range: raw.range === undefined ? null : {min: toJSON(low), max: toJSON(high)},
      schedule: structuredClone(schedule), calendarPolicy: structuredClone(calendarPolicy)});
  } catch (error) {
    return finish('INVALID', [error instanceof Error ? error.message : 'FORECAST_INPUT_INVALID']);
  }
}
