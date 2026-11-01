import test from 'node:test';
import assert from 'node:assert/strict';
import {currentPurchaseCost,totalPurchaseCost,quantityUnit,exactDisplay,convertMonthlyUnit,validMonthlyQuantity} from '../../web/quantity-contract.mjs';
test('monthly each does not become trays; user purchase price remains per package',()=>{
  assert.deepEqual(currentPurchaseCost({qty:'200',qtyUnit:'each',pack:'30',price:'6600'}),{numerator:'44000',denominator:'1'});
  assert.deepEqual(currentPurchaseCost({qty:'50',qtyUnit:'each',pack:'30',price:'1000'}),{numerator:'5000',denominator:'3'});
});
test('unit changes preserve exact base amount including fractional trays',()=>{
 const line={qty:'50',qtyUnit:'each',pack:'30',price:'6600'};
 const converted=convertMonthlyUnit(line,'tray');
 assert.equal(converted.qty,'5/3');assert.equal(validMonthlyQuantity(converted),true);
 assert.deepEqual(currentPurchaseCost(converted),{numerator:'11000',denominator:'1'});
 assert.equal(convertMonthlyUnit(converted,'each').qty,'50');
 assert.equal(validMonthlyQuantity({...converted,qty:'6/3'}),false);
});
test('legacy quantities retain their displayed package unit and exact total is not rounded',()=>{
  assert.equal(quantityUnit({pack:'30'}),'tray');assert.equal(quantityUnit({pack:'10'}),'pack');
  assert.deepEqual(totalPurchaseCost([{qty:'1',qtyUnit:'each',pack:'30',price:'1000'},{qty:'2',qtyUnit:'each',pack:'30',price:'1000'}]),{numerator:'100',denominator:'1'});
  assert.equal(exactDisplay({numerator:'5000',denominator:'3'}),'5,000/3');
  assert.equal(currentPurchaseCost({qty:'200',qtyUnit:'each',pack:'30',price:''}),null);
});
