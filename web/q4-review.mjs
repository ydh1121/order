import {createMonthlyAllocationDraft,monthlyAllocationDisplay,monthlyQuantityInputText,monthlyQuantityUnit,allocationUnitLabel} from './allocation-ui.mjs';
import {validMonthlyQuantity,monthlyQuantityText,quantityLabel} from './quantity-contract.mjs';
(()=>{'use strict';
// Preserved UX shell and interactions; monthly quantities use the shared engine.
// The regular-state bridge remains the sole persistence owner.
const iconChevron=window.OrderAccordionView.chevron;
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const names=[];
const mName={FLEX:'소진 시 주문',FIXED:'정기 납품',ONCE:'1회 납품'};
const state={};
let monthlyEditor=null;
const monthlyLocation=i=>regularContext?.allocations[i]?.locationId;
const monthlyRow=i=>monthlyEditor?.rows.find(row=>row.locationId===monthlyLocation(i));
const monthlyPending=i=>siteMode(i)!=='ONCE'&&monthlyRow(i)?.source==='derived';
function monthlyFeedback(i){const data=monthlyAllocationDisplay(monthlyEditor?.evaluate(),monthlyLocation(i)),suffix=allocationUnitLabel(data.baseUnit);if(!data.row)return '월 사용량의 수량과 단위를 확인해 주세요.';const source=monthlyRow(i)?.source==='derived'?'자동 계산 · 확인 시 반영. ':'';return `${source}${data.excess!=='0'&&data.excess!=='미확정'?`초과 배분량 ${data.excess}${suffix}`:`남은 배분량 ${data.remaining}${suffix}`} · 현재 입력 상한 ${data.maximum}${suffix}${data.proposed?` · 자동 배분 후 ${data.projectedRemaining}${suffix}`:''}`;}
function syncMonthlyFields(){if(!monthlyEditor)return;for(let i=0;i<state.count;i++){const row=monthlyRow(i);if(!row)continue;state.values[i].monthly=row.quantity.raw;const input=document.querySelector(`[data-qty="${i}:monthly"]`);if(input&&input!==document.activeElement)input.value=monthlyQuantityInputText(row.quantity);const group=input?.closest('.qa-field');if(group){group.dataset.quantitySource=row.source;const label=group.querySelector('.qa-unit');if(label)label.textContent=allocationUnitLabel(row.quantity.unit);const note=group.querySelector('[data-monthly-feedback]');if(note)note.textContent=monthlyFeedback(i);}refreshStatus(i);syncRegularQuantityErrors(i);}}
const monthEditing=new Set();
// MSG0425 site-owned UI draft state: individual-mode edits never alias global data.
const newSiteContacts=()=>({phone:true,sms:true,kakao:true,email:false});
const newSiteHoliday=()=>({days:[],none:false,irregular:false,conflict:'협의 후 조정',weekend:'협의 후 조정',holiday:'협의 후 조정',subholiday:'협의 후 조정',request:''});
// MSG0427 addendum: private per-site FIXED delivery draft; never aliased or copied.
const newSiteRepeat=()=>({period:'매주',frequency:'2회',date:'',dateMode:'custom',weeklyCheck:false,weekdays:{},weekOpen:0,semantics:'per-week-v1',legacyReviewRequired:false});
const siteRepeatComplete=i=>OrderRepeatContract.inspect(state.siteRepeat?.[i]||{}).valid;
const isIndividual=()=>state.count>1 && state.mode==='MIXED';
const siteHolidayComplete=i=>{const h=state.siteHolidays?.[i];return !!h && (h.days.length>0||h.none||h.irregular) && !['','선택 안 함'].includes(h.conflict);};
const siteContactComplete=i=>Object.values(state.siteContacts?.[i]||{}).some(Boolean);
const appliesSiteHoliday=i=>['FLEX','FIXED'].includes(siteMode(i));
const unit=()=>state.pack==='30'?'판':'팩';
const siteMode=i=>state.mode==='MIXED'?state.siteModes[i]:state.mode;
const requiredStar='<span class="ui-required qa-required-star" aria-hidden="true">*</span>';
const holidayComplete=()=>((state.holidayNone||state.holidayIrregular||state.holidayDays.length>0)&&!['','선택 안 함'].includes(state.holiday.conflict));
const isValid=v=>/^\d+$/.test(String(v??''))&&Number(v)>=1&&Number(v)<=99999;
function fields(i){const m=siteMode(i);return m==='ONCE'?['once']:state.count===1?['base',...(state.variable[i]?['min','max']:[])]:['monthly','base',...(state.variable[i]?['min','max']:[])];}
function status(i,acceptProposal=false){const v=state.values[i]||{},keys=fields(i),present=keys.filter(k=>String(v[k]??'')!=='').length,amountComplete=keys.every(k=>!q4QuantityInvalid(i,k));
 const contactOk=!isIndividual()||siteContactComplete(i);
 const holidayOk=!isIndividual()||!appliesSiteHoliday(i)||siteHolidayComplete(i);
 const repeatOk=siteMode(i)!=='FIXED'||OrderRepeatContract.inspect(isIndividual()?state.siteRepeat[i]:state).valid;
 const all=amountComplete&&contactOk&&holidayOk&&repeatOk&&dateIssue(i).valid;
 if(state.attempted&&!all)return 'error';if(all)return !acceptProposal&&monthlyPending(i)?'partial':'complete';if(present||state.variable[i]||(isIndividual()&&appliesSiteHoliday(i)&&state.siteHolidays[i].days.length)||(isIndividual()&&siteMode(i)==='FIXED'&&state.siteRepeat?.[i]?.weeklyCheck))return 'partial';return 'empty';}
function checkbox(id,label,checked,attrs='',multiline=false){
 return `<label class="q4-check-row${multiline?' q4-check-row--multiline':''}"><input id="${id}" type="checkbox" ${checked?'checked':''} ${attrs}><span class="q4-check-icon" aria-hidden="true">✓</span><span class="q4-check-copy">${label}</span></label>`;
}
// Exact product input checked-event discipline: seeded states do not animate.
const q4CheckboxPrevious=new WeakMap();
function q4SeedCheckboxes(root){root?.querySelectorAll('input[type="checkbox"]').forEach(el=>q4CheckboxPrevious.set(el,el.checked));}
function q4AnimateCheckedTransition(el){
 if(!el?.matches('input[type="checkbox"]')||!el.closest('.q4-check-row'))return;
 const before=q4CheckboxPrevious.get(el),after=el.checked;q4CheckboxPrevious.set(el,after);
 if(before!==false||after!==true||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const icon=el.nextElementSibling;if(!icon)return;icon.classList.remove('q4-just-checked');void icon.offsetWidth;icon.classList.add('q4-just-checked');
 icon.addEventListener('animationend',()=>icon.classList.remove('q4-just-checked'),{once:true});
}
const CODE1_UI=Object.freeze({copyIcon:window.OrderIcons.svg('clone'),accordion:options=>window.OrderAccordionView.render({...options,bindKey:true,requiredLabel:true}),button:({label,action,filled=false})=>`<button type="button" class="subaction ui-continue-action" ${action}>${label}</button>`});
function acc(id,label,body,open=false,st='empty',extra='qa-site-parent',required=false){return CODE1_UI.accordion({id,label:escapeHTML(label),content:body,complete:st==='complete',expanded:open,error:st==='error',extraClass:extra,required});}
function quantity(i,key,label,placeholder){placeholder=['min','max'].includes(key)?'수량 입력':key==='monthly'?'월 사용량 입력':'수량 입력';const v=state.values[i]?.[key]??'',invalid=state.attempted&&q4QuantityInvalid(i,key),id=`q0394-${i}-${key}`,monthly=key==='monthly',row=monthly?monthlyRow(i):null;
 return `<div class="qa-site-field qa-field" data-field-group="${i}-${key}" data-error="${invalid}" ${monthly?`data-quantity-source="${row?.source||'manual'}"`:''}><label class="qa-site-label ui-field-title ${['min','max'].includes(key)?'ui-field-title--dependent':''}" for="${id}">${label} ${!['min','max'].includes(key)?requiredStar:''}</label><div class="qa-number"><input id="${id}" data-qty="${i}:${key}" ${monthly?'type="text"':'type="number" min="1" max="99999" step="1"'} inputmode="numeric" value="${escapeHTML(monthly?monthlyQuantityInputText(row?.quantity):v)}" placeholder="${escapeHTML(placeholder)}" aria-invalid="${invalid}" ${monthly?`aria-describedby="${id}-allocation"`:''}/><span class="qa-unit">${monthly?allocationUnitLabel(row?.quantity.unit||monthlyQuantityUnit(regularContext.line)):unit()}</span></div>${monthly?`<p class="qa-label" id="${id}-allocation" data-monthly-feedback="${i}" aria-live="polite">${escapeHTML(monthlyFeedback(i))}</p>`:''}<p class="qa-inline-error qa-error qa-qty-a11y-only ui-feedback-sr" ${invalid?'':'hidden'} aria-label="입력 확인 필요"></p></div>`;}

function choice(label,choices,val,key){return `<section class="qa-form-section" data-section="${key}"><div class="qa-section-title ui-field-title ui-field-title--top">${label} <span class="ui-required" aria-hidden="true">*</span></div><div class="qa-mode-choices ${choices.length===2?'qa-two':''}" role="group" aria-label="${label}">${choices.map(([v,t])=>`<button type="button" class="ui-choice" data-choice="${key}" data-value="${v}" aria-pressed="${val===v}">${t}</button>`).join('')}</div></section>`;}
function comboSelected(id,chosen){if(id==='date'||/^site-repeat-\d+-date$/.test(id))return OrderRepeatContract.monthValue(chosen).valid;if(id==='freq'||/^site-repeat-\d+-freq$/.test(id))return /^[1-7]회$/.test(String(chosen));return !['','선택 안 함','일괄 설정','사업장 일괄 설정','undefined','null'].includes(String(chosen??''));}
function comboInvalid(id,chosen){return state.attempted && (id==='period'||id==='freq'||id==='date'||/^site-repeat-\d+-(period|freq|date)$/.test(id))&&!comboSelected(id,chosen);}
function dropdown(id,label,options,chosen){
 const editable=id==='date'||/^site-repeat-\d+-date$/.test(id),visibleLabel=label.replace(/\s*\*$/,''),star=label.trim().endsWith('*')?` ${requiredStar}`:'',bad=comboInvalid(id,chosen),selected=comboSelected(id,chosen);
 if(!editable&&selected&&!options.includes(chosen))options=[chosen,...options];
 const menu=`<div class="qa-combo-menu" id="combo-${id}-menu" role="listbox" hidden><div class="qa-combo-scroll">${options.map(s=>`<button type="button" role="option" data-combo-choice="${id}" data-value="${escapeHTML(s)}" aria-selected="${chosen===s||(editable&&s==='직접 입력'&&!options.includes(chosen))}">${escapeHTML(s)}</button>`).join('')}</div></div>`;
 const committed=selected&&!monthEditing.has(id);
 const inputValue=editable?String(chosen??'').replace(/일$/,''):'';
 const control=editable?`<div class="qa-combo-trigger qa-combo-editable" data-selected="${committed}" data-error="${bad}" data-variant="editable"><span class="qa-month-value"><input type="text" id="month-value-${id}" data-month-date="${id}" inputmode="numeric" autocomplete="off" value="${escapeHTML(chosen==='말일'?'말일':inputValue)}" placeholder="직접 입력" ${chosen==='말일'?'readonly':''} data-month-previous="${escapeHTML(chosen==='말일'?'말일':inputValue)}" size="${Math.max(1,inputValue.length)}" style="--ui-month-width:${chosen==='말일'?'2em':Math.max(1,inputValue.length)+'ch'}" aria-label="납품 날짜 직접 입력" aria-invalid="${bad}"/><span class="qa-month-suffix" ${!committed||chosen==='말일'?'hidden':''} aria-hidden="true">일</span></span><button type="button" data-combo="${id}" aria-label="납품 날짜 선택 목록" aria-haspopup="listbox" aria-controls="combo-${id}-menu" aria-expanded="${state.drop===id}"><span class="t-acc-chevron" aria-hidden="true">${iconChevron}</span></button></div>`:`<button type="button" class="qa-combo-trigger" data-combo="${id}" data-selected="${selected}" data-error="${bad}" data-variant="${id==='bulk'?'selection-dropdown':'standard'}" aria-pressed="${id==='bulk'?selected:'false'}" aria-invalid="${bad}" aria-haspopup="listbox" aria-controls="combo-${id}-menu" aria-expanded="${state.drop===id}"><span>${escapeHTML(chosen)}</span><span class="t-acc-chevron" aria-hidden="true">${iconChevron}</span></button>`;
 return `<div class="qa-field"><${editable?'label':'span'} ${editable?`for="month-value-${id}"`:''} class="qa-label ui-field-title">${visibleLabel}${star}</${editable?'label':'span'}><div class="qa-combo">${control}${menu}</div>${editable?`<p class="ui-field-error ui-feedback-sr" data-month-error="${id}" ${bad?'':'hidden'}>1~31의 정수 또는 말일을 입력해 주세요.</p>`:''}</div>`;
}
// The global FIXED and MIXED child FIXED blocks reuse the same factory, without shared state.
function repeatDraft(site=null){return site===null?state:state.siteRepeat[site];}
function repeatId(site,n){return site===null?`week-${n}`:`site-week-${site}-${n}`;}
function weekStatus(n,site=null){const r=repeatDraft(site),v=OrderRepeatContract.inspect(r),w=v.week.find(x=>x.number===n);if(!w)return 'empty';return w.complete?'complete':((state.attempted||w.over)&&r.weeklyCheck?'error':'empty');}
function refreshWeekStatus(n,site=null){const el=$(repeatId(site,n));if(!el)return;const st=weekStatus(n,site);el.dataset.complete=String(st==='complete');el.dataset.state=st;el.dataset.error=String(st==='error');}
function weekContent(n,site=null){const r=repeatDraft(site),v=OrderRepeatContract.inspect(r),w=v.week[n-1],owner=site===null?'global':'site-'+site,id=`q4-week-${owner}-${n}`;
 return `<div class="qa-week-choice" id="${id}" data-repeat-week="${n}" role="group" tabindex="-1" aria-label="${n}주차 납품 희망요일" aria-describedby="${id}-error" ${site===null?'':`data-repeat-site="${site}"`}>${OrderRepeatContract.days.map(d=>{const chosen=!!r.weekdays?.[`${n}:${d}`],disabled=!chosen&&(!Number.isInteger(v.perWeek)||w.count>=v.perWeek);return `<button type="button" ${site===null?`data-weekday="${n}:${d}"`:`data-site-weekday="${site}:${n}:${d}"`} data-day="${d}" aria-pressed="${chosen}" ${disabled?'disabled':''}>${d}</button>`;}).join('')}</div><p class="ui-field-error ui-feedback-sr" id="${id}-error" hidden></p>`;
}
function repeatSection(site=null){if(site===null?state.mode!=='FIXED':siteMode(site)!=='FIXED')return '';
 const r=repeatDraft(site),prefix=site===null?'':`site-repeat-${site}-`,v=OrderRepeatContract.inspect(r);
 const periodic=dropdown(prefix+'period','반복 주기 *',['매주','2주','3주','4주','매월'],r.period);
 const freq=r.period==='매월'?dropdown(prefix+'date','납품 날짜 *',['직접 입력','1일','5일','10일','15일','20일','25일','30일','말일'],r.date):dropdown(prefix+'freq',(r.period==='매주'?'납품 횟수':'매주 납품 횟수')+' *',['1회','2회','3회','4회','5회','6회','7회'],r.frequency);
 const grid=r.weeklyCheck&&v.weeks>0?`<div class="qa-week-grid">${Array.from({length:v.weeks},(_,j)=>acc(repeatId(site,j+1),v.weeks===1?'납품 희망요일':`${j+1}주차`,weekContent(j+1,site),r.weekOpen===j+1,weekStatus(j+1,site),'qa-site-child')).join('')}</div>`:'';
 const toggleId=site===null?'qa-week-toggle':`qa-site-week-toggle-${site}`,toggleAttr=site===null?'data-week-toggle':`data-site-week-toggle="${site}"`;
 return `<section class="qa-form-section qa-repeat-section" data-section="repeat" ${site===null?'':`data-site-repeat="${site}"`}><div class="qa-inline-pair">${periodic}${freq}</div>${r.legacyReviewRequired?'<p class="ui-field-error ui-feedback-sr">기존 반복 횟수를 확인하고 매주 납품 횟수를 다시 선택해 주세요.</p>':''}${r.period==='매월'?'':`<div class="qa-check-wrap">${checkbox(toggleId,'희망 요일 지정',r.weeklyCheck,toggleAttr)}</div>`}${grid}</section>`;
}
function contactField(site=null){
 const local=site!==null,c=local?state.siteContacts[site]:state.contact,owner=local?'site-'+site:'global',id='q4-contact-'+owner,bad=state.attempted&&!Object.values(c||{}).some(Boolean);
 const checks=[['phone','전화'],['sms','문자'],['kakao','카카오톡'],['email','이메일']].map(([k,label])=>checkbox(local?`qa-site-contact-${site}-${k}`:'qa-contact-'+k,label,!!c[k],local?`data-site-contact="${site}:${k}"`:`data-contact="${k}"`)).join('');
 return `<${local?'div':'section'} class="${local?'qa-site-field qa-scoped-contact':'qa-form-section'} ui-field-group" ${local?`data-site-contacts="${site}"`:'data-section="contacts"'} data-contact-owner="${owner}" data-error="${bad}"><div class="${local?'qa-site-label':'qa-section-title'} ui-field-title ${local?'':'ui-field-title--top'}" id="${id}-label">연락 수단 ${requiredStar}</div><div class="qa-checks" id="${id}" role="group" tabindex="-1" aria-labelledby="${id}-label" aria-required="true" aria-invalid="${bad}" aria-describedby="${id}-error">${checks}</div><p id="${id}-error" class="ui-field-error ui-feedback-sr" ${bad?'':'hidden'}>연락 수단을 선택해주세요.</p></${local?'div':'section'}>`;
}
function scopedContacts(i){return contactField(i);}
function q4ContactFeedback(site=null){
 const owner=site===null?'global':'site-'+site,g=document.querySelector(`[data-contact-owner="${owner}"]`);if(!g)return;
 const c=site===null?state.contact:state.siteContacts[site],bad=state.attempted&&!Object.values(c||{}).some(Boolean);
 g.dataset.error=String(bad);g.querySelector('[role="group"]').setAttribute('aria-invalid',String(bad));g.querySelector('.ui-field-error').hidden=!bad;
 if(!bad){g.classList.remove('qa-shake');g.querySelectorAll('input').forEach(el=>el.removeAttribute('aria-invalid'));}
 schedulePopupBadges();
}
function q4ScrollFocusInvalid(target,shaker=target){
 if(!target?.isConnected)return;target.tabIndex=target.matches('input,button,select,textarea')?target.tabIndex:-1;
 const scroll=$('q4-regular-scroll'),box=target.getBoundingClientRect(),host=scroll?.getBoundingClientRect();
 if(host){const delta=box.top<host.top+12?box.top-host.top-12:box.bottom>host.bottom-15?box.bottom-host.bottom+15:0;scroll.scrollTop=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,scroll.scrollTop+delta));}
 target.focus({preventScroll:true});if(shaker&&!matchMedia('(prefers-reduced-motion: reduce)').matches){shaker.classList.remove('qa-shake');void shaker.offsetWidth;shaker.classList.add('qa-shake');shaker.addEventListener('animationend',()=>shaker.classList.remove('qa-shake'),{once:true});}
}
function q4GlobalValidationIssue(){if(isIndividual())return null;if(!Object.values(state.contact).some(Boolean))return {kind:'contact',target:'#q4-contact-global'};if(state.mode!=='FIXED')return null;return repeatValidationIssue(null);}
function q4RevealGlobalIssue(issue){
 const epoch=++q4ValidationEpoch,motions=[];
 if(issue.week){state.weekOpen=issue.week;motions.push(setOpen(`week-${issue.week}`,true));}
 q4ContactFeedback();paintWeekDemo();
 Promise.allSettled(motions).then(q4AfterFrame).then(q4AfterFrame).then(()=>{
  if(epoch!==q4ValidationEpoch||!q4GlobalValidationIssue())return;
  const target=document.querySelector(issue.target);if(!target)return;
  target.setAttribute('aria-invalid','true');
  if(issue.kind==='repeat'){const group=target.closest('.qa-field');group?.setAttribute('data-error','true');}
  q4ScrollFocusInvalid(target,issue.kind==='contact'?target.parentElement:target);
 });
}

function scopedQuality(i){return `<div class="qa-site-field qa-scoped-quality" data-site-quality="${i}"><div class="qa-site-label ui-field-title">품질 테스트</div>${checkbox(`qa-site-quality-${i}`,'품질 테스트가 목적이실 경우 체크해주세요.',!!state.siteQuality[i],`data-site-quality="${i}"`,true)}</div>`;}
function scopedHoliday(i){return `<div class="qa-scoped-holiday qa-site-field" data-site-holiday="${i}" aria-label="${escapeHTML(names[i])} 휴무일 · 주말 · 공휴일 대응">${acc(`site-holiday-${i}`,'휴무일 · 주말 · 공휴일 대응',holidayContent(i),!!state.siteHolidayOpen[i],siteHolidayStatus(i),'qa-site-child qa-site-holiday-acc',true)}</div>`;}
const holidayValidationAttempt=new Set();
let q4ValidationEpoch=0;
const q4HasHolidayDays=i=>{const h=state.siteHolidays[i];return h.days.length>0||h.none||h.irregular;};
function siteHolidayStatus(i){return siteHolidayComplete(i)?'complete':(state.attempted||holidayValidationAttempt.has(i))?'error':'empty';}
function siteHolidayMark(i){const e=$(`site-holiday-${i}`);if(!e)return;const st=siteHolidayStatus(i);e.dataset.state=st;e.dataset.complete=String(st==='complete');e.dataset.error=String(st==='error');if(st==='complete'){e.classList.remove('qa-shake');e.getAnimations().filter(a=>a.animationName==='qaShake').forEach(a=>a.cancel());}
 const form=e.querySelector(':scope > .ui-accordion__body');
 const days=form?.querySelector('.qa-holiday-days');const dayBad=st==='error'&&!q4HasHolidayDays(i);
 if(days){days.dataset.error=String(dayBad);days.setAttribute('aria-invalid',String(dayBad));days.setAttribute('aria-describedby',`q4-site-holiday-${i}-day-error`);let msg=form.querySelector(`#q4-site-holiday-${i}-day-error`);if(!msg){msg=document.createElement('p');msg.id=`q4-site-holiday-${i}-day-error`;msg.className='qa-error qa-inline-error ui-feedback-sr';days.after(msg);}msg.textContent=dayBad?'매장 정기 휴무일을 선택해주세요.':'';msg.hidden=!dayBad;}
 const conflict=form?.querySelector(`[data-combo="site-holiday-${i}-conflict"]`),badConflict=st==='error'&&!comboSelected('conflict',state.siteHolidays[i].conflict);
 if(conflict){conflict.setAttribute('aria-invalid',String(badConflict));conflict.dataset.error=String(badConflict);conflict.setAttribute('aria-describedby',`q4-site-holiday-${i}-conflict-error`);let msg=form.querySelector(`#q4-site-holiday-${i}-conflict-error`);if(!msg){msg=document.createElement('p');msg.id=`q4-site-holiday-${i}-conflict-error`;msg.className='qa-error qa-inline-error ui-feedback-sr';conflict.closest('.qa-combo')?.after(msg);}if(msg){msg.textContent=badConflict?'휴무일 납품 충돌 시 대응을 선택해주세요.':'';msg.hidden=!badConflict;}}
 refreshStatus(i);}
function q4SiteValidationIssue(i,holidayOnly=false){const m=siteMode(i),h=state.siteHolidays[i];
 const holiday=()=>!isIndividual()||!appliesSiteHoliday(i)?null:!q4HasHolidayDays(i)?{kind:'holiday-days',target:'.qa-holiday-days',child:true}:!comboSelected('conflict',h.conflict)?{kind:'holiday-conflict',target:`[data-combo="site-holiday-${i}-conflict"]`,child:true}:null;
 if(holidayOnly)return holiday();
 const amount=()=>{const key=fields(i).find(k=>q4QuantityInvalid(i,k));return key?{kind:'quantity',target:`[data-qty="${i}:${key}"]`}:null;};
 const repeat=()=>isIndividual()&&m==='FIXED'?repeatValidationIssue(i):null;
 const contact=()=>isIndividual()&&!siteContactComplete(i)?{kind:'contact',target:`#q4-contact-site-${i}`}:null;
 const date=()=>dateIssue(i).valid?null:{kind:'desired-date',target:`[data-date-site="${i}"][data-date-part="day"]`};
 const order=m==='FLEX'?[amount,contact,holiday]:m==='FIXED'?[amount,repeat,contact,holiday]:[amount,date,contact];
 for(const get of order){const issue=get();if(issue)return issue;}return null;
}
function q4RevealSiteIssue(i,holidayOnly=false){const issue=q4SiteValidationIssue(i,holidayOnly);if(!issue)return false;if(issue.kind==='desired-date')return revealDateIssue(i);
 const epoch=++q4ValidationEpoch,owner=$(`site-${i}`)||$('single-site'),child=$(`site-holiday-${i}`),motions=[];
 if(holidayOnly)holidayValidationAttempt.add(i);else state.attempted=true;
 if(state.count>1){state.siteOpen=i;motions.push(setOpen(`site-${i}`,true));}
 if(isIndividual()){if(issue.child){state.siteHolidayOpen[i]=true;motions.push(setOpen(`site-holiday-${i}`,true));}if(issue.week){state.siteRepeat[i].weekOpen=issue.week;motions.push(setOpen(`site-week-${i}-${issue.week}`,true));}}
 refreshStatus(i);if(appliesSiteHoliday(i)&&isIndividual())siteHolidayMark(i);q4ContactFeedback(i);paintWeekDemo();
 if(issue.kind==='quantity'){owner?.querySelectorAll('[data-qty]').forEach(input=>{const key=input.dataset.qty.split(':')[1],bad=q4QuantityInvalid(i,key);input.setAttribute('aria-invalid',String(bad));input.closest('.qa-site-field, .qa-field')?.setAttribute('data-error',String(bad));});}
 const targetOwner=issue.child?child:owner;
 Promise.allSettled(motions).then(q4AfterFrame).then(q4AfterFrame).then(()=>{
  if(epoch!==q4ValidationEpoch||!targetOwner?.isConnected||!q4SiteValidationIssue(i,holidayOnly))return;
  const target=targetOwner.querySelector(issue.target);if(!target)return;target.setAttribute('aria-invalid','true');
  if(issue.kind==='repeat'||issue.kind==='quantity'){const group=target.closest('.qa-site-field,.qa-field');if(group){group.dataset.error='true';let note=group.querySelector('.qa-inline-error');if(!note){note=document.createElement('p');note.className='qa-error qa-inline-error ui-feedback-sr';group.append(note);}note.id=`q4-site-${i}-${issue.kind}-error`;note.textContent=issue.message||'필수 항목을 입력해주세요.';note.hidden=false;target.setAttribute('aria-describedby',note.id);}}
  const shaker=issue.child?child:target.closest('.ui-field-group,.qa-site-field,.qa-field')||target;
  q4ScrollFocusInvalid(target,shaker);
 });return true;
}
function completeSiteHoliday(i){if(!appliesSiteHoliday(i))return;if(q4RevealSiteIssue(i,true))return;
 holidayValidationAttempt.delete(i);q4ValidationEpoch++;siteHolidayMark(i);state.siteHolidayOpen[i]=false;
 const settled=setOpen(`site-holiday-${i}`,false);
 // Child closes without navigating away; move only when the following field is no longer visible.
 const target=()=>{const block=$(`site-${i}`)?.querySelector('[data-site-block="holiday"]');return block?.nextElementSibling?.querySelector('.qa-site-label,.qa-label,input,button')||null;};
 navigateAfterAccordionLayout([settled],target,{onlyIfOutside:true});
}

function exposeSiteHolidayInvalid(i){if(!appliesSiteHoliday(i)||siteHolidayComplete(i))return false;return q4RevealSiteIssue(i,true);}
function copyItem(id,label,checked=false){return checkbox(`qa-copy-field-${id}`,label,checked,`data-copy-field="${id}"`);}
// MSG0433 copy modal — common required accordion, 5 explicit opt-in fields and zero default selections.
const COPY_FIELDS=[['contact','연락 수단'],['mode','납품 방식'],['monthly','월 사용량'],['base','회당 예상 납품 수량'],['holiday','휴무일 · 주말 · 공휴일 대응']];
const copyDefaultFields=()=>Object.fromEntries(COPY_FIELDS.map(([k])=>[k,false]));
let copyHeightAnimation=null,copyOpenAnimation=null,copyClosing=false;
function copyFieldAvailable(k){const src=state.copySource;if(src===null||src===undefined)return false;const m=state.siteModes[src];return !(['monthly','base','holiday'].includes(k)&&m==='ONCE');}
function copyOptions(i){return `<div class="qa-copy-check-grid">${COPY_FIELDS.map(([key,label],n)=>`<div class="qa-copy-check-cell ${n===4?'qa-copy-check-wide':''}">${checkbox(`qa-copy-field-${key}`,label,false,`data-copy-field="${key}" ${copyFieldAvailable(key)?'':'disabled'} aria-label="${label}${copyFieldAvailable(key)?'':' (해당 없음)'}"`,true)}</div>`).join('')}</div>`;}
function requestCopy(i){if(!isIndividual()||$('qa-copy-confirm'))return;closeQ4Dropdown();state.copySource=i;state.copyTargets=[];state.copyFields=copyDefaultFields();state.copyAttempted=false;copyClosing=false;
 const targets=Array.from({length:state.count},(_,n)=>n).filter(n=>n!==i).map(n=>checkbox(`qa-copy-target-${n}`,`<span class="qa-copy-target-text">${escapeHTML(names[n])}</span>`,false,`data-copy-target="${n}" aria-label="${escapeHTML(names[n])}"`,true)).join('');
 const host=window.OrderCopyDialog.create({title:names[i]+' 설정 복제',fields:copyOptions(i),targets});
 document.body.append(host);q4SeedCheckboxes(host);bindCopyDialogEvents(host);updateCopyValidation();
 window.OrderModalShell.bind(host,()=>closeCopy());window.OrderModalShell.open(host,{variant:'copy',returnFocus:()=>document.querySelector(`[data-copy-from="${i}"]`),initialFocus:()=>host.querySelector('[data-copy-cancel]')});
}
function copyIncompatibleReason(i){const f=state.copyFields,src=state.copySource;if(src===null||!state.copyTargets.includes(i))return '';
 const srcMode=state.siteModes[src],effective=f.mode?srcMode:state.siteModes[i];
 if((f.monthly||f.base)&&effective==='ONCE')return `${names[i]}: 1회 납품에는 월 사용량·회당 수량을 복제할 수 없습니다.`;
 if(f.holiday&&effective==='ONCE')return `${names[i]}: 1회 납품에는 휴무 대응을 복제할 수 없습니다.`;
 return '';}
function copyEligibility(){const keys=COPY_FIELDS.map(x=>x[0]).filter(k=>state.copyFields?.[k]);const targetCount=state.copyTargets?.length||0, errors=state.copyTargets.map(copyIncompatibleReason).filter(Boolean);
 if(keys.some(k=>!copyFieldAvailable(k)))errors.push('원본에 없는 값을 선택했습니다.');
 if(keys.includes('monthly')&&monthlyEditor?.evaluate().normalized?.sites?.find(row=>row.locationId===monthlyLocation(state.copySource))?.status!=='VALID')errors.push('월 사용량을 입력해 주세요.');
 if(keys.includes('base')&&!isValid(state.values[state.copySource]?.base))errors.push('회당 예상 납품 수량을 입력해 주세요.');
 return {count:keys.length,targetCount,errors,valid:keys.length>0&&targetCount>0&&errors.length===0};}
function copyAnimationStatus(e,needs){if(!e)return;e.classList.toggle('qa-copy-invalid',!!needs);if(needs&&!matchMedia('(prefers-reduced-motion: reduce)').matches){e.classList.remove('qa-shake');void e.offsetWidth;e.classList.add('qa-shake');}}
function validateCopyAttempt(){const host=$('qa-copy-confirm');if(!host)return;state.copyAttempted=true;const r=copyEligibility();updateCopyValidation();if(!r.count)copyAnimationStatus(host.querySelector('#qa-copy-fields'),true);if(!r.targetCount)copyAnimationStatus(host.querySelector('#qa-copy-target-group'),true);(host.querySelector(!r.count?'#qa-copy-fields .accordion-trigger':'#qa-copy-target-group .qa-copy-target-heading'))?.focus({preventScroll:true});}
function updateCopyValidation(){const host=$('qa-copy-confirm');if(!host)return;const r=copyEligibility(),fields=host.querySelector('#qa-copy-fields'),group=host.querySelector('#qa-copy-target-group'),save=host.querySelector('[data-copy-apply]'),feedback=host.querySelector('#qa-copy-feedback');
 if(save)save.disabled=!r.valid;
 const count=host.querySelector('#qa-copy-count');if(count)count.textContent=`${r.count}개`;
 const bt=fields?.querySelector(':scope > .accordion-trigger'),label=fields?.querySelector('.qa-inline-title');
 if(fields){fields.dataset.complete=String(r.count>0);fields.dataset.state=state.copyAttempted&&!r.count?'error':r.count?'complete':'empty';fields.dataset.error=String(state.copyAttempted&&!r.count);fields.classList.toggle('qa-copy-invalid',state.copyAttempted&&!r.count);}
 group?.classList.toggle('qa-copy-invalid',!!(state.copyAttempted&&!r.targetCount));
 if(bt)bt.setAttribute('aria-invalid',String(state.copyAttempted&&!r.count));
 if(feedback){feedback.textContent=r.errors[0]||'';feedback.dataset.error=String(r.errors.length>0);feedback.classList.toggle('ui-feedback-sr',r.errors.every(x=>/입력해|선택해/.test(x)));}
 host.querySelectorAll('[data-copy-target]').forEach(el=>{const n=Number(el.dataset.copyTarget);el.setAttribute('aria-invalid',String(r.errors.some(e=>e.startsWith(names[n]+':'))));});}
function closeCopy(restore=true){
 const host=$('qa-copy-confirm');if(!host)return;
 const from=state.copySource;
 if(copyOpenAnimation){copyOpenAnimation.cancel();copyOpenAnimation=null;}
 if(copyHeightAnimation){copyHeightAnimation.cancel();copyHeightAnimation=null;}
 const finish=()=>{host.remove();state.copySource=null;state.copyTargets=[];state.copyFields=null;state.copyAttempted=false;
  if(restore&&Number.isInteger(from))document.querySelector(`[data-copy-from="${from}"]`)?.focus({preventScroll:true});};
 window.OrderModalShell.close(host,{after:finish});
}
function bindCopyDialogEvents(host){
 host.addEventListener('click',e=>{
  if(e.target.closest('[data-copy-cancel]')){closeCopy();return;}
  if(e.target.closest('[data-copy-apply]')){applyCopy();return;}
  const a=e.target.closest('[data-acc="qa-copy-fields"]');
  if(a){const open=a.getAttribute('aria-expanded')!=='true';const card=host.querySelector('.qa-copy-card');const from=card?.getBoundingClientRect().height||0;
   setOpen('qa-copy-fields',open);requestAnimationFrame(()=>animateCopyCardHeight(from,card?.scrollHeight||from));return;}
 });
 host.addEventListener('change',e=>{const el=e.target;if(!el.matches('input[type=checkbox]'))return;
  q4AnimateCheckedTransition(el);
  if(el.dataset.copyField!==undefined){state.copyFields[el.dataset.copyField]=el.checked;updateCopyValidation();requestAnimationFrame(resizeCopyCardAfterToggle);}
  else if(el.dataset.copyTarget!==undefined){const n=Number(el.dataset.copyTarget);if(el.checked){if(!state.copyTargets.includes(n))state.copyTargets.push(n);}else state.copyTargets=state.copyTargets.filter(x=>x!==n);
   updateCopyValidation();requestAnimationFrame(resizeCopyCardAfterToggle);}
 });
 host.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.matches('button,input[type=checkbox]')){
   e.preventDefault();if(copyEligibility().valid)applyCopy();else validateCopyAttempt();}});
}
function applyCopy(){if(!isIndividual()||!copyEligibility().valid){validateCopyAttempt();return;}
 const from=state.copySource,f={...state.copyFields}, targets=[...state.copyTargets],srcMode=state.siteModes[from];
 // Preflight ALL destinations before any write: atomic local draft operation.
 if(targets.some(n=>copyIncompatibleReason(n))){validateCopyAttempt();return;}
 for(const dest of targets){if(f.mode)state.siteModes[dest]=srcMode;
 if(f.contact)state.siteContacts[dest]={...state.siteContacts[from]};
 if(f.monthly)state.values[dest].monthly=state.values[from].monthly;
 if(f.base)state.values[dest].base=state.values[from].base;
 if(f.holiday){const memo=state.siteHolidays[dest].request;state.siteHolidays[dest]={...state.siteHolidays[from],days:[...state.siteHolidays[from].days],request:memo};}
 }if(f.monthly)monthlyEditor?.clone(monthlyLocation(from),targets.map(monthlyLocation));syncMonthlyFields();closeCopy(false);state.siteOpen=from;render();travel(from);}
function animateCopyCardHeight(){/* The disclosure body owns height; compact flex panel follows it naturally. No second animation on the same size change. */}
function resizeCopyCardAfterToggle(){/* Error/target content changes use natural height within the common capped, single-scroll shell. */}
function siteBody(i){
 const mode=siteMode(i),individual=isIndividual(),wrap=(name,html,child=false)=>`<div class="${child?'qa-child-block':'qa-parent-block'}" data-site-block="${name}">${html}</div>`;
 const modeHTML=individual?`<div class="qa-site-field qa-site-mode"><div class="qa-site-label ui-field-title">납품 방식 ${requiredStar}</div><div class="qa-mode-choices qa-three" role="group" aria-label="사업장${i+1} 납품 방식">${Object.entries(mName).map(([v,t])=>`<button type="button" class="ui-choice" data-site-choice="${i}" data-value="${v}" aria-pressed="${mode===v}">${t}</button>`).join('')}</div></div>`:'';
 const process=()=>`<div class="qa-site-field qa-site-process"><div class="qa-site-label ui-field-title">주문 진행 방식 ${requiredStar}</div><div class="qa-mode-choices qa-two" role="group" aria-label="사업장${i+1} 주문 진행 방식">${[['contact','상호 확인 후 배송'],['auto','자동 배송']].map(([v,t])=>`<button type="button" class="ui-choice" data-site-process="${i}" data-value="${v}" aria-pressed="${(state.siteProcess[i]||'contact')===v}">${t}</button>`).join('')}</div></div>`;
 const variable=()=>`<div class="qa-var-row qa-check-wrap">${checkbox(`qa-variable-${i}`,'예상 납품 수량이 가변적일 경우 체크해주세요.',state.variable[i],`data-var="${i}"`,true)}</div>${state.variable[i]?`<div class="qa-var-range">${quantity(i,'min','최소','13')}${quantity(i,'max','최대','17')}</div>`:''}`;
 const quantities=()=>`${state.count>1?wrap('monthly',quantity(i,'monthly','월 사용량','최대 50')):''}${wrap('base',quantity(i,'base','회당 예상 납품 수량','최대 15')+variable())}`;
 const copy=()=>individual?`<button type="button" class="qa-site-copy-action ui-copy-action" data-copy-from="${i}">다른 사업장에 설정 복사${CODE1_UI.copyIcon}</button>`:'';
 const next=()=>CODE1_UI.button({label:i===state.count-1?'입력완료':'다음 사업장 입력',action:`data-next="${i}"`,filled:i===state.count-1});
 let rows=[];if(individual)rows.push(wrap('mode',modeHTML));
 // MSG0474: presentation order and tab order share the same keyed DOM sequence.
 if(mode==='FLEX'){
  rows.push(quantities());if(individual)rows.push(wrap('contact',scopedContacts(i)),wrap('holiday',scopedHoliday(i)));
 }else if(mode==='FIXED'){
  if(individual)rows.push(wrap('process',process()));
  rows.push(quantities());if(individual)rows.push(wrap('repeat',repeatSection(i)),wrap('contact',scopedContacts(i)),wrap('holiday',scopedHoliday(i)));
 }else if(state.count>1){
  rows.push(wrap('once',quantity(i,'once','1회 납품량','최대 20')),wrap('date',dateSection(i)));
  if(individual)rows.push(wrap('contact',scopedContacts(i)));
  rows.push(wrap('quality',scopedQuality(i)));
 }else{
  // MSG0478: single-ONCE amount, date and quality are three peer field groups.
  rows.push(wrap('once',quantity(i,'once','납품 수량','최대 20')),wrap('date',dateSection(i)),wrap('quality',scopedQuality(i)));
 }
 if(state.count>1)rows.push(wrap('actions',`<div class="ui-action-group qa-site-navigation">${copy()}${next()}</div>`));return `<div class="qa-site-form">${rows.join('')}</div>`;
}
function sitesSection(){if(state.count===1)return `<section class="qa-form-section" data-section="sites"><div class="qa-single-section" id="single-site">${siteBody(0)}</div></section>`;
 const statuses=Array.from({length:state.count},(_,i)=>status(i));
 // MSG0438 MIXED is a flat list of SITE accordion owners; no parent disclosure or sibling holiday.
 if(isIndividual())return `<section class="qa-form-section qa-individual-sites" data-section="sites"><div class="qa-site-list">${statuses.map((st,i)=>acc(`site-${i}`,names[i],siteBody(i),state.siteOpen===i,st,'qa-site-child qa-mixed-site',true)).join('')}</div></section>`;
 const modes=Array.from({length:state.count},(_,i)=>siteMode(i)),title=modes.every(m=>m==='ONCE')?'사업장별 납품량':'사업장별 월 사용량';
 const parent=state.attempted&&statuses.some(x=>x==='error')?'error':statuses.every(x=>x==='complete')?'complete':'empty';
 return `<section class="qa-form-section" data-section="sites">${acc('business-parent',title,`<div class="qa-site-list">${statuses.map((st,i)=>acc(`site-${i}`,names[i],siteBody(i),state.siteOpen===i,st,'qa-site-child',true)).join('')}</div>`,state.parentOpen,parent,'qa-site-parent',true)}</section>`;
}
function holidayContent(i=null){
 const local=i!==null;const h=local?state.siteHolidays[i]:{days:state.holidayDays,none:state.holidayNone,irregular:state.holidayIrregular,...state.holiday,request:state.request};
 const options=['선택 안 함','협의 후 조정','휴무 전일 희망','휴무 다음날 희망','공급사와 별도 협의'];
 const days=['월','화','수','목','금','토','일'];const suffix=local?'-site-'+i:'';
 const weekday=`<div class="qa-site-field qa-closure-field"><div class="qa-site-label ui-field-title">매장 정기 휴무일 ${requiredStar}</div><div class="qa-holiday-days" role="group" ${local?'tabindex="-1"':''} aria-label="${local?names[i]+' ':''}매장 정기 휴무일"><div class="qa-day-weekrow">${days.map(d=>`<button type="button" ${local?`data-site-closed-day="${i}:${d}"`:`data-closed-day="${d}"`} data-day="${d}" aria-pressed="${h.days.includes(d)}">${d}</button>`).join('')}</div><div class="qa-day-exceptions">${checkbox('qa-holiday-none'+suffix,'없음',h.none,local?`data-site-no-closure="${i}"`:'data-no-closure')}${checkbox('qa-holiday-irregular'+suffix,'일정하지 않음',h.irregular,local?`data-site-irregular-closure="${i}"`:'data-irregular-closure')}</div></div></div>`;
 const prefix=local?`site-holiday-${i}-`:'holiday-';const opt=(k,label)=>dropdown(prefix+k,label,options,h[k]);
 const rid=local?'qa-request-site-'+i:'qa-request';return `<div class="qa-site-form qa-holiday-fields">${weekday}${opt('conflict','휴무일 납품 충돌 시 *')}${opt('weekend','주말 대응')}${opt('holiday','공휴일 대응')}${opt('subholiday','대체공휴일 대응')}<div class="qa-field"><label class="ui-field-title" for="${rid}">추가 요청사항</label><textarea id="${rid}" ${local?`data-site-request="${i}"`:''} maxlength="120" placeholder="">${escapeHTML(h.request)}</textarea><div class="qa-help-inline" id="${rid}-count">${h.request.length}/120</div></div>${local?`<div class="qa-holiday-done-actions ui-action-group"><button type="button" class="subaction ui-continue-action" data-site-holiday-done="${i}">입력완료</button></div>`:`<div class="qa-holiday-done-actions ui-action-group"><button type="button" class="subaction ui-continue-action" data-global-holiday-done>입력완료</button></div>`}</div>`;
}
function holidayStatus(){return holidayComplete()?'complete':state.attempted?'error':'empty';}


// MSG0465 shared desired-date field. Keys use stable line+allocation identity, never a row index.
const datePolicy=window.OrderDatePolicy;
const dateKey=i=>JSON.stringify([regularContext.line.id,regularContext.allocations[i].id]);
const dateDOMKey=i=>encodeURIComponent(regularContext.line.id)+'--'+encodeURIComponent(regularContext.allocations[i].id);
const dateID=(i,part)=>`qa-date-${part}-${dateDOMKey(i)}`;
function dateData(i=state.calendarSite??0){return state.datesByAllocation?.[dateKey(i)]||datePolicy.blank();}
function monthDayCount(y,m){return datePolicy.days(y,m);}
function dateValid(i=state.calendarSite??0){return datePolicy.validate(dateData(i)).valid;}
function dateSection(i){const d=dateData(i),v=datePolicy.validate(d),error=!v.valid&&(state.attempted||state.dateTouched?.has(dateKey(i))),owner=escapeHTML(dateKey(i));
 return `<div class="qa-site-field qa-delivery-date" data-section="preferred-date" data-date-owner="${owner}"><label class="qa-site-label ui-field-title" for="${dateID(i,'day')}">납품일</label><div class="qa-date-anchor" data-date-error="${error}"><div class="qa-date-segments">${[['year','연도',2000,2100],['month','월',1,12],['day','일',1,31]].map(([part,label,min,max])=>`<input id="${dateID(i,part)}" data-date-site="${i}" data-date-part="${part}" aria-label="${escapeHTML(names[i])} 납품 ${label}" aria-describedby="${dateID(i,'error')}" type="number" inputmode="numeric" min="${min}" max="${max}" ${part==='day'?'placeholder="__"':''} value="${escapeHTML(d[part])}" aria-invalid="${error}"/><span>${part==='year'?'년':part==='month'?'월':'일'}</span>`).join('')}</div><button type="button" class="qa-calendar-trigger" id="${dateID(i,'trigger')}" data-calendar-for="${i}" aria-label="${escapeHTML(names[i])} 납품 희망일 달력 열기" aria-haspopup="dialog" aria-controls="qa-date-popover" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 2v6 M17 2v6 M3 10h18" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></button></div><p id="${dateID(i,'error')}" class="qa-date-error qa-inline-error ui-feedback-sr" ${error?'':'hidden'}>${error?v.message:''}</p></div>`;
}
let calendarBoundaryTimer=null;
function calendarElement(){return $('qa-date-popover');}
function activeCalendarTrigger(){return state.calendarSite===null||state.calendarSite===undefined?null:$(dateID(state.calendarSite,'trigger'));}
function renderCalendar(focusDay=null){const el=calendarElement();if(!el||state.calendarSite===null)return;
 const {year:y,month:m}=state.calendarView,today=datePolicy.today(),d=dateData(),count=monthDayCount(y,m),offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
 const enabled=Array.from({length:count},(_,j)=>j+1).filter(day=>datePolicy.validate({year:y,month:m,day}).valid);
 const selected=+d.year===y&&+d.month===m&&enabled.includes(+d.day)?+d.day:null,current=today.year===y&&today.month===m?today.day:null;
 const focus=enabled.includes(+focusDay)?+focusDay:selected||(enabled.includes(current)?current:enabled[0]);
 el.dataset.owner=dateKey(state.calendarSite);el.setAttribute('aria-label',names[state.calendarSite]+' 납품 희망일 달력');
 el.setAttribute('aria-labelledby','qa-calendar-title');el.setAttribute('aria-describedby','qa-calendar-help');el.setAttribute('aria-modal','false');
 const icon=path=>`<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
 const heading=`<div class="qa-calendar-heading"><button type="button" class="ui-icon-button" data-calendar-nav="-1" aria-label="이전 달" ${y===2000&&m===1?'disabled':''}>${icon('M12 5l-5 5 5 5')}</button><strong id="qa-calendar-title" aria-live="polite">${y}년 ${m}월</strong><button type="button" class="ui-icon-button" data-calendar-nav="1" aria-label="다음 달" ${y===2100&&m===12?'disabled':''}>${icon('M8 5l5 5-5 5')}</button><button type="button" class="ui-icon-button" data-calendar-close aria-label="달력 닫기">${icon('M5 5l10 10M15 5L5 15')}</button></div>`;
 const covered=window.OrderHolidaySnapshot.get(y,m,1).covered;el.dataset.holidayCoverage=covered?'covered':'unknown';
 const cells=Array(offset).fill('<span aria-hidden="true"></span>').concat(Array.from({length:count},(_,j)=>{const day=j+1,past=!enabled.includes(day),isToday=today.year===y&&today.month===m&&today.day===day,holiday=window.OrderHolidaySnapshot.get(y,m,day).record,dow=new Date(Date.UTC(y,m-1,day)).getUTCDay(),kind=holiday?(holiday.type==='substitute'?'substitute':'holiday'):dow===0?'sunday':dow===6?'saturday':'weekday';
  return `<button type="button" data-calendar-day="${day}" data-day-kind="${kind}" ${holiday?`data-holiday-name="${escapeHTML(holiday.name)}" title="${escapeHTML(holiday.name)}"`:''} aria-label="${y}년 ${m}월 ${day}일${holiday?' '+escapeHTML(holiday.name):''}${past?' 선택 불가':''}" aria-pressed="${selected===day}" ${isToday?'aria-current="date"':''} ${past?'disabled aria-disabled="true"':''} tabindex="${focus===day?0:-1}">${day}</button>`;}));
 el.innerHTML=heading+`<div class="qa-calendar-weeknames" aria-hidden="true">${['월','화','수','목','금','토','일'].map((n,i)=>`<span ${i===5?'data-weekend="saturday"':i===6?'data-weekend="sunday"':''}>${n}</span>`).join('')}</div><div class="qa-calendar-grid" role="group" aria-label="날짜 선택">${cells.join('')}</div>${covered?'':`<p class="qa-calendar-coverage">${y}년 공휴일 정보는 확인이 필요합니다.</p>`}<p class="visually-hidden" id="qa-calendar-help">방향키로 날짜 이동, Page Up과 Page Down으로 월 이동, Enter로 선택, Escape로 닫기</p><div class="qa-calendar-actions"><button type="button" data-calendar-close>닫기</button></div>`;
 state.calendarTodayKey=datePolicy.key(today);
}
function positionCalendar(){const p=calendarElement(),btn=activeCalendarTrigger();if(!p||!btn||p.hidden)return;
 const r=btn.getBoundingClientRect(),margin=8,pw=Math.min(304,innerWidth-2*margin);
 p.style.width=pw+'px';p.style.maxHeight=Math.max(120,innerHeight-2*margin)+'px';
 const height=p.getBoundingClientRect().height;
 p.style.left=Math.max(margin,Math.min(r.right-pw,innerWidth-pw-margin))+'px';
 p.style.top=Math.max(margin,Math.min(r.bottom+margin+height<=innerHeight-margin?r.bottom+margin:r.top-height-margin,innerHeight-height-margin))+'px';
}
function refreshCalendarBoundary(){if(!state.calendarOpen)return;
 const todayKey=datePolicy.key(datePolicy.today());if(todayKey!==state.calendarTodayKey){const focused=document.activeElement?.dataset.calendarDay;renderCalendar(focused);positionCalendar();calendarElement().querySelector('[data-calendar-day][tabindex="0"]')?.focus({preventScroll:true});syncDateFields(state.calendarSite);}}
function scheduleCalendarBoundary(){clearTimeout(calendarBoundaryTimer);if(!state.calendarOpen)return;
 // Refresh at Seoul midnight; opening, keyboard, click, input and Save also validate current time.
 const now=Date.now(),day=86400000,seoulOffset=9*3600000,delay=day-((now+seoulOffset)%day);
 calendarBoundaryTimer=setTimeout(()=>{refreshCalendarBoundary();scheduleCalendarBoundary();},delay+30);
}
function toggleCalendar(on,i=state.calendarSite??0){const p=calendarElement();if(!p)return;
 if(!on){const btn=activeCalendarTrigger();state.calendarOpen=false;p.hidden=true;clearTimeout(calendarBoundaryTimer);document.querySelectorAll('[data-calendar-for]').forEach(b=>b.setAttribute('aria-expanded','false'));btn?.focus({preventScroll:true});return;}
 closeQ4Dropdown();state.calendarSite=i;state.calendarOpen=true;state.calendarReturnId=dateID(i,'trigger');
 const d=dateData(i),today=datePolicy.today(),show=datePolicy.calendarValid(d)?d:today;
 state.calendarView={year:+show.year,month:+show.month};p.hidden=false;
 document.querySelectorAll('[data-calendar-for]').forEach(b=>b.setAttribute('aria-expanded',String(+b.dataset.calendarFor===i)));
 renderCalendar();positionCalendar();(p.querySelector('[data-calendar-day][tabindex="0"]')||p.querySelector('[data-calendar-close]'))?.focus({preventScroll:true});scheduleCalendarBoundary();
}
function syncDateFields(i){if(i===undefined||!regularContext)return;const d=dateData(i),v=datePolicy.validate(d),error=!v.valid&&(state.attempted||state.dateTouched.has(dateKey(i)));
 for(const part of ['year','month','day']){const e=$(dateID(i,part));if(e){if(document.activeElement!==e)e.value=d[part];e.setAttribute('aria-invalid',String(error));}}
 const anchor=$(dateID(i,'day'))?.closest('.qa-date-anchor');if(anchor)anchor.dataset.dateError=String(error);
 const note=$(dateID(i,'error'));if(note){note.textContent=error?v.message:'';note.hidden=!error;}
 const trigger=$(dateID(i,'trigger'));if(trigger)trigger.setAttribute('aria-label',names[i]+' 납품 희망일 달력 '+(v.valid&&!v.empty?`${d.year}년 ${d.month}월 ${d.day}일 변경`:'열기'));
 refreshStatus(i);
 schedulePopupBadges();
}
function dateIssue(i){return siteMode(i)==='ONCE'?datePolicy.validate(dateData(i)): {valid:true,empty:true};}
function revealDateIssue(i){if(dateIssue(i).valid)return false;state.attempted=true;state.dateTouched.add(dateKey(i));
 const motions=[];if(state.count>1){if(!isIndividual()){state.parentOpen=true;motions.push(setOpen('business-parent',true));}state.siteOpen=i;motions.push(setOpen(`site-${i}`,true));}
 syncDateFields(i);const target=()=>$(dateID(i,'day'));
 navigateAfterAccordionLayout(motions,target);
 const field=target()?.closest('.qa-delivery-date');if(field&&!matchMedia('(prefers-reduced-motion:reduce)').matches){field.classList.remove('qa-shake');void field.offsetWidth;field.classList.add('qa-shake');field.addEventListener('animationend',()=>field.classList.remove('qa-shake'),{once:true});}return true;
}
function chooseCalendarDay(day){if(!state.calendarOpen)return;refreshCalendarBoundary();const {year,month}=state.calendarView,desired={year,month,day:Number(day)};
 if(!datePolicy.validate(desired).valid){renderCalendar();return;}
 const i=state.calendarSite;state.datesByAllocation[dateKey(i)]=desired;state.dateTouched.add(dateKey(i));toggleCalendar(false);syncDateFields(i);
}
function moveCalendarMonth(delta){const v=state.calendarView,d=new Date(Date.UTC(v.year,v.month-1+delta,1)),year=d.getUTCFullYear(),month=d.getUTCMonth()+1;if(year<2000||year>2100)return;
 state.calendarView={year,month};renderCalendar();positionCalendar();calendarElement().querySelector(`[data-calendar-nav="${delta<0?-1:1}"]`)?.focus({preventScroll:true});}
function calendarKeydown(e){if(!state.calendarOpen)return false;
 if(e.key==='Escape'){e.preventDefault();e.stopPropagation();toggleCalendar(false);return true;}
 const p=calendarElement();
 if(e.key==='Tab'){const controls=[...p.querySelectorAll('button:not(:disabled)')].filter(x=>x.tabIndex>=0);const first=controls[0],last=controls.at(-1);
  if(!p.contains(document.activeElement)){e.preventDefault();first?.focus({preventScroll:true});}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus({preventScroll:true});}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus({preventScroll:true});}return true;}
 const btn=e.target.closest('[data-calendar-day]');if(!btn)return false;
 const k=e.key,delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[k],old=Number(btn.dataset.calendarDay),v=state.calendarView;
 if(delta===undefined&&!['Home','End','PageUp','PageDown'].includes(k))return false;
 e.preventDefault();let d=new Date(Date.UTC(v.year,v.month-1,old));
 if(delta!==undefined)d.setUTCDate(old+delta);
 else if(k==='Home'||k==='End'){const weekday=(d.getUTCDay()+6)%7;d.setUTCDate(old+(k==='Home'?-weekday:6-weekday));}
 else {const step=(k==='PageUp'?-1:1)*(e.shiftKey?12:1);d=new Date(Date.UTC(v.year,v.month-1+step,1));d.setUTCDate(Math.min(old,datePolicy.days(d.getUTCFullYear(),d.getUTCMonth()+1)));}
 let next={year:d.getUTCFullYear(),month:d.getUTCMonth()+1,day:d.getUTCDate()};
 if(next.year<2000||next.year>2100)return true;if(datePolicy.key(next)<datePolicy.key(datePolicy.today()))next=datePolicy.today();
 state.calendarView={year:next.year,month:next.month};renderCalendar(next.day);positionCalendar();p.querySelector(`[data-calendar-day="${next.day}"]`)?.focus({preventScroll:true});return true;
}

// MSG0456: one shared presentation with the exact existing fixture arithmetic.

function onceQuantityData(){const indexes=Array.from({length:state.count},(_,i)=>i).filter(i=>siteMode(i)==='ONCE');
 const complete=indexes.length>0&&indexes.every(i=>isValid(state.values[i]?.once));
 const total=complete?indexes.reduce((sum,i)=>sum+Number(state.values[i].once),0):null;
 return {indexes,complete,total,value:total===null?'합계 미확정':total.toLocaleString('ko-KR')+' '+unit(),siteCount:indexes.length+'개'};}

function resultSection(){const hasRecurring=state.mode==='MIXED'?state.siteModes.some(m=>m!=='ONCE'):state.mode!=='ONCE';
 const hasOnce=state.mode==='MIXED'?state.siteModes.some(m=>m==='ONCE'):state.mode==='ONCE';
 if(!hasRecurring&&!hasOnce)return '';
 const mode=hasRecurring&&hasOnce?'both':hasRecurring?'monthly':'once';
 return Q4ResultSummary(mode,hasRecurring?monthlyResultData():null,hasOnce?onceQuantityData():null);
}
function onceQuantitySummary(){return resultSection();}
function refreshOnceQuantitySummary(){refreshResultsOnly();}
function extras(){const hasRecurring=state.mode==='MIXED'?state.siteModes.some(m=>m!=='ONCE'):state.mode!=='ONCE';
 const hasOnce=state.mode==='MIXED'?state.siteModes.some(m=>m==='ONCE'):state.mode==='ONCE';
 const holiday=(!isIndividual()&&hasRecurring)?`<section class="qa-form-section" data-section="holiday">${acc('qa-holiday','휴무일 · 주말 · 공휴일 대응',holidayContent(),state.advancedOpen,holidayStatus(),'qa-site-parent',true)}</section>`:'';
 return holiday+resultSection();
}
// Read-only preview uses the regular allocation validator. Display routing never
// commits, changes completion rules, or validates collapsed groups differently.
let popupBadgeFrame=0;
function schedulePopupBadges(){
 if(popupBadgeFrame)return;popupBadgeFrame=requestAnimationFrame(()=>{popupBadgeFrame=0;paintPopupBadges();});
}
function paintPopupBadges(){
 if(!regularContext||state.dialogClosed)return;
 const issues=window.OrderRegularQ4Bridge.inspect(serializedAllocations(true)).map(i=>({...i,groupKey:[i.stage,i.lineId||'',i.siteId||'',i.fieldKey||i.issueId].join('|')}));
 const root=$('q4-regular-dialog'),title=$('q4-regular-title'),owners=[{key:'q4-draft',title,depth:0,available:true,matches:()=>true}];
 const available=node=>{for(let body=node.parentElement;body&&body!==root;body=body.parentElement){if(body.classList.contains('ui-accordion__body')&&body.parentElement.querySelector(':scope > .accordion-trigger')?.getAttribute('aria-expanded')!=='true')return false;}return true;};
 for(const item of root.querySelectorAll('#q4-regular-fields [data-ui-subaccordion]')){
  const head=item.querySelector(':scope > .accordion-trigger'),t=head?.querySelector(':scope > .qcopy > strong');if(!t)continue;
  const id=item.id;let matches=null;
  if(id==='business-parent')matches=()=>true;
  else if(/^site-\d+$/.test(id)){const i=Number(id.slice(5));matches=x=>x.siteId===regularContext.allocations[i]?.locationId;}
  else if(/^site-week-\d+-\d+$/.test(id)){const [,i,n]=id.match(/^site-week-(\d+)-(\d+)$/);matches=x=>x.siteId===regularContext.allocations[Number(i)]?.locationId&&x.fieldKey==='weekdays-'+n;}
  else if(/^week-\d+$/.test(id)){const n=id.slice(5);matches=x=>x.fieldKey==='weekdays-'+n;}
  else if(/^site-holiday-\d+$/.test(id)){const i=Number(id.slice(13));matches=x=>x.siteId===regularContext.allocations[i]?.locationId&&/^holiday-/.test(x.fieldKey);}
  else if(id==='qa-holiday')matches=x=>/^holiday-/.test(x.fieldKey);
  if(matches){let depth=1;for(let n=item.parentElement;n&&n!==root;n=n.parentElement)if(n.matches('[data-ui-subaccordion]'))depth++;owners.push({key:'q4-draft|'+id,title:t,depth,available:available(item),matches});}
 }
 OrderErrorBadges.paint(owners,state.attempted?issues:[]);
}

function paintWeekDemo(){
 document.querySelectorAll('#q4-regular-dialog .qa-week-choice').forEach(group=>{const site=group.dataset.repeatSite===undefined?null:Number(group.dataset.repeatSite),r=repeatDraft(site),n=Number(group.dataset.repeatWeek),v=OrderRepeatContract.inspect(r),w=v.week[n-1];if(!w)return;
  const bad=!!r.weeklyCheck&&!w.complete&&(state.attempted||w.over),note=$(group.id+'-error'),owner=group.closest('[data-ui-subaccordion]');
  group.setAttribute('aria-invalid',String(bad));
  group.querySelectorAll('[data-weekday],[data-site-weekday]').forEach(button=>{const d=button.dataset.day,chosen=!!r.weekdays?.[n+':'+d];button.setAttribute('aria-pressed',String(chosen));button.disabled=!chosen&&(!Number.isInteger(v.perWeek)||w.count>=v.perWeek);button.removeAttribute('data-over');button.removeAttribute('aria-invalid');});
  if(note){note.hidden=!bad;note.textContent=bad?`${n}주차에 희망요일 ${v.perWeek}개를 선택해 주세요. (현재 ${w.count}개)`:'';}
  if(owner){owner.dataset.complete=String(w.complete);owner.dataset.error=String(bad);owner.dataset.state=bad?'error':w.complete?'complete':'empty';if(!bad){owner.classList.remove('qa-shake');group.classList.remove('qa-shake');}}
 });
 schedulePopupBadges();
}
function render(){syncMonthlyFields();closeQ4Dropdown();if(state.calendarOpen)toggleCalendar(false);const resizePanel=$('q4-regular-dialog')?.querySelector('.q4-regular-panel');const beforeHeight=resizePanel?.getBoundingClientRect().height||0;const scroller=$('q4-regular-scroll');const sc=scroller?.scrollTop||0;
 $('q4-regular-title').textContent=regularContext.line.housing+'번 · '+regularContext.line.size+' · '+state.pack+'구';
 const modeChoices=[['FLEX','소진 시 주문'],['FIXED','정기 납품'],['ONCE','1회 납품']];
 const modeChoice=state.count>=2?`<section class="qa-form-section" data-section="delivery"><div class="qa-section-title ui-field-title ui-field-title--top">납품 방식 ${requiredStar}</div><div class="qa-bulk-row"><button type="button" class="qa-individual-button ui-choice" data-individual aria-pressed="${state.mode==='MIXED'}">사업장 개별 설정</button><div class="qa-bulk-dropdown">${dropdown('bulk','', ['소진 시 주문','정기 납품','1회 납품'],state.mode==='MIXED'?'사업장 일괄 설정':mName[state.mode])}</div></div></section>`:choice('납품 방식',modeChoices,state.mode,'delivery');
 const process=state.mode!=='FIXED'?'':choice('주문 진행 방식',[['contact','상호 확인 후 배송'],['auto','자동 배송']],state.process,'process');
 const contacts=contactField();
 $('q4-regular-fields').innerHTML=modeChoice+process+(isIndividual()?'':contacts)+repeatSection()+sitesSection()+extras();
 if(scroller)scroller.scrollTop=sc;
 const modal=$('q4-regular-dialog');modal.dataset.closed=String(state.dialogClosed);refreshHolidayStatus();if(isIndividual())for(let i=0;i<state.count;i++)siteHolidayMark(i);
 q4SeedCheckboxes($('q4-regular-fields'));paintWeekDemo();if(state.weeklyCheck){for(const n of [1,2,3,4])refreshWeekStatus(n);}
 if(isIndividual())for(let i=0;i<state.count;i++)if(siteMode(i)==='FIXED'&&state.siteRepeat[i].weeklyCheck)for(const n of [1,2,3,4])refreshWeekStatus(n,i);
 const outer=document.querySelector('#q4-regular-fields > [data-section="delivery"] .qa-section-title');if(outer){const st=getComputedStyle(outer),d=$('q4-regular-dialog');d.style.setProperty('--q4-outer-title-family',st.fontFamily);d.style.setProperty('--q4-outer-title-size',(parseFloat(st.fontSize)/parseFloat(getComputedStyle(document.documentElement).fontSize))+'rem');d.style.setProperty('--q4-outer-title-weight',st.fontWeight);d.style.setProperty('--q4-outer-title-line',String(parseFloat(st.lineHeight)/parseFloat(st.fontSize)));d.style.setProperty('--q4-outer-title-spacing',st.letterSpacing);d.style.setProperty('--q4-outer-title-color',st.color);}
 // Q4 native panel preserves intrinsic geometry. No QA target height/property is assigned.


 observeResults();
}

// One height animation owner per disclosure; retain rendered height when interrupting.

function setOpen(id,open){const motion=window.OrderDisclosure.set($(id),open);schedulePopupBadges();return motion;}
// MSG0456: one cancel-safe Q4-body scroll owner, invoked after every height animation settles.
let q4NavigationSequence=0;
const q4AfterFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function q4CancelNavigation(){q4NavigationSequence++;q4ValidationEpoch++;const scroll=$('q4-regular-scroll');if(scroll)scroll.style.overflowAnchor='';}
function navigateAfterAccordionLayout(animations,findTarget,{onlyIfOutside=false,focus=true,result=false}={}){
 const seq=++q4NavigationSequence,scroller=$('q4-regular-scroll');if(!scroller)return Promise.resolve(false);
 scroller.style.overflowAnchor='none';const host=$('q4-regular-fields');if(host)host.style.paddingBottom='';
 const pending=Promise.all((animations||[]).map(p=>Promise.resolve(p).catch(()=>false))).then(async()=>{
  await q4AfterFrame();await q4AfterFrame();if(seq!==q4NavigationSequence)return false;
  const target=typeof findTarget==='function'?findTarget():document.querySelector(findTarget);if(!target?.isConnected)return false;
  let box=(target.classList.contains('qa-result-heading')?target.closest('[data-section=results]'):target).getBoundingClientRect(),viewport=scroller.getBoundingClientRect();
  const outside=box.top<viewport.top+12||box.bottom>viewport.bottom-12;
  if(onlyIfOutside&&!outside)return true;
  const before=scroller.scrollTop,desired=before+box.top-viewport.top-12;
  let max=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
  // MSG0460: keep the natural scroll extent; never synthesize padding/spacers.
  scroller.scrollTop=Math.max(0,Math.min(desired,max));
  if(focus&&target instanceof HTMLElement){if(!target.matches('button,input,textarea,[tabindex]'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}
  await q4AfterFrame();if(seq!==q4NavigationSequence)return false;
  box=target.getBoundingClientRect();viewport=scroller.getBoundingClientRect();
  const record={sequence:seq,target:target.id||target.className||target.tagName,elapsed:'after-animation+2rAF',beforeScroll:before,desiredScroll:desired,afterScroll:scroller.scrollTop,offset:box.top-viewport.top,windowScrollY:window.scrollY,at:performance.now()};
  (window.__q4NavigationLogs||(window.__q4NavigationLogs=[])).push(record);
  // Measurement only: this timer is NOT used to drive navigation.
  setTimeout(()=>{if(seq!==q4NavigationSequence||!target.isConnected)return;const bb=target.getBoundingClientRect(),ss=scroller.getBoundingClientRect();record.offset300=bb.top-ss.top;record.drift300=record.offset300-record.offset;record.scroll300=scroller.scrollTop;record.windowScrollY300=window.scrollY;},300);
  return true;
 }).finally(()=>{if(seq===q4NavigationSequence)scroller.style.overflowAnchor='';});
 return pending;
}
const q4ScrollRoot=$('q4-regular-scroll');
q4ScrollRoot?.addEventListener('wheel',q4CancelNavigation,{passive:true});
q4ScrollRoot?.addEventListener('touchstart',q4CancelNavigation,{passive:true});
q4ScrollRoot?.addEventListener('pointerdown',q4CancelNavigation,{passive:true});
q4ScrollRoot?.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key)&&!e.target.matches('input,textarea,button'))q4CancelNavigation();});
function refreshStatus(i){const e=$(`site-${i}`);if(e){let st=status(i);if(isIndividual()&&holidayValidationAttempt.has(i)&&appliesSiteHoliday(i)&&!siteHolidayComplete(i))st='error';e.dataset.state=st;e.dataset.complete=String(st==='complete');e.dataset.error=String(st==='error');if(st==='complete')e.classList.remove('qa-shake');}
 const p=$('business-parent');if(p){const a=Array.from({length:state.count},(_,j)=>status(j)),st=state.attempted&&a.includes('error')?'error':a.every(x=>x==='complete')?'complete':'empty';p.dataset.state=st;p.dataset.complete=String(st==='complete');p.dataset.error=String(st==='error');}
 schedulePopupBadges();
}
function travel(i,afterLayout=false){if(i<0||i>=state.count)return;state.parentOpen=true;
 const motions=[];if(!isIndividual())motions.push(setOpen('business-parent',true));
 if(state.siteOpen>=0&&state.siteOpen!==i)motions.push(setOpen(`site-${state.siteOpen}`,false));
 state.siteOpen=i;motions.push(setOpen(`site-${i}`,true));
 const header=()=>document.querySelector(`#site-${i} > .accordion-trigger`);
 if(afterLayout)return navigateAfterAccordionLayout(motions,header);
 // Manual accordion navigation retains its existing near-viewport behavior.
 requestAnimationFrame(()=>{const x=$(`site-${i}`);if(!x?.isConnected)return;const scroll=$('q4-regular-scroll');if(scroll){const r=x.getBoundingClientRect(),b=scroll.getBoundingClientRect();if(r.top<b.top||r.top>b.bottom-55)scroll.scrollTop+=r.top-b.top-10;}header()?.focus({preventScroll:true});});
}
function invalid(i){if(isIndividual()&&q4RevealSiteIssue(i))return;if(!fields(i).some(k=>q4QuantityInvalid(i,k))&&revealDateIssue(i))return;state.attempted=true;refreshStatus(i);const el=state.count===1?$('single-site'):$(`site-${i}`);if(!el)return;
 const first=fields(i).find(k=>q4QuantityInvalid(i,k));if(!first){if(isIndividual()&&siteMode(i)==='FIXED'&&!siteRepeatComplete(i)){const id=`site-repeat-${i}-${!comboSelected('period',state.siteRepeat[i].period)?'period':state.siteRepeat[i].period==='매월'?'date':'freq'}`;el.querySelector(`[data-combo="${id}"]`)?.focus({preventScroll:true});el.classList.remove('qa-shake');void el.offsetWidth;if(!matchMedia('(prefers-reduced-motion: reduce)').matches)el.classList.add('qa-shake');return;}if(isIndividual()&&appliesSiteHoliday(i)&&!siteHolidayComplete(i)){exposeSiteHolidayInvalid(i);return;}if(isIndividual()&&!siteContactComplete(i)){el.querySelector('.qa-scoped-contact input')?.focus({preventScroll:true});return;}return;}
 el.querySelectorAll('[data-qty]').forEach(field=>{const [si,k]=field.dataset.qty.split(':');if(Number(si)!==i)return;const bad=q4QuantityInvalid(i,k);field.setAttribute('aria-invalid',String(bad));const g=field.closest('.qa-field');if(g){g.dataset.error=String(bad);let p=g.querySelector('.qa-inline-error');if(p)p.hidden=!bad;}});
 const target=el.querySelector(`[data-qty="${i}:${first}"]`);if(target){target.focus({preventScroll:true});target.scrollIntoView({block:'nearest',behavior:'smooth'});}
 el.classList.remove('qa-shake');void el.offsetWidth;el.classList.add('qa-shake');}
function nextSite(i){const globalIssue=q4GlobalValidationIssue();if(globalIssue){state.attempted=true;paintWeekDemo();q4RevealGlobalIssue(globalIssue);return;}if(status(i,true)!=='complete'){invalid(i);return;}
 if(i===state.count-1){const motions=[setOpen(`site-${i}`,false)];state.siteOpen=-1;refreshStatus(i);
  const all=Array.from({length:state.count},(_,j)=>status(j,true)==='complete').every(Boolean);
  if(all){if(!isIndividual()){state.parentOpen=false;motions.push(setOpen('business-parent',false));}
   if(!isIndividual()&&$('qa-holiday')){state.advancedOpen=true;motions.push(setOpen('qa-holiday',true));if(!holidayComplete()){exposeHolidayInvalid();return;}}
   navigateAfterAccordionLayout(motions,()=>document.querySelector('[data-section="results"]')||$('q4-regular-save'),{result:true});}
  return;
 }
 travel(i+1,true);
}
// Keep the outer accordion and other site DOM identities stable on per-site changes.
function renderSite(i){syncMonthlyFields();q4ValidationEpoch++;const el=$(`site-${i}`),body=el?.querySelector(':scope > .ui-accordion__body');if(!body){render();return;}
 const scroll=$('q4-regular-scroll'),oldY=scroll?.scrollTop||0,oldForm=body.querySelector(':scope > .qa-site-form');
 const tmp=document.createElement('div');tmp.innerHTML=siteBody(i);const newForm=tmp.firstElementChild;
 if(oldForm){
  // Reconcile keyed top-level site blocks; retain DOM identity for unchanged holiday/contact/copy/next.
  const existing=new Map([...oldForm.children].map(node=>[node.dataset.siteBlock,node]));
  for(const child of [...newForm.children]){
   const before=existing.get(child.dataset.siteBlock);
   if(before&&before.outerHTML===child.outerHTML){newForm.replaceChild(before,child);existing.delete(child.dataset.siteBlock);}
  }
  oldForm.replaceWith(newForm);
 }else body.replaceChildren(newForm);
 if(scroll)scroll.scrollTop=oldY;q4SeedCheckboxes(newForm);paintWeekDemo();refreshStatus(i);
}
function renderRepeatOnly(i=null){
 const old=i===null?document.querySelector('#q4-regular-fields > .qa-repeat-section'):$(`site-${i}`)?.querySelector(`[data-site-repeat="${i}"]`);if(!old){render();return;}
 const wrapper=document.createElement('div');wrapper.innerHTML=repeatSection(i);const fresh=wrapper.firstElementChild;
 const scroll=$('q4-regular-scroll'),y=scroll?.scrollTop||0;old.replaceWith(fresh);if(scroll)scroll.scrollTop=y;q4SeedCheckboxes(fresh);paintWeekDemo();if(i!==null)refreshStatus(i);refreshResultsOnly();
}

function changeVariant(i){
 // Do not destroy/recreate the actual checked input: preserve focus and its real check motion.
 const form=$(`site-${i}`)?.querySelector('.qa-site-form')||$('single-site')?.querySelector('.qa-site-form');
 if(!form)return;
 const existing=form.querySelector('.qa-var-range');
 if(state.variable[i]&&!existing){const block=document.createElement('div');block.className='qa-var-range';block.innerHTML=quantity(i,'min','최소','13')+quantity(i,'max','최대','17');const control=form.querySelector('.qa-var-row');control?.after(block);}
 else if(!state.variable[i]&&existing)existing.remove();
 refreshStatus(i);refreshResultsOnly();
}


function q4DropdownHost(){let host=$('qa-dropdown-host');if(!host){host=document.createElement('div');host.id='qa-dropdown-host';host.hidden=true;$('q4-regular-dialog').append(host);}return host;}
function closeQ4Dropdown(){const host=$('qa-dropdown-host');if(host){
  const menu=host.querySelector('.qa-combo-menu');
  if(menu){menu.hidden=true;const id=menu.id.replace(/^combo-/, '').replace(/-menu$/,'');
    const trigger=[...document.querySelectorAll('[data-combo]')].find(b=>b.dataset.combo===id);
    const original=trigger?.closest('.qa-combo');if(original)original.appendChild(menu);else menu.remove();
  }
  host.hidden=true;host.replaceChildren();
 }state.drop=null;document.querySelectorAll('[data-combo]').forEach(b=>b.setAttribute('aria-expanded','false'));
}
function positionQ4Dropdown(){const host=$('qa-dropdown-host');const trigger=document.querySelector(`[data-combo="${state.drop}"]`);if(!host||host.hidden||!trigger)return;const d=$('q4-regular-dialog').getBoundingClientRect(),r=(trigger.closest('.qa-combo-editable')||trigger).getBoundingClientRect();const below=d.bottom-r.bottom-9,above=r.top-d.top-9;const up=below<Math.min(190,140)&&above>below;const available=Math.max(48,(up?above:below)-5);const scroll=host.querySelector('.qa-combo-scroll');if(scroll)scroll.style.maxHeight=Math.min(190,available)+'px';host.style.left=Math.max(0,r.left-d.left)+'px';host.style.width=r.width+'px';const height=host.getBoundingClientRect().height;host.style.top=(up?r.top-d.top-height-4:r.bottom-d.top+4)+'px';host.dataset.direction=up?'up':'down';}
function openQ4Dropdown(id){closeQ4Dropdown();const source=$(`combo-${id}-menu`);const trigger=document.querySelector(`[data-combo="${id}"]`);if(!source||!trigger)return;const host=q4DropdownHost();host.replaceChildren(source);source.hidden=false;state.drop=id;host.hidden=false;trigger.setAttribute('aria-expanded','true');positionQ4Dropdown();}
function selectedOption(id,val){
 const match=id.match(/^site-repeat-(\d+)-(period|freq|date)$/),key=match?match[2]:id;
 if(match||['period','freq','date'].includes(id)){
  const site=match?Number(match[1]):null,r=repeatDraft(site);q4ValidationEpoch++;
  if(key==='period'){if(OrderRepeatContract.resetPeriod(r,val))state.attempted=false;}
  else if(key==='freq'){r.frequency=val;r.legacyReviewRequired=false;r.semantics='per-week-v1';}
  else {r.date=val==='직접 입력'?'':val;r.dateMode=val==='직접 입력'?'custom':'preset';monthEditing.delete(id);}
  closeQ4Dropdown();renderRepeatOnly(site);
  (key==='date'?document.querySelector(`[data-month-date="${id}"]`):document.querySelector(`[data-combo="${id}"]`))?.focus({preventScroll:true});return;
 }
 if(id==='bulk'){state.mode=Object.keys(mName).find(k=>mName[k]===val)||'MIXED';state.process=state.mode==='FIXED'?'contact':'shop';closeQ4Dropdown();render();return;}
 if(id.startsWith('site-holiday-')){const m=id.match(/^site-holiday-(\d+)-(conflict|weekend|holiday|subholiday)$/);if(m)state.siteHolidays[+m[1]][m[2]]=val;}
 else if(id.startsWith('holiday-'))state.holiday[id.split('-')[1]]=val;
 else if(id.startsWith('site-mode-')){const n=Number(id.replace('site-mode-',''));state.siteModes[n]=Object.keys(mName).find(k=>mName[k]===val)||'FLEX';}
 closeQ4Dropdown();if(id.startsWith('site-holiday-')){const i=Number(id.match(/^site-holiday-(\d+)-/)[1]);q4ValidationEpoch++;const trigger=document.querySelector(`[data-combo="${id}"]`);if(trigger){trigger.querySelector('span')?.replaceChildren(document.createTextNode(val));trigger.dataset.selected=String(comboSelected(id,val));trigger.setAttribute('aria-invalid','false');trigger.focus({preventScroll:true});}siteHolidayMark(i);}else render();refreshHolidayStatus();refreshResultsOnly();
}
function closeProductModal(){
 q4CancelNavigation();q4ValidationEpoch++;
 if($('qa-copy-confirm'))closeCopy(false);closeQ4Dropdown();if(state.calendarOpen)toggleCalendar(false);
 const dialog=$('q4-regular-dialog');if(state.dialogClosed||!dialog.open)return;
 state.dialogClosed=true;window.OrderModalShell.close(dialog,{after:endRegularClose});
}
function openProductModal(){
 state.dialogClosed=false;const context=regularContext,original=returnFocus;
 window.OrderModalShell.open($('q4-regular-dialog'),{variant:'editor',returnFocus:()=>original?.isConnected?original:context.returnSelector?document.querySelector(context.returnSelector):document.querySelector(`[data-edit-allocation="${CSS.escape(context.allocations[context.selectedIndex||0].id)}"]`),initialFocus:()=> $('q4-regular-close')});
}

function repeatValidationIssue(site=null){const r=repeatDraft(site),v=OrderRepeatContract.inspect(r),prefix=site===null?'':`site-repeat-${site}-`;if(v.valid)return null;const issue=v.issue;
 if(issue.kind==='weekdays')return {kind:'repeat-weekdays',target:site===null?`#q4-week-global-${issue.week}`:`#q4-week-site-${site}-${issue.week}`,week:issue.week,message:issue.message};
 const key=issue.kind==='period'?'period':issue.kind==='date'?'date':'freq';return {kind:'repeat',target:key==='date'?`[data-month-date="${prefix+key}"]`:`[data-combo="${prefix+key}"]`,message:issue.message};
}
function toggleRepeatDay(site,n,d,button){const r=repeatDraft(site),v=OrderRepeatContract.inspect(r),w=v.week[n-1],key=n+':'+d;if(!w||!OrderRepeatContract.days.includes(d))return;
 const selected=!!r.weekdays[key];if(!selected&&(!Number.isInteger(v.perWeek)||w.count>=v.perWeek))return;
 q4ValidationEpoch++;r.weekdays[key]=!selected;button.setAttribute('aria-pressed',String(!selected));paintWeekDemo();refreshWeekStatus(n,site);
 if(site!==null)refreshStatus(site);else for(let i=0;i<state.count;i++)refreshStatus(i);refreshResultsOnly();
}
function monthOwner(id){const m=id.match(/^site-repeat-(\d+)-date$/);return m?Number(m[1]):null;}
function monthFeedback(input,{commit=false}={}){if(commit)monthEditing.delete(input.dataset.monthDate);const id=input.dataset.monthDate,site=monthOwner(id),r=repeatDraft(site),valid=OrderRepeatContract.monthValue(r.date).valid,bad=state.attempted&&!valid;
 const shell=input.closest('.qa-combo-editable');const committed=valid&&!monthEditing.has(id);shell.dataset.selected=String(committed);shell.dataset.error=String(bad);shell.querySelector('.qa-month-suffix').hidden=!committed||r.date==='말일';input.size=Math.max(1,input.value.length);input.style.setProperty('--ui-month-width',r.date==='말일'?'2em':Math.max(1,input.value.length)+'ch');input.setAttribute('aria-invalid',String(bad));const note=document.querySelector(`[data-month-error="${id}"]`);if(note)note.hidden=!bad;if(site!==null)refreshStatus(site);refreshResultsOnly();
}
$('q4-regular-dialog').addEventListener('beforeinput',e=>{if(e.target.matches('[data-month-date]')&&!e.isComposing&&e.inputType==='insertText'&&e.data&&!/^[0-9]+$/.test(e.data))e.preventDefault();});
$('q4-regular-dialog').addEventListener('paste',e=>{if(e.target.matches('[data-month-date]')&&!/^[0-9]*$/.test(e.clipboardData?.getData('text')||''))e.preventDefault();});
function acceptMonthInput(input){if(!/^[0-9]*$/.test(input.value)){input.value=input.dataset.monthPrevious||'';return;}const magnitude=input.value.replace(/^0+/,'');if(magnitude.length>2||(magnitude.length===2&&magnitude>'31'))input.value='31';input.dataset.monthPrevious=input.value;const r=repeatDraft(monthOwner(input.dataset.monthDate));r.date=input.value;r.dateMode='custom';monthEditing.add(input.dataset.monthDate);q4ValidationEpoch++;monthFeedback(input);}
$('q4-regular-dialog').addEventListener('input',e=>{if(e.target.matches('[data-month-date]')&&!e.isComposing)acceptMonthInput(e.target);});
$('q4-regular-dialog').addEventListener('compositionend',e=>{if(e.target.matches('[data-month-date]'))acceptMonthInput(e.target);});
$('q4-regular-dialog').addEventListener('keydown',e=>{
 const input=e.target.closest('[data-month-date]');
 if(input){if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();monthFeedback(input,{commit:true});return;}if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeQ4Dropdown();return;}if(e.key==='ArrowDown'&&e.altKey){e.preventDefault();e.stopImmediatePropagation();openQ4Dropdown(input.dataset.monthDate);$('qa-dropdown-host')?.querySelector('button')?.focus();return;}}
 const arrow=e.target.closest('[data-combo]');if(arrow&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();openQ4Dropdown(arrow.dataset.combo);const options=[...$('qa-dropdown-host').querySelectorAll('[role=option]')];(e.key==='ArrowUp'?options.at(-1):options[0])?.focus();return;}
 const option=e.target.closest('#qa-dropdown-host [role=option]');if(option&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const options=[...$('qa-dropdown-host').querySelectorAll('[role=option]')],i=options.indexOf(option);const n=e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[n]?.focus();}
},true);

$('q4-regular-dialog').addEventListener('focusout',e=>{if(e.target.matches('[data-month-date]'))monthFeedback(e.target,{commit:true});});
function normalizeSavedRepeat(saved,a){const r=saved?clone(saved):OrderRepeatContract.fromAllocation(a);if(r.legacyReviewRequired===undefined)r.legacyReviewRequired=OrderRepeatContract.periods[r.period]>1&&r.semantics!=='per-week-v1';return r;}
$('q4-regular-dialog').addEventListener('click',e=>{if(!state.calendarOpen||e.target.closest('#qa-date-popover')||e.target.closest('[data-calendar-for]'))return;e.preventDefault();e.stopImmediatePropagation();toggleCalendar(false);},true);
$('q4-regular-dialog').addEventListener('focusin',()=>{if(state.calendarOpen)refreshCalendarBoundary();});
$('q4-regular-dialog').addEventListener('click',e=>{
 if(e.target.id==='qa-open'){openProductModal();return;}

 const trigger=e.target.closest('[data-calendar-for]');if(trigger){const i=Number(trigger.dataset.calendarFor);toggleCalendar(!(state.calendarOpen&&state.calendarSite===i),i);return;}
 if(e.target.closest('[data-calendar-close]')){toggleCalendar(false);return;}
 const cd=e.target.closest('[data-calendar-day]');if(cd){chooseCalendarDay(cd.dataset.calendarDay);return;}
 const cn=e.target.closest('[data-calendar-nav]');if(cn){moveCalendarMonth(Number(cn.dataset.calendarNav));return;}
 const option=e.target.closest('[data-combo-choice]');if(option){selectedOption(option.dataset.comboChoice,option.dataset.value);return;}
 const combo=e.target.closest('[data-combo]');if(combo){const id=combo.dataset.combo;if(state.drop===id)closeQ4Dropdown();else openQ4Dropdown(id);return;}
 if(state.drop&&!e.target.closest('.qa-combo')&&!e.target.closest('#qa-dropdown-host'))closeQ4Dropdown();
 const siteDay=e.target.closest('[data-site-weekday]');if(siteDay){const [si,n,d]=siteDay.dataset.siteWeekday.split(':');toggleRepeatDay(Number(si),Number(n),d,siteDay);return;}
 const day=e.target.closest('[data-weekday]');if(day){const [n,d]=day.dataset.weekday.split(':');toggleRepeatDay(null,Number(n),d,day);return;}
 const accB=e.target.closest('[data-acc]');if(accB){const id=accB.dataset.acc;if(id==='qa-copy-fields'){const open=accB.getAttribute('aria-expanded')!=='true';const card=document.querySelector('#qa-copy-confirm .qa-copy-card'),body=$('qa-copy-fields-body');const from=card?.getBoundingClientRect().height||0;const prior=body?.getBoundingClientRect().height||0;setOpen(id,open);const targetBody=open?(body?.scrollHeight||0):0;animateCopyCardHeight(from,from+targetBody-prior);return;}if(id==='business-parent'){state.parentOpen=!state.parentOpen;setOpen(id,state.parentOpen);}else if(id==='qa-holiday'){state.advancedOpen=!state.advancedOpen;setOpen(id,state.advancedOpen);}else if(id.startsWith('site-holiday-')){const i=Number(id.split('-').at(-1));state.siteHolidayOpen[i]=!state.siteHolidayOpen[i];setOpen(id,state.siteHolidayOpen[i]);}else if(id.startsWith('site-week-')){const m=id.match(/^site-week-(\d+)-(\d+)$/);if(m){const r=state.siteRepeat[+m[1]],n=+m[2];r.weekOpen=r.weekOpen===n?0:n;setOpen(id,r.weekOpen===n);}}else if(id.startsWith('week-')){state.weekOpen=state.weekOpen===Number(id.slice(5))?0:Number(id.slice(5));setOpen(id,state.weekOpen===Number(id.slice(5)));}else if(id.startsWith('site-')){const i=Number(id.slice(5));if(state.siteOpen===i){state.siteOpen=-1;setOpen(id,false);}else travel(i);}else if(id==='q1-ref'){setOpen(id,accB.getAttribute('aria-expanded')!=='true');}return;}
 if(e.target.closest('[data-individual]')){state.mode='MIXED';render();return;}
 const siteChoice=e.target.closest('[data-site-choice]');if(siteChoice){const i=Number(siteChoice.dataset.siteChoice);state.siteModes[i]=siteChoice.dataset.value;state.siteProcess[i]=state.siteModes[i]==='FIXED'?'contact':'shop';/* preserve existing per-site values and variable state */renderSite(i);refreshResultsOnly();travel(i);return;}
 const siteProcess=e.target.closest('[data-site-process]');if(siteProcess){const i=Number(siteProcess.dataset.siteProcess);state.siteProcess[i]=siteProcess.dataset.value;document.querySelectorAll(`[data-site-process="${i}"]`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===state.siteProcess[i])));return;}
 const scday=e.target.closest('[data-site-closed-day]');if(scday){const [a,d]=scday.dataset.siteClosedDay.split(':');const i=Number(a),h=state.siteHolidays[i];h.none=false;h.irregular=false;h.days=h.days.includes(d)?h.days.filter(x=>x!==d):[...h.days,d];document.querySelectorAll(`[data-site-closed-day^="${i}:"]`).forEach(el=>el.setAttribute('aria-pressed',String(h.days.includes(el.dataset.siteClosedDay.split(':')[1]))));const none=$(`qa-holiday-none-site-${i}`),irr=$(`qa-holiday-irregular-site-${i}`);if(none)none.checked=false;if(irr)irr.checked=false;q4ValidationEpoch++;siteHolidayMark(i);return;}
 if(e.target.id==='qa-copy-confirm'){closeCopy();return;}
 const copy=e.target.closest('[data-copy-from]');if(copy){requestCopy(Number(copy.dataset.copyFrom));return;}
 if(e.target.closest('[data-copy-cancel]')){closeCopy();return;}
 if(e.target.closest('[data-copy-apply]')){applyCopy();return;}
 const closureDay=e.target.closest('[data-closed-day]');if(closureDay){const d=closureDay.dataset.closedDay;state.holidayNone=false;state.holidayIrregular=false;state.holidayDays=state.holidayDays.includes(d)?state.holidayDays.filter(v=>v!==d):[...state.holidayDays,d];document.querySelectorAll('[data-closed-day]').forEach(b=>b.setAttribute('aria-pressed',String(state.holidayDays.includes(b.dataset.closedDay))));const n=$('qa-holiday-none'),ir=$('qa-holiday-irregular');if(n){n.checked=false;q4CheckboxPrevious.set(n,false);}if(ir){ir.checked=false;q4CheckboxPrevious.set(ir,false);}refreshHolidayStatus();return;}
 if(e.target.closest('[data-global-holiday-done]')){if(!holidayComplete()){exposeHolidayInvalid();return;}state.advancedOpen=false;navigateAfterAccordionLayout([setOpen('qa-holiday',false)],()=>document.querySelector('[data-section="results"]'),{result:true});return;}
 const holidayDone=e.target.closest('[data-site-holiday-done]');if(holidayDone){completeSiteHoliday(Number(holidayDone.dataset.siteHolidayDone));return;}
 const next=e.target.closest('[data-next]');if(next){nextSite(Number(next.dataset.next));return;}
 const choice=e.target.closest('[data-choice]');if(choice){const k=choice.dataset.choice,v=choice.dataset.value;if(k==='delivery'){state.mode=v;state.process=v==='FIXED'?'contact':'shop';state.drop=null;render();}if(k==='process'){state.process=v;document.querySelectorAll('[data-choice="process"]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.value===v)));}return;}
 if(e.target.id==='q4-regular-save'){saveRegularDraft();return;}
 if(e.target.closest('#q4-regular-cancel,#q4-regular-close')){closeProductModal();return;}

});
$('q4-regular-dialog').addEventListener('change',e=>{const el=e.target;if(!el.matches('input[type=checkbox]'))return;q4AnimateCheckedTransition(el);
 if(el.dataset.copyField!==undefined){state.copyFields[el.dataset.copyField]=el.checked;updateCopyValidation();requestAnimationFrame(resizeCopyCardAfterToggle);return;}
 if(el.dataset.copyTarget!==undefined){const n=Number(el.dataset.copyTarget);if(el.checked){if(!state.copyTargets.includes(n))state.copyTargets.push(n);}else state.copyTargets=state.copyTargets.filter(x=>x!==n);updateCopyValidation();requestAnimationFrame(resizeCopyCardAfterToggle);return;}
 if(el.dataset.siteContact){const [a,k]=el.dataset.siteContact.split(':');state.siteContacts[+a][k]=el.checked;q4ContactFeedback(+a);refreshStatus(+a);return;}
 if(el.dataset.siteWeekToggle!==undefined){const i=Number(el.dataset.siteWeekToggle),r=state.siteRepeat[i];r.weeklyCheck=el.checked;renderRepeatOnly(i);$(`qa-site-week-toggle-${i}`)?.focus({preventScroll:true});refreshStatus(i);return;}
 if(el.dataset.siteQuality!==undefined){state.siteQuality[Number(el.dataset.siteQuality)]=el.checked;return;}
 if(el.dataset.siteNoClosure!==undefined||el.dataset.siteIrregularClosure!==undefined){const isNone=el.dataset.siteNoClosure!==undefined,i=Number(isNone?el.dataset.siteNoClosure:el.dataset.siteIrregularClosure),h=state.siteHolidays[i];h.none=isNone&&el.checked;h.irregular=!isNone&&el.checked;if(el.checked)h.days=[];const other=$(`qa-holiday-${isNone?'irregular':'none'}-site-${i}`);if(other)other.checked=false;document.querySelectorAll(`[data-site-closed-day^="${i}:"]`).forEach(b=>b.setAttribute('aria-pressed','false'));q4ValidationEpoch++;siteHolidayMark(i);return;}
 if('noClosure' in el.dataset){state.holidayNone=el.checked;state.holidayIrregular=false;state.holidayDays=[];const other=$('qa-holiday-irregular');if(other){other.checked=false;q4CheckboxPrevious.set(other,false);}document.querySelectorAll('[data-closed-day]').forEach(b=>b.setAttribute('aria-pressed','false'));refreshHolidayStatus();}
 else if('irregularClosure' in el.dataset){state.holidayIrregular=el.checked;state.holidayNone=false;state.holidayDays=[];const other=$('qa-holiday-none');if(other){other.checked=false;q4CheckboxPrevious.set(other,false);}document.querySelectorAll('[data-closed-day]').forEach(b=>b.setAttribute('aria-pressed','false'));refreshHolidayStatus();}
 else if(el.dataset.contact){state.contact[el.dataset.contact]=el.checked;q4ContactFeedback();}
 else if('weekToggle' in el.dataset){state.weeklyCheck=el.checked;renderRepeatOnly(null);$('qa-week-toggle')?.focus({preventScroll:true});}
 else if('quality' in el.dataset)state.quality=el.checked;
 else if('var' in el.dataset){const i=Number(el.dataset.var);state.variable[i]=el.checked;changeVariant(i);}
});
$('q4-regular-dialog').addEventListener('input',e=>{const el=e.target;if(el.dataset.datePart){const i=Number(el.dataset.dateSite),k=el.dataset.datePart;state.datesByAllocation[dateKey(i)][k]=el.value===''?'':Number(el.value);state.dateTouched.add(dateKey(i));syncDateFields(i);return;}if(el.matches('[data-qty]')){const [i,k]=el.dataset.qty.split(':');state.values[Number(i)][k]=el.value;if(k==='monthly'){monthlyEditor?.set(monthlyLocation(Number(i)),el.value,{composing:e.isComposing});syncMonthlyFields();}refreshStatus(Number(i));refreshResultsOnly();syncRegularQuantityErrors(Number(i));if(state.attempted){const ok=!q4QuantityInvalid(Number(i),k),g=el.closest('.qa-field');g.dataset.error=String(!ok);el.setAttribute('aria-invalid',String(!ok));const msg=g.querySelector('.qa-inline-error');if(msg)msg.hidden=ok;}}
 if(el.id==='qa-request'){state.request=el.value;const count=$('qa-request-count');if(count)count.textContent=state.request.length+'/120';}
 if(el.dataset.siteRequest!==undefined){const i=Number(el.dataset.siteRequest);state.siteHolidays[i].request=el.value;const count=$('qa-request-site-'+i+'-count');if(count)count.textContent=el.value.length+'/120';}
});

$('q4-regular-dialog').addEventListener('compositionstart',e=>{if(e.target.dataset.qty?.endsWith(':monthly')){const i=Number(e.target.dataset.qty.split(':')[0]);monthlyEditor?.set(monthlyLocation(i),e.target.value,{composing:true});}});
$('q4-regular-dialog').addEventListener('compositionend',e=>{if(e.target.dataset.qty?.endsWith(':monthly')){const i=Number(e.target.dataset.qty.split(':')[0]);monthlyEditor?.set(monthlyLocation(i),e.target.value);syncMonthlyFields();}});
$('q4-regular-dialog').addEventListener('focusout',e=>{if(e.target.dataset.qty?.endsWith(':monthly')){monthlyEditor?.refresh();syncMonthlyFields();}});
// MSG0441: navigating to another field must never auto-collapse the current business accordion.
$('q4-regular-dialog').addEventListener('keydown',e=>{if(calendarKeydown(e))return;if(e.key==='Enter'&&$('qa-copy-confirm')&&e.target.closest('#qa-copy-confirm')&&!e.target.matches('button')&&!e.target.matches('input[type=checkbox]')){e.preventDefault();if(copyEligibility().valid)applyCopy();else validateCopyAttempt();return;}if(e.key==='Tab'&&$('qa-copy-confirm')){const host=$('qa-copy-confirm');const items=[...host.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,[tabindex]')].filter(el=>el.getClientRects().length>0&&el.tabIndex>=0);if(items.length){const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}else if(!host.contains(document.activeElement)){e.preventDefault();first.focus();}}return;}if(e.key==='Tab'&&!state.dialogClosed&&!state.calendarOpen){const roots=$('q4-regular-dialog');const items=[...roots.querySelectorAll('.q4-regular-dialog button:not(:disabled),.q4-regular-dialog input:not([disabled]),.q4-regular-dialog textarea:not([disabled])')].filter(x=>x.getClientRects().length && !x.closest('[hidden]'));if(items.length){let first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}if(e.key==='Escape'){e.preventDefault();if($('qa-copy-confirm')){closeCopy();return;}if(state.calendarOpen){e.preventDefault();toggleCalendar(false);return;}if(state.drop){const old=state.drop;closeQ4Dropdown();document.querySelector(`[data-combo="${old}"]`)?.focus({preventScroll:true});}else if(!state.dialogClosed){closeProductModal();}return;}
 const el=e.target;if(el.matches('[data-qty]')&&e.key==='Enter'){e.preventDefault();const i=Number(el.dataset.qty.split(':')[0]);if(status(i,true)==='complete')nextSite(i);else el.blur();}
});
$('q4-regular-scroll')?.addEventListener('scroll',()=>{if(state.drop)positionQ4Dropdown();if(state.calendarOpen)positionCalendar();},{passive:true});window.addEventListener('resize',()=>{if(state.drop)positionQ4Dropdown();if(state.calendarOpen)positionCalendar();});



window.OrderModalShell.bind($('q4-regular-dialog'),()=>{
 if($('qa-copy-confirm')){closeCopy();return;}if(state.calendarOpen){toggleCalendar(false);return;}
 if(state.drop){const old=state.drop;closeQ4Dropdown();document.querySelector(`[data-combo="${old}"]`)?.focus({preventScroll:true});return;}closeProductModal();
});

// MSG0460 real-state adapter. This module never writes regular state directly.
let regularContext=null,returnFocus=null,opening=false,committing=false;
const clone=x=>JSON.parse(JSON.stringify(x));
const optionToCode={'선택 안 함':'','협의 후 조정':'ask','휴무 전일 희망':'previous','휴무 다음날 희망':'next','공급사와 별도 협의':'negotiate'};
const legacyPolicyLabels={conflict:{ask:'협의 후 조정',skip:'휴무일 납품 제외',deliver:'휴무일에도 납품'},weekend:{ask:'협의 후 조정',skip:'주말 제외',allow:'토·일 납품 가능'},holiday:{ask:'협의 후 조정',skip:'공휴일 제외',allow:'공휴일에도 납품'},subholiday:{ask:'협의 후 조정',skip:'대체공휴일 제외',allow:'대체공휴일에도 납품'}};
const codeToOption=(code,key)=>legacyPolicyLabels[key]?.[code]||'협의 후 조정';
// New day-before/day-after *preferences* are stored exactly in review metadata; they do not create a delivery-calendar engine.
const legacyPolicy=(label,key)=>Object.keys(legacyPolicyLabels[key]||{}).find(k=>legacyPolicyLabels[key][k]===label)||(label==='선택 안 함'?'':'ask');
function allocationHoliday(a){if(a.q4Review?.activeHoliday)return clone(a.q4Review.activeHoliday);const h=a.advanced||{};return {days:[...(h.storeOffDays||[])],none:!!h.storeOffNone,irregular:!!h.storeOffIrregular,conflict:codeToOption(h.storeOffPolicy,'conflict'),weekend:codeToOption(h.weekend,'weekend'),holiday:codeToOption(h.holiday,'holiday'),subholiday:codeToOption(h.substituteHoliday,'subholiday'),request:h.memo||''};}
function allocationRepeat(a){return OrderRepeatContract.fromAllocation(a);}
function allocationContacts(a){return Object.fromEntries(['phone','sms','kakao','email'].map(k=>[k,(a.advanced?.contactChannels||[]).includes(k)]));}
function initializeFromRegular(context){
 monthEditing.clear();context=clone(context);for(const a of context.allocations){if(a.q4Review?.pack&&String(a.q4Review.pack)!==String(context.line.pack)){a.qty='';a.oneTimeDeliveryQty='';a.monthlyDemandQty='';a.qtyMin='';a.qtyMax='';if(a.q4Review.draft)a.q4Review.draft.values={};}}
 regularContext=clone(context);names.splice(0,names.length,...context.locations.map(x=>x.name));holidayValidationAttempt.clear();q4ValidationEpoch++;q4CancelNavigation();
 const first=context.allocations[0],count=context.allocations.length;
 const profile=count===1?(first.mode||'FLEX'):(first.q4Review?.profile||'MIXED');
 const baseDate=datePolicy.today();
 Object.assign(state,{count,mode:profile,pack:String(context.line.pack),stage:'INPUT',attempted:false,parentOpen:true,siteOpen:Math.max(0,context.selectedIndex),advancedOpen:false,weekOpen:1,copySource:null,copyTargets:[],copyFields:null,drop:null,dialogClosed:true,calendarOpen:false,estimate:null,
  datesByAllocation:Object.fromEntries(context.allocations.map(a=>[JSON.stringify([context.line.id,a.id]),clone(a.q4Review?.deliveryDate||datePolicy.blank())])),dateTouched:new Set(),calendarSite:null,calendarView:{year:baseDate.year,month:baseDate.month},
  values:context.allocations.map(a=>{const saved=a.q4Review?.draft?.values||{};const active=a.mode==='ONCE'?{once:String(a.oneTimeDeliveryQty??a.qty??'')}:{base:String(a.qty??''),monthly:String(count===1?context.line.qty:a.monthlyDemandQty??''),min:String(a.qtyMin??''),max:String(a.qtyMax??'')};return {...saved,...active};}),
  variable:context.allocations.map(a=>a.mode==='ONCE'?!!a.q4Review?.draft?.variable:!!a.variableQty),
  siteModes:context.allocations.map(a=>a.q4Review?.draft?.mode||a.mode||'FLEX'),
  siteProcess:context.allocations.map(a=>a.q4Review?.draft?.process||(a.advanced?.fixedOrderProcess==='auto'?'auto':'contact')),
  siteContacts:context.allocations.map(a=>clone(a.q4Review?.draft?.contact||allocationContacts(a))),
  siteHolidays:context.allocations.map(a=>clone(a.q4Review?.draft?.holiday||allocationHoliday(a))),
  siteHolidayOpen:Array(count).fill(false),siteRepeat:context.allocations.map(a=>normalizeSavedRepeat(a.q4Review?.draft?.repeat, a)),siteQuality:context.allocations.map(a=>!!(a.q4Review?.draft?.quality??a.qualityTest))});
 const common=clone(first.q4Review?.common||{}),h=common.holiday||allocationHoliday(first),r=normalizeSavedRepeat(common.repeat,first);
 Object.assign(state,{contact:common.contact||allocationContacts(first),process:common.process||(first.advanced?.fixedOrderProcess==='auto'?'auto':'contact'),quality:!!(common.quality??first.qualityTest),period:r.period,frequency:r.frequency,date:r.date,dateMode:r.dateMode,semantics:r.semantics,legacyReviewRequired:!!r.legacyReviewRequired,legacyOriginal:r.legacyOriginal,weeklyCheck:r.weeklyCheck,weekdays:r.weekdays,weekOpen:r.weekOpen||0,
  holidayDays:[...h.days],holidayNone:h.none,holidayIrregular:h.irregular,holiday:{closed:'',conflict:h.conflict,weekend:h.weekend,holiday:h.holiday,subholiday:h.subholiday},request:h.request});
 monthlyEditor=createMonthlyAllocationDraft(context,{readCurrentContext:()=>window.OrderRegularQ4Bridge.allocationContext?.(context.line.id)||context});syncMonthlyFields();
 returnFocus=document.activeElement;render();openProductModal();fitAllResultNumbers();
}
function serializedAllocations(forReview=false){const patches=regularContext.allocations.map((original,i)=>{
 const a=clone(original),m=siteMode(i),v=state.values[i],r=isIndividual()?state.siteRepeat[i]:state;
 const h=isIndividual()?state.siteHolidays[i]:{days:state.holidayDays,none:state.holidayNone,irregular:state.holidayIrregular,...state.holiday,request:state.request};
 const c=isIndividual()?state.siteContacts[i]:state.contact,process=isIndividual()?state.siteProcess[i]:state.process;
 const period=r.period==='매월'?0:r.period==='매주'?1:parseInt(r.period,10);
 const plans=Array.from({length:period===0?0:Math.max(1,period)},(_,w)=>({weekdays:['월','화','수','목','금','토','일'].filter(d=>r.weekdays?.[`${w+1}:${d}`])}));
 Object.assign(a,{mode:m,modeExplicit:true,qty:String(m==='ONCE'?v.once??'':v.base??''),qtySource:'user',variableQty:m!=='ONCE'&&!!state.variable[i],qtyMin:m!=='ONCE'&&state.variable[i]?v.min??'':'',qtyMax:m!=='ONCE'&&state.variable[i]?v.max??'':'',qualityTest:!!state.siteQuality[i]});
 if(m==='ONCE')a.oneTimeDeliveryQty=String(v.once??'');else a.monthlyDemandQty=state.count===1?String(regularContext.line.qty):String(v.monthly??'');
 if(m==='FIXED'){const packed=OrderRepeatContract.serialize(r);if(!packed.ok&&!forReview)throw new Error(packed.issue.message);if(packed.ok)Object.assign(a,packed.value);}
 a.advanced={...(a.advanced||{}),contactChannels:Object.keys(c).filter(k=>c[k]),fixedOrderProcess:process==='auto'?'auto':'seller',flexOrderProcess:'store',orderProcess:process==='auto'?'auto':'seller',storeOffDays:[...h.days],storeOffNone:!!h.none,storeOffIrregular:!!h.irregular,storeOffPolicy:legacyPolicy(h.conflict,'conflict'),weekend:legacyPolicy(h.weekend,'weekend'),holiday:legacyPolicy(h.holiday,'holiday'),substituteHoliday:legacyPolicy(h.subholiday,'subholiday'),memo:h.request||''};
 a.q4Review={version:'0460',pack:String(regularContext.line.pack),profile:state.mode,activeHoliday:clone(h),activeRepeat:OrderRepeatContract.snapshot(r),deliveryDate:clone(dateData(i)),
  common:{contact:clone(state.contact),process:state.process,quality:state.quality,holiday:{days:[...state.holidayDays],none:state.holidayNone,irregular:state.holidayIrregular,...state.holiday,request:state.request},repeat:OrderRepeatContract.snapshot(state)},
  draft:{mode:state.siteModes[i],process:state.siteProcess[i],values:clone(v),variable:state.variable[i],contact:clone(state.siteContacts[i]),holiday:clone(state.siteHolidays[i]),repeat:OrderRepeatContract.snapshot(state.siteRepeat[i]),quality:state.siteQuality[i]}};
 return a;
});return monthlyEditor?monthlyEditor.serialize(patches):patches;}
function validateForSave(){
 state.attempted=true;render();const globalIssue=q4GlobalValidationIssue();if(globalIssue){q4RevealGlobalIssue(globalIssue);return false;}
 const modes=Array.from({length:state.count},(_,i)=>siteMode(i));if(modes.some(m=>m!=='ONCE')&&!monthlyEditor?.evaluate().normalized?.canConfirm){showCommitError({message:'사업장별 월 사용량 합계를 전체 월 사용량에 맞춰 주세요.'});return false;}
 const bad=Array.from({length:state.count},(_,i)=>i).find(i=>status(i,true)!=='complete');
 if(bad!==undefined){if(state.count>1)travel(bad);invalid(bad);return false;}
 if(!isIndividual()&&$('qa-holiday')&&!holidayComplete()){exposeHolidayInvalid();return false;}
 return true;
}
function showCommitError(result){let p=$('q4-commit-error');if(!p){p=document.createElement('p');p.id='q4-commit-error';p.className='ui-error';p.setAttribute('role','alert');$('q4-regular-fields').prepend(p);}p.classList.toggle('ui-feedback-sr',!!result.issues?.length);p.textContent=result.message||'입력값을 확인해 주세요.';p.setAttribute('tabindex','-1');p.focus({preventScroll:true});$('q4-regular-scroll').scrollTop=0;}
async function saveRegularDraft(){if(committing||state.dialogClosed)return;committing=true;
 try{
  if(!validateForSave())return;
  const context=regularContext,patches=serializedAllocations(),fingerprint=JSON.stringify(patches);
  const sameEditor=()=>regularContext===context&&!state.dialogClosed;
  // Users can keep editing or cancel while storage waits for another tab.
  // Only the exact reviewed draft may cross the durable write boundary.
  const canCommit=()=>{if(!sameEditor())return false;try{return JSON.stringify(serializedAllocations())===fingerprint;}catch{return false;}};
  const prepared=monthlyEditor?.confirm({allocations:patches});
  if(!prepared?.ok){showCommitError(prepared||{message:'월 사용량을 확인해 주세요.'});return;}
  const result=await window.OrderRegularQ4Bridge.commit(prepared.allocations,null,canCommit);
  if(!sameEditor())return;
  if(result.ok)closeProductModal();
  else if(!result.confirmation)showCommitError(result.status==='CANCELLED'&&!canCommit()?{message:'입력값이 변경되었습니다. 다시 저장해 주세요.'}:result);
 }finally{committing=false;}}
function monthlyResultData(){
 const usageValid=!!regularContext?.line&&validMonthlyQuantity(regularContext.line);
 const base={usage:usageValid?monthlyQuantityText(regularContext.line):'미확정',value:'미확정',comparison:'pending',status:'예상 수량 미확정',complete:false};
 // Original regular contract intentionally leaves multi-allocation forecasts unresolved.
 if(state.count!==1||siteMode(0)==='ONCE')return base;
 const r=state.siteRepeat[0],repeat=isIndividual()?r:state;
 const data=window.OrderRegularQ4Bridge.forecast({allocation:{...regularContext.allocations[0],mode:siteMode(0)},quantity:state.values[0].base,rangeMin:state.values[0].min,rangeMax:state.values[0].max,variable:state.variable[0],repeat:OrderRepeatContract.snapshot(repeat),period:repeat.period,frequency:repeat.frequency,date:repeat.date,monthly:regularContext.line.qty});
 if(!data)return base;if(data.resolved===false)return {...base,status:data.status||base.status};
 return {...base,...data,value:data.low===data.high?data.low.toLocaleString('ko-KR'):`${data.low.toLocaleString('ko-KR')} ~ ${data.high.toLocaleString('ko-KR')}`,complete:true};
}
function Q4ResultSummary(mode,monthly,once){
 const card=(kind,title,number)=>`<article class="q4-result-card" data-card-kind="${kind}"><div class="q4-result-card-title">${title}</div><div class="q4-result-number-row"><span class="q4-result-number" data-result-value="${kind}" data-pending="${number==='미확정'||number==='합계 미확정'}">${escapeHTML(number)}</span>${kind==='once'?`<span class="q4-result-once-unit" aria-hidden="true">${unit()}</span>`:''}</div><div class="q4-result-card-foot">${kind==='once'?`<span data-result-count>${once?.indexes.length||0}개 사업장</span>`:`${kind==='usage'?quantityLabel(regularContext.line):unit()} / 월`}</div></article>`;
 const onceValue=once?.complete?once.total.toLocaleString('ko-KR'):'합계 미확정';
 return `<section class="qa-form-section q4-result-section" data-section="results" data-summary-mode="${mode}" aria-label="납품 예상 요약"><h3 class="qa-result-heading" tabindex="-1">${mode==='both'?'납품 예상 요약':mode==='monthly'?'월간 납품 예상':'1회 납품 예상'}</h3><div class="q4-result-grid">${monthly?card('usage','기존 사용량',monthly.usage)+card('monthly','월간 납품 예상',monthly.value):''}${once?card('once','1회 납품',onceValue):''}${monthly?`<div class="q4-result-comparison" data-result-status data-comparison="${monthly.comparison}">${escapeHTML(monthly.status)}</div>`:''}</div></section>`;
}
function refreshResultsOnly(){const host=$('q4-regular-fields');if(!host)return;const t=document.createElement('template');t.innerHTML=resultSection();const fresh=t.content.firstElementChild,current=host.querySelector(':scope > [data-section="results"]');
 if(!fresh){current?.remove();return;}if(!current){host.append(fresh);observeResults();return;}
 if(current.dataset.summaryMode!==fresh.dataset.summaryMode){current.dataset.summaryMode=fresh.dataset.summaryMode;current.replaceChildren(...fresh.childNodes);observeResults();return;}
 for(const s of ['[data-result-value="usage"]','[data-result-value="monthly"]','[data-result-value="once"]','[data-result-count]','[data-result-status]']){const a=current.querySelector(s),b=fresh.querySelector(s);if(a&&b){if(a.textContent!==b.textContent)a.textContent=b.textContent;for(const k of ['pending','comparison'])if(b.dataset[k]!==undefined)a.dataset[k]=b.dataset[k];}}
 fitAllResultNumbers();
}
// Measurement is event/ResizeObserver driven, never a per-frame font polling loop.
let resultObserver=null,resultFitQueued=false;const fitCache=new WeakMap();
const resultInkContext=document.createElement('canvas').getContext('2d');
function alignResultInk(node,rootPx,advance,unitEl){
 const cs=getComputedStyle(node),ctx=resultInkContext;
 ctx.font=[cs.fontStyle,cs.fontWeight,cs.fontSize,cs.fontFamily].join(' ');
 if('letterSpacing' in ctx)ctx.letterSpacing=cs.letterSpacing;
 const metrics=ctx.measureText(node.textContent),inkCenter=(metrics.actualBoundingBoxRight-metrics.actualBoundingBoxLeft)/2;
 // Keep numeric ink on the independent center line. Unit owns no space in the number's grid track.
 const dx=(advance/2-inkCenter);
 node.style.setProperty('--ui-number-optic-x',(dx/rootPx).toFixed(5)+'rem');
 node.dataset.inkOffsetX=dx.toFixed(3);
 if(unitEl)unitEl.style.left=`calc(50% + ${((metrics.actualBoundingBoxRight+metrics.actualBoundingBoxLeft)/2)/rootPx}rem + .25rem)`;
}

function fitAllResultNumbers(){if(resultFitQueued)return;resultFitQueued=true;requestAnimationFrame(()=>{resultFitQueued=false;
 const rootPx=parseFloat(getComputedStyle(document.documentElement).fontSize)||16;
 document.querySelectorAll('#q4-regular-dialog .q4-result-number').forEach(n=>{
  const row=n.parentElement,w=row.getBoundingClientRect().width,unitEl=row.querySelector('.q4-result-once-unit'),once=unitEl&&getComputedStyle(unitEl).display!=='none'?unitEl:null,unitWidth=once?.getBoundingClientRect().width||0;
  const available=Math.max(0,w-(once?2*(unitWidth+4):0)),base=parseFloat(getComputedStyle(row).fontSize)/rootPx,min=parseFloat(getComputedStyle(row).getPropertyValue('--type-result-number-min'))||.75;
  const key=[available,n.textContent,rootPx,base].join('|');if(fitCache.get(n)===key)return;fitCache.set(n,key);
  n.style.fontSize=base+'rem';let actual=n.getBoundingClientRect().width;
  const rem=Math.max(min,Math.min(base,base*available/Math.max(1,actual)));
  n.style.fontSize=rem.toFixed(4)+'rem';actual=n.getBoundingClientRect().width;
  const limited=actual>available+.5;n.dataset.fitLimited=String(limited);n.closest('.q4-result-card').dataset.fitLimited=String(limited);
  n.dataset.available=String(available);n.dataset.measuredWidth=String(actual);alignResultInk(n,rootPx,actual,once);
 });});}
function observeResults(){resultObserver?.disconnect();resultObserver=new ResizeObserver(fitAllResultNumbers);document.querySelectorAll('#q4-regular-dialog .q4-result-number-row').forEach(n=>resultObserver.observe(n));fitAllResultNumbers();}
function invalidateResultFonts(){document.querySelectorAll('#q4-regular-dialog .q4-result-number').forEach(n=>fitCache.delete(n));fitAllResultNumbers();}
if(document.fonts){document.fonts.ready.then(invalidateResultFonts);document.fonts.addEventListener('loadingdone',invalidateResultFonts);}
function setRegularGutter(){window.OrderModalShell.sync();}
function endRegularClose(){monthlyEditor?.cancel();monthlyEditor=null;cancelAnimationFrame(popupBadgeFrame);popupBadgeFrame=0;resultObserver?.disconnect();window.OrderRegularQ4Bridge.closed();regularContext=null;}
window.OrderQ4Review=Object.freeze({open:initializeFromRegular,close:closeProductModal,validate:validateForSave,commitError:showCommitError,
 get allocation(){return monthlyEditor?clone({evaluation:monthlyEditor.evaluate(),rows:monthlyEditor.rows,revision:monthlyEditor.session?.revision}):null;},get draft(){return regularContext?clone(state):null;},get serialized(){return regularContext?serializedAllocations():null;},get context(){return regularContext?clone(regularContext):null;}});
// Global/single-site holiday view uses the same group-owned feedback as the preserved per-site view.
function refreshHolidayStatus(){const p=$('qa-holiday');if(!p)return;const st=holidayStatus();p.dataset.state=st;p.dataset.complete=String(st==='complete');p.dataset.error=String(st==='error');
 const days=p.querySelector('.qa-holiday-days'),missing=!(state.holidayNone||state.holidayIrregular||state.holidayDays.length),dayBad=state.attempted&&missing;
 if(days){days.dataset.error=String(dayBad);days.setAttribute('tabindex','-1');days.setAttribute('aria-invalid',String(dayBad));days.setAttribute('aria-describedby','qa-global-holiday-days-error');let note=$('qa-global-holiday-days-error');if(!note){note=document.createElement('p');note.id='qa-global-holiday-days-error';note.className='qa-error ui-feedback-sr';days.after(note);}note.textContent=dayBad?'매장 정기 휴무일을 선택해주세요.':'';note.hidden=!dayBad;}
 const trigger=p.querySelector('[data-combo="holiday-conflict"]'),bad=state.attempted&&!comboSelected('conflict',state.holiday.conflict);if(trigger){trigger.dataset.error=String(bad);trigger.setAttribute('aria-invalid',String(bad));trigger.setAttribute('aria-describedby','qa-global-conflict-error');let note=$('qa-global-conflict-error');if(!note){note=document.createElement('p');note.id='qa-global-conflict-error';note.className='qa-error ui-feedback-sr';trigger.closest('.qa-combo').after(note);}note.textContent=bad?'휴무일 납품 충돌 시 대응을 선택해주세요.':'';note.hidden=!bad;}
 if(st==='complete'){p.classList.remove('qa-shake');p.getAnimations().filter(a=>a.animationName==='qaShake').forEach(a=>a.cancel());}
 schedulePopupBadges();
}
function exposeHolidayInvalid(){if(holidayComplete()){refreshHolidayStatus();return;}state.attempted=true;state.advancedOpen=true;const done=setOpen('qa-holiday',true);refreshHolidayStatus();const epoch=++q4ValidationEpoch;
 Promise.resolve(done).then(()=>q4AfterFrame()).then(()=>q4AfterFrame()).then(()=>{if(epoch!==q4ValidationEpoch||holidayComplete()||state.dialogClosed)return;const p=$('qa-holiday'),missing=!(state.holidayNone||state.holidayIrregular||state.holidayDays.length),target=p?.querySelector(missing?'.qa-holiday-days':'[data-combo="holiday-conflict"]');if(!target)return;
 const scroll=$('q4-regular-scroll'),r=target.getBoundingClientRect(),s=scroll.getBoundingClientRect();scroll.scrollTop=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,scroll.scrollTop+r.top-s.top-12));target.focus({preventScroll:true});
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches){p.classList.remove('qa-shake');void p.offsetWidth;p.classList.add('qa-shake');p.addEventListener('animationend',()=>p.classList.remove('qa-shake'),{once:true});}
 });
}

// Original regular numeric guard: ranges remain ordered and contain the base quantity.
function q4QuantityInvalid(i,key){const v=state.values[i]||{};if(key==='monthly'){const evaluation=monthlyEditor?.evaluate(),row=evaluation?.normalized?.sites?.find(x=>x.locationId===monthlyLocation(i));return !row||!['VALID'].includes(row.status)||evaluation.status==='INVALID'||evaluation.status==='POLICY_UNRESOLVED';}if(!isValid(v[key]))return true;
 if(siteMode(i)==='ONCE'||!state.variable[i])return false;
 if(key==='min'&&isValid(v.max)&&+v.min>+v.max)return true;
 return key==='base'&&((isValid(v.min)&&+v.base<+v.min)||(isValid(v.max)&&+v.base>+v.max));
}
function syncRegularQuantityErrors(i){if(!state.attempted)return;const root=$(`site-${i}`)||$('single-site');root?.querySelectorAll('[data-qty]').forEach(el=>{const [si,key]=el.dataset.qty.split(':');if(+si!==i)return;const invalid=q4QuantityInvalid(i,key);el.setAttribute('aria-invalid',String(invalid));const group=el.closest('.qa-field');if(group)group.dataset.error=String(invalid);});}

})();
window.__orderReviewBoot();
