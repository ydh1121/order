import { engineResult } from '../contracts/result.mjs';
import { exact, multiply, divide, compare, toJSON, round } from './exact.mjs';
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

const positivePackage = value => {const number=exact(value);if(number.n<=0n||number.d!==1n)throw Error('INTEGER_PACKAGE_REQUIRED');return number;};
const strictRange=value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!['min','max'].includes(key)))throw Error('QUANTITY_RANGE_INVALID');return value;};
const supportResult=(input,status,reasonCodes,normalized=null)=>{let raw=null;try{raw=structuredClone(input);JSON.stringify(raw);}catch{status='INVALID';reasonCodes=['SUPPORT_INPUT_NOT_SERIALIZABLE'];normalized=null;raw=null;}return engineResult({raw,status,reasonCodes,normalized,field:'deliverySupport',ruleVersion:'delivery-support-1.2.0',dataVersion:null,evidence:{interpretation:'NOMINAL_USER_PLAN',actualDeliverySchedule:false,storageCommitPerformed:false}});};
/** Injected Seoul civil date: no clock, timezone guessing or nominal 30-day month. */
export function orderMonthContext(asOfLocalDate){
  if(typeof asOfLocalDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(asOfLocalDate))return null;
  const [year,month,day]=asOfLocalDate.split('-').map(Number),last=monthlyDayIntent({year,month,day:'last'});
  if(last.status!=='VALID'||day<1||day>last.normalized.resolvedDay)return null;
  return {asOfLocalDate,year,month,daysInMonth:last.normalized.resolvedDay};
}
/** Exact long-run ratios and an independent integer display projection; never scheduled visits. */
export function demandFrequency(input){
  try{
    if(!input||Object.keys(input).some(key=>!['monthlyPlan','quantity','range','asOfLocalDate'].includes(key)))throw Error('FREQUENCY_INPUT_INVALID');
    const monthly=positivePackage(input.monthlyPlan),quantity=positivePackage(input.quantity);
    let low=quantity,high=quantity;
    if(input.range!==undefined){strictRange(input.range);low=positivePackage(input.range.min);high=positivePackage(input.range.max);if(compare(low,high)>0||compare(quantity,low)<0||compare(quantity,high)>0)throw Error('QUANTITY_RANGE_INVALID');}
    const average=divide(monthly,quantity),lower=divide(monthly,high),upper=divide(monthly,low),variable=compare(low,high)<0;
    const atLeastOne=value=>{const integer=BigInt(value);return (integer<1n?1n:integer).toString();};
    const displayLow=atLeastOne(round(variable?lower:average,{scale:0,mode:variable?'FLOOR':'HALF_UP'}).decimal);
    const roundedHigh=atLeastOne(round(variable?upper:average,{scale:0,mode:variable?'CEIL':'HALF_UP'}).decimal);
    const displayHigh=BigInt(roundedHigh)<BigInt(displayLow)?displayLow:roundedHigh;
    const month=input.asOfLocalDate===undefined?null:orderMonthContext(input.asOfLocalDate);
    if(input.asOfLocalDate!==undefined&&!month)throw Error('AS_OF_LOCAL_DATE_INVALID');
    const representativeCount=atLeastOne(round(average,{scale:0,mode:'HALF_UP'}).decimal);
    const daily=!!month&&!variable&&compare(average,exact(month.daysInMonth))===0;
    const representative={exact:toJSON(average),count:representativeCount,kind:daily?'DAILY':variable||average.d!==1n?'APPROX':'EXACT',variable,month};
    // low/high remain a diagnostic range. Only representative M/Q owns the
    // customer frequency; display rounding never changes Q, a/b or a calendar.
    return supportResult(input,'VALID',[],{monthlyPlan:toJSON(monthly),quantity:toJSON(quantity),average:toJSON(average),low:toJSON(lower),high:toJSON(upper),range:input.range?{min:toJSON(low),max:toJSON(high)}:null,display:{low:displayLow,high:displayHigh,rounding:variable?'FLOOR_CEIL_MIN_1':'HALF_UP_MIN_1'},representative,meaning:'LONG_TERM_MONTHLY_AVERAGE'});
  }catch(error){return supportResult(input,'INVALID',[error.message]);}
}
/** Current transaction bounds. FLEX limits its representative frequency to D;
 * FIXED has no daily-frequency floor. This is never a bound on variable max b. */
export function orderQuantityBounds(input){
  try{
    if(!input||Object.keys(input).some(key=>!['mode','monthlyPlan','asOfLocalDate'].includes(key))||!['FLEX','FIXED'].includes(input.mode))throw Error('ORDER_QUANTITY_MODE_INVALID');
    const monthly=positivePackage(input.monthlyPlan),month=orderMonthContext(input.asOfLocalDate);
    if(!month)throw Error('AS_OF_LOCAL_DATE_INVALID');
    const minimum=input.mode==='FLEX'?round(divide(monthly,exact(month.daysInMonth)),{scale:0,mode:'CEIL'}).decimal:'1';
    return supportResult(input,'VALID',[],{min:minimum,max:monthly.n.toString(),mode:input.mode,month});
  }catch(error){return supportResult(input,'INVALID',[error.message]);}
}
/** Reconcile only the directly edited per-order field. Draft refresh/restore
 * may inspect bounds but cannot rewrite quantities or schedule semantics. */
export function orderQuantityInput(input={}){
  const {mode,monthlyPlan,quantity,asOfLocalDate,phase='input',direct=true,composing=false}=input;
  const raw=String(quantity??''),bounds=orderQuantityBounds({mode,monthlyPlan,asOfLocalDate});
  const base={valid:false,quantity:raw,min:bounds.normalized?.min??null,max:bounds.normalized?.max??null,changed:false,forceMonthly:false,withinBounds:false,month:bounds.normalized?.month??null,reason:null};
  if(bounds.status!=='VALID')return {...base,reason:bounds.reasonCodes[0]};
  if(composing||raw==='')return {...base,reason:'QUANTITY_EDITING'};
  if(!/^\d+$/.test(raw)||!['input','complete','commit'].includes(phase))return {...base,reason:'INTEGER_PACKAGE_REQUIRED'};
  const parsed=BigInt(raw),minimum=BigInt(base.min),maximum=BigInt(base.max),over=parsed>maximum,under=parsed<minimum;
  let value=parsed,reason=null;
  if(direct&&over){value=maximum;reason='ORDER_QUANTITY_MAXIMUM';}
  else if(under&&(direct&&phase==='complete'||phase==='commit')){value=minimum;reason='ORDER_QUANTITY_MINIMUM';}
  const withinBounds=value>=minimum&&value<=maximum;
  return {...base,valid:withinBounds,quantity:value===parsed?raw:value.toString(),changed:value!==parsed,forceMonthly:direct&&mode==='FIXED'&&over,withinBounds,reason:reason??(!withinBounds?'ORDER_QUANTITY_OUTSIDE_BOUNDS':null)};
}
/** Read-only restoration/completion gate. Historical records without an input
 * month still have Q<=M, but cannot acquire an invented month-dependent floor.
 * The stored month, not today's wall clock, owns a reviewed record's floor. */
export function inspectStoredOrderQuantity(input={}){
  const {mode,monthlyPlan,quantity,asOfLocalDate}=input;
  const base={valid:false,quantity:String(quantity??''),min:null,max:null,month:null,lowerBasis:'UNSPECIFIED',changed:false,forceMonthly:false,reason:null};
  try{
    if(!['FLEX','FIXED'].includes(mode))throw Error('ORDER_QUANTITY_MODE_INVALID');
    const monthly=positivePackage(monthlyPlan),value=positivePackage(quantity);
    let minimum='1',month=null;
    if(asOfLocalDate!==undefined){const bound=orderQuantityBounds({mode,monthlyPlan,asOfLocalDate});if(bound.status!=='VALID')throw Error(bound.reasonCodes[0]);minimum=bound.normalized.min;month=bound.normalized.month;}
    const over=value.n>monthly.n,under=value.n<BigInt(minimum);
    return {...base,valid:!over&&!under,min:minimum,max:monthly.n.toString(),month,lowerBasis:mode==='FIXED'?'POSITIVE_INTEGER':month?'STORED_INPUT_MONTH':'UNSPECIFIED',reason:over?'ORDER_QUANTITY_MAXIMUM':under?'ORDER_QUANTITY_MINIMUM':null};
  }catch(error){return {...base,reason:error.message};}
}
/** Integer package plan across an explicit number of visits; caller owns calendar context. */
export function fixedQuantityPlan(input){
  try{
    if(!input||Object.keys(input).some(key=>!['monthlyPlan','visits','variable','range'].includes(key)))throw Error('FIXED_PLAN_INPUT_INVALID');
    const monthly=positivePackage(input.monthlyPlan),visits=positivePackage(input.visits);
    if(visits.n>366n)throw Error('VISIT_COUNT_INVALID');
    if(input.variable!==undefined&&typeof input.variable!=='boolean')throw Error('VARIABLE_PERMISSION_REQUIRED');
    const n=visits.n,q=monthly.n/n,remainder=monthly.n%n;
    const normalized={monthlyPlan:toJSON(monthly),visits:Number(n),exactAverage:toJSON(divide(monthly,visits)),feasible:false,constantQuantity:remainder===0n?q.toString():null,distribution:null,requiresVariable:remainder!==0n};
    if(!input.variable){
      if(remainder!==0n)return supportResult(input,'POLICY_UNRESOLVED',['VARIABLE_PLAN_PERMISSION_REQUIRED'],normalized);
      if(q<1n)return supportResult(input,'INVALID',['POSITIVE_DELIVERY_REQUIRED'],normalized);
      return supportResult(input,'VALID',[],{...normalized,feasible:true,distribution:[{quantity:q.toString(),visits:Number(n)}]});
    }
    if(!input.range)return supportResult(input,'POLICY_UNRESOLVED',['VARIABLE_RANGE_REQUIRED'],normalized);
    strictRange(input.range);const min=positivePackage(input.range.min),max=positivePackage(input.range.max);
    if(compare(min,max)>0)throw Error('QUANTITY_RANGE_INVALID');
    normalized.minTotal=toJSON(multiply(min,visits));normalized.maxTotal=toJSON(multiply(max,visits));
    if(compare(monthly,multiply(min,visits))<0||compare(monthly,multiply(max,visits))>0)return supportResult(input,'INVALID',['INTEGER_PLAN_OUTSIDE_RANGE'],normalized);
    const distribution=[];if(remainder)distribution.push({quantity:(q+1n).toString(),visits:Number(remainder)});if(n-remainder)distribution.push({quantity:q.toString(),visits:Number(n-remainder)});
    return supportResult(input,'VALID',[],{...normalized,feasible:true,distribution});
  }catch(error){return supportResult(input,'INVALID',[error.message]);}
}
