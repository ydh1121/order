// Public browser entry: keep every Node-only loader outside this dependency graph.
export {ENGINE_VERSION, CONTRACT_VERSION} from '../engine/contracts/result.mjs';
export {createOrderPhoneAdapter, parseBrowserPhone, projectPhone} from '../engine/adapters/phone-browser.mjs';
export {createBrowserEmailService} from '../engine/adapters/email-browser.mjs';
export {createBrowserIanaProvider, verifyBrowserIana, browserIanaFreshness} from '../engine/adapters/iana-browser.mjs';
export {evaluateAllocation, beginAllocationEdit, editAllocation, confirmAllocation, cancelAllocation, evaluateOnceAllocation, changeAllocationTopology} from '../engine/calculation/allocation.mjs';
export {calculateQuote} from '../engine/calculation/quote.mjs';
export {calendarForecast} from '../engine/calculation/calendar-forecast.mjs';
export {demandFrequency,fixedQuantityPlan} from '../engine/calculation/period.mjs';
export {startDateRange,inspectStartDate,recurringDeliveryDates,holidaySnapshotState,holidayPolicyFromSelection,START_DATE_POLICY_VERSION} from '../engine/calculation/start-date.mjs';
export {KR_HOLIDAY_SNAPSHOT,OrderHolidaySnapshot} from '../engine/reference/kr-holidays.mjs';
