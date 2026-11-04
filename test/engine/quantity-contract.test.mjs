import test from 'node:test';
import assert from 'node:assert/strict';
import {currentPurchaseCost,totalPurchaseCost,quantityUnit,quantityInputText,quantityDisplayNote,moneyDisplay,numericInput,baseQuantity,exactDisplay,convertMonthlyUnit,validMonthlyQuantity} from '../../web/quantity-contract.mjs';
test('monthly each does not become trays; user purchase price remains per package',()=>{
  assert.deepEqual(currentPurchaseCost({qty:'200',qtyUnit:'each',pack:'30',price:'6600'}),{numerator:'46200',denominator:'1'});
  assert.deepEqual(currentPurchaseCost({qty:'50',qtyUnit:'each',pack:'30',price:'1000'}),{numerator:'2000',denominator:'1'});
});
test('unit changes preserve exact base amount including fractional trays',()=>{
 const line={qty:'50',qtyUnit:'each',pack:'30',price:'6600'};
 const converted=convertMonthlyUnit(line,'tray');
 assert.equal(converted.qty,'50');assert.equal(converted.qtyUnit,'each');assert.equal(converted.qtyDisplayUnit,'tray');assert.equal(quantityInputText(converted),'2');assert.equal(validMonthlyQuantity(converted),true);
 assert.deepEqual(currentPurchaseCost(converted),{numerator:'13200',denominator:'1'});
 assert.equal(convertMonthlyUnit(converted,'each').qty,'50');
 assert.equal(validMonthlyQuantity({...converted,qty:'6/3'}),false);
});
test('legacy quantities retain their displayed package unit and exact total is not rounded',()=>{
  assert.equal(quantityUnit({pack:'30'}),'tray');assert.equal(quantityUnit({pack:'10'}),'pack');
  assert.deepEqual(totalPurchaseCost([{qty:'1',qtyUnit:'each',pack:'30',price:'1000'},{qty:'2',qtyUnit:'each',pack:'30',price:'1000'}]),{numerator:'2000',denominator:'1'});
  assert.equal(exactDisplay({numerator:'5000',denominator:'3'}),'확인 필요');
  assert.equal(currentPurchaseCost({qty:'200',qtyUnit:'each',pack:'30',price:''}),null);
  assert.equal(validMonthlyQuantity({qty:'2',qtyUnit:'tray',pack:'10'}),false,'unsupported restored unit cannot be relabeled as packs');
});

for(const [demand,packs] of [['6000','200'],['6001','201'],['6050','202'],['6060','202'],['6061','203']])test(`F03 demand ${demand} shows ${packs} packs without changing exact demand`,()=>{
 const line={qty:demand,qtyUnit:'each',pack:'30',price:'10000'};
 const display=convertMonthlyUnit(line,'tray');assert.equal(quantityInputText(display),packs);assert.equal(baseQuantity(display).n,BigInt(demand));assert.equal(display.qty,demand);assert.equal(convertMonthlyUnit(display,'each').qty,demand);
 assert.equal(currentPurchaseCost(display).numerator,currentPurchaseCost(line).numerator);assert.ok(!quantityDisplayNote(display).includes('/'));
});
test('MSG0540 costs whole packages while raw 6050 and manual 6060 demands stay distinct',()=>{
 const demand={qty:'6050',qtyUnit:'each',pack:'30',price:'10000'};const manual={...demand,qty:'202',qtyUnit:'tray'};
 assert.deepEqual(currentPurchaseCost(demand),{numerator:'2020000',denominator:'1'});assert.equal(moneyDisplay(currentPurchaseCost(demand)),'2,020,000');assert.equal(baseQuantity(demand).n,6050n);
 assert.equal(baseQuantity(manual).n,6060n);assert.equal(moneyDisplay(currentPurchaseCost(manual)),'2,020,000');
});
test('MSG0540 aggregate sums whole-package row costs with exact arithmetic',()=>{
 const lines=Array.from({length:3},()=>({qty:'1',qtyUnit:'each',pack:'30',price:'10'}));
 assert.equal(moneyDisplay(currentPurchaseCost(lines[0])),'10');assert.equal(moneyDisplay(totalPurchaseCost(lines)),'30');
 assert.equal(moneyDisplay({numerator:'1',denominator:'2'}),'1');assert.equal(moneyDisplay({numerator:'-1',denominator:'2'}),'-1');
});
test('F03 integer parser rejects fraction/punctuation instead of concatenating digits',()=>{
 for(const raw of ['605/3','6,050,000/3','1e3','-20','abc20'])assert.equal(numericInput(raw),null);
 assert.equal(numericInput('6,050'),'6050');assert.equal(numericInput(''),'');assert.equal(numericInput('0020'),'20');
});
test('F03 10 and 20 packages preserve demand; legacy reviewed rational can render without fraction leakage',()=>{
 for(const pack of ['10','20']){const line={qty:'51',qtyUnit:'each',pack,price:'10000'};const selected=convertMonthlyUnit(line,'pack');assert.equal(quantityInputText(selected),pack==='10'?'6':'3');assert.equal(baseQuantity(selected).n,51n);}
 const old={qty:'605/3',qtyUnit:'tray',pack:'30',price:'10000',qtyExact:{representation:'rational',conversionReviewed:true,numerator:'605',denominator:'3'}};assert.equal(quantityInputText(old),'202');assert.equal(baseQuantity(old).n,6050n);assert.equal(quantityInputText(convertMonthlyUnit(old,'each')),'6050');
});

test('F03 comma editing stays editable while invalid metadata never renders a fraction or throws',()=>{
 assert.equal(numericInput('6,05'),null);assert.equal(quantityInputText({qty:'605/3',qtyUnit:'tray',pack:'30'}),'');
 assert.equal(quantityInputText({qty:'10가20',qtyUnit:'each',pack:'30'}),'10가20');
 assert.equal(quantityInputText({qty:'50',qtyUnit:'each',qtyDisplayUnit:'tray',pack:'10'}),'50');
});

test('F03 legacy fractional packages show exact base demand in summaries',()=>{
 const old={qty:'605/3',qtyUnit:'tray',pack:'30',price:'10000',qtyExact:{representation:'rational',conversionReviewed:true,numerator:'605',denominator:'3'}};
 assert.equal(quantityDisplayNote(old),'낱개 기준 총 6,050개');
 assert.equal(exactDisplay({numerator:'12345',denominator:'100'}),'123.45');
 assert.equal(exactDisplay({numerator:'-1',denominator:'2'}),'-0.5');
});

for(const pack of ['30','20','10'])test(`MSG0540 ${pack}-egg package bills two packages above one and roundtrip keeps raw demand`,()=>{
 const line={qty:String(Number(pack)+1),qtyUnit:'each',pack,price:'10000'};
 const display=convertMonthlyUnit(line,pack==='30'?'tray':'pack');
 assert.equal(quantityInputText(display),'2');assert.equal(convertMonthlyUnit(display,'each').qty,line.qty);
 assert.equal(currentPurchaseCost(display).numerator,'20000');
});
test('MSG0540 twelve-digit quantity and price use exact integer products beyond Number precision',()=>{
 const line={qty:'999999999999',qtyUnit:'tray',pack:'30',price:'999999999999'};
 assert.deepEqual(currentPurchaseCost(line),{numerator:'999999999998000000000001',denominator:'1'});
 assert.equal(moneyDisplay(currentPurchaseCost(line)),'999,999,999,998,000,000,000,001');
 assert.equal(totalPurchaseCost([line,line]).numerator,'1999999999996000000000002');
 assert.equal(currentPurchaseCost({...line,qty:''}),null);assert.equal(currentPurchaseCost({...line,qty:'0'}),null);
});
