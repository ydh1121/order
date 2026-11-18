// Server-side policy selection for the existing selected-offer calculator.
import { calculateQuote } from './quote.mjs';
import { exact, add, multiply, compare, divide, round, subtract, fromRatio } from './exact.mjs';
import { customerQuoteResponse } from '../contracts/quote-response.mjs';

import {PolicyError,validateCarrierPolicy,selectCarrier} from './freight-policy.mjs';
import {createPriceMatrixModel} from './price-matrix.mjs';
const priceMatrix=createPriceMatrixModel();
export {PolicyError};
const check = (condition, code) => { if (!condition) throw new PolicyError(code); };
const token = value => typeof value === 'string' && /^[\w.:-]{1,100}$/.test(value);
const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const integer = (v, minimum = 1) => Number.isSafeInteger(v) && v >= minimum && v <= 1_000_000_000;
const money = v => typeof v === 'string' && /^\d{1,15}(?:\.\d{1,4})?$/.test(v);
const has = (value, options) => options.includes(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const SEVEN_DAYS_MS = 7 * 86400000;

function checkPerformance(rule, allowPending) {
  check(has(rule?.basis, ['DELIVERY','PREVIOUS_MONTH']), 'TIER_BASIS_REQUIRED');
  if (rule.basis === 'DELIVERY') return;
  check(has(rule.fallback, ['DELIVERY','DEFAULT_TIER','CONSULT']), 'NEW_CUSTOMER_RULE_REQUIRED');
  check(rule.fallback !== 'DEFAULT_TIER' || integer(rule.defaultQty), 'DEFAULT_TIER_INVALID');
  check(has(rule.scope, ['BUSINESS','SITE','SUPPLIER','SKU','BUNDLE']) &&
    has(rule.event, ['ORDER_CONFIRMED','DELIVERED']) && (allowPending || token(rule.adjustmentRuleId) && token(rule.aggregationVersion)) && (rule.scope !== 'BUNDLE' || token(rule.bundleId)),
    'PERFORMANCE_POLICY_REQUIRED');
}
function checkDelivery(d) {
  check(d && token(d.ruleSetId) && token(d.regionVersion) && has(d.groupBasis,['SHIPMENT','SITE','PACK']), 'DELIVERY_POLICY_REQUIRED');
  check(Array.isArray(d.regions) && d.regions.length <= 100, 'REGIONS_INVALID');
  const keys = new Set();
  for (const r of d.regions) {
    check(r && token(r.id) && /^\d{2}(?:\d{3}(?:\d{5})?)?$/.test(r.prefix) &&
      typeof r.label === 'string' && r.label.trim() && r.label.length <= 120 &&
      integer(r.priority,0) && integer(r.minimumQty) && has(r.status,['FEE','FREE','UNSET','CONSULT','UNAVAILABLE']), 'REGION_INVALID');
    check(!keys.has(r.id), 'REGION_ID_DUPLICATE'); keys.add(r.id);
    check(r.zip == null || /^\d{5}$/.test(r.zip), 'POSTCODE_INVALID');
    check(Array.isArray(r.weekdays) && r.weekdays.length > 0 && r.weekdays.every(day=>Number.isInteger(day)&&day>=0&&day<=6), 'SERVICE_DAYS_REQUIRED');
    check(r.cutoff == null || /^([01]\d|2[0-3]):[0-5]\d$/.test(r.cutoff), 'CUTOFF_INVALID');
    check(r.status !== 'FEE' || money(r.fee), 'FEE_REQUIRED');
    check(r.status !== 'FREE' || r.fee === '0', 'EXPLICIT_FREE_REQUIRED');
    check(!has(r.status,['UNSET','CONSULT','UNAVAILABLE']) || r.fee == null, 'UNAVAILABLE_FEE_INVALID');
    check(r.surcharge == null || money(r.surcharge), 'SURCHARGE_INVALID');
    check(r.freeQty == null || integer(r.freeQty), 'FREE_THRESHOLD_INVALID');
    check(r.freeAmount == null || money(r.freeAmount), 'FREE_THRESHOLD_INVALID');
  }
  for (const [i,a] of d.regions.entries()) for (const b of d.regions.slice(i+1)) {
    const sameDestination = a.prefix.startsWith(b.prefix) || b.prefix.startsWith(a.prefix);
    const sameZip = !a.zip || !b.zip || a.zip === b.zip;
    check(!(a.priority === b.priority && sameDestination && sameZip && a.weekdays.some(n=>b.weekdays.includes(n))), 'REGION_PRIORITY_CONFLICT');
  }
}
export function validateSupplyPolicy(p,{allowPendingPerformance=false}={}) {
  check(p && [p.supplierId,p.originId,p.productId,p.groupId,p.unit,p.packaging,p.policyId].every(token), 'PRODUCT_SCOPE_REQUIRED');
  check(instant(p.effectiveFrom) && (p.effectiveTo == null || instant(p.effectiveTo) && p.effectiveTo > p.effectiveFrom), 'INVALID_EFFECTIVE_PERIOD');
  check(integer(p.packSize) && integer(p.minimumOrder), 'UNIT_OR_MINIMUM_INVALID');
  check(p.currency === 'KRW' && has(p.rounding,['HALF_UP','HALF_EVEN','DOWN','CEIL','FLOOR']), 'SETTLEMENT_POLICY_REQUIRED');
  check(p.tax && token(p.tax.ruleId) && has(p.tax.type,['INCLUDED','EXTRA_PERCENT']) &&
    (p.tax.type !== 'EXTRA_PERCENT' || money(p.tax.percent)), 'TAX_POLICY_REQUIRED');
  check(p.discount && token(p.discount.ruleId) && p.discount.type === 'NONE', 'DISCOUNT_POLICY_REQUIRED');
  check(p.timeZone === 'Asia/Seoul', 'UNSUPPORTED_OR_UNSET_TIME_ZONE');
  checkPerformance(p.performance,allowPendingPerformance);
  if (p.matrix) {
    check(priceMatrix.errors(p.matrix).length===0, 'PRICE_MATRIX_INVALID');
  } else {
    check(Array.isArray(p.tiers) && p.tiers.length > 0 && p.tiers.length <= 100, 'TIERS_REQUIRED');
    let next = 1;
    for (const row of p.tiers) {
      check(row && next !== null && row.min === next && (row.max === null || integer(row.max) && row.max >= next), 'TIER_COVERAGE_INVALID');
      check(money(row.price) && exact(row.price).n > 0n, 'TIER_PRICE_INVALID');
      check(has(row.packMode,['FINAL','ADD']) && (row.packMode === 'ADD' ? money(row.packFee) : row.packFee == null), 'PACK_COST_CONFLICT');
      next = row.max === null ? null : row.max + 1;
    }
    check(next === null, 'TIER_END_REQUIRED');
  }
  checkDelivery(p.delivery);
  validateCarrierPolicy(p.delivery.carrierPolicy);
  return p;
}

export function previousPeriod(asOf) {
  const kst = new Date(Date.parse(asOf) + 9*3600000);
  return new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth()-1,1)).toISOString().slice(0,7);
}
function tierBasis(rule,qty,stat,asOf) {
  if (rule.basis === 'DELIVERY') return qty;
  if(stat?.status==='UNAVAILABLE') throw new PolicyError('PERFORMANCE_LOOKUP_FAILED');
  // A finalized zero is different from a missing or still-processing observation.
  check(stat && stat.status === 'FINAL' && stat.period === previousPeriod(asOf) &&
    instant(stat.finalizedAt) && stat.finalizedAt <= asOf && integer(stat.quantity,0), 'PERFORMANCE_UNCONFIRMED');
  if (stat.quantity > 0) return stat.quantity;
  check(rule.fallback !== 'CONSULT','NEW_CUSTOMER_CONSULT');
  return rule.fallback === 'DEFAULT_TIER' ? rule.defaultQty : qty;
}
function shippingRule(policy,line,asOf) {
  check(/^\d{10}$/.test(line.region) && line.regionVersion === policy.delivery.regionVersion, 'DESTINATION_UNVERIFIED');
  check(/^\d{4}-\d\d-\d\d$/.test(line.serviceDate) && instant(line.serviceDate+'T00:00:00.000Z'), 'SERVICE_DATE_REQUIRED');
  const weekday = new Date(line.serviceDate+'T00:00:00Z').getUTCDay();
  const matches = policy.delivery.regions.filter(r=>line.region.startsWith(r.prefix) && (!r.zip || line.zip === r.zip) && r.weekdays.includes(weekday)).sort((a,b)=>b.priority-a.priority);
  if(policy.delivery.carrierPolicy){
    check(line.serviceDate>=new Date(Date.parse(asOf)+9*3600000).toISOString().slice(0,10),'DELIVERY_CUTOFF');
    return {id:policy.delivery.ruleSetId};
  }
  const r = matches[0];
  check(r && has(r.status,['FREE','FEE']), r?.status || 'DELIVERY_NOT_CONFIGURED');
  const local = new Date(Date.parse(asOf)+9*3600000).toISOString();
  check(line.serviceDate >= local.slice(0,10) && !(r.cutoff && line.serviceDate === local.slice(0,10) && local.slice(11,16) >= r.cutoff), 'DELIVERY_CUTOFF');
  return r;
}
function feeForGroup(g) {
  const r=g.rule;
  check(g.qty >= r.minimumQty, 'DELIVERY_MINIMUM_NOT_MET');
  const free = r.status === 'FREE' || r.freeQty != null && g.qty >= r.freeQty || r.freeAmount != null && compare(g.goods,exact(r.freeAmount))>=0;
  const base=free ? exact(0) : exact(r.fee);
  // Thresholds waive the base fee; a postcode/region surcharge is separately declared.
  return add(g.basis==='PACK' ? multiply(base,exact(g.qty)) : base, exact(r.surcharge ?? 0));
}

/** Internal server calculation for a selected set of offer versions and physical shipments. */
export function simulateSupplyQuote({asOf, lines, versions, performanceByLine={}, comparison=null, issue=false, requestId='simulation', inputRevision=0, annualDeliveries=null}) {
  check(instant(asOf) && Array.isArray(lines) && lines.length>0 && lines.length<=100 && Array.isArray(versions), 'QUOTE_INPUT_INVALID');
  check(new Set(lines.map(line=>line.id)).size===lines.length, 'DUPLICATE_LINE');
  const products=new Map(), offers=[], normalizedLines=[], groups=new Map(), selected=[];
  let tax=exact(0), shipping=exact(0), first=null;
  const expiresAt = new Date(Date.parse(asOf)+SEVEN_DAYS_MS).toISOString();
  const shipmentAllocations=new Map(),freight=[];
  for (const line of lines) {
    const version=versions.find(v=>v.id === line.versionId);
    check(version && (!issue || version.status === 'APPROVED'), 'APPROVED_VERSION_REQUIRED');
    const p=validateSupplyPolicy(version.policy);
    if (!first) first=p;
    check(p.rounding===first.rounding && p.currency===first.currency, 'MIXED_SETTLEMENT_POLICY');
    check(asOf >= p.effectiveFrom && (!p.effectiveTo || asOf < p.effectiveTo), 'VERSION_NOT_EFFECTIVE');
    check(!issue || !p.effectiveTo || p.effectiveTo >= expiresAt,'SEVEN_DAY_GUARANTEE_UNRESOLVED');
    check([line.id,line.siteId,line.shipmentId].every(token) && line.productId===p.productId && integer(line.deliveryQty) && line.unit===p.unit, 'UNIT_OR_QUANTITY_INVALID');
    check(line.deliveryQty>=p.minimumOrder,'ORDER_MINIMUM_NOT_MET');
    const qty=tierBasis(p.performance,line.deliveryQty,performanceByLine[line.id],asOf);
    const row=p.matrix ? priceMatrix.select(p.matrix,qty,line.grade,line.packing) : p.tiers.find(t=>qty>=t.min && (t.max===null || qty<=t.max));
    if (row.error) throw new PolicyError(row.error);
    const price=add(exact(row.price),exact(row.packMode==='ADD'?row.packFee:0));
    const amount=multiply(price,exact(line.deliveryQty));
    if(p.tax.type==='EXTRA_PERCENT') tax=add(tax,divide(multiply(amount,exact(p.tax.percent)),exact(100)));
    const rule=shippingRule(p,line,asOf);
    const carrierPolicy=p.delivery.carrierPolicy;
    const shipmentKey=JSON.stringify([p.supplierId,p.originId,line.siteId,line.serviceDate]);
    if(carrierPolicy){
      const prior=shipmentAllocations.get(shipmentKey);
      if(prior)check(prior.id===line.shipmentId||(carrierPolicy.splitAllowed&&prior.splitAllowed),'FREIGHT_SPLIT_NOT_ALLOWED');
      else shipmentAllocations.set(shipmentKey,{id:line.shipmentId,splitAllowed:carrierPolicy.splitAllowed});
    }
    const key=JSON.stringify([p.supplierId,p.originId,line.siteId,line.serviceDate,p.delivery.ruleSetId,!carrierPolicy && p.delivery.groupBasis==='SITE' ? '' : line.shipmentId]);
    let group=groups.get(key);
    if(!group){group={products:new Map(),basis:p.delivery.groupBasis,unit:p.unit,packSize:p.packSize,delivery:p.delivery,siteId:line.siteId,shipmentId:line.shipmentId,serviceDate:line.serviceDate,rule,qty:0,goods:exact(0),region:line.region,zip:line.zip??null};groups.set(key,group);}
    if(carrierPolicy){
      const {packing:_,...existing}=group.delivery.carrierPolicy??{};
      const {packing,...selectionPolicy}=carrierPolicy;
      check(group.unit===p.unit && group.region===line.region && group.zip===(line.zip??null) &&
        same(existing,selectionPolicy),'MIXED_SHIPPING_BASIS');
      const key=JSON.stringify([p.productId,p.packaging,packing]);
      const prior=group.products.get(key);
      if(prior)prior.qty+=line.deliveryQty;
      else group.products.set(key,{qty:line.deliveryQty,pack:packing});
    }else{
      check(group.unit===p.unit && group.packSize===p.packSize && group.region===line.region && group.zip===(line.zip??null) &&
        same(group.delivery,p.delivery) && group.rule.id===rule.id,'MIXED_SHIPPING_BASIS');
    }
    group.qty+=line.deliveryQty;group.goods=add(group.goods,amount);
    const product={id:p.productId,groupId:p.groupId,baseUnit:p.unit,units:{[p.unit]:'1'}};
    check(!products.has(p.productId) || same(products.get(p.productId),product),'MIXED_PRODUCT_BASIS');
    products.set(p.productId,product);
    const offerId=line.id;
    const formattedPrice=round(price,{scale:4,mode:'HALF_UP'}).decimal;
    offers.push({id:offerId,productId:p.productId,legalSellerId:p.supplierId,unit:p.unit,currency:p.currency,unitPrice:formattedPrice,explicitZero:Boolean(p.matrix && price.n===0n),status:'APPROVED',priceRevision:version.id,approvalId:version.approvalId||'SIMULATION',approvedBy:version.approvedBy||'SIMULATION',approvedAt:version.approvedAt||asOf,effectiveFrom:p.effectiveFrom,effectiveTo:p.effectiveTo,regions:[line.region],siteIds:[line.siteId]});
    normalizedLines.push({id:line.id,offerId,quantity:String(line.deliveryQty),unit:line.unit,region:line.region,siteId:line.siteId,productId:line.productId});
    selected.push({lineId:line.id,versionId:version.id,tierBasisQty:qty,deliveryQty:line.deliveryQty,tierMin:row.min,...(p.matrix?{grade:line.grade,packing:line.packing,baseUnitPrice:row.price,packFee:row.packFee}:{}),unitPrice:formattedPrice,regionRuleId:rule.id,regionVersion:p.delivery.regionVersion});
  }
  for(const group of groups.values()){
    if(!group.delivery.carrierPolicy){shipping=add(shipping,feeForGroup(group));continue;}
    const applied=selectCarrier(group.delivery.carrierPolicy,{items:[...group.products.values()],qty:group.qty,asOf,region:group.region,zip:group.zip,serviceDate:group.serviceDate});
    freight.push({shipmentId:group.shipmentId,siteId:group.siteId,serviceDate:group.serviceDate,...applied});
    shipping=add(shipping,exact(applied.chosen.total));
  }
  // Keep exact tax and shipping until the existing quote owner's TOTAL rounding.
  const decimal = (v,scale) => {const s=round(v,{scale,mode:'DOWN'});check(compare(exact(s.decimal),v)===0,'COST_PRECISION_UNSUPPORTED');return s.decimal;};
  const rules={version:'supply-policy-0585-v1',rounding:{stage:'TOTAL',mode:first.rounding,scale:0},costComponents:{shipping:{amount:decimal(shipping,8),ruleId:'region-fees'},tax:{amount:decimal(tax,10),ruleId:'explicit-tax-policies'},discount:{amount:'0',ruleId:'explicit-no-discount'}}};
  const result=calculateQuote({input:{lines:normalizedLines,asOf,...(comparison ? {comparisonTotal:comparison.total,comparisonContext:comparison.context}: {})},catalog:{version:'approved-products-v1',products:[...products.values()]},priceBook:{version:'selected-policies-v1',offers},rules});
  check(result.status==='VALID',result.reasonCodes[0]||'CALCULATION_UNAVAILABLE');
  result.normalized.validUntil=expiresAt;
  const customer=customerQuoteResponse({requestId,inputRevision,results:[result]});
  const c=result.normalized.comparison;
  let savings=null;
  if(c && result.normalized.comparisonEligibility.status==='ELIGIBLE' && exact(c.current.decimal).n>0n && exact(c.difference.decimal).n>0n) {
    // Comparison denominator is the customer’s comparable current delivered total.
    const deliveredTotal=add(fromRatio(result.normalized.merchandiseSubtotal),add(shipping,tax));
    const delta=subtract(exact(comparison.total),deliveredTotal);
    const ratio=divide(multiply(delta,exact(100)),exact(comparison.total));
    savings={percent:round(ratio,{scale:2,mode:'HALF_UP'}).decimal,annual:integer(annualDeliveries)?round(multiply(delta,exact(annualDeliveries)),rules.rounding).decimal:null};
  }
  return {customer,issuer:{issuedAt:asOf,expiresAt,selected,...(freight.length?{freight}:{}),shipping:rules.costComponents.shipping.amount,tax:rules.costComponents.tax.amount,shippingGroups:groups.size,merchandise:result.normalized.displayedMerchandiseSubtotal.decimal,savings}};
}

