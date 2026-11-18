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

test('Korean currency entry normalizes valid grouping and preserves distinct non-price states',()=>{
  for(const entry of [5980,'5980','5,980','5,980원','5,980 원'])assert.equal(model.normalize(entry),'5980');
  const matrix={schema:1,grades:[{id:'g',name:'규격'}],rows:[{min:1,max:null,cells:['5,980원','+210원']}]};
  assert.deepEqual(model.errors(matrix),[]);
  assert.equal(model.select(matrix,1,'g','packed').price,'5980');
  assert.equal(model.select(matrix,1,'g','packed').packFee,'210');
  for(const invalid of ['5,98','5,,980','-50','2원3',Infinity,null,{},'1,000,000,000,000']){
    matrix.rows[0].cells=[invalid,''];assert.ok(model.errors(matrix).length);
  }
  assert.deepEqual(['',0,'협의','판매 안 함','미판매'].map(model.normalize),['','0','협의','미판매','미판매']);
  assert.equal(model.scaled('5,980원','-5'),'5681');assert.equal(model.scaled('1','-100'),'0');
  assert.equal(model.scaled('0.0001','50'),'0.0002');assert.equal(model.scaled('1','-101'),null);
});
