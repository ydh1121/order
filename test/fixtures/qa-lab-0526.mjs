import {allocationFixture} from './qa-lab.mjs';

// Explicit comparison inputs only. Neither this module nor these prices enter dist.
export function q4ComparisonFixture(kind='200'){
 const f=allocationFixture();f.lines[0].price='10000';f.open='q4';
 if(kind==='200')return f;
 f.lines[0].qty='5000';f.lines[0].qtyUnit='each';
 if(kind==='known'){
  for(const a of f.allocations)Object.assign(a,{monthlyDemandQty:'2500',monthlyDemandUnit:'each',monthlyDemandSource:'manual',monthlyDemandBasis:'known',monthlyPlanQty:'84',monthlyPlanSource:'derived'});
  return f;
 }
 if(kind==='5000'){
  const third={...structuredClone(f.locations[1]),id:'qa-site-c',name:'합성 QA 사업장 C'};f.locations.push(third);
  f.allocations.push({...structuredClone(f.allocations[1]),id:'qa-allocation-c',locationId:third.id});
  f.allocations.forEach((a,i)=>Object.assign(a,{monthlyPlanQty:i?'50':'67',monthlyPlanSource:'manual',monthlyDemandBasis:'package-plan',monthlyDemandSource:'manual',qty:'15'}));
  return f;
 }
 if(kind==='legacy'){
  f.allocations.forEach((a,i)=>{a.mode='FIXED';a.q4Review.profile='MIXED';const repeat={...a.q4Review.common.repeat,period:i?'4주':'2주',frequency:'2회',weeklyCheck:true,weekdays:{'1:월':true,'1:목':true,'2:화':true,'2:금':true,'3:월':true,'3:목':true,'4:화':true,'4:금':true},semantics:'per-week-v1'};a.q4Review.activeRepeat=structuredClone(repeat);a.q4Review.draft={mode:'FIXED',repeat:structuredClone(repeat),values:{base:'15'},process:'contact'};a.qty='15';});
  return f;
 }
 throw Error('QA_COMPARISON_FIXTURE_UNKNOWN');
}
