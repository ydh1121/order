import { engineResult } from '../contracts/result.mjs';
import { exact, fromRatio, add, subtract, multiply, divide, compare, toJSON, round } from './exact.mjs';

const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const isoTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const failure = (code, status = 'INVALID') => { const error = new Error(code); error.status = status; throw error; };
function assertUnique(items, code) {
  if (!Array.isArray(items) || items.some(x => !x || !validId(x.id)) || new Set(items.map(x => x.id)).size !== items.length) failure(code);
}
function factor(product, unit) {
  if (!product.units || !Object.hasOwn(product.units, unit)) failure('UNIT_CONVERSION_UNAVAILABLE', 'UNAVAILABLE');
  const value = fromRatio(product.units[unit]);
  if (value.n <= 0n) failure('UNIT_FACTOR_NOT_POSITIVE');
  return value;
}
function approval(offer, asOf) {
  if (!offer || offer.status !== 'APPROVED') failure('PRICE_UNAVAILABLE', 'UNAVAILABLE');
  if (![offer.id, offer.priceRevision, offer.approvalId, offer.approvedBy, offer.legalSellerId, offer.productId, offer.unit].every(validId) || !isoTime(offer.approvedAt) || !isoTime(offer.effectiveFrom) || (offer.effectiveTo != null && !isoTime(offer.effectiveTo))) failure('PRICE_APPROVAL_METADATA_INVALID');
  const time = Date.parse(asOf);
  if (offer.effectiveTo != null && Date.parse(offer.effectiveTo) <= Date.parse(offer.effectiveFrom)) failure('PRICE_VALIDITY_INTERVAL_INVALID');
  if (Date.parse(offer.approvedAt) > time || Date.parse(offer.effectiveFrom) > time || offer.effectiveTo != null && Date.parse(offer.effectiveTo) <= time) failure('PRICE_NOT_EFFECTIVE', 'UNAVAILABLE');
  if (!/^[A-Z]{3}$/.test(offer.currency || '')) failure('CURRENCY_INVALID');
  if (offer.availabilityStatus != null && offer.availabilityStatus !== 'AVAILABLE') failure('SUPPLY_UNAVAILABLE', 'UNAVAILABLE');
  return offer;
}

/**
 * Pure declared-line calculation; it never selects a recommended supplier/price.
 * Approved source data remains the caller's responsibility. A metadata signature
 * is not verified here and must not be treated as commercial authorization.
 */
export function calculateQuote(request) {
  const { input, catalog, priceBook, rules } = request || {};
  const finish = (status, reasonCodes, normalized = null, evidence = {}) => engineResult({status, reasonCodes, raw: input ?? null, normalized, field: 'quote', ruleVersion: rules?.version ?? null, dataVersion: {catalog:catalog?.version ?? null, prices:priceBook?.version ?? null}, evidence: { ...evidence, realOrderApproval: false }});
  try {
    if (!isoTime(input?.asOf)) failure('EXPLICIT_CANONICAL_TIME_REQUIRED');
    if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 1000) failure('LINES_REQUIRED_OR_BUDGET_EXCEEDED');
    assertUnique(input.lines, 'LINE_IDS_INVALID');
    if (!validId(catalog?.version) || !Array.isArray(catalog.products) || !catalog.products.length) failure('CATALOG_UNAVAILABLE', 'UNAVAILABLE');
    if (!validId(priceBook?.version) || !Array.isArray(priceBook.offers) || !priceBook.offers.length) failure('PRICE_UNAVAILABLE', 'UNAVAILABLE');
    assertUnique(catalog.products, 'PRODUCT_IDS_INVALID');
    assertUnique(priceBook.offers, 'PRICE_IDS_INVALID');
    if (!validId(rules?.version)) failure('RULE_VERSION_REQUIRED', 'POLICY_UNRESOLVED');
    if (!rules.rounding || rules.rounding.stage !== 'TOTAL') failure('ROUNDING_POLICY_REQUIRED', 'POLICY_UNRESOLVED');
    // Validate rounding even when the subtotal happens to be an integer.
    round(exact(0), rules.rounding);
    let subtotal = exact(0), currency = null;
    const totalsBySite = new Map();
    const quantitiesByOffer = new Map();
    const lines = [];
    for (const line of input.lines) {
      if (![line.siteId, line.productId, line.unit].every(validId)) failure('LINE_IDENTITY_REQUIRED');
      if (!validId(line.offerId)) failure('PRICE_SELECTION_REQUIRED', 'POLICY_UNRESOLVED');
      const product = catalog.products.find(p => p.id === line.productId);
      if (!product) failure('PRODUCT_UNAVAILABLE', 'UNAVAILABLE');
      if (![product.groupId, product.baseUnit].every(validId)) failure('PRODUCT_UNIT_METADATA_INVALID');
      if (compare(factor(product, product.baseUnit), exact(1)) !== 0) failure('BASE_UNIT_FACTOR_NOT_ONE');
      const quantity = fromRatio(line.quantity);
      if (quantity.n <= 0n) failure('QUANTITY_NOT_POSITIVE');
      const conversion = factor(product, line.unit);
      const baseQuantity = multiply(quantity, conversion);
      const offer = approval(priceBook.offers.find(o => o.id === line.offerId), input.asOf);
      if (offer.productId !== product.id) failure('PRICE_PRODUCT_MISMATCH');
      if (offer.regions != null && (!Array.isArray(offer.regions) || !offer.regions.includes(line.region))) failure('REGION_CONSTRAINT_UNSATISFIED', 'UNAVAILABLE');
      if (offer.siteIds != null && (!Array.isArray(offer.siteIds) || !offer.siteIds.includes(line.siteId))) failure('SITE_CONSTRAINT_UNSATISFIED', 'UNAVAILABLE');
      const priceUnitFactor = factor(product, offer.unit);
      const pricedQuantity = divide(baseQuantity, priceUnitFactor);
      if (offer.minQuantity != null && offer.maxQuantity != null && compare(exact(offer.minQuantity),exact(offer.maxQuantity)) > 0) failure('QUANTITY_CONSTRAINT_INVALID');
      for (const [key, sign] of [['minQuantity', -1], ['maxQuantity', 1]]) {
        if (offer[key] != null) {
          const boundary = exact(offer[key]);
          if (boundary.n <= 0n) failure('QUANTITY_CONSTRAINT_INVALID');
          if (compare(pricedQuantity, boundary) === sign) failure('QUANTITY_CONSTRAINT_UNSATISFIED', 'UNAVAILABLE');
        }
      }
      if (offer.quantityStep != null) {
        const step = exact(offer.quantityStep);
        if (step.n <= 0n) failure('QUANTITY_STEP_INVALID');
        if (divide(pricedQuantity, step).d !== 1n) failure('QUANTITY_STEP_UNSATISFIED', 'UNAVAILABLE');
      }
      if (offer.availableQuantity != null) {
        const available = exact(offer.availableQuantity);
        if (available.n < 0n) failure('AVAILABLE_QUANTITY_INVALID');
        if (compare(add(quantitiesByOffer.get(offer.id) || exact(0),pricedQuantity),available) > 0) failure('INSUFFICIENT_DECLARED_STOCK', 'UNAVAILABLE');
      }
      quantitiesByOffer.set(offer.id,add(quantitiesByOffer.get(offer.id) || exact(0),pricedQuantity));
      const unitPrice = exact(offer.unitPrice);
      if (unitPrice.n <= 0n) failure('UNIT_PRICE_NOT_POSITIVE');
      if (currency !== null && currency !== offer.currency) failure('CURRENCY_CONVERSION_UNRESOLVED', 'POLICY_UNRESOLVED');
      currency = offer.currency;
      const amount = multiply(pricedQuantity, unitPrice);
      subtotal = add(subtotal, amount);
      totalsBySite.set(line.siteId, add(totalsBySite.get(line.siteId) || exact(0), amount));
      lines.push({id:line.id, siteId:line.siteId, productId:product.id, groupId:product.groupId, quantity:toJSON(quantity), unit:line.unit, baseUnit:product.baseUnit, baseQuantity:toJSON(baseQuantity), priceUnit:offer.unit, pricedQuantity:toJSON(pricedQuantity), unitPrice:toJSON(unitPrice), amount:toJSON(amount), approvalId:offer.approvalId, offerId:offer.id, priceRevision:offer.priceRevision, conversion: {inputUnitFactor:toJSON(conversion), priceUnitFactor:toJSON(priceUnitFactor)}});
    }
    const replay = structuredClone({ input, catalog, priceBook, rules });
    const normalized = {currency, lines, siteSubtotals:[...totalsBySite].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([siteId, amount]) => ({siteId, amount:toJSON(amount)})), merchandiseSubtotal:toJSON(subtotal), displayedMerchandiseSubtotal:round(subtotal, rules.rounding), total:null, comparison:null};
    const missing = ['tax', 'shipping', 'discount'].filter(key => !rules.costComponents?.[key]);
    if (missing.length) return finish('POLICY_UNRESOLVED', missing.map(key => key.toUpperCase() + '_POLICY_REQUIRED'), normalized, {replay, calculationScope:'DECLARED_LINES', missingComponents:missing});
    const components = {};
    for (const key of ['tax', 'shipping', 'discount']) {
      const component = rules.costComponents[key];
      if (!validId(component.ruleId)) failure('COST_COMPONENT_RULE_ID_REQUIRED', 'POLICY_UNRESOLVED');
      components[key] = exact(component.amount);
      if (components[key].n < 0n) failure('NEGATIVE_COST_COMPONENT');
    }
    const total = subtract(add(add(subtotal, components.tax), components.shipping), components.discount);
    if (total.n < 0n) failure('DISCOUNT_EXCEEDS_TOTAL');
    normalized.total = round(total, rules.rounding);
    normalized.costComponents = Object.fromEntries(Object.entries(components).map(([key, amount]) => [key, {amount:toJSON(amount), ruleId:rules.costComponents[key].ruleId}]));
    if (input.comparisonTotal != null) {
      const previous = exact(input.comparisonTotal);
      if (previous.n < 0n) failure('NEGATIVE_COMPARISON_TOTAL');
      normalized.comparison = {previous:toJSON(previous), difference:round(subtract(previous, total), rules.rounding)};
    }
    return finish('VALID', [], normalized, {replay, calculationScope:'DECLARED_LINES', roundingStage:'TOTAL', lineRounding:false, stockReservation:'NOT_PERFORMED', fulfillmentStatus:'NOT_VERIFIED'});
  } catch (error) { return finish(error.status || 'INVALID', [error.message]); }
}
