/** Shared historical-regression adapters. These invoke the real current control,
 * and retain native-select baseline interaction only for frozen older builds. */
export const approved0540=process.env.ORDER_QA_CONTRACT==='MSG0540';
// MSG0583 adds decorative aria-hidden digit cells. Read the single semantic
// amount when present; frozen historical builds retain their original text.
export const moneyText=locator=>locator.evaluate(el=>el.querySelector('.order-counter-value')?.textContent??el.innerText);
export const moneyTexts=locator=>locator.evaluateAll(elements=>elements.map(el=>el.querySelector('.order-counter-value')?.textContent??el.textContent));
export async function chooseQuantityUnit(select,value){
 if(await select.isVisible())return select.selectOption(value);
 const page=select.page(),id=await select.getAttribute('data-line-qty-unit');
 const option=await select.locator(`option[value="${value}"]`).textContent();
 await page.locator(`[data-unit-trigger="${id}"]`).click();
 await page.locator('#order-quantity-menu [role="option"]').filter({hasText:new RegExp('^'+option+'(?:✓)?$')}).click();
}
export function superseded0540(id){
 if(!approved0540)return null;
 const exact={
  C28_15_16_17_N08:'C54-11/12: direct fixed Q upper correction uses approved cadence memory and monthly day rule',
  C28_02_17_FIXED_UPPER_CORRECTION_UNDO_AND_CANCEL:'C54-12/22: approved monthly-memory quantity undo contract',
  C28_24_D26_EXISTING_STARTED_ANCHOR_READ_NO_WRITE:'C54-22: legacy anchor remains persisted; new D1R6 editor uses explicit approved semantics',
  C26_FIXED_PERIODS_OPTIONAL_DATE_NO_HIDDEN_REFERENCE:'C54-11/16/20: approved cadence excludes new3week choices and requires weekly/fortnight dates',
  C26_C28_INDIVIDUAL_INVALID_MONTH_ISOLATED_FROM_SHARED_MODE:'C54-17/22: D1R6 impossible month is corrected immediately, not retained raw',
  C26_SHARED_REQUIRED_DATE_REVEALS_ACTUAL_COLLAPSED_OWNER:'C54-20/22: D1R6 monthly derived date and explicit required rule gate',
  C28_12_COMMON_ORDER_COPY_OUTPUTS_AND_WEEKDAYS:'C54-08/14/22: approved weekly computed frequency and maximum weekdays replace exact cardinality'
 };
 if(exact[id])return exact[id];
 if(/^C28_18_19_21_22_.*_ACTUAL_DATE_INPUT$/.test(id)||id==='C28_21_D27_PARTIAL_DATE_NO_TYPING_CLAMP')return 'C54-16/17/18/19/20: D1R6 today to next-month-end, immediate impossible-input correction, shared calendar';
 return null;
}

/** An unrelated save regression supplies the newly required date through the
 * actual field, without changing its gate or seeding a hidden default. */
export async function fillVisibleApprovedDate(page){
 if(!approved0540)return;
 const today=await page.evaluate(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 for(const root of await page.locator('[data-order-date-field]:not([data-readonly="true"])').all()){
  if(!await root.isVisible())continue;
  const day=root.locator('[data-order-date-part="day"]');
  if(await day.inputValue())continue;
  const [year,month,date]=today.split('-');
  await root.locator('[data-order-date-part="year"]').fill(year);
  await root.locator('[data-order-date-part="month"]').fill(month);
  await day.fill(date);await day.press('Tab');
 }
}
