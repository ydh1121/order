import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSupplyPolicy, simulateSupplyQuote, previousPeriod} from '../../src/engine/calculation/supply-policy.mjs';
const asOf='2026-11-19T02:30:00.000Z';
const policy=()=>({supplierId:'sample-co',originId:'sample-origin',productId:'sku',groupId:'egg',unit:'pack',packaging:'carton',policyId:'cost',currency:'KRW',timeZone:'Asia/Seoul',packSize:18,minimumOrder:10,effectiveFrom:'2026-10-01T00:00:00.000Z',effectiveTo:null,rounding:'HALF_UP',discount:{ruleId:'no-discount',type:'NONE'},tax:{ruleId:'tax-included',type:'INCLUDED'},performance:{basis:'DELIVERY'},tiers:[{min:1,max:10,price:'100',packMode:'ADD',packFee:'7'},{min:11,max:30,price:'90',packMode:'FINAL'},{min:31,max:50,price:'80',packMode:'FINAL'},{min:51,max:100,price:'70',packMode:'FINAL'},{min:101,max:500,price:'60',packMode:'FINAL'},{min:501,max:null,price:'50',packMode:'FINAL'}],delivery:{ruleSetId:'fee',regionVersion:'sample-r1',groupBasis:'SHIPMENT',regions:[{id:'base',label:'테스트 지역',prefix:'11',priority:1,minimumQty:10,weekdays:[0,1,2,3,4,5,6],status:'FEE',fee:'55'}]}});
const line=(qty)=>({id:'line',siteId:'a',shipmentId:'sh1',versionId:'v-1',productId:'sku',unit:'pack',deliveryQty:qty,serviceDate:'2026-11-20',region:'1100000000',regionVersion:'sample-r1'});
const vers=p=>({id:'v-1',revision:3,status:'APPROVED',approvalId:'approval-1',approvedBy:'reviewer',approvedAt:'2026-10-30T00:00:00.000Z',policy:p});
const run=(p,qty,other={})=>simulateSupplyQuote({asOf,lines:[line(qty)],versions:[vers(p)],...other});
for(const [qty,want] of [[10,'1125'],[11,'1045'],[30,'2755'],[31,'2535'],[50,'4055'],[51,'3625'],[100,'7055'],[101,'6115'],[500,'30055'],[501,'25105']])
  test('independent delivered total at quantity '+qty,()=>assert.equal(run(policy(),qty).customer.quotes[0].total.decimal,want));
test('minimum order is independent from tier existence, exact units and integers required',()=>{
 for(const qty of [0,-1,0.5,9])assert.throws(()=>run(policy(),qty),/QUANTITY_INVALID|MINIMUM/);
 assert.throws(()=>run(policy(),10,{lines:[{...line(10),unit:'pieces'}]}),/UNIT_OR_QUANTITY/);
});
test('finalized previous month applies to the tier only; missing, provisional and finalized zero differ',()=>{
 const p=policy();p.performance={basis:'PREVIOUS_MONTH',scope:'SITE',event:'DELIVERED',adjustmentRuleId:'net-returns',aggregationVersion:'a1',fallback:'DELIVERY'};
 const s={period:'2026-10',quantity:100,status:'FINAL',finalizedAt:asOf};
 assert.equal(run(p,10,{performanceByLine:{line:s}}).customer.quotes[0].total.decimal,'755');
 assert.equal(run(p,10,{performanceByLine:{line:{...s,quantity:0}}}).customer.quotes[0].total.decimal,'1125');
 for(const stat of [undefined,{...s,status:'PENDING'},{...s,period:'2026-09'},{...s,quantity:null}])assert.throws(()=>run(p,10,{performanceByLine:{line:stat}}),/PERFORMANCE_UNCONFIRMED/);
 assert.equal(previousPeriod('2026-10-31T15:00:00.000Z'),'2026-10');
});
test('region precedence, explicit free threshold, surcharge after waiver and no implicit free',()=>{
 const p=policy(),base=p.delivery.regions[0];
 p.delivery.regions.push({...base,id:'zip',zip:'00123',priority:2,freeQty:11,surcharge:'8'});
 const runZip=qty=>run(p,qty,{lines:[{...line(qty),zip:'00123'}]}).customer.quotes[0].total.decimal;
 assert.equal(runZip(10),'1133');assert.equal(runZip(11),'998');
 for(const status of ['UNSET','UNAVAILABLE','CONSULT']){base.status=status;base.fee=null;assert.throws(()=>run(p,10),new RegExp(status));}
 base.status='FREE';base.fee='0';assert.equal(run(p,10).customer.quotes[0].total.decimal,'1070');
});
test('physical shipment charged once for multiple SKU lines and separately for sites',()=>{
 const p=policy();const duplicate={...line(10),id:'b'};
 assert.equal(run(p,10,{lines:[line(10),duplicate]}).customer.quotes[0].total.decimal,'2195');
 assert.equal(run(p,10,{lines:[line(10),{...duplicate,siteId:'b'}]}).customer.quotes[0].total.decimal,'2250');
});
test('incomplete or ambiguous rules rejected before publication',()=>{
 for(const edit of [p=>{p.tiers[1].min=10;},p=>{p.tiers[1].min=12;},p=>{p.tiers.at(-1).max=1000;},p=>{p.tiers[1].packFee='2';},p=>{p.delivery.regions.push({...p.delivery.regions[0],id:'other',prefix:'11000'});},p=>{p.tax=null;},p=>{p.effectiveTo=p.effectiveFrom;}]){const p=policy();edit(p);assert.throws(()=>validateSupplyPolicy(p));}
});
test('short supplier validity blocks seven-day issue; future, withdrawn, unmatched region and service day fail closed',()=>{
 const p=policy();p.effectiveTo='2026-11-26T02:29:59.999Z';assert.throws(()=>run(p,10,{issue:true}),/SEVEN_DAY_GUARANTEE/);
 p.effectiveTo='2026-11-26T02:30:00.000Z';assert.equal(run(p,10,{issue:true}).issuer.expiresAt,p.effectiveTo);
 assert.throws(()=>run(p,10,{versions:[{...vers(p),status:'WITHDRAWN'}],issue:true}),/APPROVED_VERSION/);
 p.delivery.regions[0].weekdays=[1];assert.throws(()=>run(p,10),/DELIVERY_NOT_CONFIGURED/);
});
test('comparison denominator uses observed comparable current total; annual needs confirmed annual count',()=>{
 const p=policy(),l=line(10),basis={periodId:'delivery',cadenceId:'weekly',deliveryTermsId:'delivered',costBasisId:'all-in',currency:'KRW'};
 const comparison={total:'1500',context:{source:{id:'evidence',observedAt:asOf},current:{...basis,lines:[{...l,quantity:'10'}]},proposed:basis}};
 assert.deepEqual(run(p,10,{comparison}).issuer.savings,{percent:'25.00',annual:null});
 assert.deepEqual(run(p,10,{comparison,annualDeliveries:48}).issuer.savings,{percent:'25.00',annual:'18000'});
 assert.equal(run(p,10).issuer.savings,null);
 assert.equal(run(p,10,{comparison:{...comparison,total:'0'}}).issuer.savings,null);
});
