import {exact,add,multiply,divide,toJSON,fromRatio} from '../src/engine/calculation/exact.mjs';

export const quantityUnit = line => line.qtyUnit || (String(line.pack)==='30'?'tray':'pack');
export const quantityLabel = line => ({each:'개',tray:'판',pack:'팩'})[quantityUnit(line)] || '단위 확인';
export function monthlyQuantity(line) {
  if(line.qtyExact?.representation==='rational'){
    const value=fromRatio(line.qtyExact);
    if(line.qty!==`${value.n}/${value.d}`||value.n<=0n)throw Error('MONTHLY_QUANTITY_METADATA');
    return value;
  }
  if(!/^[1-9]\d*$/.test(String(line.qty)))throw Error('MONTHLY_QUANTITY_INVALID');
  return exact(String(line.qty));
}
export function validMonthlyQuantity(line){try{return monthlyQuantity(line).n>0n;}catch{return false;}}
export function monthlyQuantityText(line){try{return exactDisplay(monthlyQuantity(line).d===1n?monthlyQuantity(line).n.toString():line.qtyExact);}catch{return String(line.qty??'');}}
export function quantityFactor(line,unit=quantityUnit(line)) {
  if(unit==='each')return exact('1');
  if(unit==='tray')return exact('30');
  if(unit==='pack'&&['10','20','30'].includes(String(line.pack)))return exact(String(line.pack));
  throw Error('QUANTITY_UNIT_REQUIRED');
}
export function baseQuantity(line,raw=line.qty,unit=quantityUnit(line)) {
  return multiply(raw===line.qty?monthlyQuantity(line):exact(String(raw)),quantityFactor(line,unit));
}
export function convertMonthlyUnit(line,nextUnit){
  const value=divide(baseQuantity(line),quantityFactor(line,nextUnit));
  return {...line,qtyUnit:nextUnit,qty:value.d===1n?value.n.toString():`${value.n}/${value.d}`,
    qtyExact:value.d===1n?undefined:{representation:'rational',conversionReviewed:true,...toJSON(value)}};
}
export function currentPurchaseCost(line) {
  try {
    if(!validMonthlyQuantity(line)||!/^[1-9]\d*$/.test(String(line.price)))return null;
    const amount=divide(multiply(baseQuantity(line),exact(String(line.price))),exact(String(line.pack)));
    return toJSON(amount);
  }catch{return null;}
}
export function totalPurchaseCost(lines) {
  if(!lines.length)return null;
  let total=exact('0');for(const line of lines){const value=currentPurchaseCost(line);if(!value)return null;total=add(total,fromRatio(value));}return toJSON(total);
}
// No currency rounding policy is invented. Non-integral amounts retain their exact fraction.
export function exactDisplay(value) {
  try {const v=fromRatio(value);return v.d===1n?v.n.toLocaleString('ko-KR'):`${v.n.toLocaleString('ko-KR')}/${v.d.toLocaleString('ko-KR')}`;}catch{return '확인 필요';}
}
