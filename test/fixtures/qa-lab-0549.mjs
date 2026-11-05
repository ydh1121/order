// Offline QA controls only. Expected labels are independent handoff examples,
// never production policy, live addresses or real orders.
import {approvedFixture} from './qa-lab-0540.mjs';
export const c55Cases=[
 ...Array.from({length:7},(_,i)=>({id:'C55-week-'+(i+1),title:`C55-04 · ${30*(i+1)}/7 → 매주 ${i+1}회`,monthly:String(30*(i+1)),quantity:'7',expected:{period:'매주',frequency:(i+1)+'회'}})),
 {id:'C55-67-15',title:'C55-05 · 67/15 → 매주 약 1회',monthly:'67',quantity:'15',expected:{period:'매주',frequency:'약 1회'}},
 {id:'C55-100-14',title:'C55-05 · 100/14 → 매주 약 2회',monthly:'100',quantity:'14',expected:{period:'매주',frequency:'약 2회'}},
 {id:'C55-600-300',title:'C55-05 · 600/300 → 2주 1회',monthly:'600',quantity:'300',expected:{period:'2주',frequency:'1회'}},
 {id:'C55-600-227',title:'C55-05 · 600/227 → 협의',monthly:'600',quantity:'227',expected:{period:'협의'}},
 {id:'C55-bulk',title:'C55-07 · A100/Q14 + B67/Q15 일괄 전환',expected:{monthlyQuantities:['100','67'],restoredQuantities:['14','15']}},
 {id:'C55-wide',title:'C55-16 · 최소10 / 보통40 / 최대60',expected:{valid:true}},
 {id:'C55-once',title:'C55-13~15 · 1회 주문 2027-01-10',expected:{date:'2027-01-10',optional:true}},
 {id:'C55-partial',title:'C55-11 · 주4회 / 희망요일3개',expected:{monthly:'—',reason:'희망 요일 3개, 나머지 일정 미정'}}
];
export function c55Fixture(id){
 const c=c55Cases.find(c=>c.id===id);if(!c)throw Error('UNKNOWN_C55_QA_CASE');
 const data=approvedFixture({count:id==='C55-bulk'?2:1,mode:id==='C55-once'?'ONCE':'FIXED',monthly:c.monthly||(id==='C55-bulk'?'167':'600'),quantity:c.quantity||'40',period:c.monthly||id==='C55-bulk'?'협의':'매주',date:id==='C55-bulk'?'':'2026-11-05'});
 if(id==='C55-bulk')data.allocations.forEach((a,i)=>{Object.assign(a,{qty:i?'15':'14',monthlyPlanQty:i?'67':'100',monthlyPlanSource:'manual',monthlyDemandBasis:'package-plan'});for(const r of [a.q4Review.activeRepeat,a.q4Review.common.repeat]){r.period='협의';r.frequency='협의';r.cadence={version:'3.0.0',kind:'CONSULT',preferredDate:'',nominalAnchor:''};}});
 if(id==='C55-wide')Object.assign(data.allocations[0],{variableQty:true,qtyMin:'10',qtyMax:'60'});
 if(id==='C55-once')data.allocations[0].q4Review.deliveryDate={year:2027,month:1,day:10};
 if(id==='C55-partial')for(const r of [data.allocations[0].q4Review.activeRepeat,data.allocations[0].q4Review.common.repeat])Object.assign(r,{frequency:'4회',weeklyCheck:true,weekdays:{'1:월':true,'1:화':true,'1:목':true}});
 return data;
}
