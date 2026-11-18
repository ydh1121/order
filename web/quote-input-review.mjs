import {moneyDisplay,quantityLabel} from './quantity-contract.mjs';

const kinds={FLEX:'소진 시 주문',FIXED:'정기 주문',ONCE:'1회 주문'};
const count=(value,suffix)=>value==null||value===''?'미입력':String(value)+suffix;
const asPrice=value=>/^\d+$/.test(String(value))?BigInt(value).toLocaleString('ko-KR')+'원':'미입력';
const spec=line=>[line.housing&&('난각 '+line.housing+'번'),line.size,line.pack&&(line.pack+'구')].filter(Boolean).join(' · ');

export function quoteReviewSections(model){
  const {purchase,assignment,terms}=Object.fromEntries(model.groups.map(group=>[group.id,group]));
  const regions=assignment.regionIntent,order=terms.orderIntent;
  const labels=new Map(purchase.rows.map((line,index)=>[line.id,spec(line)||('품목 '+(index+1))]));
  const sites=new Map(assignment.sites.map((site,index)=>[site.id,site.region||('사업장 '+(index+1))]));
  const rows=purchase.rows.map(line=>{
    const price=purchase.specUnknown?'월 예상 예산 '+asPrice(purchase.monthlyBudget):'포장당 '+asPrice(line.price);
    return labels.get(line.id)+' · 월 '+count(line.qty,quantityLabel(line))+' · '+price;
  });
  if(purchase.currentPurchaseTotal)rows.push('현재 월 구매비용 '+moneyDisplay(purchase.currentPurchaseTotal)+'원');
  const locations=regions
    ?[regions.siteCountConfirmed?'사업장 '+count(regions.siteCount,'곳'):'사업장 수 확인 필요',...(regions.regionsDiffer?regions.sites.map((site,index)=>'사업장 '+(index+1)+' · '+(site.region||'지역 미입력')):[regions.sharedRegion||'지역 미입력'])]
    :[...sites.values()];
  const unitLabels={each:'개',tray:'판',pack:'팩'};
  for(const row of assignment.rows){
    const region=sites.get(row.locationId),product=labels.get(row.lineId);
    if(region&&product&&row.monthlyDemandQty)locations.push(region+' · '+product+' · 월 '+count(row.monthlyDemandQty,unitLabels[row.monthlyDemandUnit]||' (단위 확인 필요)'));
  }
  const termsRows=[];
  if(order){
    termsRows.push(kinds[order.kind]||'주문 방식 미입력');
    if(order.kind==='FLEX'&&order.flexBasis)termsRows.push(order.flexBasis==='MONTH'?'월 기준':'주 기준');
    if(order.preferredDate)termsRows.push('납품 희망일 '+order.preferredDate);
  }else{
    for(const term of terms.rows){
      const keys=[sites.get(term.locationId),labels.get(term.lineId),kinds[term.mode]||'주문 방식 확인 필요'];
      const day=term.deliveryDate;
      if(day?.year&&day.month&&day.day)keys.push('납품 희망일 '+[day.year,day.month,day.day].join('. '));
      termsRows.push(keys.filter(Boolean).join(' · '));
    }
  }
  return [
    {stage:'q1',title:'계란 규격',values:purchase.specUnknown?['규격 모름']:purchase.rows.map(line=>spec(line)||'규격 미입력')},
    {stage:'q2',title:'월 구매정보',values:rows},
    {stage:'q3',title:regions?'사업장 수와 지역':'납품 사업장',values:locations},
    {stage:'q4',title:'주문과 납품 조건',values:termsRows}
  ];
}

export function bindQuoteInputReview({document:doc,shell,quoteDocument,canReview,editStage}){
  const dialog=doc.getElementById('input-review-dialog'),trigger=doc.getElementById('input-review-open');
  const byId=id=>doc.getElementById(id);
  const create=(tag,content)=>{const node=doc.createElement(tag);node.textContent=content;return node;};
  const close=after=>shell.close(dialog,{after});
  function open(){
    if(dialog.open||!canReview())return false;
    const model=quoteDocument();
    byId('input-review-title').textContent=(model.inputScope.mode==='SIMPLE'?'간편':'상세')+' 견적 입력 검토';
    const sections=quoteReviewSections(model).map(({stage,title,values})=>{
      const item=doc.createElement('li'),head=doc.createElement('div'),list=doc.createElement('ul');
      head.append(create('h3',title));
      const edit=create('button','수정');edit.type='button';edit.className='ui-copy-action';edit.setAttribute('aria-label',title+' 수정');
      edit.onclick=()=>close(()=>editStage(stage));head.append(edit);
      for(const value of values.length?values:['미입력'])list.append(create('li',value));
      item.append(head,list);return item;
    });
    byId('input-review-rows').replaceChildren(...sections);
    shell.open(dialog,{variant:'compact',role:'selection',history:true,returnFocus:trigger,initialFocus:()=>byId('input-review-title')});
    return true;
  }
  trigger.onclick=open;
  shell.bind(dialog,()=>close());
  byId('input-review-back').onclick=()=>shell.requestClose(dialog,'cancel');
  byId('input-review-save').onclick=()=>close(()=>byId('save-checkpoint').click());
  byId('input-review-result').onclick=()=>close(()=>byId('to-result').click());
  return {open};
}
