import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCarrierPolicy,selectCarrier} from '../../src/engine/calculation/freight-policy.mjs';
import {simulateSupplyQuote} from '../../src/engine/calculation/supply-policy.mjs';
const asOf='2026-11-19T03:00:00.000Z';
const packing={confirmed:true,unitsPerBox:5,kgPerBox:3,m3PerBox:0.02,sumCm:80,longestCm:40,boxesPerPallet:10};
const parcel={id:'courier-a',name:'합성 택배 A',mode:'PARCEL',priority:1,status:'FEE',enabled:true,min:1,max:10,measure:'TRAYS',prefixes:['11'],days:[0,1,2,3,4,5,6],start:'2026-10-01',end:'2026-12-01',eggsConfirmed:true,termsConfirmed:true,vat:'INCLUDED',zone:'base',rates:[{id:'small',zone:'base',amount:'100',maxKg:3,maxCm:80},{id:'large',zone:'base',amount:'80',maxKg:5,maxCm:120}],extras:[]};
const truck={...parcel,id:'truck-1',name:'합성 용달',mode:'TRUCK',priority:2,min:11,max:null,vehicle:'차량 A',distanceKm:20,capacityKg:20,capacityM3:5,trip:'ONE_WAY',rates:[{id:'20',zone:'base',amount:'150',pointKm:20,vehicle:'차량 A'}]};
const policy=(contracts=[parcel,truck])=>({schema:1,selection:'CHEAPEST',splitAllowed:false,packing:{...packing},contracts:structuredClone(contracts)});
const detail=(qty=10)=>({qty,asOf,serviceDate:'2026-11-20',region:'1100000000'});
const chosen=(p,q)=>{validateCarrierPolicy(p);return selectCarrier(p,detail(q));};
test('SH02/05/06 use physical boxes and both size limits; below/equal/above use the submitted service policy',()=>{
 for(const q of [9,10,11]){const r=chosen(policy(),q);assert.equal(r.chosen.id,q<=10?'courier-a':'truck-1');assert.equal(r.chosen.base,q<=10?'200':'150');assert.equal(r.load.BOXES,Math.ceil(q/5));}
 const p=policy([parcel]);p.packing.sumCm=100;assert.equal(chosen(p,10).chosen.base,'160');
 p.packing.confirmed=false;assert.throws(()=>chosen(p,10),/QUOTE_REQUIRED/);
});
test('SH03/09 application selects totals after extras and VAT, compares only qualified services, preserves explicit zero',()=>{
 const a={...parcel,vat:'EXTRA',vatPercent:'10',extras:[{label:'계약료',type:'PER_BOX',enabled:true,amount:'10'}]};
 const b={...parcel,id:'courier-b',priority:2,rates:[{...parcel.rates[0],amount:'115'}]};
 let p=policy([a,b]);let r=chosen(p,10);
 assert.equal(r.chosen.id,'courier-b');const ca=r.candidates.find(c=>c.id==='courier-a');
 assert.deepEqual([ca.base,ca.surcharge,ca.vat,ca.total],['200','20','22','242']);
 p.selection='PRIORITY';assert.equal(chosen(p,10).chosen.id,'courier-a');
 p.selection='MANUAL';p.manualId=a.id;p.manualReason='회수 일정';assert.equal(chosen(p,10).difference,'12');
 p.contracts[0].eggsConfirmed=false;assert.throws(()=>chosen(p,10),/MANUAL_INELIGIBLE/);
 p=policy([{...parcel,rates:[{...parcel.rates[0],amount:'0'}]}]);assert.deepEqual([chosen(p,10).chosen.status,chosen(p,10).chosen.total],['FEE','0']);
 p.contracts[0].status='FREE';assert.equal(chosen(p,10).chosen.status,'FREE');
 for(const s of ['UNSET','CONSULT','UNAVAILABLE']){p.contracts[0].status=s;assert.throws(()=>chosen(p,10),e=>e.candidates[0].reason===s);}
});
test('SH04/07/10/12 ambiguous, expired, unconfirmed and unmapped carrier quotes never become zero',()=>{
 for(const change of [{distanceKm:21},{capacityKg:1},{trip:null},{start:'2027-01-01',end:null},{end:'2026-11-19'},{prefixes:['41']},{postcode:'12345'},{enabled:false},{termsConfirmed:false},{days:[1]},{vat:'UNKNOWN'},{vat:'EXTRA',vatPercent:null},{extras:[{label:'대기',enabled:true,type:'QUOTE',amount:null}]}]){
  const p=policy([{...truck,...change}]);assert.throws(()=>chosen(p,11),/QUOTE_REQUIRED/);
 }
 const p=policy([{...truck,distanceKm:21,rates:[{...truck.rates[0],fromKm:20,toKm:25}]}]);assert.equal(chosen(p,11).chosen.total,'150');
 p.contracts[0].rates.push({...p.contracts[0].rates[0],id:'other',fromKm:21,toKm:28});assert.throws(()=>chosen(p,11),/QUOTE_REQUIRED/);
 const dup=policy([{...parcel,extras:[...['제주','제주 도서'].map(label=>({enabled:true,label,group:'ZONE',type:'FLAT',amount:'50'}))]}]);assert.throws(()=>validateCarrierPolicy(dup),/SURCHARGE_OVERLAP/);
 const cutoff=policy([{...parcel,cutoff:'12:00'}]);assert.throws(()=>selectCarrier(cutoff,{...detail(),serviceDate:'2026-11-19'}),/QUOTE_REQUIRED/);
});
test('SH06 freight capacity is checked on configured boxes, kg, volume, pallets and distance',()=>{
 for(const [measure,value] of Object.entries({TRAYS:10,BOXES:2,KG:6,M3:0.04,PALLETS:1,KM:20})){
   const p=policy([{...parcel,measure,min:value,max:value,distanceKm:20}]);assert.equal(chosen(p,10).chosen.total,'200');
   p.contracts[0].min=value+1;p.contracts[0].max=null;assert.throws(()=>chosen(p,10),/QUOTE_REQUIRED/);
 }
 const f=policy([{...parcel,mode:'FREIGHT',rates:[{id:'combined',zone:'base',maxKg:6,maxM3:0.04,amount:'25'}]}]);assert.equal(chosen(f,10).chosen.total,'25');
 f.contracts[0].rates[0].maxM3=0.03;assert.throws(()=>chosen(f,10),/QUOTE_REQUIRED/);
});
test('SH07/11 priority, stable tie-break and explicit manual explanation precede issuing',()=>{
 const p=policy([{...parcel,id:'second',priority:2},{...parcel,id:'first',priority:1}]);assert.equal(chosen(p,10).chosen.id,'first');
 p.contracts.reverse();p.contracts[1].priority=1;assert.equal(chosen(p,10).chosen.id,'first');
 p.selection='MANUAL';p.manualId='first';assert.throws(()=>chosen(p,10),/MANUAL/);
});
const supply=p=>({supplierId:'test-supplier',originId:'farm',productId:'sample-egg',groupId:'egg',unit:'tray',packaging:'carton',policyId:'fee',currency:'KRW',timeZone:'Asia/Seoul',packSize:18,minimumOrder:1,effectiveFrom:'2026-10-01T00:00:00.000Z',rounding:'HALF_UP',discount:{ruleId:'none',type:'NONE'},tax:{ruleId:'inc',type:'INCLUDED'},performance:{basis:'PREVIOUS_MONTH',scope:'SITE',event:'DELIVERED',adjustmentRuleId:'agreed',aggregationVersion:'r1',fallback:'DELIVERY'},tiers:[{min:1,max:50,price:'10',packMode:'FINAL'},{min:51,max:null,price:'5',packMode:'FINAL'}],delivery:{ruleSetId:'review-contract',regionVersion:'test',groupBasis:'SHIPMENT',regions:[],carrierPolicy:p}});
const stat={period:'2026-10',quantity:100,status:'FINAL',finalizedAt:'2026-11-05T01:00:00.000Z'};
const line=(id,site,ship,q)=>({id,siteId:site,shipmentId:ship,productId:'sample-egg',versionId:'v1',unit:'tray',region:'1100000000',regionVersion:'test',serviceDate:'2026-11-20',deliveryQty:q});
function simulate(p,lines){
 return simulateSupplyQuote({asOf,issue:true,lines,performanceByLine:Object.fromEntries(lines.map(l=>[l.id,stat])),
  versions:[{id:'v1',revision:3,status:'APPROVED',approvalId:'approval',approvedBy:'reviewer',approvedAt:asOf,policy:supply(p)}]});
}
test('SH06/08 prices use last month 100; freight uses current physical 10, overrides audited to issuer only',()=>{
 const p=policy();const order=simulate(p,[line('a','one','trip-1',10)]);assert.equal(order.issuer.selected[0].tierBasisQty,100);assert.equal(order.issuer.freight[0].load.TRAYS,10);
 assert.equal(order.issuer.freight[0].chosen.id,'courier-a');assert.equal(order.customer.quotes[0].total.decimal,'250');assert.ok(!JSON.stringify(order.customer).includes('courier-a'));
 const two=simulate(p,[line('a','one','trip-1',7),line('b','two','trip-2',4)]);assert.equal(two.issuer.freight.length,2);
 const one=simulate(p,[line('a','one','trip-1',7),line('b','one','trip-1',4)]);assert.equal(one.issuer.freight.length,1);assert.equal(one.issuer.freight[0].chosen.id,'truck-1');
 const split=[line('a','one','trip-1',7),line('b','one','trip-2',4)];assert.throws(()=>simulate(p,split),/SPLIT_NOT_ALLOWED/);
 p.splitAllowed=true;assert.deepEqual(simulate(p,split).issuer.freight.map(x=>x.load.TRAYS),[7,4]);
});
test('SH10 night, weekend/holiday and waiting charges require verified route terms and never silently stack',()=>{
 const night={label:'야간',enabled:true,type:'PERCENT',when:'TIME',amount:'20',fromTime:'22:00',toTime:'06:00'};
 const hol={label:'휴일',enabled:true,type:'PERCENT',when:'WEEKEND_HOLIDAY',amount:'10'};
 const wait={label:'대기',enabled:true,type:'PER_HOUR',when:'WAIT',amount:'120',freeMinutes:30};
 const p=policy([{...truck,serviceTime:'22:00',extras:[night,hol,wait]}]),c=p.contracts[0];
 const calc=(date)=>{validateCarrierPolicy(p);return selectCarrier(p,{...detail(11),serviceDate:date}).chosen;};
 assert.throws(()=>calc('2026-11-20'),/QUOTE_REQUIRED/);
 Object.assign(c,{calendarStart:'2026-11-01',calendarEnd:'2026-11-30',holidays:[],waitMinutes:30});
 assert.equal(calc('2026-11-20').total,'180');c.serviceTime='06:00';assert.equal(calc('2026-11-20').total,'150');
 assert.equal(calc('2026-11-21').total,'165');c.holidays=['2026-11-20'];c.serviceTime='22:00';
 assert.throws(()=>calc('2026-11-20'),/QUOTE_REQUIRED/);c.percentStack='BASE_ADDITIVE';assert.equal(calc('2026-11-20').total,'195');
 c.percentStack='COMPOUND';assert.equal(calc('2026-11-20').total,'198');c.waitMinutes=31;
 assert.throws(()=>calc('2026-11-20'),/QUOTE_REQUIRED/);
 Object.assign(c.extras[2],{increment:15,waitBasis:'AFTER_FREE',rounding:'UP'});assert.equal(calc('2026-11-20').total,'228');
});
