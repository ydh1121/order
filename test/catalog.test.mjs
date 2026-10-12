import test from "node:test";
import assert from "node:assert/strict";
import { normalizePricebook, catalogOptions, loadApprovedCatalog } from "../src/catalog.mjs";

const now = new Date("2026-10-13T00:00:00Z");
const offer = {
  id: "real-offer-ref", priceRevision: "v1", status: "APPROVED",
  approvedBy: "internal-approver-id", approvedAt: "2026-10-11T00:00:00Z",
  legalSellerId: "verified-seller-id", housing: "4", size: "XL",
  pack: 30, regions: ["서울", "경기"], minMonthlyTrays: 100,
  minDropTrays: 30, pricePerTray: 6800,
  effectiveFrom: "2026-10-12T00:00:00Z", effectiveTo: "2026-11-01T00:00:00Z"
};
// All values above are fixtures only; none is a live offer or an official price.
const book = offers => ({schemaVersion:1,updatedAt:null,offers});

test("empty approval catalog remains empty (not zero-priced)", () => {
  assert.deepEqual(normalizePricebook(book([]), now).offers, []);
});
test("DRAFT never appears in public catalog", () => {
  assert.equal(normalizePricebook(book([{...offer,status:"DRAFT"}]), now).offers.length, 0);
});
test("APPROVED without evidence or legal seller fails closed", () => {
  assert.throws(() => normalizePricebook(book([{...offer,approvedBy:undefined}]), now), /검증/);
  assert.throws(() => normalizePricebook(book([{...offer,legalSellerId:undefined}]), now), /검증/);
});
test("future and expired approvals excluded", () => {
  assert.equal(normalizePricebook(book([{...offer,effectiveFrom:"2026-12-01"}]), now).offers.length,0);
  assert.equal(normalizePricebook(book([{...offer,effectiveTo:"2026-10-12"}]), now).offers.length,0);
});
test("eligible offer drives housing-size-pack-region choices", () => {
  const items = normalizePricebook(book([offer,{...offer,id:"other",housing:"1",size:"L",pack:10,regions:["부산"]}]), now).offers;
  const options = catalogOptions(items,{housing:"4",size:"XL",pack:30});
  assert.deepEqual(options.size,["XL"]);
  assert.deepEqual(options.pack,[30]);
  assert.deepEqual(options.region,["경기","서울"]);
});
test("reader distinguishes network errors and valid empty data", async () => {
  const empty = await loadApprovedCatalog(async path => {
    assert.equal(path,"/data/offers.json");
    return {ok:true,json:async()=>book([])};
  },now);
  assert.deepEqual(empty.offers, []);
  await assert.rejects(loadApprovedCatalog(async()=>({ok:false,status:503}),now),/HTTP 503/);
});
