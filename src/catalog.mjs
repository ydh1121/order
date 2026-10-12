/**
 * Local read adapter for approved offers. The file is a development data source,
 * not a production database or an authority for legal/commercial approval.
 */
const safeInt = (v) => Number.isSafeInteger(Number(v)) && Number(v) > 0;
const dateValue = (v) => typeof v === "string" ? Date.parse(v) : NaN;
export function normalizePricebook(payload, now = new Date()) {
  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.offers)) {
    throw new TypeError("상품 정보 형식이 올바르지 않습니다.");
  }
  const active = [];
  for (const o of payload.offers) {
    if (!o || o.status !== "APPROVED") continue;
    // Approval evidence and legal seller are mandatory for any live-visible offer.
    if (typeof o.id !== "string" || !o.id ||
        typeof o.priceRevision !== "string" || !o.priceRevision ||
        typeof o.approvedBy !== "string" || !o.approvedBy ||
        !Number.isFinite(dateValue(o.approvedAt)) ||
        typeof o.legalSellerId !== "string" || !o.legalSellerId ||
        !["1","2","3","4"].includes(String(o.housing)) ||
        typeof o.size !== "string" || !o.size.trim() ||
        !safeInt(o.pack) ||
        !Array.isArray(o.regions) || !o.regions.length ||
        !o.regions.every(r => typeof r === "string" && !!r.trim()) ||
        !safeInt(o.minMonthlyTrays) || !safeInt(o.minDropTrays) ||
        !safeInt(o.pricePerTray) ||
        !Number.isFinite(dateValue(o.effectiveFrom)) ||
        (o.effectiveTo && !Number.isFinite(dateValue(o.effectiveTo)))) {
      throw new TypeError("승인 상품에 필수 검증 정보가 누락되었습니다.");
    }
    if (dateValue(o.approvedAt) > now.valueOf()) continue;
    if (dateValue(o.effectiveFrom) > now.valueOf()) continue;
    if (o.effectiveTo && dateValue(o.effectiveTo) <= now.valueOf()) continue;
    if (o.availableQuantity === 0 || o.availabilityStatus === "UNAVAILABLE") continue;
    active.push(o);
  }
  return { offers: active, revision: payload.updatedAt ?? null };
}
export async function loadApprovedCatalog(fetcher = fetch, now = new Date()) {
  const response = await fetcher("/data/offers.json", { cache: "no-store" });
  if (!response.ok) throw new Error("상품 정보 조회 실패 (HTTP " + response.status + ")");
  const data = await response.json();
  return normalizePricebook(data, now);
}
export function catalogOptions(offers, query = {}) {
  const selected = offers.filter(o =>
    (!query.housing || String(o.housing) === String(query.housing)) &&
    (!query.size || o.size === query.size) &&
    (!query.pack || Number(o.pack) === Number(query.pack)));
  const unique = values => [...new Set(values)].sort((a,b) => String(a).localeCompare(String(b), "ko", {numeric:true}));
  return {
    housing: unique(offers.map(o => String(o.housing))),
    size: unique(offers.filter(o => !query.housing || String(o.housing) === String(query.housing)).map(o => o.size)),
    pack: unique(offers.filter(o =>
      (!query.housing || String(o.housing) === String(query.housing)) &&
      (!query.size || o.size === query.size)).map(o => Number(o.pack))),
    region: unique(selected.flatMap(o => o.regions))
  };
}
