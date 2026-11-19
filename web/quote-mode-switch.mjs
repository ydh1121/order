import {mountOrderMenu} from './order-menu.mjs';
// Both modes retain their own confirmed draft. The opt-in handoff copies the
// selected egg and its raw purchase inputs, leaving site and order data private.
export function copySimpleLine(source,destination){
 const line=source.lines[0];
 if(source.simpleQuote?.specUnknown||!line?.housing||!line.size||!line.pack)return {status:'NO_KNOWN_LINE'};
 const existing=destination.lines.find(item=>item.id===line.id);
 if(existing&&['housing','size','pack','qty','price','qtyUnit','qtyDisplayUnit','qtyExact'].every(key=>JSON.stringify(existing[key])===JSON.stringify(line[key])))return {status:'ALREADY_COPIED'};
 const first=destination.bodyCheckpoint?.q1Selection;
 if(existing||first&&(first.housing||first.size||first.pack)||destination.lines.some(item=>item.housing===line.housing&&item.size===line.size&&item.pack===line.pack))return {status:'EXISTING_LINE'};
 const next=structuredClone(destination);
 delete next.bodyCheckpoint;
 next.lines.push(structuredClone(line));
 next.current=line.id;
 next.open='q2';
 next.allocationRevision++;
 return {status:'READY',data:next};
}

export function bindQuoteModeSwitch({simple,dialog,trigger,shell,source,guard,saveCurrent,detailedStore,navigate,preference}){
 const option=dialog.querySelector('[data-mode-option]'),row=option.closest('label');
 const cancel=dialog.querySelector('[data-mode-cancel]'),confirm=dialog.querySelector('[data-mode-confirm]');
 const error=dialog.querySelector('[data-mode-error]'),other=simple?'상세 견적':'간편 견적';
 mountOrderMenu({simple,switchMode:()=>trigger.click()});
 trigger.textContent=other+'으로 전환';
 dialog.querySelector('[data-mode-title]').textContent=other+'으로 전환할까요?';
 dialog.querySelector('[data-mode-option-label]').textContent=simple?'선택한 계란 규격과 구매정보도 가져가기':'다시 표시하지 않기';
 let attempt=null,destinationAtOpen=null;
 function dismiss(){
  if(attempt)attempt.cancelled=true;
  shell.close(dialog);
 }
 cancel.addEventListener('click',dismiss);
 shell.bind(dialog,dismiss);
 async function change(skipDialog=false){
  if(attempt||!guard())return;
  const current={cancelled:false};attempt=current;
  confirm.disabled=true;trigger.disabled=true;
  const active=()=>attempt===current&&!current.cancelled;
  try{
   const saved=await saveCurrent(active);
   if(!active())return;
   if(!saved.ok)throw Error(saved.status==='CONFLICT'?'다른 탭에서 입력이 변경되었습니다.':'입력을 저장하지 못했습니다. 다시 시도해 주세요.');
   if(simple&&option.checked&&!row.hidden){
    const {store,snapshot}=destinationAtOpen;
    const [before,destination]=await Promise.all([snapshot,store.load()]);
    if(!active())return;
    if(!destination.ok||!before.ok)throw Error('상세 견적을 불러올 수 없습니다.');
    if(before.versionToken!==destination.versionToken||before.revision!==destination.revision)throw Error('다른 탭에서 상세 견적이 변경되었습니다.');
    const copy=copySimpleLine(source(),destination.data);
    if(copy.status==='EXISTING_LINE')throw Error('상세 견적에 작성 중인 규격이 있습니다. 가져가기를 해제해 주세요.');
    if(copy.status==='NO_KNOWN_LINE')throw Error('가져갈 계란 규격을 확인해 주세요.');
    if(copy.status==='READY'){
     const result=await store.commit(copy.data,{expectedRevision:destination.revision,expectedToken:destination.versionToken,transactionId:crypto.randomUUID(),canCommit:active});
     if(!active())return;
     if(!result.ok)throw Error(result.status==='CONFLICT'?'다른 탭에서 상세 견적이 변경되었습니다.':'상세 견적을 저장할 수 없습니다.');
    }
   }
   if(!simple&&!skipDialog&&option.checked)preference.set();
   if(active())navigate(!simple);
  }catch(e){
   if(active()){
    if(!dialog.open)shell.open(dialog,{role:'confirm',variant:'compact',history:true,returnFocus:trigger,initialFocus:()=>cancel});
    error.hidden=false;error.textContent=e.message;
   }
  }finally{
   attempt=null;confirm.disabled=false;trigger.disabled=false;
  }
 }
 trigger.addEventListener('click',()=>{
  if(attempt||!guard())return;
  error.hidden=true;option.checked=false;
  row.hidden=simple&&copySimpleLine(source(),{lines:[],allocationRevision:0}).status!=='READY';
  if(!simple&&preference.get()){void change(true);return;}
  if(simple&&!row.hidden){
   const store=detailedStore();
   destinationAtOpen={store,snapshot:store.inspectCurrent()};
  }
  shell.open(dialog,{role:'confirm',variant:'compact',history:true,returnFocus:trigger,initialFocus:()=>cancel});
 });
 confirm.addEventListener('click',()=>{void change();});
}
