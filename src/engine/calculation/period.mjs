import { engineResult } from '../contracts/result.mjs';
import { exact, multiply, divide, toJSON } from './exact.mjs';
const result = (input, status, reasonCodes, normalized = null, evidence = {}) => engineResult({status, reasonCodes, raw: input, normalized, field: 'period', ruleVersion: 'period-1.0.0', dataVersion: 'gregorian-calendar-1', evidence});

/** Expected quantities only; actual delivery scheduling is outside this module. */
export function periodQuantity(input) {
  try {
    const quantity = exact(input?.perDelivery);
    if (quantity.n <= 0n) return result(input, 'INVALID', ['QUANTITY_NOT_POSITIVE']);
    const period = input.period;
    if (!period?.kind) return result(input, 'POLICY_UNRESOLVED', ['PERIOD_POLICY_REQUIRED']);
    if (!['EXPLICIT_VISITS','FOUR_WEEKS','THIRTY_DAYS'].includes(period.kind)) return result(input, 'POLICY_UNRESOLVED', ['PERIOD_POLICY_UNSUPPORTED']);
    const allowed = period.kind === 'EXPLICIT_VISITS' ? ['kind','visits'] : period.kind === 'THIRTY_DAYS' ? ['kind','method'] : ['kind'];
    if (Object.keys(period).some(key => !allowed.includes(key))) return result(input, 'POLICY_UNRESOLVED', ['PERIOD_POLICY_CONFLICT']);
    let visits;
    if (period.kind === 'EXPLICIT_VISITS') {
      visits = exact(period.visits);
      if (visits.n <= 0n || visits.d !== 1n) return result(input, 'INVALID', ['VISIT_COUNT_INVALID']);
    } else {
      const weekly = exact(input.weeklyVisits);
      if (weekly.n <= 0n || weekly.d !== 1n || weekly.n > 7n) return result(input, 'INVALID', ['WEEKLY_VISITS_INVALID']);
      if (period.kind === 'FOUR_WEEKS') visits = multiply(weekly, exact(4));
      else if (period.kind === 'THIRTY_DAYS') {
        if (period.method !== 'PRORATED_EXPECTATION') return result(input, 'POLICY_UNRESOLVED', ['THIRTY_DAY_VISIT_METHOD_REQUIRED']);
        visits = divide(multiply(weekly, exact(30)), exact(7));
      }
    }
    return result(input, 'VALID', [], { expectedVisits: toJSON(visits), expectedQuantity: toJSON(multiply(quantity, visits)), period: structuredClone(period), actualCalendarDates: null }, { interpretation: 'EXPECTED_QUANTITY_ONLY', calendarScheduling: 'UNRESOLVED' });
  } catch (error) { return result(input, 'INVALID', [error.message]); }
}

export function monthlyDayIntent(input) {
  const { year, month, day } = input || {};
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !(day === 'last' || Number.isInteger(day) && day >= 1 && day <= 31)) return result(input, 'INVALID', ['MONTH_DAY_INVALID']);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day !== 'last' && day > days) return result(input, 'POLICY_UNRESOLVED', ['SHORT_MONTH_POLICY_REQUIRED'], { intent: {year, month, day}, resolvedDay: null });
  return result(input, 'VALID', [], { intent: {year, month, day}, resolvedDay: day === 'last' ? days : day }, { calendarMeaningOnly: true, deliveryApproval: false });
}
