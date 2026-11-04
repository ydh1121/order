// MSG0540 synthetic fixtures only. Not in the production Pages allowlist.
import {allocationFixture} from './qa-lab.mjs';
export const CLOCK_0540='2026-11-05T01:00:00Z';
export function approvedFixture({count=1,monthly='600',quantity='40',mode='FIXED',period='매주',date='',pack='30',rawQuantity=null,displayUnit=null,price='10000',address=false}={}){
 const data=allocationFixture(),site=data.locations[0],allocation=data.allocations[0];
 data.lines=[{id:'qa-line',housing:'4',size:'특란',pack,qty:rawQuantity??monthly,qtyUnit:displayUnit??(pack==='30'?'tray':'pack'),price}];
 data.current='qa-line';data.open='q4';
 const cadence={version:'3.0.0',kind:period==='매주'?'WEEKLY':period==='2주'?'INTERVAL_DAYS':period==='매월'?'MONTHLY':'CONSULT',preferredDate:date,nominalAnchor:date,...(period==='2주'?{intervalDays:14}:period==='매월'?{dayRule:'last'}:{})};
 const repeat={period,frequency:period==='매주'?'약 4회':period==='2주'?'1회':'협의',date:period==='매월'?'말일':'',dateMode:'custom',weeklyCheck:false,weekdays:{},weekOpen:0,semantics:'cadence-v3',legacyReviewRequired:false,weekdayOrder:[],quantityEditVersion:'0540',cadence};
 data.locations=Array.from({length:count},(_,i)=>({...structuredClone(site),id:'qa-site-'+i,name:'합성 QA 사업장 '+(i+1),contactPhone:i?'070-2345-6789':'010-2345-6789',email:'qa@example.com',storePhone:i?'':'02-234-5678',road:'',detail:'',postal:'',providerId:'',addressProvider:'',dropoff:'',jibun:'',region:'',addressState:'ADDRESS_UI_PENDING',basicInfoDraft:true,...(address?{...syntheticKakaoResult().items[0],detail:'합성 상세',dropoff:'합성 물품 장소',addressState:'PROVIDER_SELECTED',basicInfoDraft:false}:{})}));
 data.allocations=data.locations.map((site,i)=>{const a=structuredClone(allocation);Object.assign(a,{id:'qa-allocation-'+i,locationId:site.id,qty:quantity,mode,monthlyPlanQty:i?'':monthly,monthlyPlanSource:i?'derived':'manual',monthlyDemandQty:'',monthlyDemandBasis:i?'unknown':'package-plan',monthlyDemandSource:i?'derived':'manual',monthlyPlanUnit:pack==='30'?'tray':'pack'});a.q4Review.pack=pack;a.q4Review.profile=mode;a.q4Review.activeRepeat=structuredClone(repeat);a.q4Review.common.repeat=structuredClone(repeat);if(mode==='FIXED')a.cadence=structuredClone(cadence);return a;});
 return data;
}
export function syntheticKakaoResult(mode='synthetic'){
 if(mode==='unavailable')return {version:2,status:'UNAVAILABLE',reason:'PROVIDER_UNAVAILABLE',items:[],provider:'KAKAO'};
 const items=mode==='empty'?[]:[{road:'합성 QA 도로 10 — 실제 주소 아님',postal:'08843',jibun:'합성 QA 지번 10',region:'합성 QA 지역',providerId:'KAKAO:v1:'+'a'.repeat(64),addressProvider:'KAKAO'}];
 return {version:2,status:items.length?'OK':'EMPTY',reason:items.length?'RESULTS':'NO_RESULTS',provider:'KAKAO',items,page:1,total:items.length,pageable:items.length,hasMore:false};
}
export const cadenceCases0540=[
 {monthly:'600',quantity:'40',period:'매주',monthlyText:'월 15회',weeklyText:'약 4회'},
 {monthly:'600',quantity:'300',period:'2주',monthlyText:'월 2회'},
 {monthly:'600',quantity:'227',period:'협의',monthlyText:'월 약 3회'},
 {monthly:'600',quantity:'600',period:'매월',monthlyText:'월 1회'},
 {monthly:'600',quantity:'50',period:'매주',monthlyText:'월 12회',weeklyText:'약 3회'},
 {monthly:'660',quantity:'30',period:'매주',monthlyText:'월 22회',weeklyText:'약 5회'},
 {monthly:'600',quantity:'400',period:'2주',monthlyText:'월 약 2회'},
 {monthly:'600',quantity:'240',period:'2주',monthlyText:'월 약 3회'}
];
