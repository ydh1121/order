import {fromRatio,multiply,divide,toJSON} from '../calculation/exact.mjs';
import {engineResult} from './result.mjs';

// SIMPLE-04 / ORDER-PARTIAL-20261112-063305-R1. This is a supplier data
// boundary, not a customer question, an admin screen, or an authorization check.
export const SHIPPING_BUNDLE_VERSION='supplier-shipping-bundle-1';
const text=value=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
const evidence=()=>({authorityVerified:false,productQuantityChanged:false,documentPublicationPolicy:'UNRESOLVED',minimumOrderPolicy:'NOT_DEFINED'});
const result=(status,reasonCodes,normalized=null)=>engineResult({status,reasonCodes,normalized,field:'shippingBundle',ruleVersion:SHIPPING_BUNDLE_VERSION,evidence:evidence()});

/** Allowlist supplier-origin unit metadata. VALID means data shape only. */
export function readSupplierShippingBundle(value){
  if(value==null)return result('UNAVAILABLE',['SHIPPING_BUNDLE_NOT_PROVIDED']);
  if(value.version!==SHIPPING_BUNDLE_VERSION||![value.id,value.revision,value.supplierId,value.productId,value.productUnit,value.bundleUnit,value.bundleLabel].every(text))return result('INVALID',['SHIPPING_BUNDLE_IDENTITY_INVALID']);
  if(!text(value.source?.id)||!iso(value.source?.observedAt))return result('INVALID',['SHIPPING_BUNDLE_PROVENANCE_REQUIRED']);
  try{
    const factor=fromRatio(value.productUnitsPerBundle);
    if(factor.n<=0n)return result('INVALID',['SHIPPING_BUNDLE_FACTOR_NOT_POSITIVE']);
    return result('VALID',[],{version:SHIPPING_BUNDLE_VERSION,id:value.id,revision:value.revision,supplierId:value.supplierId,productId:value.productId,productUnit:value.productUnit,bundleUnit:value.bundleUnit,bundleLabel:value.bundleLabel,productUnitsPerBundle:toJSON(factor),source:{id:value.source.id,observedAt:value.source.observedAt}});
  }catch{return result('INVALID',['SHIPPING_BUNDLE_FACTOR_INVALID']);}
}

/** Exact document-unit projection through the existing catalog units. It never
 * rounds up the purchase, changes the price basis, or adds a minimum order. */
export function projectShippingBundleQuantity({configuration,product,supplierId,quantity,unit}={}){
  const parsed=readSupplierShippingBundle(configuration);
  if(parsed.status!=='VALID')return parsed;
  const bundle=parsed.normalized;
  if(!text(supplierId)||supplierId!==bundle.supplierId)return result('INVALID',['SHIPPING_BUNDLE_SUPPLIER_MISMATCH']);
  if(!product||product.id!==bundle.productId)return result('INVALID',['SHIPPING_BUNDLE_PRODUCT_MISMATCH']);
  if(!text(product.baseUnit)||!product.units||!Object.hasOwn(product.units,product.baseUnit)||!Object.hasOwn(product.units,unit)||!Object.hasOwn(product.units,bundle.productUnit))return result('UNAVAILABLE',['SHIPPING_BUNDLE_UNIT_UNAVAILABLE']);
  try{
    const baseFactor=fromRatio(product.units[product.baseUnit]),inputFactor=fromRatio(product.units[unit]),packageFactor=fromRatio(product.units[bundle.productUnit]),original=fromRatio(quantity);
    if(baseFactor.n!==baseFactor.d||inputFactor.n<=0n||packageFactor.n<=0n||original.n<=0n)return result('INVALID',['SHIPPING_BUNDLE_QUANTITY_OR_FACTOR_INVALID']);
    const baseQuantity=multiply(original,inputFactor),bundleBase=multiply(fromRatio(bundle.productUnitsPerBundle),packageFactor),bundleQuantity=divide(baseQuantity,bundleBase);
    return result('VALID',[],{productId:product.id,original:{quantity:toJSON(original),unit},base:{quantity:toJSON(baseQuantity),unit:product.baseUnit},documentUnit:{quantity:toJSON(bundleQuantity),unit:bundle.bundleUnit,label:bundle.bundleLabel,wholeUnits:bundleQuantity.d===1n},configurationRef:{id:bundle.id,revision:bundle.revision,sourceId:bundle.source.id}});
  }catch{return result('INVALID',['SHIPPING_BUNDLE_QUANTITY_OR_FACTOR_INVALID']);}
}
