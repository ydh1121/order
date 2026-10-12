/**
 * Pure domain pricing. Never insert a guessed price/offer.
 * All prices are actual approved offer data loaded by an adapter.
 */
export function quote(offers, query, now = new Date()) {
  if (!Array.isArray(offers)) throw new TypeError("offers must be an array");
  const { housing, size, pack, region, monthlyTrays, dropTrays, currentTrayPrice } = query;
  const monthly = Number(monthlyTrays);
  const drop = Number(dropTrays);
  if (!housing || !size || !region || !Number.isInteger(Number(pack)) ||
      !Number.isFinite(monthly) || monthly <= 0 || !Number.isFinite(drop) || drop <= 0)
    return {kind:"invalid", reason:"견적 조건을 확인하세요."};
  const valid = offers.filter(o => o && o.status === "APPROVED" &&
    String(o.housing) === String(housing) && o.size === size &&
    Number(o.pack) === Number(pack) && Array.isArray(o.regions) && o.regions.includes(region) &&
    monthly >= Number(o.minMonthlyTrays) && drop >= Number(o.minDropTrays) &&
    Number.isFinite(o.pricePerTray) && o.pricePerTray > 0 &&
    typeof o.effectiveFrom === "string" &&
    Date.parse(o.effectiveFrom) <= now.valueOf() &&
    (!o.effectiveTo || Date.parse(o.effectiveTo) > now.valueOf()) &&
    typeof o.id === "string" && typeof o.priceRevision === "string"
  ).sort((a,b)=>a.pricePerTray-b.pricePerTray || a.id.localeCompare(b.id));
  if (valid.length===0) return {kind:"unavailable", reason:"해당 조건으로 승인된 납품가격이 없습니다."};
  const offer=valid[0];
  const previous = currentTrayPrice === "" || currentTrayPrice == null ? null : Number(currentTrayPrice);
  const saving = Number.isFinite(previous) && previous>=0 ? (previous-offer.pricePerTray)*monthly : null;
  return {kind:"priced",offerId:offer.id,revision:offer.priceRevision,
    trayPrice:offer.pricePerTray, monthlyPrice:offer.pricePerTray*monthly,
    savingPerMonth:saving, monthlyTrays:monthly, pack:Number(pack),
    pricedAt: now.toISOString()};
}
