import {exact,add,multiply,divide,toJSON,fromRatio,round} from '../src/engine/calculation/exact.mjs';

// qty + qtyUnit are authoritative demand. The optional display unit never changes it.
export const quantityUnit = line => line.qtyUnit || (String(line.pack)==='30'?'tray':'pack');
export const quantityDisplayUnit = line => line.qtyDisplayUnit || quantityUnit(line);
export const packageUnit = line => String(line.pack)==='30'?'tray':['10','20'].includes(String(line.pack))?'pack':null;
export const quantityLabel = line => ({each:'개',tray:'판',pack:'팩'})[line.qtyExact?.representation==='rational'?'each':quantityUnit(line)] || '단위 확인';
export function monthlyQuantity(line) {
  if(line.qtyExact?.representation==='rational'){
    const value=fromRatio(line.qtyExact);
    if(line.qtyExact.conversionReviewed!==true||line.qty!==`${value.n}/${value.d}`||value.n<=0n)throw Error('MONTHLY_QUANTITY_METADATA');
    return value;
  }
  if(!/^[1-9]\d{0,11}$/.test(String(line.qty)))throw Error('MONTHLY_QUANTITY_INVALID');
  return exact(String(line.qty));
}
export function validMonthlyQuantity(line){try{if(!['each',String(line.pack)==='30'?'tray':'pack'].includes(quantityUnit(line))||!['each',String(line.pack)==='30'?'tray':'pack'].includes(quantityDisplayUnit(line)))return false;quantityFactor(line);return monthlyQuantity(line).n>0n;}catch{return false;}}
export function quantityFactor(line,unit=quantityUnit(line)) {
  if(unit==='each')return exact('1');
  if(unit==='tray'&&String(line.pack)==='30')return exact('30');
  if(unit==='pack'&&['10','20','30'].includes(String(line.pack)))return exact(String(line.pack));
  throw Error('QUANTITY_UNIT_REQUIRED');
}
export function baseQuantity(line,raw=line.qty,unit=quantityUnit(line)) {
  return multiply(raw===line.qty?monthlyQuantity(line):exact(String(raw)),quantityFactor(line,unit));
}
export function convertMonthlyUnit(line,nextUnit){
  if(!['each',String(line.pack)==='30'?'tray':'pack'].includes(nextUnit))throw Error('QUANTITY_UNIT_REQUIRED');
  return {...line,qtyDisplayUnit:nextUnit};
}
export function quantityInputText(line){
  if(!validMonthlyQuantity(line))return String(line.qty??'').includes('/')?'':String(line.qty??'');
  if(!['each',String(line.pack)==='30'?'tray':'pack'].includes(quantityDisplayUnit(line)))return '';
  const v=divide(baseQuantity(line),quantityFactor(line,quantityDisplayUnit(line)));
  return round(v,{scale:0,mode:'CEIL'}).decimal;
}
export function quantityDisplayNote(line){
  if(!validMonthlyQuantity(line))return '';
  const base=baseQuantity(line),packages=divide(base,exact(String(line.pack))),label=String(line.pack)==='30'?'판':'팩';
  if(quantityDisplayUnit(line)!=='each')return `낱개 기준 총 ${exactDisplay(toJSON(base))}개`;
  const packs=round(packages,{scale:0,mode:'CEIL'}).decimal;
  const truncated=round(packages,{scale:1,mode:'DOWN'}).decimal;
  // Sub-package demand must never look like zero; the exact source stays untouched.
  const detail=packages.d!==1n&&truncated!=='0.0'?` (${truncated}${label})`:'';
  return `포장 기준 ${BigInt(packs).toLocaleString('ko-KR')}${label}${detail}`;
}
/** Read-only display projection. Historical demand is never rewritten as a plan. */
export function monthlyPlanSnapshot(line,allocation={}){
  const unit=packageUnit(line);if(!unit)return {status:'INVALID',qty:null,unit:null,source:null,demandBase:null};
  const present=allocation.monthlyPlanQty!==undefined;
  let demandBase=null;
  try{
    if(allocation.monthlyDemandQty!==undefined&&allocation.monthlyDemandQty!==''){
      let metadata=allocation.monthlyDemandExact;
      if(metadata?.representation==='rational'){
        if(metadata.conversionReviewed!==true||metadata.raw!==allocation.monthlyDemandQty||metadata.unit!==allocation.monthlyDemandUnit||!/^\d+\/[1-9]\d*$/.test(metadata.raw))throw Error();
        const [numerator,denominator]=metadata.raw.split('/'),value=fromRatio({numerator,denominator});
        if(metadata.numerator!==undefined&&metadata.numerator!==value.n.toString()||metadata.denominator!==undefined&&metadata.denominator!==value.d.toString())throw Error();
        metadata={...metadata,numerator,denominator};
      }
      const demand={...line,qty:allocation.monthlyDemandQty,qtyUnit:allocation.monthlyDemandUnit||quantityUnit(line),qtyExact:metadata};
      const base=baseQuantity(demand);if(base.n<=0n||base.d!==1n)throw Error();demandBase=toJSON(base);
    }
    if(present){
      if(allocation.monthlyPlanQty==='')return {status:'EMPTY',qty:'',unit,source:allocation.monthlyPlanSource||'manual',demandBase};
      if(!/^[1-9]\d*$/.test(allocation.monthlyPlanQty)||allocation.monthlyPlanUnit!==unit||!['manual','derived'].includes(allocation.monthlyPlanSource))throw Error();
      return {status:'VALID',qty:allocation.monthlyPlanQty,unit,source:allocation.monthlyPlanSource,demandBase};
    }
    if(!demandBase)return {status:'EMPTY',qty:'',unit,source:'manual',demandBase:null};
    const packages=divide(fromRatio(demandBase),quantityFactor(line,unit));
    return {status:'VALID',qty:round(packages,{scale:0,mode:'CEIL'}).decimal,unit,source:packages.d===1n&&(allocation.monthlyDemandUnit||quantityUnit(line))===unit?allocation.monthlyDemandSource||'manual':'derived',demandBase};
  }catch{return {status:'INVALID',qty:null,unit,source:null,demandBase:null};}
}
// Legacy converted rationals remain readable as exact demand; never expose fraction syntax.
export function monthlyQuantityText(line){try{return exactDisplay(toJSON(line.qtyExact?.representation==='rational'?baseQuantity(line):monthlyQuantity(line)));}catch{return String(line.qty??'').includes('/')?'확인 필요':String(line.qty??'');}}
export function currentPurchaseCost(line) {
  try {
    if(!validMonthlyQuantity(line)||!/^[1-9]\d{0,11}$/.test(String(line.price)))return null;
    const packages=round(divide(baseQuantity(line),exact(String(line.pack))),{scale:0,mode:'CEIL'}).decimal;
    return toJSON(multiply(exact(packages),exact(String(line.price))));
  }catch{return null;}
}
export function totalPurchaseCost(lines) {
  if(!lines.length)return null;
  let total=exact('0');for(const line of lines){const value=currentPurchaseCost(line);if(!value)return null;total=add(total,fromRatio(value));}return toJSON(total);
}
export function moneyDisplay(value){try{return BigInt(round(fromRatio(value),{scale:0,mode:'HALF_UP'}).decimal).toLocaleString('ko-KR');}catch{return '확인 필요';}}
// Quantity summaries use decimal text; monetary formatting has its own explicit policy.
export function exactDisplay(value) {
  try {
    const v=fromRatio(value);if(v.d===1n)return v.n.toLocaleString('ko-KR');
    let denominator=v.d,twos=0,fives=0;while(denominator%2n===0n){denominator/=2n;twos++;}while(denominator%5n===0n){denominator/=5n;fives++;}
    if(denominator!==1n)return '확인 필요';
    const scale=Math.max(twos,fives),scaled=v.n*(10n**BigInt(scale)/v.d),negative=scaled<0n;
    const digits=(negative?-scaled:scaled).toString().padStart(scale+1,'0');const whole=digits.slice(0,-scale),fraction=digits.slice(-scale).replace(/0+$/,'');
    return (negative?'-':'')+BigInt(whole).toLocaleString('ko-KR')+(fraction?'.'+fraction:'');
  }catch{return '확인 필요';}
}
// Commas are formatting only. Reject arbitrary punctuation instead of turning 605/3 into6053.
export function numericInput(raw){const text=String(raw??'');if(!/^(?:\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(text))return null;return text.replaceAll(',','').replace(/^0+(?=\d)/,'');}
