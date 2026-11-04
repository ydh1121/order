// MSG0540 approved estimate contract. Exact integers are retained throughout;
// these estimates never constitute a supplier delivery commitment.
export const APPROVED_SCHEDULE_VERSION='0540';
export const APPROVED_PERIODS=Object.freeze(['협의','매주','2주','매월']);
const number=value=>/^[0-9]{1,12}$/.test(String(value??''))?BigInt(value):null;
const positive=value=>{const n=number(value);return n!==null&&n>0n?n:null;};
const rounded=(n,d)=>(n*2n+d)/(d*2n);
export function monthlyEstimate(monthly,quantity){
 const M=positive(monthly),Q=positive(quantity);
 if(M===null||Q===null||Q>M)return {valid:false,text:'—'};
 const count=rounded(M,Q),exact=M%Q===0n;
 return {valid:true,count:String(count),exact,text:`월 ${exact?'':'약 '}${count.toLocaleString('ko-KR')}회`};
}
export function classifyCadence(monthly,quantity){
 const M=positive(monthly),Q=positive(quantity);
 if(M===null||Q===null||Q>M)return '협의';
 if(M===Q)return '매월';
 if(M>=Q*12n&&M<=Q*22n)return '매주';
 if(M*2n>=Q*3n&&M*2n<=Q*5n)return '2주';
 return '협의';
}
export function weeklyEstimate(monthly,quantity,asOfLocalDate){
 const M=positive(monthly),Q=positive(quantity),parts=/^(\d{4})-(\d{2})-\d{2}$/.exec(asOfLocalDate||'');
 if(M===null||Q===null||Q>M||!parts)return {valid:false,text:'—'};
 const year=Number(parts[1]),month=Number(parts[2]);if(month<1||month>12)return {valid:false,text:'—'};
 const days=new Date(Date.UTC(year,month,0)).getUTCDate(),n=M*7n,d=Q*BigInt(days),raw=rounded(n,d),count=Number(raw<1n?1n:raw>7n?7n:raw),exact=n%d===0n;
 return {valid:true,count,exact,days,text:`${exact?'':'약 '}${count}회`,ratio:{numerator:String(n),denominator:String(d)}};
}
export function availableCadences(monthly,quantity,repeat={}){
 const candidate=repeat.period==='매월'?repeat.monthlyMemory?.quantity??quantity:quantity;
 return APPROVED_PERIODS.filter(period=>period==='협의'||(period==='매월'?positive(monthly)!==null:classifyCadence(monthly,candidate)===period));
}
export function quantityIssue({monthly,quantity,min='',max='',variable=false,unit='판'}){
 const M=number(monthly),Q=number(quantity),a=number(min),b=number(max);
 const issue=(field,code,message)=>({valid:false,field,code,message});
 if(String(monthly??'')==='')return issue('monthly','MONTHLY_REQUIRED','월 주문 수량을 입력해 주세요.');
 if(M===null||M<=0n)return issue('monthly','MONTHLY_POSITIVE',`월 수량은 1${unit} 이상이어야 합니다.`);
 if(String(quantity??'')==='')return issue('base','QUANTITY_REQUIRED','회당 주문 수량을 입력해 주세요.');
 if(Q===null||Q<=0n)return issue('base','QUANTITY_POSITIVE',`회당 수량은 1${unit} 이상이어야 합니다.`);
 if(Q>M)return issue('base','QUANTITY_ABOVE_MONTHLY','회당 수량이 월 수량보다 큽니다.');
 if(variable){
  if(String(min??'')==='')return issue('min','MIN_REQUIRED','최소 수량을 입력해 주세요.');
  if(a===null||a<=0n)return issue('min','MIN_POSITIVE',`최소 수량은 1${unit} 이상이어야 합니다.`);
  if(String(max??'')==='')return issue('max','MAX_REQUIRED','최대 수량을 입력해 주세요.');
  if(b===null||b<=0n)return issue('max','MAX_POSITIVE',`최대 수량은 1${unit} 이상이어야 합니다.`);
  if(a>b)return issue('min','RANGE_REVERSED','최소 수량이 최대 수량보다 큽니다.');
  if(Q<a)return issue('min','Q_BELOW_MIN','최소 수량이 회당 수량보다 큽니다.');
  if(Q>b)return issue('max','Q_ABOVE_MAX','최대 수량이 회당 수량보다 작습니다.');
 }
 return {valid:true};
}
export function fixedFrequencyPresentation(input){
 const issue=quantityIssue(input);
 if(!issue.valid){const both=String(input.monthly??'')===''&&String(input.quantity??'')==='';return {valid:false,text:both?'수량 입력 필요':issue.field==='monthly'&&issue.code==='MONTHLY_REQUIRED'?'월 수량 입력':issue.code==='QUANTITY_REQUIRED'?'회당 수량 입력':['min','max'].includes(issue.field)?'최소·최대 확인':'수량 확인 필요',issue};}
 return {...monthlyEstimate(input.monthly,input.quantity),issue};
}
export function cadenceForPeriod(period,previous={}){
 const date=previous?.preferredDate||'',base={version:'3.0.0',preferredDate:date,nominalAnchor:date};
 if(period==='협의')return {...base,kind:'CONSULT'};
 if(period==='매주')return {...base,kind:'WEEKLY'};
 if(period==='2주')return {...base,kind:'INTERVAL_DAYS',intervalDays:14};
 return {...base,kind:'MONTHLY',dayRule:previous?.kind==='MONTHLY'?previous.dayRule:''};
}
/** A pure draft transaction. A monthly edit never rewrites the per-order value. */
export function editQuantityCadence({repeat={},monthly,quantity,field,value,asOfLocalDate,clampDirect=true}){
 const next=structuredClone(repeat),M=String(field==='monthly'?value:monthly??''),rawQ=String(field==='base'?value:quantity??'');
 let Q=rawQ,adjusted=false;
 if(clampDirect&&field==='base'&&positive(M)!==null&&positive(Q)!==null&&BigInt(Q)>BigInt(M)){Q=M;adjusted=true;}
 const period=classifyCadence(M,Q),previousDate=repeat.period==='매월'&&period!=='매월'&&repeat.monthlyMemory?.preferredDate!==undefined?{...next.cadence,preferredDate:repeat.monthlyMemory.preferredDate}:next.cadence;next.period=period;next.cadence=cadenceForPeriod(period,previousDate);next.semantics='cadence-v3';next.quantityEditVersion=APPROVED_SCHEDULE_VERSION;next.legacyReviewRequired=false;
 if(field==='base')delete next.monthlyMemory;
 if(period==='매주')next.frequency=repeat.period===period&&['협의',''].includes(repeat.frequency)?repeat.frequency:weeklyEstimate(M,Q,asOfLocalDate).text;
 else if(period==='2주')next.frequency='1회';
 else if(period==='협의')next.frequency='협의';
 return {repeat:next,monthly:M,quantity:Q,adjusted};
}
export function selectCadence({repeat={},monthly,quantity,period,asOfLocalDate}){
 if(!availableCadences(monthly,quantity,repeat).includes(period))return {accepted:false,repeat:structuredClone(repeat),quantity:String(quantity??'')};
 const next=structuredClone(repeat);let Q=String(quantity??''),adjusted=false;
 if(period==='매월'&&repeat.period!=='매월'){
  next.monthlyMemory={quantity:Q,period:APPROVED_PERIODS.includes(repeat.period)&&repeat.period!=='매월'?repeat.period:'협의',frequency:String(repeat.frequency??''),preferredDate:repeat.cadence?.preferredDate||''};Q=String(monthly);adjusted=true;
 }else if(period!=='매월'&&repeat.period==='매월'&&repeat.monthlyMemory){Q=String(repeat.monthlyMemory.quantity);delete next.monthlyMemory;}
 next.period=period;next.cadence=cadenceForPeriod(period,repeat.period==='매월'&&period!=='매월'&&repeat.monthlyMemory?.preferredDate!==undefined?{...next.cadence,preferredDate:repeat.monthlyMemory.preferredDate}:next.cadence);next.semantics='cadence-v3';next.quantityEditVersion=APPROVED_SCHEDULE_VERSION;next.legacyReviewRequired=false;
 if(period==='매주')next.frequency=repeat.period==='매월'&&repeat.monthlyMemory?.period===period&&['협의',''].includes(repeat.monthlyMemory.frequency)?repeat.monthlyMemory.frequency:weeklyEstimate(monthly,Q,asOfLocalDate).text;
 else if(period==='2주')next.frequency='1회';else if(period==='협의')next.frequency='협의';
 return {accepted:true,repeat:next,quantity:Q,adjusted};
}
export function weekdayState(repeat){
 const selected=Object.keys(repeat.weekdays||{}).filter(key=>repeat.weekdays[key]);
 const order=[...new Set([...(repeat.weekdayOrder||[]).filter(key=>selected.includes(key)),...selected])];
 const match=/^(?:약\s*)?([1-7])회$/.exec(repeat.frequency||''),fixed=repeat.frequency!=='협의'&&!!match,limit=fixed?Number(match[1]):7;
 const excess=repeat.weeklyCheck?order.slice(limit):[];
 return {order,limit,fixed,excess,over:excess.length>0,count:order.length,atLimit:order.length>=limit};
}
