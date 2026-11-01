/** Confirmed Q1–Q4 persistence. All writers must share the origin's Web Lock.
 * Domain validity, DNS, UI drafts and provider approval remain outside storage.
 */
export const STORAGE_SCHEMA_VERSION=1;
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
const repeat=object({period:short,frequency:short,date:short,dateMode:short,weeklyCheck:boolean,weekdays,weekOpen:integer,semantics:nullable(short),legacyReviewRequired:boolean,
 legacyOriginal:object({cycleCount:integer,freq:integer,intervalWeeks:integer,weekPlans})});
const ratio=object({representation:oneOf(['rational']),conversionReviewed:boolean,numerator:short,denominator:short},['representation','numerator','denominator']);
const monthlyExact=object({raw,unit,representation:oneOf(['rational']),conversionReviewed:boolean,numerator:short,denominator:short,phase:omit,composing:omit},['raw','unit','representation']);
const advanced=object({contactChannels:list(oneOf(['phone','sms','kakao','email']),4),orderProcess:short,fixedOrderProcess:short,flexOrderProcess:short,storeOffDays:days,storeOffNone:boolean,storeOffIrregular:boolean,storeOffPolicy:short,weekend:short,holiday:short,substituteHoliday:short,memo:text(4096)});
const review=object({version:oneOf(['0460']),pack:short,profile:oneOf(['FLEX','FIXED','ONCE','MIXED']),activeHoliday:holiday,activeRepeat:repeat,deliveryDate,
 common:object({contact,process:short,quality:boolean,holiday,repeat}),
 // This is committed inactive-mode input, not the live modal's working draft.
 draft:object({mode,process:short,values:object({base:raw,monthly:raw,min:raw,max:raw,once:raw}),variable:boolean,contact,holiday,repeat,quality:boolean})},['version']);
const line=object({id,housing:short,size:short,pack:short,qty:raw,qtyUnit:unit,price:raw,qtyExact:ratio},['id','housing','size','pack','qty','price']);
const location=object({id,name:text(1024),road:text(4096),postal:short,detail:text(4096),jibun:text(4096),region:text(1024),providerId:text(1024),contactPhone:raw,email:raw,storePhone:raw,addressState:short,basicInfoDraft:boolean,
 status:omit,emailDomainState:omit,mailboxVerified:omit,dns:omit,dnsResult:omit,validation:omit},['id','name']);
const allocation=object({id,lineId:id,locationId:id,qty:raw,mode,modeExplicit:boolean,freq:integer,days,intervalWeeks:integer,cycleCount:integer,scheduleDetail:short,weekPlans,qtySource:short,variableQty:boolean,qtyMin:raw,qtyMax:raw,qualityTest:boolean,oneTimeDeliveryQty:raw,deliveryQtyUnit:unit,monthlyDemandQty:raw,monthlyDemandUnit:unit,monthlyDemandSource:oneOf(['manual','derived']),monthlyDemandExact:monthlyExact,repeatSemantics:short,frequencyPerWeek:nullable(integer),monthDay:(v,p)=>typeof v==='number'?integer(v,p):short(v,p),advanced,q4Review:review,onceConfirmedFingerprint:text(32768),cycleAnchorDate:short,calendarPolicy:object({kind:short},['kind']),monthlyAllocationContract:short,
 suggestedQty:omit,monthlyAllocationComplete:omit,monthlyAllocationDraftRevision:omit},['id','lineId','locationId']);
const payloadShape=object({lines:list(line),current:nullable(id),locations:list(location),allocations:list(allocation),open:oneOf(['','q1','q2','q3','q4']),allocationRevision:integer,
 stage:omit,errorExposure:omit,validation:omit,dnsCache:omit,pendingRequests:omit},['lines','locations','allocations']);
export const emptyStoredPayload=()=>({lines:[],current:null,locations:[],allocations:[],open:'q1',allocationRevision:0});
function canonical(value){return Array.isArray(value)?'['+value.map(canonical).join(',')+']':plain(value)?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);}
const clone=value=>JSON.parse(JSON.stringify(value));
/** Structural validation and explicit exclusion of transient evidence. No input coercion. */
export function projectStoredPayload(input){
 const result=payloadShape(input,'data');
 const unique=(rows,field)=>{const set=new Set(rows.map(row=>row.id));if(set.size!==rows.length)fail('data.'+field,'DUPLICATE_ID');return set;};
 const lines=unique(result.lines,'lines'),sites=unique(result.locations,'locations');unique(result.allocations,'allocations');
 const pairs=new Set();for(const row of result.allocations){if(!lines.has(row.lineId)||!sites.has(row.locationId))fail('data.allocations','ORPHAN_REFERENCE');const pair=JSON.stringify([row.lineId,row.locationId]);if(pairs.has(pair))fail('data.allocations','DUPLICATE_ASSIGNMENT');pairs.add(pair);}
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
  const site=location({...address,id:address.id||'legacy-r1-site-1',name:address.name||'기본 사업장'},'legacy.address');
  const populated=['name','road','postal','detail','jibun','region','providerId','contactPhone','email','storePhone'].some(field=>typeof address[field]==='string'&&address[field].trim()!=='');
  if(!populated&&source.lines.some(row=>row.drop!==undefined&&row.drop!==''))fail('legacy.drop','ADDRESS_REQUIRED');
  source.locations=populated?[site]:[];source.allocations=populated?source.lines.map((row,i)=>({id:'legacy-r1-allocation-'+(i+1),lineId:row.id,locationId:site.id,qty:legacyNumber(row.drop??'','legacy.drop'),mode:delivery.mode||'FLEX',freq:delivery.freq??1,days:delivery.days??[]})):[];
  delete source.address;delete source.delivery;
 }
 if(r1)for(const row of source.lines){if(Object.hasOwn(row,'drop')){legacyNumber(row.drop,'legacy.drop');delete row.drop;}}
 if(source.locations===undefined)source.locations=[];if(source.allocations===undefined)source.allocations=[];if(source.current===undefined)source.current=null;if(source.open===undefined)source.open='q1';if(source.allocationRevision===undefined)source.allocationRevision=0;
 return projectStoredPayload(source);
}
const receiptShape=object({transactionId:id,fingerprint:text(64),revision:integer,operation:oneOf(['commit','reset'])},['transactionId','fingerprint','revision','operation']);
const migrationShape=nullable(object({source:oneOf(['session-R2','session-R1']),legacyKey:oneOf(LEGACY_KEYS)},['source','legacyKey']));
const envelopeShape=object({schemaVersion:oneOf([1]),generation:id,revision:integer,state:oneOf(['data','reset']),data:v=>v,receipts:list(receiptShape,MAX_RECEIPTS),migration:migrationShape,updatedAt:integer},['schemaVersion','generation','revision','state','data','receipts','migration','updatedAt']);
function decode(rawValue){
 if(typeof rawValue!=='string'||new TextEncoder().encode(rawValue).length>MAX_BYTES)fail('record','SIZE_LIMIT');
 const value=JSON.parse(rawValue);if(!plain(value))fail('record','OBJECT');if(value.schemaVersion!==1)fail('record','UNSUPPORTED_VERSION');
 const envelope=envelopeShape(value,'record');if(envelope.revision<1)fail('record.revision');
 if(envelope.state==='reset'){if(envelope.data!==null)fail('record.data');}else{
  const projected=projectStoredPayload(envelope.data);if(canonical(projected)!==canonical(envelope.data))fail('record.data','NON_CANONICAL_SCHEMA');envelope.data=projected;
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
  const envelope={schemaVersion:1,generation:epoch,revision:1,state:'data',data:old.data,receipts:[],migration,updatedAt:0};
  const result=await write(envelope,null);if(result.ok){result.status='MIGRATED';result.migration=migration;}else result.versionToken='ABSENT';
  // Original session is deliberately retained, never authoritative after this envelope exists.
  return result;
 });}
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
   const result=await write({schemaVersion:1,generation:epoch,revision:next,state:operation==='reset'?'reset':'data',data,receipts,migration:previous?.migration??null,updatedAt:0},previous,canCommit);
   if(damaged&&result.ok)result.recoveredFrom=current.error.status;return result;
  });
 }
 return Object.freeze({load,commit:(payload,settings)=>mutate('commit',payload,settings),reset:settings=>mutate('reset',null,settings),key,lockName});
}
