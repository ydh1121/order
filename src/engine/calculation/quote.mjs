import { engineResult } from '../contracts/result.mjs';
import { exact, fromRatio, add, subtract, multiply, divide, compare, toJSON, round } from './exact.mjs';

const validId = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 200;
const isoTime = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const failure = (code, status = 'INVALID', evidence = {}) => { const error = new Error(code); error.status = status; error.evidence = evidence; throw error; };
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
  if (offer.effectiveTo != null && Date.parse(offer.effectiveTo) <= time) failure('PRICE_NOT_EFFECTIVE', 'UNAVAILABLE', {validity:{status:'EXPIRED', effectiveTo:offer.effectiveTo, asOf}});
  if (Date.parse(offer.approvedAt) > time || Date.parse(offer.effectiveFrom) > time) failure('PRICE_NOT_EFFECTIVE', 'UNAVAILABLE', {validity:{status:'NOT_YET_EFFECTIVE', effectiveFrom:offer.effectiveFrom, asOf}});
  if (!/^[A-Z]{3}$/.test(offer.currency || '')) failure('CURRENCY_INVALID');
  if (offer.availabilityStatus != null && offer.availabilityStatus !== 'AVAILABLE') failure('SUPPLY_UNAVAILABLE', 'UNAVAILABLE');
  return offer;
}

// These identifiers attest equal declared bases; they do not define a period,
// delivery policy, or tax treatment. Only a trusted adapter may supply them.
function comparisonEligibility(input, catalog, currency) {
  const verdict = (status, ...reasonCodes) => ({status, reasonCodes});
  if (input.comparisonTotal == null) return verdict('CURRENT_PRICE_MISSING', 'CURRENT_PURCHASE_TOTAL_REQUIRED');
  const context = input.comparisonContext;
  if (!context) return verdict('POLICY_UNRESOLVED', 'COMPARISON_BASIS_REQUIRED');
  if (!validId(context.source?.id) || !isoTime(context.source?.observedAt) || Date.parse(context.source.observedAt) > Date.parse(input.asOf)) return verdict('POLICY_UNRESOLVED', 'CURRENT_PURCHASE_PROVENANCE_REQUIRED');
  const {current, proposed} = context;
  if (!current || !proposed) return verdict('POLICY_UNRESOLVED', 'COMPARISON_BASIS_REQUIRED');
  for (const [key, label] of [['periodId','PERIOD'],['cadenceId','CADENCE'],['deliveryTermsId','DELIVERY_TERMS'],['costBasisId','COST_BASIS']]) {
    if (!validId(current[key]) || !validId(proposed[key])) return verdict('POLICY_UNRESOLVED', `COMPARISON_${label}_REQUIRED`);
    if (current[key] !== proposed[key]) return verdict('INELIGIBLE', `COMPARISON_${label}_MISMATCH`);
    if (input.lines.some(line => line[key] != null && line[key] !== proposed[key])) return verdict('INELIGIBLE', `COMPARISON_${label}_MISMATCH`);
  }
  if (!/^[A-Z]{3}$/.test(current.currency || '')) return verdict('POLICY_UNRESOLVED', 'COMPARISON_CURRENCY_REQUIRED');
  if (current.currency !== currency) return verdict('INELIGIBLE', 'COMPARISON_CURRENCY_MISMATCH');
  if (!Array.isArray(current.lines) || !current.lines.length || current.lines.length > 1000) return verdict('POLICY_UNRESOLVED', 'CURRENT_PURCHASE_LINES_REQUIRED');
  for (const [key, label] of [['periodId','PERIOD'],['cadenceId','CADENCE'],['deliveryTermsId','DELIVERY_TERMS'],['costBasisId','COST_BASIS']]) {
    if (current.lines.some(line => line?.[key] != null && line[key] !== current[key])) return verdict('INELIGIBLE', `COMPARISON_${label}_MISMATCH`);
  }
  const quantities = lines => {
    const totals = new Map();
    for (const line of lines) {
      if (!line || ![line.productId, line.siteId, line.region, line.unit].every(validId)) failure('COMPARISON_LINE_BASIS_REQUIRED');
      const product = catalog.products.find(p => p.id === line.productId);
      if (!product) failure('COMPARISON_PRODUCT_UNAVAILABLE');
      const quantity = fromRatio(line.quantity);
      if (quantity.n <= 0n) failure('COMPARISON_QUANTITY_NOT_POSITIVE');
      const key = JSON.stringify([line.productId,line.siteId,line.region]);
      totals.set(key, add(totals.get(key) || exact(0), multiply(quantity, factor(product,line.unit))));
    }
    return totals;
  };
  try {
    const candidate = quantities(input.lines), previous = quantities(current.lines);
    if (candidate.size !== previous.size || [...candidate].some(([key, quantity]) => !previous.has(key) || compare(quantity,previous.get(key)) !== 0)) return verdict('INELIGIBLE', 'COMPARISON_PRODUCT_SITE_REGION_QUANTITY_MISMATCH');
  } catch (error) { return verdict('POLICY_UNRESOLVED', error.message); }
  return verdict('ELIGIBLE');
}

function declaredCondition(offer, line, context, key, valueKey, label) {
  if (offer[key] == null) return;
  if (!Array.isArray(offer[key]) || !offer[key].length || !offer[key].every(validId)) failure(`${label}_CONSTRAINT_INVALID`);
  const value = line[valueKey] ?? context?.proposed?.[valueKey];
  if (!validId(value)) failure(`${label}_CONDITION_REQUIRED`, 'POLICY_UNRESOLVED');
  if (!offer[key].includes(value)) failure(`${label}_CONSTRAINT_UNSATISFIED`, 'UNAVAILABLE');
}

/**
 * Pure declared-line calculation; it never selects a recommended supplier/price.
 * Approved source data remains the caller's responsibility. A metadata signature
 * is not verified here and must not be treated as commercial authorization.
 */
export function calculateQuote(request) {
  const { input, catalog, priceBook, rules } = request || {};
  const finish = (status, reasonCodes, normalized = null, evidence = {}) => engineResult({status, reasonCodes, raw: input ?? null, normalized, field: 'quote', ruleVersion: rules?.version ?? null, dataVersion: {catalog:catalog?.version ?? null, prices:priceBook?.version ?? null}, evidence: {selectionPolicy:'CALLER_SELECTED_OFFER', optimization:'NOT_PERFORMED', stockReservation:'NOT_PERFORMED', fulfillmentStatus:'NOT_VERIFIED', ...evidence, realOrderApproval: false }});
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
    let subtotal = exact(0), currency = null, validUntil = null;
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
      if (offer.effectiveTo != null && (validUntil == null || offer.effectiveTo < validUntil)) validUntil = offer.effectiveTo;
      if (offer.productId !== product.id) failure('PRICE_PRODUCT_MISMATCH');
      if (offer.regions != null && (!Array.isArray(offer.regions) || !offer.regions.includes(line.region))) failure('REGION_CONSTRAINT_UNSATISFIED', 'UNAVAILABLE');
      if (offer.siteIds != null && (!Array.isArray(offer.siteIds) || !offer.siteIds.includes(line.siteId))) failure('SITE_CONSTRAINT_UNSATISFIED', 'UNAVAILABLE');
      declaredCondition(offer,line,input.comparisonContext,'periodIds','periodId','PERIOD');
      declaredCondition(offer,line,input.comparisonContext,'cadenceIds','cadenceId','CADENCE');
      declaredCondition(offer,line,input.comparisonContext,'deliveryTermsIds','deliveryTermsId','DELIVERY_TERMS');
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
      lines.push({id:line.id, siteId:line.siteId, productId:product.id, groupId:product.groupId, quantity:toJSON(quantity), unit:line.unit, baseUnit:product.baseUnit, baseQuantity:toJSON(baseQuantity), priceUnit:offer.unit, pricedQuantity:toJSON(pricedQuantity), unitPrice:toJSON(unitPrice), amount:toJSON(amount), approvalId:offer.approvalId, offerId:offer.id, priceRevision:offer.priceRevision, conversion: {inputUnitFactor:toJSON(conversion), priceUnitFactor:toJSON(priceUnitFactor)}, inventory:{status:offer.availableQuantity == null ? 'NOT_DECLARED' : 'DECLARED_NOT_RESERVED', availableQuantity:offer.availableQuantity == null ? null : toJSON(exact(offer.availableQuantity)), sourceId:validId(offer.inventorySource?.id) ? offer.inventorySource.id : null, observedAt:isoTime(offer.inventorySource?.observedAt) && Date.parse(offer.inventorySource.observedAt) <= Date.parse(input.asOf) ? offer.inventorySource.observedAt : null}});
    }
    const replay = structuredClone({ input, catalog, priceBook, rules });
    const normalized = {currency, lines, siteSubtotals:[...totalsBySite].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([siteId, amount]) => ({siteId, amount:toJSON(amount)})), merchandiseSubtotal:toJSON(subtotal), displayedMerchandiseSubtotal:round(subtotal, rules.rounding), total:null, comparison:null, comparisonEligibility:comparisonEligibility(input,catalog,currency), validUntil};
    const missing = ['tax', 'shipping', 'discount'].filter(key => rules.costComponents?.[key]?.amount == null);
    if (missing.length) {
      const reasonCodes = missing.map(key => key.toUpperCase() + '_POLICY_REQUIRED');
      normalized.comparisonEligibility = {status:'POLICY_UNRESOLVED',reasonCodes};
      return finish('POLICY_UNRESOLVED', reasonCodes, normalized, {replay, calculationScope:'DECLARED_LINES', missingComponents:missing});
    }
    const components = {};
    for (const key of ['tax', 'shipping', 'discount']) {
      const component = rules.costComponents[key];
      if (!validId(component.ruleId)) {
        normalized.comparisonEligibility = {status:'POLICY_UNRESOLVED',reasonCodes:['COST_COMPONENT_RULE_ID_REQUIRED']};
        return finish('POLICY_UNRESOLVED', ['COST_COMPONENT_RULE_ID_REQUIRED'], normalized, {replay, calculationScope:'DECLARED_LINES'});
      }
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
      if (!input.comparisonContext || normalized.comparisonEligibility.status === 'ELIGIBLE') normalized.comparison = {previous:toJSON(previous), current:round(previous, rules.rounding), difference:round(subtract(previous, total), rules.rounding)};
    }
    return finish('VALID', [], normalized, {replay, calculationScope:'DECLARED_LINES', roundingStage:'TOTAL', lineRounding:false, stockReservation:'NOT_PERFORMED', fulfillmentStatus:'NOT_VERIFIED'});
  } catch (error) { return finish(error.status || 'INVALID', [error.message], null, error.evidence); }
}
