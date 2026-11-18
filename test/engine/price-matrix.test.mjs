import test from 'node:test';
import assert from 'node:assert/strict';
import {createPriceMatrixModel} from '../../src/engine/calculation/price-matrix.mjs';
const model=createPriceMatrixModel();
test('matrix quantity ranges and packed additions preserve explicit absent/zero/consult states',()=>{
  const matrix={schema:1,grades:[{id:'g',name:'규격'}],rows:[{min:1,max:10,cells:['0','+3']},{min:11,max:null,cells:['협의','판매 안 함']}]};
  assert.deepEqual(model.errors(matrix),[]);
  for(const qty of [9,10])assert.deepEqual(model.select(matrix,qty,'g','packed'),{min:1,max:10,price:'0',packMode:'ADD',packFee:'3'});
  assert.equal(model.select(matrix,11,'g','raw').error,'PRICE_CONSULT');
  assert.equal(model.select(matrix,12,'g','packed').error,'PRICE_NOT_OFFERED');
  const bad=structuredClone(matrix);bad.rows[1].min=10;bad.rows[0].cells[0]='';assert.equal(model.errors(bad).length,2);
  assert.equal(model.select(bad,10,'g','raw').error,'PRICE_NOT_SET');
  assert.equal(model.shifted('1.2345','-1.2345'),'0');assert.equal(model.shifted('0.1','0.2'),'0.3');
  assert.equal(model.shifted('1','-2'),null);assert.equal(model.shifted('','1'),null);
});
