/** MSG0581 candidate input only. This is not an approved quote request, an
 * authentication provider, a booking, or an instruction to contact a customer. */
import {validMonthlyQuantity,currentPurchaseCost,quantityUnit} from './quantity-contract.mjs';

export const SIMPLE_QUOTE_VERSION='provisional-0581-1';
export const SIMPLE_QUOTE_SNAPSHOT='ORDER-PARTIAL-20261112-063305-R1';
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const fail=(path,reason='TYPE')=>{throw Object.assign(new TypeError(reason),{path,reason});};
const string=(value,path,max=2048)=>typeof value==='string'&&value.length<=max?value:fail(path);
const id=(value,path)=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value)?value:fail(path,'ID');
const bool=(value,path)=>typeof value==='boolean'?value:fail(path);
const oneOf=(value,path,allowed)=>allowed.includes(value)?value:fail(path,'ENUM');
function fields(value,path,allowed){if(!plain(value))fail(path,'OBJECT');for(const key of Object.keys(value))if(!allowed.includes(key))fail(path+'.'+key,'UNKNOWN_FIELD');for(const key of allowed)if(!Object.hasOwn(value,key))fail(path+'.'+key,'REQUIRED');}
function civilDate(value,path){
 if(value==='')return value;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail(path,'DATE');
 const [year,month,day]=value.split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0),length=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][month-1];
 return year>0&&month>=1&&month<=12&&day>=1&&day<=length?value:fail(path,'DATE');
}
const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
const handoffs=new WeakSet();

export function blankSimpleQuote(){return {version:SIMPLE_QUOTE_VERSION,snapshotId:SIMPLE_QUOTE_SNAPSHOT,specUnknown:false,consultationInterest:false,monthlyScope:'UNCONFIRMED',siteCount:'',regionsDiffer:false,sharedRegion:'',sites:[],orderKind:'',flexBasis:'',preferredDate:''};}

/** Strict projection preserves inactive-mode raw intent without interpreting it. */
export function projectSimpleQuote(value,path='simpleQuote'){
 fields(value,path,Object.keys(blankSimpleQuote()));
 if(!Array.isArray(value.sites)||value.sites.length>500)fail(path+'.sites','ARRAY');
 const sites=value.sites.map((site,index)=>{const p=path+'.sites.'+index;fields(site,p,['id','region']);return {id:id(site.id,p+'.id'),region:string(site.region,p+'.region',1024)};});
 if(new Set(sites.map(site=>site.id)).size!==sites.length)fail(path+'.sites','DUPLICATE_ID');
 if(typeof value.siteCount!=='string'||!/^\d{0,12}$/.test(value.siteCount))fail(path+'.siteCount','COUNT_DIGITS');
 return {version:oneOf(value.version,path+'.version',[SIMPLE_QUOTE_VERSION]),snapshotId:oneOf(value.snapshotId,path+'.snapshotId',[SIMPLE_QUOTE_SNAPSHOT]),specUnknown:bool(value.specUnknown,path+'.specUnknown'),consultationInterest:bool(value.consultationInterest,path+'.consultationInterest'),monthlyScope:oneOf(value.monthlyScope,path+'.monthlyScope',['UNCONFIRMED']),siteCount:value.siteCount,regionsDiffer:bool(value.regionsDiffer,path+'.regionsDiffer'),sharedRegion:string(value.sharedRegion,path+'.sharedRegion',1024),sites,orderKind:oneOf(value.orderKind,path+'.orderKind',['','FLEX','FIXED','ONCE']),flexBasis:oneOf(value.flexBasis,path+'.flexBasis',['','WEEK','MONTH']),preferredDate:civilDate(value.preferredDate,path+'.preferredDate')};
}

function lineInput(line){
 if(!plain(line))fail('lines.0','OBJECT');
 const result={id:id(line.id,'lines.0.id')};
 for(const field of ['housing','size','pack','qty','price'])result[field]=string(line[field],'lines.0.'+field);
 for(const field of ['qtyUnit','qtyDisplayUnit'])if(Object.hasOwn(line,field))result[field]=oneOf(line[field],'lines.0.'+field,['each','tray','pack']);
 if(line.qtyExact!==undefined){
  const value=line.qtyExact,p='lines.0.qtyExact';
  if(!plain(value)||Object.keys(value).some(key=>!['representation','conversionReviewed','numerator','denominator'].includes(key)))fail(p,'UNKNOWN_FIELD');
  if(value.representation!=='rational'||value.conversionReviewed!==true||typeof value.numerator!=='string'||!/^\d{1,128}$/.test(value.numerator)||typeof value.denominator!=='string'||!/^\d{1,128}$/.test(value.denominator)||BigInt(value.denominator)===0n)fail(p,'RATIO');
  result.qtyExact={representation:'rational',conversionReviewed:true,numerator:value.numerator,denominator:value.denominator};
 }
 return result;
}

/** Detailed contacts, addresses, allocation and transient DNS state never cross
 * this allowlist. Raw region text is not promoted to a verified provider code. */
export function projectSimpleInput(state){
 const simple=projectSimpleQuote(state?.simpleQuote??blankSimpleQuote());
 if(!Array.isArray(state?.lines)||state.lines.length>1)fail('lines','SINGLE_SKU_REQUIRED');
 const line=state.lines.length?lineInput(state.lines[0]):null;
 return {contractVersion:SIMPLE_QUOTE_VERSION,snapshotId:SIMPLE_QUOTE_SNAPSHOT,product:{specUnknown:simple.specUnknown,line},monthly:{scope:simple.monthlyScope,quantity:line?.qty??'',unit:line?(line.qtyUnit??(['10','20','30'].includes(line.pack)?quantityUnit(line):null)):null,price:line?.price??''},regions:{siteCount:simple.siteCount,regionsDiffer:simple.regionsDiffer,sharedRegion:simple.sharedRegion,sites:simple.sites},order:{kind:simple.orderKind,flexBasis:simple.flexBasis,preferredDate:simple.preferredDate},consultationInterest:simple.consultationInterest,authentication:'UNKNOWN',businessVerification:'UNKNOWN'};
}

/** Form advancement and proven price comparison are intentionally separate. */
export function inspectSimpleQuote(state){
 let simple,input,invalid=null;try{simple=projectSimpleQuote(state?.simpleQuote??blankSimpleQuote());input=projectSimpleInput(state);}catch(error){invalid=error.reason||'INVALID_INPUT';}
 const stages=Object.fromEntries(['q1','q2','q3','q4'].map(key=>[key,{ready:false,issues:[]}]));
 const proofBlockers=['MONTHLY_SCOPE_UNCONFIRMED','REGION_UNVERIFIED','APPROVED_OFFER_REQUIRED'];
 if(invalid){for(const stage of Object.values(stages))stage.issues.push(invalid);proofBlockers.push(invalid);}
 else{
  const line=input.product.line,identity=line&&['1','2','3','4'].includes(line.housing)&&['왕란','특란','대란','중란','소란'].includes(line.size)&&['10','20','30'].includes(line.pack);
  if(!line)stages.q1.issues.push('PRODUCT_REQUIRED');else if(!simple.specUnknown&&!identity)stages.q1.issues.push('SPEC_REQUIRED');
  if(simple.specUnknown)proofBlockers.push('SPEC_UNKNOWN');else if(!identity)proofBlockers.push('SPEC_REQUIRED');
  if(!line||!validMonthlyQuantity(line))stages.q2.issues.push('MONTHLY_QUANTITY_REQUIRED');
  if(!line||!currentPurchaseCost(line))proofBlockers.push('CURRENT_PRICE_OR_PACKAGE_REQUIRED');
  const count=/^[1-9]\d{0,11}$/.test(simple.siteCount)?BigInt(simple.siteCount):0n;
  if(!count)stages.q3.issues.push('SITE_COUNT_REQUIRED');
  if(simple.regionsDiffer){if(count!==BigInt(simple.sites.length))stages.q3.issues.push('REGION_COUNT_MISMATCH');if(simple.sites.some(site=>!site.region.trim()))stages.q3.issues.push('REGION_REQUIRED');}
  else if(!simple.sharedRegion.trim())stages.q3.issues.push('REGION_REQUIRED');
  if(!simple.orderKind)stages.q4.issues.push('ORDER_KIND_REQUIRED');
  if(simple.orderKind==='FLEX'&&!simple.flexBasis)stages.q4.issues.push('FLEX_BASIS_REQUIRED');
  for(const stage of Object.values(stages))stage.ready=stage.issues.length===0;
 }
 return {contractVersion:SIMPLE_QUOTE_VERSION,snapshotId:SIMPLE_QUOTE_SNAPSHOT,stages,readyToAdvance:Object.values(stages).every(stage=>stage.ready),proofBlocked:true,proofBlockers:[...new Set(proofBlockers)],authentication:'UNKNOWN',businessVerification:'UNKNOWN'};
}

function requestMeta(requestId,inputRevision){id(requestId,'requestId');if(!Number.isSafeInteger(inputRevision)||inputRevision<0)fail('inputRevision','REVISION');}
export function createSimpleAuthHandoff(state,{requestId,inputRevision}={}){
 requestMeta(requestId,inputRevision);const handoff=freeze({requestId,inputRevision,input:projectSimpleInput(state)});handoffs.add(handoff);return handoff;
}

/** A provider callback may only return the original isolated input. It cannot
 * commit it, unlock multiple products, or verify a business by itself. */
export function resumeSimpleAuthHandoff(handoff,{requestId,inputRevision,authentication='UNAVAILABLE'}={}){
 requestMeta(handoff?.requestId,handoff?.inputRevision);
 oneOf(authentication,'authentication',['UNKNOWN','UNAVAILABLE','CANCELLED','AUTHENTICATED']);
 const stale=requestId!==handoff.requestId||inputRevision!==handoff.inputRevision;
 const status=stale?'STALE':authentication==='AUTHENTICATED'?'RESUMED':authentication;
 // Serialize only this module's immutable envelope, never arbitrary callback data.
 if(!handoffs.has(handoff))fail('handoff','IMMUTABLE_HANDOFF_REQUIRED');
 return freeze({ok:status==='RESUMED',status,requestId:handoff.requestId,inputRevision:handoff.inputRevision,input:handoff.input,authentication:stale?'UNKNOWN':authentication,businessVerification:'UNKNOWN'});
}
