import {quantityDisplayUnit,quantityInputText,numericInput,currentPurchaseCost,totalPurchaseCost} from './quantity-contract.mjs';

// Display uses the current numeric owner's accepted raw state, not a stale
// durable line or completion badge. This projection never writes a line.
export function projectQ2Costs(lines,read){
 const projected=[],rows=lines.map(line=>{
  const draft=read(line.id),qty=draft?.quantity,price=draft?.price;
  if(!qty?.valid||qty.composing||!price?.valid||price.composing||draft.unit!==quantityDisplayUnit(line))return {id:line.id,cost:null};
  const next={...line,price:price.value};
  // Unit-only display changes retain original demand (including old exact
  // metadata); an actual accepted quantity edit is in the displayed unit.
  if(qty.value!==numericInput(quantityInputText(line))){next.qty=qty.value;next.qtyUnit=draft.unit;delete next.qtyExact;}
  const cost=currentPurchaseCost(next);if(cost!==null)projected.push(next);
  return {id:line.id,cost};
 });
 return {rows,total:lines.length&&projected.length===lines.length?totalPurchaseCost(projected):null};
}
