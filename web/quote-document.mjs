import {projectQuoteInput} from './quote-result.mjs';
import {projectSimpleInput,inspectSimpleQuote} from './simple-quote-contract.mjs';
import {readCustomerQuoteResponse,quoteProofGate,validQuoteRevision} from '../src/engine/contracts/quote-response.mjs';

// UX-02/04: a read-only data adapter, not a selected invoice/receipt design.
export const QUOTE_DOCUMENT_VERSION='order-quote-document-1';
const statuses=new Set(['IDLE','PENDING','LONG_PENDING','PARTIAL','COMPLETE','EMPTY','UNAVAILABLE','FAILED','EXPIRED','STALE','DETACHED','CANCELLED']);
const fields=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value?.[key]??null]));
const stamp=value=>Number.isFinite(value)&&Math.abs(value)<=8640000000000000?new Date(value).toISOString():null;
const grants=()=>({orderConfirmed:false,stockReserved:false,deliveryGuaranteed:false,globalMinimum:false});

/** All rows retain their source/basis. Server money comes only from the existing
 * DTO and proof gate; local purchase input is never substituted for it. The
 * caller must supply the current input revision and observation clock. */
export function buildQuoteDocumentModel({state={},snapshot=null,inputRevision=null,observedAt=null}={}){
  const simpleMode=Object.hasOwn(state,'simpleQuote'),uncertainties=[];
  let simpleInput=null,simpleAssessment=null;
  if(simpleMode){
    simpleAssessment=inspectSimpleQuote(state);
    try{simpleInput=projectSimpleInput(state);}catch{uncertainties.push('SIMPLE_INPUT_INVALID');}
    uncertainties.push(...simpleAssessment.proofBlockers);
  }
  // Simple regions/order intent never become fabricated detail addresses,
  // allocations, calendar schedules or per-delivery quantities.
  const input=projectQuoteInput(simpleMode?{lines:simpleInput?.product.line?[simpleInput.product.line]:[],locations:[],allocations:[]}:state);
  let response=null,status=statuses.has(snapshot?.status)?snapshot.status:'IDLE';
  const observationTime=stamp(observedAt),requestedAt=stamp(snapshot?.startedAt);
  const revisionMatches=validQuoteRevision(inputRevision)&&snapshot?.inputRevision===inputRevision;
  if(!observationTime)uncertainties.push('OBSERVATION_TIME_REQUIRED');
  if(!revisionMatches)uncertainties.push('CURRENT_INPUT_REVISION_UNCONFIRMED');
  if(snapshot?.response){
    try{
      response=readCustomerQuoteResponse(snapshot.response);
      if(response.requestId!==snapshot.requestId||response.inputRevision!==snapshot.inputRevision){response=null;status='FAILED';uncertainties.push('RESPONSE_REQUEST_MISMATCH');}
    }catch{status='FAILED';uncertainties.push('INVALID_PUBLIC_RESPONSE');}
  }
  if(response&&observationTime&&response.quotes.some(q=>q.validUntil!==null&&Date.parse(q.validUntil)<=observedAt))status='EXPIRED';
  if(snapshot?.requestId&&!revisionMatches)status='STALE';
  const proof=quoteProofGate({status:observationTime&&revisionMatches&&!simpleMode?status:'IDLE',response});
  const singleQuote=proof.amountAllowed&&response?.quotes.length===1?response.quotes[0]:null;
  const comparable=singleQuote&&proof.comparisonAllowed;
  if(response?.quotes.length>1)uncertainties.push('QUOTE_SELECTION_REQUIRED');
  if(!singleQuote)uncertainties.push('CONFIRMED_QUOTE_AMOUNT_UNAVAILABLE');
  if(!comparable)uncertainties.push('CONFIRMED_COMPARISON_UNAVAILABLE');
  uncertainties.push('PROVIDER_CALCULATION_TIME_NOT_IN_PUBLIC_CONTRACT','PERIOD_MEANING_UNRESOLVED');
  const purchaseRows=input.purchases.map(p=>({...fields(p,['id','housing','size','pack','qty','qtyUnit','price','qtyExact','currentPurchaseCost']),quantityPeriod:'MONTH',source:'CUSTOMER_INPUT'}));
  const assignmentRows=input.allocations.map(a=>({...fields(a,['id','lineId','locationId','qty','oneTimeDeliveryQty','deliveryQtyUnit','monthlyDemandQty','monthlyDemandUnit','monthlyDemandSource','monthlyDemandExact','monthlyPlanQty','monthlyPlanUnit','monthlyPlanSource','monthlyDemandBasis']),source:'CUSTOMER_INPUT'}));
  const termRows=input.allocations.map(a=>({...fields(a,['id','lineId','locationId','mode','modeExplicit','freq','intervalWeeks','cycleCount','variableQty','qtyMin','qtyMax','qualityTest','repeatSemantics','frequencyPerWeek','monthDay','cycleAnchorDate','scheduleDetail','days','weekPlans','cadence','deliveryDate','activeRepeat','deliveryTerms','storeOffDays','activeHoliday']),source:'CUSTOMER_INPUT'}));
  return {
    version:QUOTE_DOCUMENT_VERSION,sourceSnapshot:'ORDER-PARTIAL-20261112-063305-R1',provisional:true,designSelected:false,
    inputScope:{mode:simpleMode?'SIMPLE':'DETAILED',assessment:simpleAssessment,authentication:simpleInput?.authentication??null,businessVerification:simpleInput?.businessVerification??null,consultationInterest:simpleInput?.consultationInterest??null},
    request:{requestId:snapshot?.requestId??null,inputRevision:validQuoteRevision(inputRevision)?inputRevision:null,responseRevision:snapshot?.inputRevision??null,revisionMatches,status,requestedAt,observedAt:observationTime,providerCalculatedAt:null},
    groups:[
      {id:'purchase',title:'구매 내역',rows:purchaseRows,currentPurchaseTotal:input.currentPurchaseTotal,quantityPeriod:'MONTH',totalScope:simpleInput?.monthly.scope??null,specUnknown:simpleInput?.product.specUnknown??null,source:'CUSTOMER_INPUT'},
      {id:'assignment',title:'납품지별 배정',sites:input.sites,rows:assignmentRows,regionIntent:simpleInput?.regions??null,regionCode:null,source:'CUSTOMER_INPUT'},
      {id:'terms',title:'납품 조건',rows:termRows,orderIntent:simpleInput?.order??null,source:'CUSTOMER_INPUT'},
      {id:'comparison',title:'비용 비교',source:'PUBLIC_QUOTE_RESPONSE',currency:singleQuote?.currency??null,currentCost:comparable?singleQuote.comparison.current:null,quoteCost:singleQuote?.total??null,difference:comparable?singleQuote.comparison.difference:null,comparisonEligibility:singleQuote?.comparisonEligibility??null,basis:singleQuote?.basis??null,validUntil:singleQuote?.validUntil??null,coverage:response?.coverage??null,reasonCodes:response?.reasonCodes??[],proof}
    ],
    uncertainties:[...new Set(uncertainties)],grants:grants()
  };
}
