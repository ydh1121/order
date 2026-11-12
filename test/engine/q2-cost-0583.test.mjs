import test from 'node:test';
import assert from 'node:assert/strict';
import {projectQ2Costs} from '../../web/q2-cost.mjs';
import {moneyDisplay} from '../../web/quantity-contract.mjs';
const line=(id,qty='31',price='5000')=>({id,housing:'4',size:'특란',pack:'30',qty,qtyUnit:'each',price});
const state=(qty='31',price='5000',extra={})=>({quantity:{valid:true,value:qty,composing:false},price:{valid:true,value:price,composing:false},unit:'each',...extra});
const money=value=>value===null?null:moneyDisplay(value);
test('Q2 raw incomplete/composing/zero must not resurrect stored valid money',()=>{
 for(const draft of [state(''),state('0'),state('31',''),state('31','0'),state('31','5000',{quantity:{valid:false,value:null}}),state('31','5000',{quantity:{valid:true,value:'31',composing:true}}),state('31','5000',{price:{valid:true,value:'5000',composing:true}})]){
  const result=projectQ2Costs([line('a')],()=>draft);assert.equal(result.rows[0].cost,null);assert.equal(result.total,null);
 }
});
test('Q2 valid accepted raw projection and all-active-row total are independent from storage',()=>{
 const a=line('a'),b={...line('b','3','2100'),pack:'20',qtyUnit:'pack'};
 const rows=new Map([['a',state()],['b',state('3','2100',{unit:'pack'})]]);
 const both=projectQ2Costs([a,b],id=>rows.get(id));assert.deepEqual(both.rows.map(x=>money(x.cost)),['10,000','6,300']);assert.equal(money(both.total),'16,300');
 rows.set('b',state('','2100',{unit:'pack'}));const partial=projectQ2Costs([a,b],id=>rows.get(id));assert.equal(money(partial.rows[0].cost),'10,000');assert.equal(partial.total,null);
 assert.equal(money(projectQ2Costs([a],()=>state('61','5000')).total),'15,000');assert.equal(a.qty,'31');
});
test('Q2 unit-only projection retains original demand and large cost is exact',()=>{
 const original={...line('a','6050','10000'),qtyDisplayUnit:'tray'};
 const result=projectQ2Costs([original],()=>state('202','10000',{unit:'tray'}));assert.equal(money(result.total),'2,020,000');assert.equal(original.qty,'6050');
 assert.equal(projectQ2Costs([original],()=>state('202','10000',{unit:'each'})).total,null);
 const huge={...line('a','999999999999','999999999999'),qtyUnit:'tray'};
 assert.equal(money(projectQ2Costs([huge],()=>state(huge.qty,huge.price,{unit:'tray'})).total),'999,999,999,998,000,000,000,001');
 assert.equal(projectQ2Costs([],()=>state()).total,null);
});
