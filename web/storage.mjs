/** Confirmed Q1–Q4 persistence. All writers must share the origin's Web Lock.
 * Domain validity, DNS, UI drafts and delivery approval remain outside storage.
 * Address provenance records the selected provider result, not a live validation.
 */
import {isVerifiedAddress} from './address-contract.mjs';
import {inspectCadence} from './cadence-contract.mjs';
export const STORAGE_SCHEMA_VERSION=7;
export const STORAGE_KEY='order_q1_q4_v1';
export const STORAGE_LOCK='order-q1-q4-storage';
export const LEGACY_KEYS=Object.freeze(['order_v015R2_draft','order_v015R1_draft']);
const MAX_BYTES=2_000_000,MAX_ROWS=500,MAX_RECEIPTS=128;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&[Object.prototype,null].includes(Object.getPrototypeOf(v));
const fail=(path,reason='TYPE')=>{throw Object.assign(new Error(reason),{path,reason});};
const text=(max=4096)=>(v,p)=>typeof v==='string'&&v.length<=max?v:fail(p);
const boolean=(v,p)=>typeof v==='boolean'?v:fail(p);
const integer=(v,p)=>Number.isSafeInteger(v)&&v>=0?v:fail(p);
const nullable=fn=>(v,p)=>v===null?null:fn(v,p);
const oneOf=values=>(v,p)=>values.includes(v)?v:fail(p,'ENUM');
const list=(fn,max=MAX_ROWS)=>(v,p)=>Array.isArray(v)&&v.length<=max?v.map((x,i)=>fn(x,p+'.'+i)):fail(p,'ARRAY');
const id=(v,p)=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f\u007f]/.test(v)?v:fail(p,'ID');
const omit=()=>undefined;
function object(spec,required=[]){return (v,p)=>{
 if(!plain(v))fail(p,'OBJECT');const out={};
 for(const key of Object.keys(v)){if(!Object.hasOwn(spec,key))fail(p+'.'+key,'UNKNOWN_FIELD');if(v[key]!==undefined){const value=spec[key](v[key],p+'.'+key);if(value!==undefined)out[key]=value;}}
 for(const key of required)if(!Object.hasOwn(out,key))fail(p+'.'+key,'REQUIRED');return out;
};}
const raw=text(2048),short=text(128),unit=oneOf(['each','tray','pack']),mode=oneOf(['FLEX','FIXED','ONCE']);
const days=list(oneOf(['월','화','수','목','금','토','일']),7);
const contact=object({phone:boolean,sms:boolean,kakao:boolean,email:boolean});
const weekPlans=list(object({weekdays:days},['weekdays']),52);
const weekdays=(v,p)=>{if(!plain(v)||Object.keys(v).length>364)fail(p);const out={};for(const [key,value]of Object.entries(v)){if(!/^([1-9]|[1-4][0-9]|5[0-2]):[월화수목금토일]$/.test(key))fail(p+'.'+key,'WEEKDAY');out[key]=boolean(value,p+'.'+key);}return out;};
const datePart=(v,p)=>v===''?'':integer(v,p);
const deliveryDate=object({year:datePart,month:datePart,day:datePart});
const holiday=object({days,none:boolean,irregular:boolean,closed:short,conflict:short,weekend:short,holiday:short,subholiday:short,request:text(4096)});
const approvedQuantity=(v,p)=>typeof v==='string'&&/^\d{0,12}$/.test(v)?v:fail(p,'QUANTITY_DIGITS');
const weekdayKey=oneOf(['1:월','1:화','1:수','1:목','1:금','1:토','1:일']);
const weekdayOrder=(v,p)=>{const out=list(weekdayKey,7)(v,p);if(new Set(out).size!==out.length)fail(p,'DUPLICATE_WEEKDAY');return out;};
const monthlyMemory=object({quantity:approvedQuantity,period:oneOf(['협의','매주','2주']),frequency:short,preferredDate:(v,p)=>civilDate(v,p)},['quantity','period','frequency']);
const repeat=object({period:short,frequency:short,date:short,dateMode:short,weeklyCheck:boolean,weekdays,weekOpen:integer,semantics:nullable(short),legacyReviewRequired:boolean,
 legacyOriginal:object({cycleCount:integer,freq:integer,intervalWeeks:integer,weekPlans}),cadence:(v,p)=>v===null?null:draftCadence(v,p),weekdayOrder,monthlyMemory:nullable(monthlyMemory),quantityEditVersion:oneOf(['0540'])});
const ratio=object({representation:oneOf(['rational']),conversionReviewed:boolean,numerator:short,denominator:short},['representation','numerator','denominator']);
const monthlyExact=object({raw,unit,representation:oneOf(['rational']),conversionReviewed:boolean,numerator:short,denominator:short,phase:omit,composing:omit},['raw','unit','representation']);
const packageRaw=(v,p)=>typeof v==='string'&&/^[1-9]\d{0,127}$/.test(v)?v:fail(p,'POSITIVE_INTEGER_PACKAGE');
const optionalPackageRaw=(v,p)=>v===''?'':packageRaw(v,p);
const packageUnit=oneOf(['tray','pack']);
const positiveInteger=(v,p)=>Number.isSafeInteger(v)&&v>0?v:fail(p,'POSITIVE_INTEGER');
const nominalVisits=(v,p)=>v===''?'':BigInt(packageRaw(v,p))<=366n?v:fail(p,'VISIT_COUNT');
const civilDate=(v,p)=>{if(v==='')return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail(p,'DATE');const [year,month,day]=v.split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0),length=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];if(year<1||month<1||month>12||day<1||day>length)fail(p,'DATE');return v;};
// A v2 cadence records an explicit user selection. Legacy repeat fields retain
// their original meaning until that selection; storage never infers a cadence.
const cadenceShape=object({version:oneOf(['2.0.0','2.1.0','3.0.0']),kind:oneOf(['CONSULT','WEEKLY','INTERVAL_DAYS','MONTHLY']),intervalDays:oneOf([14,21]),dayRule:(v,p)=>v==='last'||Number.isInteger(v)&&v>=1&&v<=31?v:fail(p,'DAY_RULE'),preferredDate:civilDate,nominalAnchor:civilDate},['version','kind','preferredDate']);
const cadence=(v,p)=>{const out=cadenceShape(v,p),checked=inspectCadence(out);if(!checked.valid)fail(p,checked.code);return out;};
// Inactive FIXED input is a committed draft, not a completed recurrence.
// A deliberately cleared monthly rule must not block a valid FLEX/ONCE save.
// Its selected anchor remains draft input; it never supplies a replacement rule.
const draftCadence=(v,p)=>{if(plain(v)&&v.kind==='MONTHLY'&&v.dayRule===''){const date=['2.1.0','3.0.0'].includes(v.version)?civilDate(v.nominalAnchor,p+'.nominalAnchor'):civilDate(v.preferredDate,p+'.preferredDate'),checked=cadence({...v,dayRule:date?Number(date.slice(-2)):1},p);return {...checked,dayRule:''};}return cadence(v,p);};
const planningReference=object({year:(v,p)=>Number.isInteger(v)&&v>=1&&v<=9999?v:fail(p,'YEAR'),month:(v,p)=>Number.isInteger(v)&&v>=1&&v<=12?v:fail(p,'MONTH'),anchorDate:civilDate,nominal:boolean},['year','month','anchorDate','nominal']);
const deliveryPlanShape=object({version:oneOf(['1.0.0']),monthlyPlan:packageRaw,visits:positiveInteger,unit:packageUnit,distribution:list(object({quantity:packageRaw,visits:positiveInteger},['quantity','visits']),366),range:object({min:packageRaw,max:packageRaw},['min','max']),reference:planningReference,inputSignature:text(32768),source:oneOf(['derived']),reviewed:oneOf([true])},['version','monthlyPlan','visits','unit','distribution','reference','source','reviewed']);
const deliveryPlan=(v,p)=>{const out=deliveryPlanShape(v,p);if(out.visits>366||!out.distribution.length)fail(p,'VISIT_COUNT');let visits=0,total=0n;for(const row of out.distribution){visits+=row.visits;total+=BigInt(row.quantity)*BigInt(row.visits);if(out.range&&(BigInt(row.quantity)<BigInt(out.range.min)||BigInt(row.quantity)>BigInt(out.range.max)))fail(p,'PLAN_OUTSIDE_RANGE');}if(visits!==out.visits||total!==BigInt(out.monthlyPlan))fail(p,'PLAN_TOTAL_MISMATCH');if(out.range&&BigInt(out.range.min)>BigInt(out.range.max))fail(p,'PLAN_RANGE');if(new Set(out.distribution.map(row=>row.quantity)).size>1&&!out.range)fail(p,'VARIABLE_RANGE_REQUIRED');return out;};
const advanced=object({contactChannels:list(oneOf(['phone','sms','kakao','email']),4),orderProcess:short,fixedOrderProcess:short,flexOrderProcess:short,storeOffDays:days,storeOffNone:boolean,storeOffIrregular:boolean,storeOffPolicy:short,weekend:short,holiday:short,substituteHoliday:short,memo:text(4096)});
const requiredCivilDate=(v,p)=>v===''?fail(p,'DATE_REQUIRED'):civilDate(v,p);
const startDateReview=object({version:oneOf(['1.0.0']),lifecycle:oneOf(['NEW','STARTED','LEGACY']),asOfLocalDate:requiredCivilDate,holidayVersion:short,policyVersion:short},['version','lifecycle','asOfLocalDate']);
const review=object({asOfLocalDate:requiredCivilDate,startDateReview,version:oneOf(['0460']),pack:short,profile:oneOf(['FLEX','FIXED','ONCE','MIXED']),activeHoliday:holiday,activeRepeat:repeat,deliveryDate,
 common:object({contact,process:short,quality:boolean,holiday,repeat}),
 // This is committed inactive-mode input, not the live modal's working draft.
 draft:object({mode,process:short,values:object({base:raw,monthly:raw,min:raw,max:raw,once:raw}),variable:boolean,contact,holiday,repeat,quality:boolean})},['version']);
const line=object({id,housing:short,size:short,pack:short,qty:raw,qtyUnit:unit,qtyDisplayUnit:unit,price:raw,qtyExact:ratio},['id','housing','size','pack','qty','price']);
const locationSpec={id,name:text(1024),road:text(4096),postal:short,detail:text(4096),jibun:text(4096),region:text(1024),providerId:text(1024),contactPhone:raw,email:raw,storePhone:raw,addressState:short,basicInfoDraft:boolean,
 status:omit,emailDomainState:omit,mailboxVerified:omit,dns:omit,dnsResult:omit,validation:omit};
const legacyLocation=object(locationSpec,['id','name']);
const selectedLocation=object({...locationSpec,dropoff:text(4096),addressProvider:oneOf(['','JUSO','KAKAO'])},['id','name']);
const location=(value,path)=>{const out=selectedLocation(value,path);if(['JUSO','KAKAO'].includes(out.addressProvider)&&!isVerifiedAddress(out))fail(path,'INVALID_PROVIDER_SELECTION');return out;};
const allocationSpec={id,lineId:id,locationId:id,qty:raw,mode,modeExplicit:boolean,freq:integer,days,intervalWeeks:integer,cycleCount:integer,scheduleDetail:short,weekPlans,qtySource:short,variableQty:boolean,qtyMin:raw,qtyMax:raw,qualityTest:boolean,oneTimeDeliveryQty:raw,deliveryQtyUnit:unit,monthlyDemandQty:raw,monthlyDemandUnit:unit,monthlyDemandSource:oneOf(['manual','derived']),monthlyDemandExact:monthlyExact,repeatSemantics:short,frequencyPerWeek:nullable(integer),monthDay:(v,p)=>typeof v==='number'?integer(v,p):short(v,p),advanced,q4Review:review,onceConfirmedFingerprint:text(32768),cycleAnchorDate:short,calendarPolicy:object({kind:short},['kind']),monthlyAllocationContract:short,
 suggestedQty:omit,monthlyAllocationComplete:omit,monthlyAllocationDraftRevision:omit};
const legacyAllocation=object(allocationSpec,['id','lineId','locationId']);
const currentAllocationShape=object({...allocationSpec,monthlyPlanQty:optionalPackageRaw,monthlyPlanUnit:packageUnit,monthlyPlanSource:oneOf(['manual','derived']),monthlyDemandBasis:oneOf(['known','residual','single-total','package-plan','unknown']),cadence:nullable(cadence),planningReference,nominalVisitCount:nominalVisits,deliveryPlan},['id','lineId','locationId']);
const allocation=(v,p)=>{const out=currentAllocationShape(v,p);if(out.cadence?.version==='3.0.0'){for(const key of ['qty','qtyMin','qtyMax','monthlyPlanQty'])if(Object.hasOwn(out,key))approvedQuantity(out[key],p+'.'+key);}const planFields=['monthlyPlanQty','monthlyPlanUnit','monthlyPlanSource','monthlyDemandBasis'];if(planFields.some(key=>Object.hasOwn(out,key))){if(planFields.some(key=>!Object.hasOwn(out,key))||out.monthlyAllocationContract!=='2.0.0')fail(p,'PACKAGE_CONTRACT_INCOMPLETE');const known=['known','residual','single-total'].includes(out.monthlyDemandBasis);if(known&&(!out.monthlyDemandQty||out.monthlyDemandUnit!=='each'||!out.monthlyDemandSource))fail(p,'DEMAND_REQUIRED');if(!known&&out.monthlyDemandQty!=='')fail(p,'UNKNOWN_DEMAND_MUST_STAY_EMPTY');if(known){const value=out.monthlyDemandQty;if(!/^[1-9]\d*$/.test(value)&&!(out.monthlyDemandExact?.conversionReviewed===true&&out.monthlyDemandExact.raw===value&&out.monthlyDemandExact.unit==='each'&&/^\d+\/[1-9]\d*$/.test(value)))fail(p,'DEMAND_SYNTAX');}if(['residual','single-total'].includes(out.monthlyDemandBasis)&&out.monthlyDemandSource!=='derived')fail(p,'RESIDUAL_PROVENANCE');if(out.qtySource!==undefined&&!['user','auto'].includes(out.qtySource))fail(p,'QUANTITY_SOURCE');}return out;};
const bodyCheckpoint=object({version:oneOf(['1.0.0']),q1Selection:object({id,housing:oneOf(['','1','2','3','4']),size:oneOf(['','왕란','특란','대란','중란','소란']),pack:oneOf(['','10','20','30'])},['id','housing','size','pack'])},['version','q1Selection']);
const payloadShape=(schemaVersion=STORAGE_SCHEMA_VERSION)=>object({bodyCheckpoint,lines:list(line),current:nullable(id),locations:list(schemaVersion<3?legacyLocation:location),allocations:list(schemaVersion<4?legacyAllocation:allocation),open:oneOf(['','q1','q2','q3','q4']),allocationRevision:integer,
 stage:omit,errorExposure:omit,validation:omit,dnsCache:omit,pendingRequests:omit},['lines','locations','allocations']);
export const emptyStoredPayload=()=>({lines:[],current:null,locations:[],allocations:[],open:'q1',allocationRevision:0});
function canonical(value){return Array.isArray(value)?'['+value.map(canonical).join(',')+']':plain(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);}
const clone=value=>JSON.parse(JSON.stringify(value));
/** Structural validation and explicit exclusion of transient evidence. No input coercion. */
export function projectStoredPayload(input){
 return projectPayload(input,STORAGE_SCHEMA_VERSION);
}
function projectPayload(input,schemaVersion){
 if(schemaVersion<7){
  if(Array.isArray(input?.locations))for(const [i,row]of input.locations.entries())if(row?.addressProvider==='KAKAO')fail('data.locations.'+i+'.addressProvider','UNKNOWN_FIELD');
  if(Array.isArray(input?.allocations))for(const [i,row]of input.allocations.entries()){
   const repeats=[row?.q4Review?.activeRepeat,row?.q4Review?.common?.repeat,row?.q4Review?.draft?.repeat];
   for(const value of [row?.cadence,...repeats.map(repeat=>repeat?.cadence)])if(value?.version==='3.0.0')fail('data.allocations.'+i+'.cadence','UNKNOWN_FIELD');
   for(const repeat of repeats)if(repeat&&['weekdayOrder','monthlyMemory','quantityEditVersion'].some(key=>Object.hasOwn(repeat,key)))fail('data.allocations.'+i+'.repeat','UNKNOWN_FIELD');
  }
 }
 if(schemaVersion<6){
  if(input&&Object.hasOwn(input,'bodyCheckpoint'))fail('data.bodyCheckpoint','UNKNOWN_FIELD');
  if(Array.isArray(input?.allocations))for(const [i,row]of input.allocations.entries()){
   if(row?.q4Review&&['asOfLocalDate','startDateReview'].some(key=>Object.hasOwn(row.q4Review,key)))fail('data.allocations.'+i+'.q4Review','UNKNOWN_FIELD');
   for(const value of [row?.cadence,row?.q4Review?.activeRepeat?.cadence,row?.q4Review?.common?.repeat?.cadence,row?.q4Review?.draft?.repeat?.cadence])if(value&&(value.version==='2.1.0'||Object.hasOwn(value,'nominalAnchor')))fail('data.allocations.'+i+'.cadence','UNKNOWN_FIELD');
  }
 }
 if(schemaVersion<5&&Array.isArray(input?.allocations))for(const [i,row]of input.allocations.entries()){
  if(Object.hasOwn(row,'cadence')||[row.q4Review?.activeRepeat,row.q4Review?.common?.repeat,row.q4Review?.draft?.repeat].some(repeat=>repeat&&Object.hasOwn(repeat,'cadence')))fail('data.allocations.'+i+'.cadence','UNKNOWN_FIELD');
 }
 const result=payloadShape(schemaVersion)(input,'data');
 if(result.bodyCheckpoint&&result.lines.length)fail('data.bodyCheckpoint','BODY_CHECKPOINT_NOT_INITIAL');
 const unique=(rows,field)=>{const set=new Set(rows.map(row=>row.id));if(set.size!==rows.length)fail('data.'+field,'DUPLICATE_ID');return set;};
 const lines=unique(result.lines,'lines'),sites=unique(result.locations,'locations');unique(result.allocations,'allocations');
 const pairs=new Set();for(const row of result.allocations){if(!lines.has(row.lineId)||!sites.has(row.locationId))fail('data.allocations','ORPHAN_REFERENCE');const pair=JSON.stringify([row.lineId,row.locationId]);if(pairs.has(pair))fail('data.allocations','DUPLICATE_ASSIGNMENT');pairs.add(pair);if(row.mode==='FIXED'&&row.cadence&&row.q4Review?.activeRepeat?.cadence&&canonical(row.cadence)!==canonical(row.q4Review.activeRepeat.cadence))fail('data.allocations','CADENCE_CONTRACT_MISMATCH');if(row.monthlyAllocationContract==='2.0.0'){const sku=result.lines.find(line=>line.id===row.lineId),unit=String(sku.pack)==='30'?'tray':['10','20'].includes(String(sku.pack))?'pack':null;if(!unit||row.monthlyPlanUnit!==unit)fail('data.allocations','PACKAGE_UNIT');if((schemaVersion<5||row.mode==='FIXED'&&!row.cadence)&&row.deliveryPlan&&(row.deliveryPlan.unit!==unit||row.deliveryPlan.monthlyPlan!==row.monthlyPlanQty||row.deliveryPlan.distribution.length>1&&!row.variableQty||row.deliveryPlan.range&&(!row.variableQty||row.deliveryPlan.range.min!==row.qtyMin||row.deliveryPlan.range.max!==row.qtyMax)||row.planningReference&&canonical(row.deliveryPlan.reference)!==canonical(row.planningReference)))fail('data.allocations','DELIVERY_PLAN_CONTRACT');}}
 result.current??=null;if(result.current!==null&&!lines.has(result.current))fail('data.current','ORPHAN_REFERENCE');result.open??='q1';result.allocationRevision??=0;
 if(new TextEncoder().encode(JSON.stringify(result)).length>MAX_BYTES)fail('data','SIZE_LIMIT');return result;
}
const legacyNumber=(value,path)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):raw(value,path);
function migrateLegacy(input,key){
 if(!plain(input))fail('legacy','OBJECT');if('schemaVersion'in input||'version'in input)fail('legacy','UNSUPPORTED_VERSION');
 const r1=key===LEGACY_KEYS[1],source=clone(input);
 if(!Array.isArray(source.lines))fail('legacy.lines','REQUIRED');
 source.lines=source.lines.map((row,i)=>{if(!plain(row))fail('legacy.lines','OBJECT');const next={...row};if(r1&&!next.id)next.id='legacy-r1-line-'+(i+1);for(const field of ['qty','price'])next[field]=legacyNumber(next[field]??'',`legacy.lines.${i}.${field}`);next.qtyUnit??=String(next.pack)==='30'?'tray':'pack';return next;});
 if(r1&&Object.hasOwn(source,'address')){
  if(source.locations?.length||source.allocations?.length)fail('legacy','AMBIGUOUS_ADDRESS');
  const address=source.address;const delivery=object({mode,freq:integer,days},[])(source.delivery??{},'legacy.delivery');
  if(!plain(address))fail('legacy.address','OBJECT');
  const site=legacyLocation({...address,id:address.id||'legacy-r1-site-1',name:address.name||'기본 사업장'},'legacy.address');
  const populated=['name','road','postal','detail','jibun','region','providerId','contactPhone','email','storePhone'].some(field=>typeof address[field]==='string'&&address[field].trim()!=='');
  if(!populated&&source.lines.some(row=>row.drop!==undefined&&row.drop!==''))fail('legacy.drop','ADDRESS_REQUIRED');
  source.locations=populated?[site]:[];source.allocations=populated?source.lines.map((row,i)=>({id:'legacy-r1-allocation-'+(i+1),lineId:row.id,locationId:site.id,qty:legacyNumber(row.drop??'','legacy.drop'),mode:delivery.mode||'FLEX',freq:delivery.freq??1,days:delivery.days??[]})):[];
  delete source.address;delete source.delivery;
 }
 if(r1)for(const row of source.lines){if(Object.hasOwn(row,'drop')){legacyNumber(row.drop,'legacy.drop');delete row.drop;}}
 if(source.locations===undefined)source.locations=[];if(source.allocations===undefined)source.allocations=[];if(source.current===undefined)source.current=null;if(source.open===undefined)source.open='q1';if(source.allocationRevision===undefined)source.allocationRevision=0;
 // Historical sessions cannot introduce schema3 provider provenance or dropoff.
 // Missing new fields are read as empty by the address contract; no address is
 // silently upgraded. The first successful explicit commit writes the current schema.
 return projectPayload(source,2);
}
const receiptShape=object({transactionId:id,fingerprint:text(64),revision:integer,operation:oneOf(['commit','reset'])},['transactionId','fingerprint','revision','operation']);
const migrationShape=nullable(object({source:oneOf(['session-R2','session-R1']),legacyKey:oneOf(LEGACY_KEYS)},['source','legacyKey']));
const envelopeShape=object({schemaVersion:oneOf([1,2,3,4,5,6,7]),generation:id,revision:integer,state:oneOf(['data','reset']),data:v=>v,receipts:list(receiptShape,MAX_RECEIPTS),migration:migrationShape,updatedAt:integer},['schemaVersion','generation','revision','state','data','receipts','migration','updatedAt']);
function decode(rawValue){
 if(typeof rawValue!=='string'||new TextEncoder().encode(rawValue).length>MAX_BYTES)fail('record','SIZE_LIMIT');
 const value=JSON.parse(rawValue);if(!plain(value))fail('record','OBJECT');if(![1,2,3,4,5,6,7].includes(value.schemaVersion))fail('record','UNSUPPORTED_VERSION');
 const envelope=envelopeShape(value,'record');if(envelope.revision<1)fail('record.revision');
 if(envelope.state==='reset'){if(envelope.data!==null)fail('record.data');}else{
  if(envelope.schemaVersion===1&&envelope.data?.lines?.some(row=>Object.hasOwn(row,'qtyDisplayUnit')))fail('record.data.lines','UNKNOWN_FIELD');
  const projected=projectPayload(envelope.data,envelope.schemaVersion);if(canonical(projected)!==canonical(envelope.data))fail('record.data','NON_CANONICAL_SCHEMA');envelope.data=projected;
 }
 const ids=new Set();for(const receipt of envelope.receipts){if(ids.has(receipt.transactionId)||receipt.revision<1||receipt.revision>envelope.revision||!/^[a-f0-9]{64}$/.test(receipt.fingerprint))fail('record.receipts');ids.add(receipt.transactionId);}
 return envelope;
}
function resolveDefault(options,key,getter){if(Object.hasOwn(options,key))return options[key];try{return getter();}catch{return null;}}
/** Injected Storage and LockManager allow isolated tests without any product QA hook. */
export function createBrowserStorage(options={}){
 const local=resolveDefault(options,'localStorage',()=>globalThis.localStorage),session=resolveDefault(options,'sessionStorage',()=>globalThis.sessionStorage),locks=resolveDefault(options,'locks',()=>globalThis.navigator?.locks),crypto=resolveDefault(options,'crypto',()=>globalThis.crypto);
 const key=options.key??STORAGE_KEY,lockName=options.lockName??STORAGE_LOCK,now=options.now??Date.now;
 if(typeof key!=='string'||!key||typeof lockName!=='string'||!lockName||typeof now!=='function')throw TypeError('STORAGE_CONFIG');
 let last=null;const tokens=new WeakMap();
 const output=(ok,status,envelope=null,extra={})=>({ok,status,revision:envelope?.revision??0,versionToken:envelope?tokens.get(envelope):undefined,generation:envelope?.generation??null,data:envelope?envelope.state==='data'?clone(envelope.data):emptyStoredPayload():null,changed:false,...extra});
 async function digest(value){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
 function generation(){if(crypto?.randomUUID)return crypto.randomUUID();const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
 async function read(){
  let raw,versionToken;try{if(!local||typeof local.getItem!=='function'||typeof local.setItem!=='function')throw Error();raw=local.getItem(key);}catch{return {error:output(false,'UNAVAILABLE',last,{reason:'LOCAL_STORAGE_UNAVAILABLE'})};}
  try{versionToken=raw===null?'ABSENT':await digest(raw);}catch{return {error:output(false,'UNAVAILABLE',last,{reason:'SHA256_UNAVAILABLE'})};}
  if(raw===null)return {raw:null,envelope:null,versionToken};
  try{const envelope=decode(raw);tokens.set(envelope,versionToken);last=envelope;return {raw,envelope,versionToken};}
  catch(error){let revision=0;try{const candidate=JSON.parse(raw)?.revision;if(Number.isSafeInteger(candidate)&&candidate>=0)revision=candidate;}catch{}
   return {raw,versionToken,revision,error:output(false,error.reason==='UNSUPPORTED_VERSION'?'UNSUPPORTED':'CORRUPT',null,{reason:error.reason||'JSON_INVALID',path:error.path,versionToken,revision})};}
 }
 async function exclusive(fn){if(!locks||typeof locks.request!=='function')return output(false,'UNAVAILABLE',last,{reason:'WEB_LOCKS_REQUIRED'});try{return await locks.request(lockName,{mode:'exclusive'},lock=>lock?fn():output(false,'UNAVAILABLE',last,{reason:'LOCK_NOT_ACQUIRED'}));}catch{return output(false,'UNAVAILABLE',last,{reason:'LOCK_REQUEST_FAILED'});}}
 async function write(envelope,previous,canCommit=()=>true){
  let serialized,versionToken;try{const time=now();if(!Number.isSafeInteger(time)||time<0)throw Error();envelope.updatedAt=time;serialized=JSON.stringify(envelope);if(new TextEncoder().encode(serialized).length>MAX_BYTES)return output(false,'WRITE_FAILED',previous,{reason:'SIZE_LIMIT'});versionToken=await digest(serialized);}catch{return output(false,'WRITE_FAILED',previous,{reason:'ENCODING_FAILED'});}
  // Last synchronous guard immediately before the single atomic native write.
  try{if(canCommit()!==true)return output(false,'CANCELLED',previous,{reason:'CALLER_CANCELLED'});}catch{return output(false,'CANCELLED',previous,{reason:'CALLER_CANCELLED'});}
  try{local.setItem(key,serialized);}catch(error){return output(false,'WRITE_FAILED',previous,{reason:error?.name==='QuotaExceededError'?'QUOTA_EXCEEDED':'STORAGE_WRITE_FAILED'});}
  try{if(local.getItem(key)!==serialized)return output(false,'WRITE_FAILED',previous,{reason:'WRITE_NOT_VERIFIED',uncertain:true,attemptedRevision:envelope.revision});}catch{return output(false,'WRITE_FAILED',previous,{reason:'WRITE_NOT_VERIFIED',uncertain:true,attemptedRevision:envelope.revision});}
  tokens.set(envelope,versionToken);last=envelope;return output(true,envelope.state==='reset'?'RESET':'COMMITTED',envelope,{changed:true});
 }
 function legacy(){try{if(!session||typeof session.getItem!=='function')return {error:output(false,'UNAVAILABLE',null,{reason:'SESSION_STORAGE_UNAVAILABLE'})};for(const legacyKey of LEGACY_KEYS){const raw=session.getItem(legacyKey);if(raw!==null){if(typeof raw!=='string'||new TextEncoder().encode(raw).length>MAX_BYTES)fail('legacy','SIZE_LIMIT');return {key:legacyKey,data:migrateLegacy(JSON.parse(raw),legacyKey)};}}return {};}catch(error){return {error:output(false,error.reason==='UNSUPPORTED_VERSION'?'UNSUPPORTED':error instanceof SyntaxError||error.reason?'CORRUPT':'UNAVAILABLE',null,{reason:error.reason||'LEGACY_READ_FAILED',path:error.path})};}}
 async function load(){return exclusive(async()=>{
  const current=await read();if(current.error)return current.error;if(current.envelope)return output(true,current.envelope.state==='reset'?'RESET':'LOADED',current.envelope);
  const old=legacy();if(old.error)return {...old.error,versionToken:'ABSENT'};if(!old.key)return output(true,'EMPTY',null,{data:emptyStoredPayload(),versionToken:'ABSENT'});
  const migration={source:old.key===LEGACY_KEYS[0]?'session-R2':'session-R1',legacyKey:old.key};let epoch;try{epoch=generation();}catch{return output(false,'UNAVAILABLE',null,{reason:'GENERATION_UNAVAILABLE',versionToken:'ABSENT'});}
  const envelope={schemaVersion:STORAGE_SCHEMA_VERSION,generation:epoch,revision:1,state:'data',data:old.data,receipts:[],migration,updatedAt:0};
  const result=await write(envelope,null);if(result.ok){result.status='MIGRATED';result.migration=migration;}else result.versionToken='ABSENT';
  // Original session is deliberately retained, never authoritative after this envelope exists.
  return result;
 });}
 // Read the current durable revision under the same writer lock without loading
 // application data or consulting/migrating legacy session state. Callers must
 // still use commit's revision/token preconditions for an eventual write.
 async function inspectCurrent(){
  const result=await exclusive(async()=>{const current=await read();if(current.error)return current.error;return output(true,current.envelope?current.envelope.state==='reset'?'RESET':'LOADED':'EMPTY',current.envelope,{versionToken:current.versionToken});});
  return {ok:result.ok,status:result.status,revision:result.revision,versionToken:result.versionToken??null,...(result.reason?{reason:result.reason}:{})};
 }
 async function mutate(operation,payload,settings={}){
  const {expectedRevision,expectedToken,transactionId,canCommit=()=>true}=settings;let data;
  try{if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0||typeof expectedToken!=='string'||!expectedToken||typeof canCommit!=='function')fail('transaction','OPTIONS');id(transactionId,'transactionId');data=operation==='reset'?null:projectStoredPayload(payload);}catch(error){return output(false,'INVALID_DATA',last,{reason:error.reason||'TRANSACTION_OPTIONS',path:error.path});}
  // Snapshot before waiting: subsequent caller edits never leak into this transaction.
  data=data===null?null:clone(data);let fingerprint;try{fingerprint=await digest(canonical({operation,data}));}catch{return output(false,'UNAVAILABLE',last,{reason:'SHA256_UNAVAILABLE'});}
  return exclusive(async()=>{
   const current=await read();const damaged=!!current.error&&['CORRUPT','UNSUPPORTED'].includes(current.error.status)&&typeof current.raw==='string';
   if(current.error&&!(damaged&&operation==='reset'))return current.error;
   const previous=current.envelope??null,revision=previous?.revision??current.revision??0;
   const receipt=previous?.receipts.find(item=>item.transactionId===transactionId);
   if(receipt){if(receipt.operation!==operation||receipt.fingerprint!==fingerprint)return output(false,'CONFLICT',previous,{reason:'TRANSACTION_ID_REUSED'});if(receipt.revision!==revision)return output(false,'CONFLICT',previous,{reason:'TRANSACTION_SUPERSEDED'});try{if(canCommit()!==true)return output(false,'CANCELLED',previous,{reason:'CALLER_CANCELLED'});}catch{return output(false,'CANCELLED',previous,{reason:'CALLER_CANCELLED'});}return output(true,'IDEMPOTENT',previous,{receiptRevision:receipt.revision});}
   if(expectedToken!==current.versionToken||expectedRevision!==revision)return output(false,'CONFLICT',previous,{reason:'REVISION_MISMATCH',versionToken:current.versionToken,revision});
   if(!damaged&&revision===Number.MAX_SAFE_INTEGER)return output(false,'WRITE_FAILED',previous,{reason:'REVISION_EXHAUSTED'});
   if(!previous&&!damaged&&operation==='commit'){const old=legacy();if(old.error)return {...old.error,versionToken:'ABSENT'};if(old.key)return output(false,'CONFLICT',null,{reason:'MIGRATION_REQUIRED',versionToken:'ABSENT'});}
   let epoch=previous?.generation;try{epoch??=generation();}catch{return output(false,'UNAVAILABLE',previous,{reason:'GENERATION_UNAVAILABLE'});}
   const next=revision<Number.MAX_SAFE_INTEGER?revision+1:1,receipts=[...(previous?.receipts??[]),{transactionId,fingerprint,revision:next,operation}].slice(-MAX_RECEIPTS);
   const result=await write({schemaVersion:STORAGE_SCHEMA_VERSION,generation:epoch,revision:next,state:operation==='reset'?'reset':'data',data,receipts,migration:previous?.migration??null,updatedAt:0},previous,canCommit);
   if(damaged&&result.ok)result.recoveredFrom=current.error.status;return result;
  });
 }
 return Object.freeze({load,inspectCurrent,commit:(payload,settings)=>mutate('commit',payload,settings),reset:settings=>mutate('reset',null,settings),key,lockName});
}
