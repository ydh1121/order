// Contract rates belong to the enclosing, independently approved supply version.
// Values from the carrier's published pack never participate directly in this calculation.
import {exact,add,multiply,divide,compare,round} from './exact.mjs';
export class PolicyError extends Error {
  constructor(code,status=422){super(code);this.status=status;}
}
const requireValue=(ok,code)=>{if(!ok)throw new PolicyError(code);};
const num=(v,positive=false)=>typeof v==='number' && Number.isFinite(v) && /^\d+(?:\.\d{1,6})?$/.test(String(v)) && v>=0 && v<=1e9 && (!positive || v>0);
const whole=v=>Number.isSafeInteger(v)&&v>0&&v<=1e9;
const money=v=>typeof v==='string'&&/^\d{1,12}(?:\.\d{1,4})?$/.test(v);
const range=(x,min,max)=>(min==null||x>=min)&&(max==null||x<=max);
const label=v=>typeof v==='string'&&v.trim().length>0&&v.length<=140;
const ymd=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00Z'))&&new Date(v+'T00:00Z').toISOString().slice(0,10)===v;
const clock=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const units=['TRAYS','BOXES','KG','M3','PALLETS','KM'];
const statuses=['UNSET','FEE','FREE','CONSULT','UNAVAILABLE'];
const modes=['PARCEL','TRUCK','FREIGHT','DIRECT'];

export function validateCarrierPolicy(p){
  if(p==null)return;
  requireValue(p.schema===1 && ['CHEAPEST','PRIORITY','MANUAL'].includes(p.selection)&&typeof p.splitAllowed==='boolean','FREIGHT_POLICY_INVALID');
  requireValue(Array.isArray(p.contracts)&&p.contracts.length<=24,'FREIGHT_CONTRACTS_INVALID');
  const ids=new Set();
  for(const c of p.contracts){
    requireValue(c && label(c.id)&&!ids.has(c.id)&&label(c.name)&&modes.includes(c.mode)&&typeof c.enabled==='boolean'&&statuses.includes(c.status),'FREIGHT_CONTRACT_INVALID');
    ids.add(c.id);
    requireValue(Number.isSafeInteger(c.priority)&&c.priority>=0&&c.priority<=10000&&units.includes(c.measure),'FREIGHT_CONDITION_INVALID');
    for(const k of ['min','max','distanceKm','capacityKg','capacityM3','maxBoxKg','maxSumCm','maxLongestCm','minSumCm'])requireValue(c[k]==null||num(c[k]),'FREIGHT_LIMIT_INVALID');
    requireValue(c.min==null||c.max==null||c.max>=c.min,'FREIGHT_LIMIT_INVALID');
    requireValue(Array.isArray(c.prefixes)&&c.prefixes.length<=300&&c.prefixes.every(x=>/^\d{2}(?:\d{3}(?:\d{5})?)?$/.test(x)),'FREIGHT_DESTINATION_INVALID');
    requireValue(c.postcode==null||/^\d{5}$/.test(c.postcode),'FREIGHT_DESTINATION_INVALID');
    requireValue(c.start==null||ymd(c.start),'FREIGHT_PERIOD_INVALID');
    requireValue(c.end==null||ymd(c.end)&&(!c.start||c.end>=c.start),'FREIGHT_PERIOD_INVALID');
    requireValue(Array.isArray(c.days)&&c.days.every(x=>Number.isInteger(x)&&x>=0&&x<7)&&(!c.cutoff||/^([01]\d|2[0-3]):[0-5]\d$/.test(c.cutoff)),'FREIGHT_SERVICE_INVALID');
    requireValue(['UNKNOWN','INCLUDED','EXTRA'].includes(c.vat)&&(c.vatPercent==null||money(c.vatPercent)&&Number(c.vatPercent)<=100),'FREIGHT_TAX_INVALID');
    requireValue(Array.isArray(c.rates)&&c.rates.length<=160&&Array.isArray(c.extras)&&c.extras.length<=18,'FREIGHT_ROWS_INVALID');
    requireValue(new Set(c.rates.map(r=>r.id)).size===c.rates.length,'FREIGHT_DUPLICATE_RATE');
    for(const r of c.rates){
      requireValue(label(r.id)&&(r.amount==null||money(r.amount)),'FREIGHT_RATE_INVALID');
      for(const k of ['maxKg','maxCm','maxM3','pointKm','fromKm','toKm'])requireValue(r[k]==null||num(r[k]),'FREIGHT_RATE_INVALID');
      requireValue((r.fromKm==null)===(r.toKm==null)&&(r.fromKm==null||r.fromKm<=r.toKm),'FREIGHT_DISTANCE_INVALID');
    }
    requireValue(c.serviceTime==null||clock(c.serviceTime),'FREIGHT_SERVICE_INVALID');
    requireValue(c.waitMinutes==null||Number.isSafeInteger(c.waitMinutes)&&range(c.waitMinutes,0,10080),'FREIGHT_SERVICE_INVALID');
    requireValue(c.holidays==null||Array.isArray(c.holidays)&&c.holidays.length<=500&&c.holidays.every(ymd),'FREIGHT_SERVICE_INVALID');
    requireValue((c.calendarStart==null||ymd(c.calendarStart))&&(c.calendarEnd==null||ymd(c.calendarEnd))&&(!c.calendarStart||!c.calendarEnd||c.calendarStart<=c.calendarEnd),'FREIGHT_SERVICE_INVALID');
    requireValue(c.percentStack==null||['BASE_ADDITIVE','COMPOUND'].includes(c.percentStack),'FREIGHT_SURCHARGE_INVALID');
    const groups=new Set();
    for(const e of c.extras){
      requireValue(label(e.label)&&['FLAT','PERCENT','PER_BOX','PER_HOUR','QUOTE'].includes(e.type)&&(e.amount==null||money(e.amount)),'FREIGHT_SURCHARGE_INVALID');
      requireValue(e.when==null||['ALWAYS','TIME','WEEKEND_HOLIDAY','WAIT'].includes(e.when),'FREIGHT_SURCHARGE_INVALID');
      requireValue((e.fromTime==null||clock(e.fromTime))&&(e.toTime==null||clock(e.toTime))&&(e.freeMinutes==null||Number.isSafeInteger(e.freeMinutes)&&range(e.freeMinutes,0,10080)),'FREIGHT_SURCHARGE_INVALID');
      requireValue((e.increment==null||[15,30,60].includes(e.increment))&&(e.rounding==null||['UP','DOWN'].includes(e.rounding))&&(e.waitBasis==null||['AFTER_FREE','ALL'].includes(e.waitBasis)),'FREIGHT_SURCHARGE_INVALID');
      if(e.group && e.enabled){requireValue(!groups.has(e.group),'FREIGHT_SURCHARGE_OVERLAP');groups.add(e.group);}
    }
  }
  if(p.manualId!=null)requireValue(ids.has(p.manualId),'FREIGHT_MANUAL_INVALID');
  const pack=p.packing;
  requireValue(pack&&typeof pack.confirmed==='boolean','FREIGHT_PACKING_INVALID');
  for (const k of ['unitsPerBox','boxesPerPallet'])requireValue(pack[k]==null||whole(pack[k]),'FREIGHT_PACKING_INVALID');
  for (const k of ['kgPerBox','m3PerBox','sumCm','longestCm'])requireValue(pack[k]==null||num(pack[k],true),'FREIGHT_PACKING_INVALID');
  if(pack.sumCm!=null&&pack.longestCm!=null)requireValue(pack.longestCm<=pack.sumCm && pack.longestCm>=pack.sumCm/3,'FREIGHT_PACKING_INVALID');
}
function display(v){
  const raw=round(v,{scale:8,mode:'DOWN'}).decimal;
  requireValue(compare(exact(raw),v)===0,'FREIGHT_PRECISION_UNCONFIRMED');
  return raw.replace(/\.?0+$/,'')||'0';
}
function packingFor(q,p){
  if(!p.confirmed||!p.unitsPerBox||!p.kgPerBox||!p.m3PerBox||!p.sumCm||!p.longestCm)return null;
  const boxes=Math.ceil(q/p.unitsPerBox);
  // Use the registered maximum loaded box throughout, including a partly filled final box.
  // Multiplying integer boxes by decimal kg/m³ via rational arithmetic keeps policy boundaries exact.
  const measure=(n)=>Number(display(multiply(exact(String(n)),exact(boxes))));
  return {TRAYS:q,BOXES:boxes,KG:measure(p.kgPerBox),M3:measure(p.m3PerBox),PALLETS:p.boxesPerPallet?Math.ceil(boxes/p.boxesPerPallet):null};
}
function matchedRate(c,pack,load){
  const rows=c.rates.filter(r=>r.zone===c.zone && (!c.vehicle||r.vehicle===c.vehicle));
  if(c.mode==='PARCEL'){
    const matches=rows.filter(r=>r.maxKg!=null&&r.maxCm!=null&&pack.kgPerBox<=r.maxKg&&pack.sumCm<=r.maxCm);
    // A price never determines which published size bracket a box belongs to.
    const least=matches.filter(r=>!matches.some(o=>o!==r&&o.maxKg<=r.maxKg&&o.maxCm<=r.maxCm&&(o.maxKg<r.maxKg||o.maxCm<r.maxCm)));
    return least.length===1?least[0]:null;
  }
  if(c.mode==='TRUCK'){
    if(c.distanceKm==null||!c.vehicle)return null;
    const valid=rows.filter(r=>r.fromKm!=null?range(c.distanceKm,r.fromKm,r.toKm):r.pointKm!=null&&r.pointKm===c.distanceKm);
    return valid.length===1?valid[0]:null;
  }
  if(c.mode==='FREIGHT'){
    const matches=rows.filter(r=>r.maxKg!=null&&r.maxM3!=null&&load.KG<=r.maxKg&&load.M3<=r.maxM3);
    const least=matches.filter(r=>!matches.some(o=>o!==r&&o.maxKg<=r.maxKg&&o.maxM3<=r.maxM3&&(o.maxKg<r.maxKg||o.maxM3<r.maxM3)));
    return least.length===1?least[0]:null;
  }
  return rows.length===1?rows[0]:null;
}
function checkContract(c,items,d,load){
  const serviceDay=d.serviceDate, bookDay=d.local.slice(0,10);
  if(!c.enabled||!c.prefixes.some(pre=>d.region.startsWith(pre))||c.postcode&&c.postcode!==d.zip)return 'OUT_OF_SCOPE';
  if(!c.start||serviceDay<c.start||c.end&&serviceDay>c.end||bookDay<c.start||c.end&&bookDay>c.end)return 'EXPIRED';
  if(!c.days.includes(new Date(serviceDay+'T00:00:00Z').getUTCDay())||c.cutoff&&serviceDay===bookDay&&d.local.slice(11,16)>=c.cutoff)return 'CLOSED';
  if(!c.eggsConfirmed||!c.termsConfirmed||!load)return 'PACKING_OR_CONTRACT_UNCONFIRMED';
  if(c.mode==='TRUCK'&&(!c.capacityKg||!c.capacityM3||!['ONE_WAY','ROUND_TRIP'].includes(c.trip))||c.capacityKg!=null&&load.KG>c.capacityKg||c.capacityM3!=null&&load.M3>c.capacityM3)return 'CAPACITY_UNAVAILABLE';
  if(items.some(({pack:p})=>c.maxBoxKg!=null&&p.kgPerBox>c.maxBoxKg || c.minSumCm!=null&&p.sumCm<c.minSumCm || c.maxSumCm!=null&&p.sumCm>c.maxSumCm || c.maxLongestCm!=null&&p.longestCm>c.maxLongestCm))return 'CAPACITY_UNAVAILABLE';
  const amount=c.measure==='KM'?c.distanceKm:load[c.measure];
  if(amount==null||!range(amount,c.min,c.max))return 'VOLUME_OUT_OF_SCOPE';
  if(!['FEE','FREE'].includes(c.status))return c.status;
  if(c.vat==='UNKNOWN'||c.vat==='EXTRA'&&c.vatPercent==null)return 'TAX_UNCONFIRMED';
  return null;
}
// null means an execution fact or a settlement rule still needs a separate quote.
function extraFactor(e,c,day){
  if(e.when==='TIME'){
    if(!clock(c.serviceTime)||!clock(e.fromTime)||!clock(e.toTime)||e.fromTime===e.toTime)return null;
    const time=c.serviceTime;
    const inside=e.fromTime<e.toTime?time>=e.fromTime&&time<e.toTime:time>=e.fromTime||time<e.toTime;
    if(!inside)return 0;
  }
  if(e.when==='WEEKEND_HOLIDAY'){
    const weekday=new Date(day+'T00:00Z').getUTCDay();
    if(weekday!==0&&weekday!==6){
      if(!c.calendarStart||day<c.calendarStart||!c.calendarEnd||day>c.calendarEnd||!Array.isArray(c.holidays))return null;
      if(!c.holidays.includes(day))return 0;
    }
  }
  if(e.when==='WAIT'||e.type==='PER_HOUR'){
    if(c.waitMinutes==null||e.freeMinutes==null)return null;
    if(c.waitMinutes<=e.freeMinutes)return 0;
    if(e.type!=='PER_HOUR')return 1;
    if(!e.increment||!e.rounding||!e.waitBasis)return null;
    const duration=e.waitBasis==='ALL'?c.waitMinutes:c.waitMinutes-e.freeMinutes;
    const increments=e.rounding==='UP'?Math.ceil(duration/e.increment):Math.floor(duration/e.increment);
    return increments*e.increment/60;
  }
  return 1;
}
function priceCandidate(c,items,load,day){
  const rated=c.mode==='PARCEL'?items.map(item=>({rate:matchedRate(c,item.pack,load),count:item.load.BOXES})):
    [{rate:matchedRate(c,items[0].pack,load),count:1}];
  if(rated.some(({rate})=>!rate&&(c.status!=='FREE'||c.mode!=='DIRECT')||c.status!=='FREE'&&rate?.amount==null))return 'SEPARATE_QUOTE';
  let base=exact(0);
  if(c.status!=='FREE')for(const {rate,count} of rated)base=add(base,multiply(exact(rate.amount),exact(count)));
  let extra=exact(0);
  const applied=[];let percentageCount=0,percentageBasis=base;
  for(const e of c.extras.filter(e=>e.enabled)){
    const units=extraFactor(e,c,day);
    if(units===0)continue;
    if(units==null||e.type==='QUOTE'||e.amount==null)return 'SEPARATE_QUOTE';
    if(e.type==='PERCENT'&&++percentageCount>1&&!c.percentStack)return 'SEPARATE_QUOTE';
    const factor=e.type==='PERCENT'?divide(percentageBasis,exact(100)):exact(String(e.type==='PER_BOX'?load.BOXES:units));
    const value=multiply(exact(e.amount),factor);
    if(e.type==='PERCENT'&&c.percentStack==='COMPOUND')percentageBasis=add(percentageBasis,value);
    extra=add(extra,value);applied.push({label:e.label,charge:display(value)});
  }
  const subtotal=add(base,extra);
  const tax=c.vat==='EXTRA'?divide(multiply(subtotal,exact(c.vatPercent)),exact(100)):exact(0);
  return {id:c.id,name:c.name,mode:c.mode,priority:c.priority,status:c.status,source:c.source??null,rateIds:rated.map(({rate})=>rate?.id??null),
    base:display(base),extras:applied,surcharge:display(extra),vat:display(tax),total:display(add(subtotal,tax)),distanceKm:c.distanceKm??null,vehicle:c.vehicle??null};
}
export function selectCarrier(p,d){
  const items=(d.items??[{qty:d.qty,pack:p.packing}]).map(item=>({...item,load:packingFor(item.qty,item.pack)}));
  let load=null;
  if(items.length&&items.every(item=>item.load)){
    load={};
    for(const key of ['TRAYS','BOXES','KG','M3','PALLETS']){
      load[key]=items.every(item=>item.load[key]!=null)?Number(display(items.reduce((acc,item)=>add(acc,exact(String(item.load[key]))),exact(0)))):null;
    }
  }
  const candidates=[],excluded=[];
  const local=new Date(Date.parse(d.asOf)+9*3600_000).toISOString();
  for(const c of p.contracts){
    const reason=checkContract(c,items,{...d,local},load);
    const result=reason||priceCandidate(c,items,load,d.serviceDate);
    if(typeof result==='string')excluded.push({id:c.id,name:c.name,reason:result});else candidates.push(result);
  }
  const rank=(a,b)=>a.priority-b.priority||(a.id<b.id?-1:a.id>b.id?1:0);
  const cheapest=[...candidates].sort((a,b)=>compare(exact(a.total),exact(b.total))||rank(a,b));
  const selected=p.selection==='MANUAL'?candidates.find(c=>c.id===p.manualId&&label(p.manualReason)):p.selection==='PRIORITY'?[...candidates].sort(rank)[0]:cheapest[0];
  if(!selected){
    const error=new PolicyError(p.selection==='MANUAL'?'FREIGHT_MANUAL_INELIGIBLE':'FREIGHT_QUOTE_REQUIRED');
    error.candidates=excluded;throw error;
  }
  return {selection:p.selection,reason:p.selection==='MANUAL'?p.manualReason:null,
    chosen:selected,candidates,excluded,load,difference:display(add(exact(selected.total),multiply(exact(-1),exact(cheapest[0].total))))};
}
