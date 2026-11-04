/** Selected address data, independent of dialogs, search transport and persistence.
 * Provider provenance records a chosen search result, not occupancy or delivery approval.
 * Legacy address text has no provider provenance and is never promoted on restore.
 */
export const ADDRESS_FIELDS=Object.freeze(['road','postal','detail','jibun','region','providerId','dropoff','addressProvider']);
export const ADDRESS_LIMITS=Object.freeze({road:4096,postal:5,detail:4096,jibun:4096,region:1024,providerId:73,dropoff:4096,addressProvider:5});
const clean=value=>typeof value==='string'?value:'';
const bounded=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
/** Copy only address fields. Never copy site IDs, contacts or async email state. */
export function addressFields(site={}){return Object.fromEntries(ADDRESS_FIELDS.map(key=>[key,clean(site?.[key])]));}
export const normalizeAddress=addressFields;
export function isVerifiedAddress(site){
 const identity=site?.addressProvider==='JUSO'?/^\d{25}$/:site?.addressProvider==='KAKAO'?/^KAKAO:v1:[a-f0-9]{64}$/:null;
 return identity!==null&&bounded(site.road,ADDRESS_LIMITS.road)&&site.road.trim()!==''&&
  typeof site.postal==='string'&&/^\d{5}$/.test(site.postal)&&typeof site.providerId==='string'&&identity.test(site.providerId)&&
  ['jibun','region'].every(key=>site[key]===undefined||bounded(site[key],ADDRESS_LIMITS[key]));
}
export function addressStatus(site){
 if(isVerifiedAddress(site))return {valid:true,state:'PROVIDER_SELECTED',issue:null};
 const present=typeof site?.road==='string'&&site.road.trim()!=='';
 return {valid:false,state:present?'UNVERIFIED':'EMPTY',issue:{key:'address',code:present?'ADDRESS_SELECTION_REQUIRED':'ADDRESS_REQUIRED',message:present?'사업장 소재지를 검색하여 선택해 주세요.':'사업장 소재지를 입력해 주세요.'}};
}
/** Building identity wins over display spelling; an old text-only address may
 * retain its optional fields only after that exact road/postal is truly selected. */
export function sameAddressBase(current,candidate){
 const a=addressFields(current),b=addressFields(candidate);
 // A historical ID may belong to a different provider/format. Only compare
 // IDs inside the same provider namespace; cross-provider identity uses road/postal.
 if(isVerifiedAddress(a)&&isVerifiedAddress(b)&&a.addressProvider===b.addressProvider)return a.providerId===b.providerId&&a.postal===b.postal;
 return !!a.road.trim()&&a.road.trim()===b.road.trim()&&a.postal===b.postal;
}
export function selectAddress(current,candidate){
 if(!isVerifiedAddress(candidate))throw TypeError('ADDRESS_SELECTION_INVALID');
 const before=addressFields(current),next=addressFields(candidate),same=sameAddressBase(before,next);
 // Provider payloads cannot supply user-owned details or delivery placement.
 return {...next,detail:same?before.detail:'',dropoff:same?before.dropoff:''};
}
/** Presentation lines are derived, never the source representation. */
export function addressLines(site){
 const a=addressFields(site),road=[a.road.trim(),a.detail.trim()].filter(Boolean).join(' ');
 return [road,a.postal.trim(),a.dropoff.trim()].filter(Boolean);
}
