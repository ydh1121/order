import test from "node:test";
import assert from "node:assert/strict";
import { quote } from "../src/quote.mjs";
const now = new Date("2026-10-13T00:00:00Z");
const q={housing:"4",size:"XL",pack:30,region:"서울",monthlyTrays:200,dropTrays:50,currentTrayPrice:7000};
const eligible={id:"a",priceRevision:"r1",status:"APPROVED",housing:4,size:"XL",pack:30,regions:["서울"],minMonthlyTrays:200,minDropTrays:40,pricePerTray:6600,effectiveFrom:"2026-10-01T00:00:00Z"};
test("no made-up offer",()=>assert.equal(quote([],q,now).kind,"unavailable"));
test("sample fixture drives price and savings",()=>assert.deepEqual(
  (({trayPrice,monthlyPrice,savingPerMonth})=>({trayPrice,monthlyPrice,savingPerMonth}))(quote([eligible],q,now)),
  {trayPrice:6600,monthlyPrice:1320000,savingPerMonth:80000}
));
test("picks lowest approved eligible offer",()=>assert.equal(
  quote([eligible,{...eligible,id:"b",priceRevision:"r2",pricePerTray:6400}],q,now).offerId,"b"
));
test("unapproved and expired offers excluded",()=>assert.equal(
  quote([{...eligible,status:"DRAFT"},{...eligible,id:"e",effectiveTo:"2026-10-10"}],q,now).kind,"unavailable"
));
test("minimum lot, region and housing enforced",()=>{
 assert.equal(quote([eligible],{...q,dropTrays:10},now).kind,"unavailable");
 assert.equal(quote([eligible],{...q,region:"부산"},now).kind,"unavailable");
 assert.equal(quote([eligible],{...q,housing:"1"},now).kind,"unavailable");
});
test("missing required volume rejected",()=>assert.equal(quote([eligible],{...q,monthlyTrays:0},now).kind,"invalid"));
test("missing competitor price is null, not fake savings",()=>assert.equal(
 quote([eligible],{...q,currentTrayPrice:""},now).savingPerMonth,null
));
