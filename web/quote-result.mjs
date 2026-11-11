import {currentPurchaseCost,totalPurchaseCost,moneyDisplay} from './quantity-contract.mjs';

const fields=(value,keys)=>Object.fromEntries(keys.filter(key=>value?.[key]!==undefined && (value[key]===null || ['string','number','boolean'].includes(typeof value[key]))).map(key=>[key,value[key]]));
const ratio=value=>fields(value,['representation','conversionReviewed','raw','unit','numerator','denominator']);
const cadence=value=>value==null?null:fields(value,['version','kind','intervalDays','dayRule','preferredDate','nominalAnchor']);
const days=value=>Array.isArray(value)?value.filter(day=>['월','화','수','목','금','토','일'].includes(day)):[];
function repeat(value) {
  if(!value)return null;
  const result=fields(value,['period','frequency','date','dateMode','weeklyCheck','semantics','legacyReviewRequired']);
  result.cadence=cadence(value.cadence);
  result.weekdays=Object.fromEntries(Object.entries(value.weekdays||{}).filter(([key,enabled])=>/^([1-9]|[1-4][0-9]|5[0-2]):[월화수목금토일]$/.test(key)&&typeof enabled==='boolean'));
  return result;
}

/** Product input, not an invented catalog/offer mapping. The approved provider
 * resolves stable IDs and authorization. No contacts, documents or modal drafts. */
export function projectQuoteInput(state) {
  const linkedSites=new Set((state.allocations||[]).map(allocation=>allocation.locationId));
  return {version:'order-product-quote-input-1',
    purchases:(state.lines||[]).map(line=>({...fields(line,['id','housing','size','pack','qty','qtyUnit','price']),...(line.qtyExact?{qtyExact:ratio(line.qtyExact)}:{}),currentPurchaseCost:currentPurchaseCost(line)})),
    currentPurchaseTotal:totalPurchaseCost(state.lines||[]),
    sites:(state.locations||[]).filter(site=>linkedSites.has(site.id)).map(site=>fields(site,['id','region','addressProvider','providerId','postal','addressState'])),
    allocations:(state.allocations||[]).map(allocation=>({
      ...fields(allocation,['id','lineId','locationId','qty','mode','modeExplicit','freq','intervalWeeks','cycleCount','variableQty','qtyMin','qtyMax','qualityTest','oneTimeDeliveryQty','deliveryQtyUnit','monthlyDemandQty','monthlyDemandUnit','monthlyDemandSource','monthlyPlanQty','monthlyPlanUnit','monthlyPlanSource','monthlyDemandBasis','monthlyAllocationContract','repeatSemantics','frequencyPerWeek','monthDay','cycleAnchorDate']),
      ...(['count','days'].includes(allocation.scheduleDetail)?{scheduleDetail:allocation.scheduleDetail}:{}),
      days:days(allocation.days),weekPlans:(allocation.weekPlans||[]).map(plan=>({weekdays:days(plan.weekdays)})),
      ...(allocation.monthlyDemandExact?{monthlyDemandExact:ratio(allocation.monthlyDemandExact)}:{}),cadence:cadence(allocation.cadence),
      deliveryDate:fields(allocation.q4Review?.deliveryDate,['year','month','day']),activeRepeat:repeat(allocation.q4Review?.activeRepeat),
      deliveryTerms:fields(allocation.advanced,['orderProcess','fixedOrderProcess','flexOrderProcess','storeOffNone','storeOffIrregular','storeOffPolicy','weekend','holiday','substituteHoliday']),
      storeOffDays:days(allocation.advanced?.storeOffDays),
      activeHoliday:{...fields(allocation.q4Review?.activeHoliday,['none','irregular','closed','conflict','weekend','holiday','subholiday']),days:days(allocation.q4Review?.activeHoliday?.days)}
    }))};
}

// Display exactly the server's decimal; no client percentage, currency or
// monthly conversion, and no second price/rounding calculation.
export function quoteMoney(value,{absolute=false}={}) {
  const match=/^(-?)(\d+)(?:\.(\d+))?$/.exec(value?.decimal||'');
  if(!match)return '확인 필요';
  const fraction=(match[3]||'').replace(/0+$/,'');
  return `${absolute?'':match[1]}${BigInt(match[2]).toLocaleString('ko-KR')}${fraction?'.'+fraction:''}원`;
}

export function quoteResultView(snapshot,{currentPurchaseTotal=null}={}) {
  const status=snapshot?.status||'IDLE';
  const view={status,title:'비용 비교 결과',outcome:'산출 전',outcomeLabel:'조건 확인 필요',currentLabel:'입력한 월 구매비용',current:currentPurchaseTotal===null?'입력 필요':moneyDisplay(currentPurchaseTotal)+'원',supplyLabel:'납품비용',supply:'비교 조건 확인 필요',difference:'비교 조건 확인 필요',note:'실제 공급가와 비용 조건 확인이 필요합니다.',unavailable:true,loss:false,busy:['PENDING','LONG_PENDING','PARTIAL'].includes(status)};
  const notes={PENDING:'입력한 조건으로 견적을 조회하고 있습니다.',LONG_PENDING:'견적 조회가 계속 진행 중입니다.',PARTIAL:snapshot?.response?.quotes?.length?'일부 견적을 확인했습니다. 조회가 진행 중입니다.':'견적 조회가 아직 완료되지 않았습니다.',EMPTY:'조건에 맞는 견적이 없습니다.',FAILED:'견적을 불러오지 못했습니다.',EXPIRED:'견적의 유효기간이 지났습니다.',STALE:'입력 조건이 변경되었습니다. 다시 조회해야 합니다.',DETACHED:'견적 조회 화면을 닫았습니다.',CANCELLED:'견적 조회 취소를 확인했습니다.'};
  if(notes[status])view.note=notes[status];
  if(status==='PENDING'||status==='LONG_PENDING'){view.outcome='조회 중';view.outcomeLabel=status==='LONG_PENDING'?'조회가 계속되고 있습니다':'조건 확인 중';}
  else if(status==='PARTIAL'){view.outcome='조회 중';view.outcomeLabel='일부 응답 확인';}
  else if(status==='EMPTY'){view.outcome='견적 없음';view.outcomeLabel='조건 확인 필요';}
  else if(status==='FAILED'){view.outcome='조회 오류';view.outcomeLabel='다시 조회 필요';}
  else if(status==='EXPIRED'){view.outcome='견적 만료';view.outcomeLabel='다시 조회 필요';}
  const quotes=snapshot?.response?.quotes||[];
  if(status!=='COMPLETE'||!snapshot?.proof?.amountAllowed)return view;
  if(quotes.length!==1){view.note='여러 견적의 선택 기준을 확인해야 합니다.';return view;}
  const quote=quotes[0];
  if(quote.currency!=='KRW'){view.note='견적 통화의 표시 기준을 확인해야 합니다.';return view;}
  view.supply=quoteMoney(quote.total);view.currentLabel='비교 기준 구매비용';view.current='비교 조건 확인 필요';view.note='확인된 입력 조건의 견적입니다. 주문·재고·납품 확정을 뜻하지 않습니다.';
  const comparable=quote.comparisonEligibility==='ELIGIBLE'&&snapshot.proof.comparisonAllowed&&quote.comparison?.current&&quote.comparison?.difference;
  if(!comparable){view.outcomeLabel='절감액 비교 조건 확인 필요';return view;}
  const difference=BigInt(quote.comparison.difference.minorUnits);
  view.current=quoteMoney(quote.comparison.current);view.outcome=quoteMoney(quote.comparison.difference,{absolute:true});
  view.loss=difference<0n;view.unavailable=false;
  view.title=view.loss?'예상 비용 증가액':'예상 절감액';view.outcomeLabel=view.loss?'비용 증가':difference===0n?'차이 없음':'절감 가능';
  view.difference=`${view.outcome} ${view.loss?'증가':difference===0n?'차이 없음':'절감 가능'}`;
  return view;
}

/** Patch the existing result nodes. Never replace the card on an async response. */
export function patchQuoteResult(document,view) {
  const text=(id,value)=>{const node=document.getElementById(id);if(node)node.textContent=value;};
  for(const [id,value] of Object.entries({'result-title':view.title,'quote-outcome-value':view.outcome,'quote-outcome-label':view.outcomeLabel,'quote-current-label':view.currentLabel,'quote-current-value':view.current,'quote-supply-label':view.supplyLabel,'quote-supply-value':view.supply,'quote-result-status':view.note,'quote-detail-current-label':view.currentLabel,'quote-detail-current-value':view.current,'quote-detail-supply-value':view.supply,'quote-detail-difference-value':view.difference,'quote-detail-status':view.note}))text(id,value);
  const receipt=document.getElementById('receipt');if(receipt){receipt.dataset.quoteStatus=view.status;receipt.setAttribute('aria-busy',String(view.busy));}
  const outcome=document.getElementById('quote-outcome');outcome?.classList.toggle('is-unavailable',view.unavailable);outcome?.classList.toggle('is-loss',view.loss);
  document.getElementById('quote-supply-value')?.classList.toggle('comparison-unavailable',view.supply==='비교 조건 확인 필요');
}
