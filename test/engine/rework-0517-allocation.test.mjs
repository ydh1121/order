import test from 'node:test';
import assert from 'node:assert/strict';
import {createMonthlyAllocationDraft,inspectMonthlyAllocations,monthlyQuantityInputText,monthlyAllocationDisplay} from '../../web/allocation-ui.mjs';
const legacyLine=()=>({id:'L',housing:'1',size:'대란',pack:'30',qty:'605/3',qtyUnit:'tray',price:'10000',qtyExact:{representation:'rational',conversionReviewed:true,numerator:'605',denominator:'3'}});
const context=()=>({line:legacyLine(),locations:[{id:'A'},{id:'B'}],allocations:[
 {id:'AA',lineId:'L',locationId:'A',mode:'FLEX',qty:'12',monthlyDemandQty:'50',monthlyDemandUnit:'tray',monthlyDemandSource:'manual'},
 {id:'AB',lineId:'L',locationId:'B',mode:'FLEX',qty:'15',monthlyDemandQty:'',monthlyDemandUnit:'tray'}]});

test('F03 restored fractional trays project exact base units for Q4 and cancel leaves all saved units/raw intact',()=>{
 const source=context(),before=structuredClone(source),draft=createMonthlyAllocationDraft(source);
 assert.deepEqual(draft.rows.map(row=>[row.quantity.raw,row.quantity.unit,row.source]),[['1500','each','manual'],['4550','each','derived']]);
 assert.equal(draft.evaluate().normalized.totalBase.numerator,'6050');
 assert.deepEqual(source,before);
 const display=monthlyAllocationDisplay(draft.evaluate(),'B');assert.equal(display.remaining,'4,550');assert.equal(display.baseUnit,'each');
 draft.cancel();assert.deepEqual(source,before);
});

test('F03 explicit confirmation stores equivalent base allocations and preserves manual/derived and per-delivery values',()=>{
 const source=context(),draft=createMonthlyAllocationDraft(source),confirmed=draft.confirm();
 assert.equal(confirmed.ok,true);assert.deepEqual(confirmed.allocations.map(row=>[row.monthlyDemandQty,row.monthlyDemandUnit,row.monthlyDemandSource,row.qty]),[['1500','each','manual','12'],['4550','each','derived','15']]);
 assert.equal(inspectMonthlyAllocations({...source,allocations:confirmed.allocations}).normalized.canConfirm,true);
 draft.set('A','1501');assert.equal(draft.rows.find(row=>row.locationId==='B').quantity.raw,'4549');
 assert.equal(source.allocations[0].monthlyDemandQty,'50');assert.equal(source.line.qty,'605/3');
});

test('F03 stored rational monthly allocation converts to whole each without reinterpreting other missing units',()=>{
 const source=context();source.line={...legacyLine(),qty:'6050',qtyUnit:'each'};delete source.line.qtyExact;
 source.allocations[0]={...source.allocations[0],monthlyDemandQty:'5/3',monthlyDemandUnit:'tray',monthlyDemandExact:{raw:'5/3',unit:'tray',representation:'rational',conversionReviewed:true}};
 source.allocations[1]={...source.allocations[1],monthlyDemandQty:'6000',monthlyDemandSource:'manual'};delete source.allocations[1].monthlyDemandUnit;
 const draft=createMonthlyAllocationDraft(source);
 assert.deepEqual(draft.rows.map(row=>[row.quantity.raw,row.quantity.unit,row.source]),[['50','each','manual'],['6000','each','manual']]);
 assert.equal(draft.evaluate().normalized.canConfirm,true);
 assert.equal(draft.confirm().allocations[0].monthlyDemandExact,undefined);
});

test('F03 unreviewed or inconsistent fractions remain invalid privately and are blank on the editable surface',()=>{
 for(const metadata of [{representation:'rational',conversionReviewed:false},{representation:'rational',conversionReviewed:true,numerator:'99',denominator:'1'}]){
  const source=context();source.line={...legacyLine(),qty:'6050',qtyUnit:'each'};delete source.line.qtyExact;
  source.allocations[0]={...source.allocations[0],monthlyDemandQty:'5/3',monthlyDemandExact:{raw:'5/3',unit:'tray',...metadata}};
  const before=structuredClone(source),draft=createMonthlyAllocationDraft(source),row=draft.rows[0];
  assert.equal(row.quantity.raw,'5/3','Private raw is retained; no implicit empty-row proposal');
  assert.equal(monthlyQuantityInputText(row.quantity),'');assert.equal(draft.confirm().ok,false);assert.deepEqual(source,before);
  draft.set('A','50');assert.equal(draft.rows[0].quantity.raw,'50');assert.equal(draft.rows[0].source,'manual');
 }
});

test('F03 new each demand with saved tray rows projects a fractional-package remainder into exact each',()=>{
 const source=context();source.line={...legacyLine(),qty:'6050',qtyUnit:'each'};delete source.line.qtyExact;
 const draft=createMonthlyAllocationDraft(source);
 assert.deepEqual(draft.rows.map(row=>[row.quantity.raw,row.quantity.unit,row.source]),[['50','tray','manual'],['4550','each','derived']]);
 draft.set('A','51');assert.equal(draft.rows[1].quantity.raw,'4520');assert.equal(draft.rows[1].quantity.unit,'each');
 assert.equal(draft.confirm().ok,true);assert.equal(source.allocations[1].monthlyDemandQty,'');
});
