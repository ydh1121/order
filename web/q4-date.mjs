/* Mode adapter only: mechanics, notices and validation live in order-date.
 * ONCE period unification is unapproved. Keep its existing calendar horizon. */
import {dateKey,validDate,inspectDateParts} from './order-date.mjs';
const OPTIONS=Object.freeze({
 FIXED:Object.freeze({label:'정기 주문 시작 예상일 지정',required:true,policyOptions:Object.freeze({selectionPeriod:'D1R6'})}),
 ONCE:Object.freeze({label:'납품일',required:false,policyOptions:Object.freeze({selectionPeriod:'ONCE_LEGACY'})})
});
export function dateModeOptions(mode){const options=OPTIONS[mode];if(!options)throw Error('DATE_MODE_UNSUPPORTED');return options;}
export function oneTimeDateValue(parts){
 if(!parts||['year','month','day'].some(key=>!/^\d+$/.test(String(parts[key]??''))))return '';
 const value=dateKey(Number(parts.year),Number(parts.month),Number(parts.day));return validDate(value)?value:'';
}
export function inspectOneTimeDate(parts,now=new Date()){
 const {required,policyOptions}=dateModeOptions('ONCE');return inspectDateParts(parts,now,{required,...policyOptions});
}

/** The shared field edits strings; legacy ONCE persistence owns integer parts.
 * Adapt accepted digits at the write boundary without coercing invalid text or
 * touching a restored date during a read. Empty parts remain empty. */
export function oneTimeDateParts(parts){
 return Object.fromEntries(['year','month','day'].map(key=>{
  const raw=parts?.[key],value=typeof raw==='string'&&/^\d+$/.test(raw)&&Number.isSafeInteger(Number(raw))?Number(raw):raw;
  return [key,value];
 }));
}
