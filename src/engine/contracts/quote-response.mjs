// Customer projection only. Full engine results/replay belong to the server owner.
export const QUOTE_RESPONSE_VERSION = 'quote-response-1';
const statuses = new Set(['OK','UNAVAILABLE','FAILED','EXPIRED']);
const reasons = new Set(['APPROVED_SOURCE_NOT_CONNECTED','SITE_NOT_AUTHORIZED','SOURCE_APPROVAL_REQUIRED','SOURCE_UNAVAILABLE','PRICE_UNAVAILABLE','PRICE_EXPIRED','CONDITIONS_UNRESOLVED','CONDITIONS_INVALID','COMPARISON_UNAVAILABLE','NETWORK_FAILURE','INVALID_RESPONSE']);
const eligibility = new Set(['ELIGIBLE','POLICY_UNRESOLVED','INELIGIBLE','CURRENT_PRICE_MISSING']);
const token = value => typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
export const validQuoteRevision = value => Number.isSafeInteger(value) && value >= 0 || token(value);
export const validQuoteRequestId = token;
const iso = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const grants = () => ({orderConfirmed:false,stockReserved:false,deliveryGuaranteed:false,globalMinimum:false});
function money(value, negative = false) {
  if (!value || !Number.isInteger(value.scale) || value.scale < 0 || value.scale > 12 || typeof value.minorUnits !== 'string' || !/^-?\d{1,100}$/.test(value.minorUnits)) return null;
  const units = BigInt(value.minorUnits);
  if (!negative && units < 0n) return null;
  const digits = (units < 0n ? -units : units).toString().padStart(value.scale + 1, '0');
  const decimal = (units < 0n ? '-' : '') + (value.scale ? digits.slice(0,-value.scale) + '.' + digits.slice(-value.scale) : digits);
  if (decimal !== value.decimal) return null;
  return {decimal,minorUnits:units.toString(),scale:value.scale};
}
function publicQuote(result) {
  const n = result?.normalized;
  if (result?.status !== 'VALID' || !n || !/^[A-Z]{3}$/.test(n.currency || '')) return null;
  const total = money(n.total);
  if (!total || n.validUntil != null && !iso(n.validUntil)) return null;
  let comparisonEligibility = eligibility.has(n.comparisonEligibility?.status) ? n.comparisonEligibility.status : 'POLICY_UNRESOLVED';
  const difference = comparisonEligibility === 'ELIGIBLE' ? money(n.comparison?.difference, true) : null;
  const current = difference ? money(n.comparison?.current) : null;
  if(comparisonEligibility==='ELIGIBLE'&&(!difference||!current||difference.scale!==total.scale||current.scale!==total.scale))comparisonEligibility='POLICY_UNRESOLVED';
  return {currency:n.currency,total,comparison:comparisonEligibility==='ELIGIBLE' ? {difference,current} : null,comparisonEligibility,
    validUntil:n.validUntil ?? null,basis:{scope:'DECLARED_LINES',period:'UNRESOLVED'},grants:grants()};
}
function publicReason(result) {
  if (result?.evidence?.validity?.status === 'EXPIRED') return 'PRICE_EXPIRED';
  return ({POLICY_UNRESOLVED:'CONDITIONS_UNRESOLVED',UNAVAILABLE:'PRICE_UNAVAILABLE',INVALID:'CONDITIONS_INVALID'})[result?.status] || 'CONDITIONS_INVALID';
}

/** Server-side calculation -> explicit public fields; never spread an engine result. */
export function customerQuoteResponse({requestId,inputRevision,completion='COMPLETE',results=[],status='OK',reasonCodes=[]}) {
  if (!validQuoteRequestId(requestId) || !validQuoteRevision(inputRevision) || !['COMPLETE','PARTIAL'].includes(completion) || !statuses.has(status) || !Array.isArray(results) || results.length > 100) throw new TypeError('INVALID_QUOTE_RESPONSE');
  const quotes = results.map(publicQuote).filter(Boolean);
  const codes = [...new Set([...reasonCodes.filter(code=>reasons.has(code)),...results.filter(result=>!publicQuote(result)).map(publicReason)])];
  if (status === 'OK' && results.length && !quotes.length) status = codes.includes('PRICE_EXPIRED') ? 'EXPIRED' : 'UNAVAILABLE';
  return {version:QUOTE_RESPONSE_VERSION,requestId,inputRevision,completion,status,reasonCodes:codes,quotes,coverage:{complete:completion==='COMPLETE',validQuoteCount:quotes.length},grants:grants()};
}

/** Validate and rebuild the transport boundary. Unknown/private keys never survive. */
export function readCustomerQuoteResponse(value) {
  if (!value || value.version !== QUOTE_RESPONSE_VERSION || !validQuoteRequestId(value.requestId) || !validQuoteRevision(value.inputRevision) || !['PARTIAL','COMPLETE'].includes(value.completion) || !statuses.has(value.status) || !Array.isArray(value.reasonCodes) || value.reasonCodes.length > 20 || !Array.isArray(value.quotes) || value.quotes.length > 100) throw new TypeError('INVALID_QUOTE_RESPONSE');
  const quotes = value.quotes.map(quote=>{
    const total = money(quote?.total), comparison = quote?.comparison == null ? null : money(quote.comparison.difference,true), current=quote?.comparison?.current==null?null:money(quote.comparison.current);
    if (!total || !/^[A-Z]{3}$/.test(quote.currency || '') || !eligibility.has(quote.comparisonEligibility) || quote.validUntil != null && !iso(quote.validUntil) || quote.comparison != null && (!comparison || !current || quote.comparisonEligibility !== 'ELIGIBLE' || comparison.scale!==total.scale || current.scale!==total.scale)) throw new TypeError('INVALID_QUOTE_RESPONSE');
    return {currency:quote.currency,total,comparison:comparison ? {difference:comparison,current} : null,comparisonEligibility:quote.comparisonEligibility,validUntil:quote.validUntil ?? null,basis:{scope:'DECLARED_LINES',period:'UNRESOLVED'},grants:grants()};
  });
  if (value.status !== 'OK' && quotes.length) throw new TypeError('INVALID_QUOTE_RESPONSE');
  if (value.status === 'OK' && (value.reasonCodes.some(code=>['NETWORK_FAILURE','INVALID_RESPONSE','APPROVED_SOURCE_NOT_CONNECTED','SITE_NOT_AUTHORIZED','SOURCE_APPROVAL_REQUIRED','SOURCE_UNAVAILABLE'].includes(code)) || !quotes.length && value.reasonCodes.length)) throw new TypeError('INVALID_QUOTE_RESPONSE');
  return {version:QUOTE_RESPONSE_VERSION,requestId:value.requestId,inputRevision:value.inputRevision,completion:value.completion,status:value.status,
    reasonCodes:[...new Set(value.reasonCodes.filter(code=>reasons.has(code)))],quotes,coverage:{complete:value.completion==='COMPLETE',validQuoteCount:quotes.length},grants:grants()};
}

/** Semantic permissions for existing UI copy; this supplies no customer wording. */
export function quoteProofGate(snapshot) {
  const response = snapshot?.response, complete = snapshot?.status === 'COMPLETE' && response?.completion === 'COMPLETE' && response?.status === 'OK';
  const quotes = response?.quotes || [];
  const comparable = complete && quotes.length === 1 && quotes[0].comparisonEligibility === 'ELIGIBLE' && quotes[0].comparison?.current != null && quotes[0].comparison?.difference != null;
  const difference = comparable ? BigInt(quotes[0].comparison.difference.minorUnits) : null;
  return {amountAllowed:complete && quotes.length > 0,comparisonAllowed:comparable,savingsAllowed:comparable && difference > 0n,
    noSavingsAllowed:comparable && difference === 0n,increaseAllowed:comparable && difference < 0n,
    emptyAllowed:snapshot?.status === 'EMPTY',partialAllowed:snapshot?.status === 'PARTIAL',viewPartialAllowed:snapshot?.status === 'PARTIAL' && quotes.length > 0,
    errorAllowed:snapshot?.status === 'FAILED',expiredAllowed:snapshot?.status === 'EXPIRED',...grants()};
}
