import {createMonthlyAllocationDraft,monthlyAllocationDisplay,monthlyQuantityInputText,allocationUnitLabel} from './allocation-ui.mjs';
import {validMonthlyQuantity,monthlyQuantityText,quantityLabel,exactDisplay} from './quantity-contract.mjs';
import {createCadence,startDateRange,inspectStartDate,syncMonthlyPreferredDate,holidayPolicyFromSelection} from './cadence-contract.mjs';
import {bindNumericInputs,formatNumericText} from './numeric-input.mjs';
import {frequencyPresentation,orderQuantityInput,repeatVisitPlan,nominalQuantity,sumNominalByReference,restoredDeliverySettings} from './q4-planning.mjs';
import {dateFieldMarkup,bindDateField} from './date-field.mjs';
import {nearestMonthly,validateApprovedStart} from './order-date.mjs';
import {dateModeOptions,inspectOneTimeDate,oneTimeDateValue,oneTimeDateParts} from './q4-date.mjs';
import {APPROVED_PERIODS,cadenceForPeriod,weeklyEstimate,availableCadences,quantityIssue,fixedFrequencyPresentation,editQuantityCadence,selectCadence,weekdayState} from './approved-schedule.mjs';
import {fromRatio,toJSON,compare} from '../src/engine/calculation/exact.mjs';
export function createQ4Review({bridge}){
// Preserved UX shell and interactions; monthly quantities use the shared engine.
// The regular-state bridge remains the sole persistence owner.
const iconChevron=window.OrderAccordionView.chevron;
const $=id=>document.getElementById(id);
const escapeHTML=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const names=[];
const mName={FLEX:'소진 시 주문',FIXED:'정기 주문',ONCE:'1회 주문'};
const state={};
let monthlyEditor=null;
const monthlyLocation=i=>regularContext?.allocations[i]?.locationId;
const monthlyRow=i=>monthlyEditor?.rows.find(row=>row.locationId===monthlyLocation(i));
const monthlyPending=i=>siteMode(i)!=='ONCE'&&monthlyRow(i)?.source==='derived';
function monthlyFeedback(i){const data=monthlyAllocationDisplay(monthlyEditor?.evaluate(),monthlyLocation(i)),suffix=unit();if(!data.row)return '<span>—</span>';const label=(name,value)=>`<span><strong>${name} :</strong> <span>${escapeHTML(formatNumericText(value,{grouped:true}))}${value==='—'?'':suffix}</span></span>`;return label('남은 수량',data.remaining)+'<span aria-hidden="true"> / </span>'+label('전체 수량',data.total==='—'?'—':'총'+formatNumericText(data.total,{grouped:true}));}
function syncMonthlyModes(){if(!monthlyEditor)return;for(let i=0;i<state.count;i++){const row=monthlyRow(i),mode=siteMode(i);if(row&&row.mode!==mode)monthlyEditor.setMode(monthlyLocation(i),mode);}}
function syncMonthlyFields(){if(!monthlyEditor)return;syncMonthlyModes();for(let i=0;i<state.count;i++){const row=monthlyRow(i);if(!row)continue;state.values[i].monthly=row.quantity.raw;const input=document.querySelector(`[data-qty="${i}:monthly"]`);if(input&&input!==document.activeElement)q4Numeric.replace(input,row.quantity.raw,{notify:false,history:'replace'});const group=input?.closest('.qa-field');if(group){group.dataset.quantitySource=row.source;const label=group.querySelector('.qa-unit');if(label)label.textContent=unit();const note=group.querySelector('[data-monthly-feedback]');if(note)note.innerHTML=monthlyFeedback(i);}refreshStatus(i);syncRegularQuantityErrors(i);}q4Numeric.refresh();refreshQuantitySupport();}
const monthEditing=new Set(),numericComposing=new Set(),preferredEditedFields=new WeakSet(),quantityEditedFields=new WeakSet();
// MSG0425 site-owned UI draft state: individual-mode edits never alias global data.
const newSiteContacts=()=>({phone:true,sms:true,kakao:true,email:false});
const newSiteHoliday=()=>({days:[],none:false,irregular:false,conflict:'협의 후 조정',weekend:'협의 후 조정',holiday:'협의 후 조정',subholiday:'협의 후 조정',request:''});
// MSG0427 addendum: private per-site FIXED delivery draft; never aliased or copied.
const newSiteRepeat=()=>({period:'협의',frequency:'협의',date:'',dateMode:'custom',weeklyCheck:false,weekdays:{},weekOpen:0,semantics:'per-week-v1',legacyReviewRequired:false});
const siteRepeatComplete=i=>OrderRepeatContract.inspect(state.siteRepeat?.[i]||{}).valid;
const isIndividual=()=>state.count>1 && state.mode==='MIXED';
const siteHolidayComplete=i=>{const h=state.siteHolidays?.[i];return !!h && (h.days.length>0||h.none||h.irregular) && (siteMode(i)==='FLEX'||!['','선택 안 함'].includes(h.conflict));};
const siteContactComplete=i=>Object.values(state.siteContacts?.[i]||{}).some(Boolean);
const appliesSiteHoliday=i=>['FLEX','FIXED'].includes(siteMode(i));
const unit=()=>state.pack==='30'?'판':'팩';
const siteMode=i=>state.mode==='MIXED'?state.siteModes[i]:state.mode;
const requiredStar='<span class="ui-required qa-required-star" aria-hidden="true">*</span>';
const holidayComplete=()=>((state.holidayNone||state.holidayIrregular||state.holidayDays.length>0)&&(state.mode==='FLEX'||!['','선택 안 함'].includes(state.holiday.conflict)));
const isValid=v=>/^\d+$/.test(String(v??''))&&Number(v)>=1&&String(v).length<=12;
function fields(i){const m=siteMode(i);return m==='ONCE'?['once']:['monthly','base',...(state.variable[i]?['min','max']:[])];}
function status(i,acceptProposal=false){const v=state.values[i]||{},keys=fields(i),present=keys.filter(k=>String(v[k]??'')!=='').length,allocation=regularContext.allocations[i];
 const issues=bridge.inspect(serializedAllocations(true)),blocked=issues.some(issue=>issue.stage==='q4'&&issue.lineId===regularContext.line.id&&(!issue.siteId||issue.siteId===allocation.locationId));
 const all=!numericComposing.size&&![...approvedDateBindings.values()].some(binding=>binding.inspect().valid===false)&&!blocked;
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
function quantity(i,key,label,placeholder){placeholder='0';const v=state.values[i]?.[key]??'',invalid=quantityFeedbackVisible(i,key)&&q4QuantityInvalid(i,key),id=`q0394-${i}-${key}`,monthly=key==='monthly',row=monthly?monthlyRow(i):null,inline=['min','max'].includes(key),labelHTML=`<label class="${inline?'qa-number-label':'qa-site-label'} ui-field-title ${inline?'ui-field-title--dependent':''}" for="${id}">${label}${inline?'':` ${requiredStar}`}</label>`;
 return `<div class="qa-site-field qa-field ui-input-field ui-egg-field" data-field-size="quantity" data-field-group="${i}-${key}" data-error="${invalid}" ${monthly?`data-quantity-source="${row?.source||'manual'}"`:''}>${inline?'':labelHTML}<div class="qa-number input-unit ui-egg-number">${inline?labelHTML:''}<input id="${id}" data-qty="${i}:${key}" type="text" inputmode="numeric" value="${escapeHTML(formatNumericText(monthly?monthlyQuantityInputText(row?.quantity):v,{grouped:true}))}" placeholder="${escapeHTML(placeholder)}" aria-invalid="${invalid}" ${monthly?`aria-describedby="${id}-allocation"`:''}/><span class="qa-unit">${unit()}</span></div>${monthly?`<p class="qa-quantity-support ui-field-support" id="${id}-allocation" data-monthly-feedback="${i}" aria-live="polite">${monthlyFeedback(i)}</p>`:''}<p class="qa-inline-error qa-error" data-quantity-error="${i}:${key}" ${invalid?'':'hidden'}>${invalid?escapeHTML(q4QuantityMessage(i,key)):''}</p></div>`;}

function choice(label,choices,val,key){return `<section class="qa-form-section" data-section="${key}"><div class="qa-section-title ui-field-title ui-field-title--top">${label} <span class="ui-required" aria-hidden="true">*</span></div><div class="qa-mode-choices ${choices.length===2?'qa-two':''}" role="group" aria-label="${label}">${choices.map(([v,t])=>`<button type="button" class="ui-choice" data-choice="${key}" data-value="${v}" aria-pressed="${val===v}">${t}</button>`).join('')}</div></section>`;}
function comboSelected(id,chosen){if(id==='date'||/^site-repeat-\d+-date$/.test(id))return OrderRepeatContract.monthValue(chosen).valid;if(id==='freq'||/^site-repeat-\d+-freq$/.test(id))return /^(?:약\s*)?[1-7]회$/.test(String(chosen))||chosen==='협의';return !['','선택 안 함','일괄 설정','사업장 일괄 설정','undefined','null'].includes(String(chosen??''));}
function comboInvalid(id,chosen){return state.attempted && (id==='period'||id==='freq'||id==='date'||/^site-repeat-\d+-(period|freq|date)$/.test(id))&&!comboSelected(id,chosen);}
function rMonthMessage(value){return String(value??'').trim()===''?'희망 납품일을 선택해 주세요.':'1~31의 정수 또는 말일을 입력해 주세요.';}
function monthDateInputValue(value){return value==='말일'?'말일':String(value??'').replace(/일$/,'');}
function dropdown(id,label,options,chosen,{disabled=[]}={}){
 const frequency=id==='freq'||/^site-repeat-\d+-freq$/.test(id),editable=id==='date'||/^site-repeat-\d+-date$/.test(id),visibleLabel=label.replace(/\s*\*$/,''),star=label.trim().endsWith('*')?` ${requiredStar}`:'',bad=comboInvalid(id,chosen),selected=comboSelected(id,chosen);
 if(!editable&&selected&&!options.includes(chosen)&&!/(^|-)period$/.test(id))options=[chosen,...options];
 const menu=`<div class="qa-combo-menu" id="combo-${id}-menu" role="listbox" hidden><div class="qa-combo-scroll">${options.map(s=>`<button type="button" role="option" data-combo-choice="${id}" data-value="${escapeHTML(s)}" ${disabled.includes(s)?'disabled':''} aria-selected="${chosen===s||(editable&&s==='직접 입력'&&!options.includes(chosen))}">${escapeHTML(s)}</button>`).join('')}</div></div>`;
 const committed=selected&&!monthEditing.has(id);
 const inputValue=editable?monthDateInputValue(chosen):'';
 const control=editable?`<div class="qa-combo-trigger qa-combo-editable" data-selected="${committed}" data-error="${bad}" data-variant="editable"><span class="qa-month-value"><input type="text" id="month-value-${id}" data-month-date="${id}" inputmode="numeric" autocomplete="off" value="${escapeHTML(chosen==='말일'?'말일':inputValue)}" placeholder="직접 입력" ${chosen==='말일'?'readonly':''} data-month-previous="${escapeHTML(chosen==='말일'?'말일':inputValue)}" size="${Math.max(1,inputValue.length)}" style="--ui-month-width:${chosen==='말일'?'2em':Math.max(1,inputValue.length)+'ch'}" aria-label="납품일 직접 입력" aria-invalid="${bad}"/><span class="qa-month-suffix" ${!committed||chosen==='말일'?'hidden':''} aria-hidden="true">일</span></span><button type="button" data-combo="${id}" aria-label="납품일 선택 목록" aria-haspopup="listbox" aria-controls="combo-${id}-menu" aria-expanded="${state.drop===id}"><span class="t-acc-chevron" aria-hidden="true">${iconChevron}</span></button></div>`:`<button type="button" class="qa-combo-trigger" data-combo="${id}" data-selected="${selected}" data-error="${bad}" data-variant="${id==='bulk'?'selection-dropdown':'standard'}" aria-pressed="${id==='bulk'?selected:'false'}" aria-invalid="${bad}" ${frequency?`aria-required="true" aria-describedby="combo-${id}-error"`:''} aria-haspopup="listbox" aria-controls="combo-${id}-menu" aria-expanded="${state.drop===id}"><span>${escapeHTML(chosen)}</span><span class="t-acc-chevron" aria-hidden="true">${iconChevron}</span></button>`;
 return `<div class="qa-field ui-input-field" data-field-size="short"><${editable?'label':'span'} ${editable?`for="month-value-${id}"`:''} class="qa-label ui-field-title">${visibleLabel}${star}</${editable?'label':'span'}><div class="qa-combo">${control}${menu}</div>${frequency?`<p class="ui-field-error" id="combo-${id}-error" ${bad?'':'hidden'}>횟수를 선택해 주세요.</p>`:''}${editable?`<p class="ui-field-error" data-month-error="${id}" ${bad?'':'hidden'}>${rMonthMessage(chosen)}</p>`:''}</div>`;
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
 const r=repeatDraft(site),i=site??0,prefix=site===null?'':`site-repeat-${site}-`,v=OrderRepeatContract.inspect(r),legacy=!r.cadence&&!['매주','매월','협의'].includes(r.period),interval=r.cadence?.kind==='INTERVAL_DAYS',approved=r.cadence?.version==='3.0.0';
 const owners=site===null?Array.from({length:state.count},(_,index)=>index):[i],allowed=APPROVED_PERIODS.filter(period=>owners.every(index=>availableCadences(state.values[index]?.monthly,state.values[index]?.base,repeatForSite(index),state.asOfLocalDate).includes(period)));
 const periodic=dropdown(prefix+'period','주문 주기 *',APPROVED_PERIODS,r.period,{disabled:APPROVED_PERIODS.filter(p=>!allowed.includes(p))});
 const computed=weeklyEstimate(state.values[i]?.monthly,state.values[i]?.base,state.asOfLocalDate).text;
 const freq=r.period==='협의'?'':r.period==='매월'?dropdown(prefix+'date','희망 납품일 *',['직접 입력','1일','5일','10일','15일','20일','25일','30일','31일','말일'],r.date):interval?`<div class="qa-field" data-field-size="short"><span class="qa-label ui-field-title" id="${prefix}fixed-frequency-label">주기 내 예상 납품횟수</span><output id="${prefix}fixed-frequency" class="qa-computed-output" aria-labelledby="${prefix}fixed-frequency-label">1회</output></div>`:dropdown(prefix+'freq','주기 내 예상 납품횟수 *',approved?['협의',computed]:['1회','2회','3회','4회','5회','6회','7회'],r.frequency);
 const weekday=r.period==='매주'||legacy,grid=weekday&&r.weeklyCheck&&v.weeks>0?`<div class="qa-week-grid">${Array.from({length:v.weeks},(_,j)=>v.weeks===1?weekContent(j+1,site):acc(repeatId(site,j+1),`${j+1}주차`,weekContent(j+1,site),r.weekOpen===j+1,weekStatus(j+1,site),'qa-site-child')).join('')}</div>`:'';
 const toggleId=site===null?'qa-week-toggle':`qa-site-week-toggle-${site}`,toggleAttr=site===null?'data-week-toggle':`data-site-week-toggle="${site}"`;
 return `<section class="qa-form-section qa-repeat-section" data-section="repeat" ${site===null?'':`data-site-repeat="${site}"`}><div class="qa-inline-pair ui-field-pair qa-repeat-pair">${periodic}${freq}</div>${weekday?`<div class="qa-weekday-owner" data-weekday-error="false"><div class="qa-check-wrap">${checkbox(toggleId,'희망 요일 지정',r.weeklyCheck,toggleAttr)}</div>${grid}</div>`:''}${r.period!=='협의'?dateSection(i):''}</section>`;
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
 const epoch=++q4ValidationEpoch,motions=[],ancestors=[];
 // Shared recurrence can live inside the first site's collapsed body. Open the
 // actual owning disclosures before measuring or focusing its invalid field.
 for(let owner=document.querySelector(issue.target)?.parentElement;owner&&owner!==$('q4-regular-fields');owner=owner.parentElement){if(owner.matches('[data-ui-subaccordion]'))ancestors.unshift(owner);}
 for(const owner of ancestors){const id=owner.id;if(id==='business-parent')state.parentOpen=true;else if(/^site-\d+$/.test(id))state.siteOpen=Number(id.slice(5));else if(/^week-\d+$/.test(id))state.weekOpen=Number(id.slice(5));motions.push(setOpen(id,true));}
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
 const form=e.querySelector(':scope > .ui-accordion__body')||e;
 const days=form?.querySelector('.qa-holiday-days');const dayBad=st==='error'&&!q4HasHolidayDays(i);
 if(days){days.dataset.error=String(dayBad);days.setAttribute('aria-invalid',String(dayBad));days.setAttribute('aria-describedby',`q4-site-holiday-${i}-day-error`);let msg=form.querySelector(`#q4-site-holiday-${i}-day-error`);if(!msg){msg=document.createElement('p');msg.id=`q4-site-holiday-${i}-day-error`;msg.className='qa-error qa-inline-error ui-feedback-sr';days.after(msg);}msg.textContent=dayBad?'매장 정기 휴무일을 선택해주세요.':'';msg.hidden=!dayBad;}
 const conflict=form?.querySelector(`[data-combo="site-holiday-${i}-conflict"]`),badConflict=st==='error'&&!comboSelected('conflict',state.siteHolidays[i].conflict);
 if(conflict){conflict.setAttribute('aria-invalid',String(badConflict));conflict.dataset.error=String(badConflict);conflict.setAttribute('aria-describedby',`q4-site-holiday-${i}-conflict-error`);let msg=form.querySelector(`#q4-site-holiday-${i}-conflict-error`);if(!msg){msg=document.createElement('p');msg.id=`q4-site-holiday-${i}-conflict-error`;msg.className='qa-error qa-inline-error ui-feedback-sr';conflict.closest('.qa-combo')?.after(msg);}if(msg){msg.textContent=badConflict?'휴무일 납품 충돌 시 대응을 선택해주세요.':'';msg.hidden=!badConflict;}}
 refreshStatus(i);}
function q4SiteValidationIssue(i,holidayOnly=false){const m=siteMode(i),h=state.siteHolidays[i];
 const holiday=()=>!isIndividual()||!appliesSiteHoliday(i)?null:!q4HasHolidayDays(i)?{kind:'holiday-days',target:'.qa-holiday-days',child:m==='FIXED'}:m==='FIXED'&&!comboSelected('conflict',h.conflict)?{kind:'holiday-conflict',target:`[data-combo="site-holiday-${i}-conflict"]`,child:true}:null;
 if(holidayOnly)return holiday();
 const amount=()=>{const key=fields(i).find(k=>q4QuantityInvalid(i,k));return key?{kind:'quantity',target:`[data-qty="${i}:${key}"]`}:null;};
 const repeat=()=>isIndividual()&&m==='FIXED'?repeatValidationIssue(i):null;
 const contact=()=>isIndividual()&&!siteContactComplete(i)?{kind:'contact',target:`#q4-contact-site-${i}`}:null;
 const date=()=>dateIssue(i).valid?null:{kind:'desired-date',target:approvedDateActive(i)?`#${CSS.escape(approvedDateId(i))} [data-order-date-part=day]`:`[data-date-site="${i}"][data-date-part="day"]`};
 const order=m==='FLEX'?[amount,contact,holiday]:m==='FIXED'?[amount,repeat,date,contact,holiday]:[amount,date,contact];
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
const COPY_FIELDS=[['contact','연락 수단'],['mode','주문 방식'],['monthly','월 주문 수량'],['base','회당 예상 주문 수량'],['holiday','휴무일 · 주말 · 공휴일 대응']];
const copyDefaultFields=()=>Object.fromEntries(COPY_FIELDS.map(([k])=>[k,false]));
let copyHeightAnimation=null,copyOpenAnimation=null,copyClosing=false,copyReview=null,copyApplied=false,copyContext=null,copyPending=false,copyGeneration=0;
function copyFieldAvailable(k){const src=state.copySource;if(src===null||src===undefined)return false;const m=state.siteModes[src];return !(['monthly','base','holiday'].includes(k)&&m==='ONCE');}
function copyOptions(i){return `<div class="qa-copy-check-grid">${COPY_FIELDS.map(([key,rawLabel],n)=>{const label=key==='holiday'&&state.siteModes[i]==='FLEX'?'매장 정기 휴무일 · 추가 요청사항':rawLabel;return `<div class="qa-copy-check-cell ${n===4?'qa-copy-check-wide':''}">${checkbox(`qa-copy-field-${key}`,label,false,`data-copy-field="${key}" ${copyFieldAvailable(key)?'':'disabled'} aria-label="${label}${copyFieldAvailable(key)?'':' (해당 없음)'}"`,true)}</div>`;}).join('')}</div>`;}
function requestCopy(i){if(!isIndividual()||$('qa-copy-confirm'))return;closeQ4Dropdown();state.copySource=i;state.copyTargets=[];state.copyFields=copyDefaultFields();state.copyAttempted=false;copyClosing=false;copyReview=null;copyApplied=false;copyPending=false;copyGeneration++;copyContext=regularContext;
 const targets=Array.from({length:state.count},(_,n)=>n).filter(n=>n!==i).map(n=>checkbox(`qa-copy-target-${n}`,`<span class="qa-copy-target-text">${escapeHTML(names[n])}</span>`,false,`data-copy-target="${n}" aria-label="${escapeHTML(names[n])}"`,true)).join('');
 const host=window.OrderCopyDialog.create({title:names[i]+' 설정 복사',fields:copyOptions(i),targets,applyLabel:'적용'});host.dataset.copyStage='select';
 document.body.append(host);q4SeedCheckboxes(host);bindCopyDialogEvents(host);updateCopyValidation();
 window.OrderModalShell.bind(host,()=>disposeCopy(),{editable:true,isDirty:()=>!!state.copyTargets.length||Object.values(state.copyFields||{}).some(Boolean),onExitIntent:()=>{copyGeneration++;copyPending=false;host.querySelector('[data-copy-apply]').disabled=false;}});window.OrderModalShell.open(host,{variant:'copy',role:'editor',history:true,returnFocus:()=>document.querySelector(`[data-copy-from="${i}"]`),initialFocus:()=>host.querySelector('[data-copy-cancel]')});
}
function copyIncompatibleReason(i){const f=state.copyFields,src=state.copySource;if(src===null||!state.copyTargets.includes(i))return '';
 const srcMode=state.siteModes[src],effective=f.mode?srcMode:state.siteModes[i];
 if((f.monthly||f.base)&&effective==='ONCE')return `${names[i]}: 1회 주문에는 월 주문 수량·회당 수량을 복제할 수 없습니다.`;
 if(f.holiday&&effective==='ONCE')return `${names[i]}: 1회 주문에는 휴무 대응을 복제할 수 없습니다.`;
 return '';}
function copyEligibility(){const keys=COPY_FIELDS.map(x=>x[0]).filter(k=>state.copyFields?.[k]);const targetCount=state.copyTargets?.length||0, errors=state.copyTargets.map(copyIncompatibleReason).filter(Boolean);
 if(keys.some(k=>!copyFieldAvailable(k)))errors.push('원본에 없는 값을 선택했습니다.');
 if(keys.includes('monthly')&&monthlyEditor?.evaluate().normalized?.sites?.find(row=>row.locationId===monthlyLocation(state.copySource))?.status!=='VALID')errors.push('월 주문 수량을 입력해 주세요.');
 if(keys.includes('base')&&!isValid(state.values[state.copySource]?.base))errors.push('회당 예상 주문 수량을 입력해 주세요.');
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
function closeCopy(restore=true){if(restore)return window.OrderModalShell.requestClose($('qa-copy-confirm'),'cancel');return disposeCopy(false);}
function disposeCopy(restore=true){
 const host=$('qa-copy-confirm');if(!host)return;
 const from=state.copySource,context=copyContext;copyClosing=true;copyReview=null;const generation=++copyGeneration;copyPending=false;
 if(copyOpenAnimation){copyOpenAnimation.cancel();copyOpenAnimation=null;}
 if(copyHeightAnimation){copyHeightAnimation.cancel();copyHeightAnimation=null;}
 const finish=()=>{host.remove();if(generation!==copyGeneration||copyContext!==context)return;state.copySource=null;state.copyTargets=[];state.copyFields=null;state.copyAttempted=false;copyContext=null;
  if(restore&&regularContext===context&&!state.dialogClosed&&Number.isInteger(from))document.querySelector(`[data-copy-from="${from}"]`)?.focus({preventScroll:true});};
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
 host.addEventListener('change',e=>{const el=e.target;if(copyClosing||host.dataset.copyStage==='review'||!el.matches('input[type=checkbox]'))return;
  q4AnimateCheckedTransition(el);
  if(el.dataset.copyField!==undefined){state.copyFields[el.dataset.copyField]=el.checked;updateCopyValidation();requestAnimationFrame(resizeCopyCardAfterToggle);}
  else if(el.dataset.copyTarget!==undefined){const n=Number(el.dataset.copyTarget);if(el.checked){if(!state.copyTargets.includes(n))state.copyTargets.push(n);}else state.copyTargets=state.copyTargets.filter(x=>x!==n);
   updateCopyValidation();requestAnimationFrame(resizeCopyCardAfterToggle);}
 });
 host.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.target.matches('button,input[type=checkbox]')){
   e.preventDefault();if(copyEligibility().valid)applyCopy();else validateCopyAttempt();}});
}
function copyDraftFingerprint(){return JSON.stringify({epoch:commitEpoch,mode:state.mode,count:state.count,asOf:state.asOfLocalDate,ids:regularContext?.allocations.map(a=>[a.id,a.locationId,a.lineId]),source:state.copySource,targets:state.copyTargets,fields:state.copyFields,values:state.values,modes:state.siteModes,contacts:state.siteContacts,holidays:state.siteHolidays,repeats:state.siteRepeat,rows:monthlyEditor?.rows});}
function copyHolidayValue(value,mode){const h=value||{},days=h.none?'없음':h.irregular?'비정기':(h.days||[]).join(' · '),parts=[days];if(mode==='FIXED')parts.push(...['conflict','weekend','holiday','subholiday'].map(k=>h[k]||''));if(h.request)parts.push(h.request);return parts.filter(Boolean).join(' / ');}
function copyTargetHoliday(from,dest){const source=state.siteHolidays[from],target=state.siteHolidays[dest],mode=state.copyFields.mode?state.siteModes[from]:state.siteModes[dest];return state.siteModes[from]==='FLEX'||mode==='FLEX'?{...target,days:[...source.days],none:source.none,irregular:source.irregular,request:source.request}:{...source,days:[...source.days]};}
function plannedCopyRepeat(from,dest,f,monthly=state.values[dest].monthly){if(!(f.monthly||f.base)||(f.mode?state.siteModes[from]:state.siteModes[dest])!=='FIXED')return null;const quantity=f.base?state.values[from].base:state.values[dest].base;return editQuantityCadence({repeat:OrderRepeatContract.snapshot(state.siteRepeat[dest]),monthly:f.monthly?state.values[from].monthly:monthly,quantity,field:f.base?'base':'monthly',value:f.base?quantity:state.values[from].monthly,asOfLocalDate:state.asOfLocalDate,clampDirect:false}).repeat;}
function copyRepeatDate(r){return r.period==='협의'?'':r.period==='매월'?nearestMonthly(r.date==='말일'?'last':Number(String(r.date||'').replace(/일$/,'')),new Date())||'':r.cadence?.preferredDate||'';}
function copyReviewPatches(){const from=state.copySource,f=state.copyFields,number=value=>String(value??'')?formatNumericText(value,{grouped:true})+unit():'',contact=value=>[['phone','전화'],['sms','문자'],['kakao','카카오톡'],['email','이메일']].filter(([key])=>value?.[key]).map(([,label])=>label).join(' · ');
 return state.copyTargets.map(dest=>{const beforeMode=state.siteModes[dest],afterMode=f.mode?state.siteModes[from]:beforeMode,changes=[],add=(key,label,before,after)=>{changes.push({key,label,before,after});};
  if(f.mode)add('mode','주문 방식',mName[beforeMode],mName[afterMode]);
  if(f.monthly)add('monthly','월 주문 수량',number(state.values[dest].monthly),number(state.values[from].monthly));
  if(f.base)add('base','회당 예상 주문 수량',number(state.values[dest].base),number(state.values[from].base));
  const planned=plannedCopyRepeat(from,dest,f);if(planned){const previous=state.siteRepeat[dest];if(previous.period!==planned.period)add('period','주문 주기',previous.period,planned.period);if(previous.frequency!==planned.frequency)add('frequency','주기 내 예상 납품횟수',previous.frequency,planned.frequency);const beforeDate=copyRepeatDate(previous),afterDate=copyRepeatDate(planned);if(beforeDate!==afterDate)add('preferredDate','정기 주문 시작 예상일',beforeDate.replaceAll('-','.'),afterDate.replaceAll('-','.'));}
  if(f.contact)add('contact','연락 수단',contact(state.siteContacts[dest]),contact(state.siteContacts[from]));
  if(f.holiday)add('holiday',afterMode==='FLEX'?'매장 정기 휴무일 · 추가 요청사항':'휴무일 · 주말 · 공휴일 대응',copyHolidayValue(state.siteHolidays[dest],beforeMode),copyHolidayValue(copyTargetHoliday(from,dest),afterMode));
  return {id:regularContext.allocations[dest].id,name:names[dest],changes};});
}
function setCopyStage(review=null){const host=$('qa-copy-confirm');if(!host)return;copyReview=review;host.dataset.copyStage=review?'review':'select';const title=review?'주문 설정 변경 확인':names[state.copySource]+' 설정 복사';host.setAttribute('aria-label',title);host.querySelector('.qa-copy-title').textContent=title;
 window.OrderModalShell.resize(host,()=>{host.querySelector('.qa-copy-accordion-area').hidden=!!review;host.querySelector('.qa-copy-target-group').hidden=!!review;const preview=host.querySelector('[data-copy-preview]');preview.classList.toggle('ui-copy-review',!!review);preview.innerHTML=review?window.OrderCopyDialog.renderReview(review.patches,{prefix:'q4-settings-review'}):'';const apply=host.querySelector('[data-copy-apply]');apply.textContent=review?'확인':'적용';apply.disabled=review?false:!copyEligibility().valid;host.querySelector('.qa-copy-scroll').scrollTop=0;});
 if(review)host.querySelector('.ui-copy-review-heading')?.focus({preventScroll:true});else{updateCopyValidation();host.querySelector('[data-copy-cancel]')?.focus({preventScroll:true});}
}
async function applyCopy(){const host=$('qa-copy-confirm');if(!host||!host.open||copyClosing||copyApplied||copyPending||state.dialogClosed||copyContext!==regularContext)return;if(!isIndividual()||!copyEligibility().valid){if(copyReview)setCopyStage();validateCopyAttempt();return;}
 if(!copyReview){setCopyStage({fingerprint:copyDraftFingerprint(),patches:copyReviewPatches()});return;}
 // Review is read-only. Reject a changed parent generation, source, selection,
 // destination or monthly transaction before the single private application.
 if(copyReview.fingerprint!==copyDraftFingerprint()||JSON.stringify(copyReview.patches)!==JSON.stringify(copyReviewPatches())){setCopyStage();return;}
 const from=state.copySource,f={...state.copyFields},targets=[...state.copyTargets];if(targets.some(n=>copyIncompatibleReason(n))){setCopyStage();validateCopyAttempt();return;}
 const generation=copyGeneration,review=copyReview,context=regularContext;copyPending=true;host.querySelector('[data-copy-apply]').disabled=true;
 let current=false;try{current=await bridge.isCurrent();}catch{}
 if(generation!==copyGeneration||context!==regularContext||copyClosing||state.dialogClosed||!host.open||host!==$('qa-copy-confirm'))return;copyPending=false;
 if(!current||copyReview!==review||review.fingerprint!==copyDraftFingerprint()||JSON.stringify(review.patches)!==JSON.stringify(copyReviewPatches())){setCopyStage();if(!current){const feedback=host.querySelector('#qa-copy-feedback');feedback.textContent='변경을 적용하지 못했습니다. 입력을 확인한 후 다시 시도해 주세요.';feedback.classList.remove('ui-feedback-sr');}return;}
 copyApplied=true;applyCopyDraft(from,f,targets);closeCopy(false);render();travel(from);
}
function applyCopyDraft(from,f,targets){const srcMode=state.siteModes[from];
 for(const dest of targets){if(f.mode)state.siteModes[dest]=srcMode;
 if(f.contact)state.siteContacts[dest]={...state.siteContacts[from]};
 if(f.monthly)state.values[dest].monthly=state.values[from].monthly;
 if(f.base){state.values[dest].base=state.values[from].base;state.qtySources[dest]='user';state.deliveryPlans[dest]=null;}
 if(f.holiday){const source=state.siteHolidays[from],target=state.siteHolidays[dest];state.siteHolidays[dest]=srcMode==='FLEX'||state.siteModes[dest]==='FLEX'?{...target,days:[...source.days],none:source.none,irregular:source.irregular,request:source.request}:{...source,days:[...source.days]};}
 }if(f.monthly)monthlyEditor?.clone(monthlyLocation(from),targets.map(monthlyLocation));syncMonthlyFields();
 // Copy confirmation is one private transaction. Reclassify the actually
 // copied quantities without clamping a destination's explicit manual Q.
 if(f.monthly||f.base)for(const dest of targets){if(siteMode(dest)!=='FIXED')continue;const r=state.siteRepeat[dest],next=plannedCopyRepeat(from,dest,f,state.values[dest].monthly);Object.assign(r,next);if(!next.cadenceSelection)delete r.cadenceSelection;if(!next.monthlyMemory)delete r.monthlyMemory;state.quantityAdjusted[dest]=false;if(r.period==='매월')syncPreferredRule(dest);state.deliveryPlans[dest]=null;}
 state.siteOpen=from;}
function animateCopyCardHeight(){/* The disclosure body owns height; compact flex panel follows it naturally. No second animation on the same size change. */}
function resizeCopyCardAfterToggle(){/* Error/target content changes use natural height within the common capped, single-scroll shell. */}
function activeRepeat(i){return isIndividual()?state.siteRepeat[i]:state;}
function repeatForSite(i){const repeat=OrderRepeatContract.snapshot(activeRepeat(i));if(state.count>1&&!isIndividual()&&state.commonMonthlyMemories){const memory=state.commonMonthlyMemories[i];if(memory)repeat.monthlyMemory=clone(memory);else delete repeat.monthlyMemory;}return repeat;}
function supportInput(i){return {asOfLocalDate:state.asOfLocalDate,monthlyPlan:numericComposing.size||q4Numeric.inspect?.().valid===false?'':monthlyRow(i)?.quantity.raw||'',repeat:repeatForSite(i),reference:state.planningReferences?.[i],count:state.nominalVisitCounts?.[i]||'',quantity:state.values[i]?.base||'',variable:!!state.variable[i],min:state.values[i]?.min||'',max:state.values[i]?.max||''};}
function frequencyMarkup(i){if(siteMode(i)==='ONCE')return '';const input=supportInput(i),fallback=fixedFrequencyPresentation({monthly:input.monthlyPlan,quantity:input.quantity,variable:input.variable,min:input.min,max:input.max,unit:unit()}),flex=siteMode(i)==='FLEX'?frequencyPresentation(input):null,result=siteMode(i)==='FIXED'?fallback:flex.valid?flex:fallback;return `<span data-frequency-value>${escapeHTML(result.text)}</span>${result.valid&&result.basisText?`<span class="qa-computed-basis" data-frequency-basis>${escapeHTML(result.basisText||'')}</span>`:''}`;}
function frequencyField(i){return `<div class="qa-field qa-frequency-field"><span class="qa-label ui-field-title" id="q4-frequency-label-${i}">월 예상 납품횟수</span><output id="q4-frequency-${i}" class="qa-computed-output" data-frequency-output="${i}" aria-labelledby="q4-frequency-label-${i}">${frequencyMarkup(i)}</output></div>`;}
function refreshQuantitySupport(){if(!regularContext||!state.values)return;for(let i=0;i<state.count;i++){const output=document.querySelector(`[data-frequency-output="${i}"]`);if(output)output.innerHTML=frequencyMarkup(i);}}

function siteBody(i){
 const mode=siteMode(i),individual=isIndividual(),wrap=(name,html,child=false)=>`<div class="${child?'qa-child-block':'qa-parent-block'}" data-site-block="${name}">${html}</div>`;
 const modeHTML=individual?`<div class="qa-site-field qa-site-mode"><div class="qa-site-label ui-field-title">주문 방식 ${requiredStar}</div><div class="qa-mode-choices qa-three" role="group" aria-label="사업장${i+1} 주문 방식">${Object.entries(mName).map(([v,t])=>`<button type="button" class="ui-choice" data-site-choice="${i}" data-value="${v}" aria-pressed="${mode===v}">${t}</button>`).join('')}</div></div>`:'';
 const variable=()=>`<div class="qa-var-row qa-check-wrap">${checkbox(`qa-variable-${i}`,'예상 주문 수량이 가변적일 경우 체크해주세요.',state.variable[i],`data-var="${i}"`,true)}</div>${state.variable[i]?`<div class="qa-var-range ui-field-pair">${quantity(i,'min','최소','13')}<span class="qa-range-tilde" aria-hidden="true">~</span>${quantity(i,'max','최대','17')}</div>`:''}`;
 const monthly=()=>wrap('monthly',quantity(i,'monthly','월 주문 수량','수량 입력'));const delivery=()=>wrap('base',`<div class="qa-inline-pair ui-field-pair qa-order-quantity-pair">${quantity(i,'base','회당 예상 주문 수량','수량 입력')}${frequencyField(i)}</div><output class="qa-adjusted-note" data-quantity-adjusted="${i}" ${state.quantityAdjusted?.[i]?'':'hidden'}>${state.quantityAdjusted?.[i]?'월 수량에 맞춤':''}</output>`+variable());
 const copy=()=>individual?`<button type="button" class="qa-site-copy-action ui-copy-action" data-copy-from="${i}">다른 사업장에 설정 복사${CODE1_UI.copyIcon}</button>`:'';
 const next=()=>CODE1_UI.button({label:i===state.count-1?'입력완료':'다음 사업장 입력',action:`data-next="${i}"`,filled:i===state.count-1});
 let rows=[];if(individual)rows.push(wrap('mode',modeHTML));
 // MSG0474: presentation order and tab order share the same keyed DOM sequence.
 if(mode==='FLEX'){
  rows.push(monthly(),delivery());if(individual)rows.push(wrap('contact',scopedContacts(i)),wrap('holiday',holidayContent(i,true)));else if(state.count===1)rows.push(wrap('contact',contactField()),wrap('holiday',holidayContent(null,true)));
 }else if(mode==='FIXED'){
  rows.push(monthly(),delivery());if(individual)rows.push(wrap('repeat',repeatSection(i)));else if(i===0)rows.push(wrap('repeat',repeatSection()));if(individual)rows.push(wrap('contact',scopedContacts(i)),wrap('holiday',scopedHoliday(i)));else if(state.count===1)rows.push(wrap('contact',contactField()));
 }else if(state.count>1){
  rows.push(wrap('once',quantity(i,'once','1회 주문량','최대 20')),wrap('date',dateSection(i)));
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
 const modes=Array.from({length:state.count},(_,i)=>siteMode(i)),title=modes.every(m=>m==='ONCE')?'사업장별 납품량':'사업장별 월 주문 수량';
 const parent=state.attempted&&statuses.some(x=>x==='error')?'error':statuses.every(x=>x==='complete')?'complete':'empty';
 return `<section class="qa-form-section" data-section="sites">${acc('business-parent',title,`<div class="qa-site-list">${statuses.map((st,i)=>acc(`site-${i}`,names[i],siteBody(i),state.siteOpen===i,st,'qa-site-child',true)).join('')}</div>`,state.parentOpen,parent,'qa-site-parent',true)}</section>`;
}
function holidayContent(i=null,flex=false){
 const local=i!==null;const h=local?state.siteHolidays[i]:{days:state.holidayDays,none:state.holidayNone,irregular:state.holidayIrregular,...state.holiday,request:state.request};
 const options=['선택 안 함','협의 후 조정','휴무 전일 희망','휴무 다음날 희망','공급사와 별도 협의'];
 const days=['월','화','수','목','금','토','일'];const suffix=local?'-site-'+i:'';
 const weekday=`<div class="qa-site-field qa-closure-field"><div class="qa-site-label ui-field-title">매장 정기 휴무일 ${requiredStar}</div><div class="qa-holiday-days" role="group" ${local?'tabindex="-1"':''} aria-label="${local?names[i]+' ':''}매장 정기 휴무일"><div class="qa-day-weekrow">${days.map(d=>`<button type="button" ${local?`data-site-closed-day="${i}:${d}"`:`data-closed-day="${d}"`} data-day="${d}" aria-pressed="${h.days.includes(d)}">${d}</button>`).join('')}</div><div class="qa-day-exceptions">${checkbox('qa-holiday-none'+suffix,'없음',h.none,local?`data-site-no-closure="${i}"`:'data-no-closure')}${checkbox('qa-holiday-irregular'+suffix,'일정하지 않음',h.irregular,local?`data-site-irregular-closure="${i}"`:'data-irregular-closure')}</div></div></div>`;
 const prefix=local?`site-holiday-${i}-`:'holiday-';const opt=(k,label)=>dropdown(prefix+k,label,options,h[k]);
 const rid=local?'qa-request-site-'+i:'qa-request';return `<div class="qa-site-form qa-holiday-fields" ${flex?`id="${local?'site-holiday-'+i:'qa-holiday-direct'}"`:""}>${weekday}${flex?'':opt('conflict','휴무일 납품 충돌 시 *')+opt('weekend','주말 대응')+opt('holiday','공휴일 대응')+opt('subholiday','대체공휴일 대응')}<div class="qa-field ui-input-field" data-field-size="wide"><label class="ui-field-title" for="${rid}">추가 요청사항</label><textarea id="${rid}" ${local?`data-site-request="${i}"`:''} maxlength="120" placeholder="">${escapeHTML(h.request)}</textarea><div class="qa-help-inline" id="${rid}-count">${h.request.length}/120</div></div>${flex?'':local?`<div class="qa-holiday-done-actions ui-action-group"><button type="button" class="subaction ui-continue-action" data-site-holiday-done="${i}">입력완료</button></div>`:`<div class="qa-holiday-done-actions ui-action-group"><button type="button" class="subaction ui-continue-action" data-global-holiday-done>입력완료</button></div>`}</div>`;
}
function holidayStatus(){return holidayComplete()?'complete':state.attempted?'error':'empty';}


const approvedDateBindings=new Map();
function approvedDateActive(i){return siteMode(i)==='ONCE'||siteMode(i)==='FIXED'&&APPROVED_PERIODS.includes(activeRepeat(i).period)&&activeRepeat(i).period!=='협의';}
function readOnlyDate(i){return siteMode(i)==='FIXED'&&activeRepeat(i).period==='매월';}
function approvedDateId(i){return `order-fixed-date-${dateDOMKey(i)}`;}
function approvedDateValue(i){if(siteMode(i)==='ONCE')return oneTimeDateValue(state.datesByAllocation[dateKey(i)]);const r=activeRepeat(i);return r.period==='매월'?nearestMonthly(r.date==='말일'?'last':Number(String(r.date||'').replace(/일$/,'')),new Date())||'':r.cadence?.preferredDate||'';}
function approvedDateIssue(i){if(siteMode(i)==='ONCE')return inspectOneTimeDate(state.datesByAllocation[dateKey(i)],new Date());const r=activeRepeat(i),cadence=cadenceForPeriod(r.period,r.cadence);if(r.period==='매월')cadence.dayRule=r.date==='말일'?'last':Number(String(r.date||'').replace(/일$/,''));return validateApprovedStart(cadence,new Date());}
function destroyApprovedDateFields(root=null){for(const [id,binding]of approvedDateBindings){if(!root||root.contains($(id))){binding.destroy();approvedDateBindings.delete(id);}}}
function bindApprovedDateFields(root=$('q4-regular-fields')){root?.querySelectorAll('[data-approved-date-site]').forEach(wrapper=>{const i=Number(wrapper.dataset.approvedDateSite),field=wrapper.querySelector('[data-order-date-field]');if(!field||approvedDateBindings.has(field.id))return;const once=siteMode(i)==='ONCE',key=once?dateKey(i):preferredKey(i);
 const binding=bindDateField(field,{...dateModeOptions(siteMode(i)),now:()=>new Date(),getDate:()=>approvedDateValue(i),...(once?{getParts:()=>state.datesByAllocation[dateKey(i)]}:{}),onChange:(value,result)=>{if(!regularContext||state.dialogClosed||!approvedDateActive(i)||readOnlyDate(i))return;if(once){state.datesByAllocation[key]=oneTimeDateParts(result.parts);state.dateTouched.add(key);}else{const current=activeRepeat(i);current.cadence=cadenceForPeriod(current.period,current.cadence);current.cadence.preferredDate=value||'';current.cadence.nominalAnchor=value||'';current.semantics='cadence-v3';state.preferredTouched.add(key);state.preferredDates[key]={...result.parts};}state.approvedDateParts[key]={...result.parts};refreshStatus(i);refreshResultsOnly();},error:state.attempted?approvedDateIssue(i).message:''});approvedDateBindings.set(field.id,binding);if(!readOnlyDate(i)&&state.approvedDateParts[key])binding.restoreParts(state.approvedDateParts[key]);
 });}
function approvedDateSection(i){const once=siteMode(i)==='ONCE',readOnly=readOnlyDate(i),options=dateModeOptions(siteMode(i));return `<div data-approved-date-site="${i}">${dateFieldMarkup({...options,label:readOnly?'정기 주문 시작 예상일':options.label,id:approvedDateId(i),value:approvedDateValue(i),...(once?{parts:state.datesByAllocation[dateKey(i)]}:{}),readOnly,required:options.required&&!readOnly,now:new Date(),error:state.attempted?approvedDateIssue(i).message:''})}</div>`;}
// MSG0465 shared desired-date field. Keys use stable line+allocation identity, never a row index.
const datePolicy=window.OrderDatePolicy;
const dateKey=i=>JSON.stringify([regularContext.line.id,regularContext.allocations[i].id]);
const dateDOMKey=i=>encodeURIComponent(regularContext.line.id)+'--'+encodeURIComponent(regularContext.allocations[i].id);
const dateID=(i,part)=>`qa-date-${part}-${dateDOMKey(i)}`;
// Shared and individual forms own separate unconfirmed date buffers.
const preferredKey=i=>isIndividual()?'site:'+dateKey(i):'common:'+regularContext.line.id;
function preferredDateActive(i){return siteMode(i)==='FIXED'&&(['INTERVAL_DAYS','MONTHLY'].includes(activeRepeat(i)?.cadence?.kind)||activeRepeat(i)?.period==='매월');}
function preferredParts(value){const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?{year:Number(m[1]),month:Number(m[2]),day:Number(m[3])}:datePolicy.blank();}
function dateData(i=state.calendarSite??0){return preferredDateActive(i)?state.preferredDates[preferredKey(i)]||preferredParts(activeRepeat(i).cadence?.preferredDate):state.datesByAllocation?.[dateKey(i)]||datePolicy.blank();}
function localDateISO(){const d=datePolicy.today();return `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;}
function dateOwnerIndex(i){return isIndividual()?i:0;}
function startDateReview(i){const key=preferredKey(i),original=regularContext.allocations[dateOwnerIndex(i)];return state.startDateReviews[key]||original.q4Review?.startDateReview||{version:'1.0.0',lifecycle:original.cadence?.preferredDate?'LEGACY':'NEW',asOfLocalDate:state.asOfLocalDate};}
function startDateOptions(i,{selection=false,completed=true,adjust=false,cadence=activeRepeat(i).cadence}={}){const h=isIndividual()?state.siteHolidays[i]:{days:state.holidayDays,none:state.holidayNone,irregular:state.holidayIrregular,...state.holiday},review=startDateReview(i),touched=state.preferredTouched.has(preferredKey(i));
 return {asOfLocalDate:state.asOfLocalDate,cadence,holidayPolicy:holidayPolicyFromSelection(h),...(regularContext.startDatePolicies?{policies:regularContext.startDatePolicies}:{}),...(regularContext.startDateScope?{scope:regularContext.startDateScope}:{}),lifecycle:selection||touched?'NEW':review.lifecycle,savedAnchor:regularContext.allocations[dateOwnerIndex(i)].cadence?.preferredDate||'',edited:selection||touched,completed,adjust,selectDayRule:selection};
}
function dateBounds(i=state.calendarSite??0){if(!preferredDateActive(i))return {minYear:2000,maxYear:2100,minMonth:1,maxMonth:12,yearLocked:false};const range=startDateRange({...startDateOptions(i),cadence:null}),min=preferredParts(range.min),max=preferredParts(range.max),asOf=preferredParts(state.asOfLocalDate);return {minYear:min.year||asOf.year,maxYear:max.year||asOf.year,minMonth:min.month||asOf.month,maxMonth:max.month||asOf.month,yearLocked:false,range};}
function dateInspection(i,value=dateData(i),{selection=false,completed=true,adjust=false}={}){if(!preferredDateActive(i))return datePolicy.validate(value);return inspectStartDate(value,startDateOptions(i,{selection,completed,adjust}));}
function recordStartDateResult(i,result,{explicit=false}={}){const key=preferredKey(i),r=activeRepeat(i);state.startDateResults[key]=result;if(!result.valid)return result;if(result.cadence)r.cadence=result.cadence;
 // An optional empty day clears the selected cadence date, not the year/month
 // the user is still composing in this private editor.
 if(result.empty){state.preferredDates[key]??=datePolicy.blank();}else{state.preferredDates[key]=preferredParts(result.value);if(!result.preserved){const versions=result.range?.versions||{};state.startDateReviews[key]={version:'1.0.0',lifecycle:'NEW',asOfLocalDate:state.asOfLocalDate,...(versions.holidayVersion?{holidayVersion:versions.holidayVersion}:{}),...(versions.policyVersion?{policyVersion:versions.policyVersion}:{})};}}
 if(r.cadence?.kind==='MONTHLY')r.date=r.cadence.dayRule==='last'?'말일':r.cadence.dayRule?r.cadence.dayRule+'일':'';
 return result;
}
function storePreferredDate(i,parts,{kind='date',completed=true,explicit=true}={}){const r=activeRepeat(i),key=preferredKey(i);state.preferredDates[key]={...parts};if(explicit)state.preferredTouched.add(key);if(!completed){const previous=state.startDateResults[key];state.startDateResults[key]={valid:false,code:'EDITING',message:previous?.message||'',stickyCode:previous?.stickyCode||previous?.code};return;}
 if(!r.cadence){r.cadence=createCadence(r.period);if(r.cadence.kind==='MONTHLY'&&OrderRepeatContract.monthValue(r.date).valid)r.cadence.dayRule=r.date==='말일'?'last':Number(String(r.date).replace(/일$/,''));}
 let value=parts;if(kind==='month'&&r.cadence.kind==='MONTHLY'&&parts.day!==''&&parts.year&&parts.month){const synced=syncMonthlyPreferredDate(r.cadence,{kind:'month',year:Number(parts.year),month:Number(parts.month)});if(synced.valid&&synced.value.preferredDate)value=preferredParts(synced.value.preferredDate);}
 const result=inspectStartDate(value,startDateOptions(i,{selection:explicit&&kind==='date',completed:true,adjust:true}));return recordStartDateResult(i,result,{explicit});
}
function syncPreferredRule(site=null){const r=repeatDraft(site),i=site??0,rule=OrderRepeatContract.monthValue(r.date);if(r.period!=='매월')return;r.cadence=cadenceForPeriod('매월',r.cadence);r.cadence.dayRule=rule.valid?(r.date==='말일'?'last':Number(String(r.date).replace(/일$/,''))):'';const value=approvedDateValue(i);r.cadence.preferredDate=value;r.cadence.nominalAnchor=value;r.semantics='cadence-v3';const field=approvedDateBindings.get(approvedDateId(i));if(field)field.sync(value);refreshStatus(i);}
function completePreferredDates(){for(const binding of approvedDateBindings.values())binding.commit();const visited=new Set();for(let i=0;i<state.count;i++){if(approvedDateActive(i)||!preferredDateActive(i)||visited.has(preferredKey(i)))continue;visited.add(preferredKey(i));const key=preferredKey(i),previous=state.startDateResults[key],result=storePreferredDate(i,dateData(i),{kind:'validate',completed:true,explicit:false});if(previous?.message&&result?.valid&&!result.message&&previous.valid)state.startDateResults[key]=previous;}}
function datePresentation(i){const result=dateInspection(i),preferred=preferredDateActive(i),last=preferred?state.startDateResults[preferredKey(i)]:null,touched=state.attempted||state.dateTouched.has(dateKey(i))||preferred&&state.preferredTouched.has(preferredKey(i)),editing=last?.code==='EDITING'&&!state.attempted,note=last?.message||(!editing&&touched&&!result.valid?result.message:''),code=editing?(last?.message?last.stickyCode:'EDITING'):last?.message?last.code:result.code;return {result,note,code,error:!editing&&!result.valid&&!!touched&&code!=='UNAVAILABLE'};}

function monthDayCount(y,m){return datePolicy.days(y,m);}
function dateValid(i=state.calendarSite??0){return dateInspection(i).valid;}
function dateSection(i){if(approvedDateActive(i))return approvedDateSection(i);const d=dateData(i),view=datePresentation(i),v=view.result,preferred=preferredDateActive(i),bounds=dateBounds(i),error=view.error,owner=escapeHTML(dateKey(i));
 return `<div class="qa-site-field qa-delivery-date ui-input-field" data-field-size="date" data-section="preferred-date" data-date-owner="${owner}"><label class="qa-site-label ui-field-title" for="${dateID(i,'day')}">${preferred?'정기 주문 시작 예상일':'납품일'}</label><div class="qa-date-anchor" data-date-error="${error}"><div class="qa-date-segments">${[['year','연도',bounds.minYear,bounds.maxYear],['month','월',1,12],['day','일',1,31]].map(([part,label,min,max])=>`<input id="${dateID(i,part)}" data-date-site="${i}" data-date-part="${part}" aria-label="${escapeHTML(names[i])} 납품 ${label}" aria-describedby="${dateID(i,'error')}" type="text" inputmode="numeric" min="${min}" max="${max}" ${part==='year'&&bounds.yearLocked?'readonly':''} ${part==='day'?'placeholder="__"':''} value="${escapeHTML(d[part])}" aria-invalid="${error}"/><span>${part==='year'?'년':part==='month'?'월':'일'}</span>`).join('')}</div><button type="button" class="qa-calendar-trigger" id="${dateID(i,'trigger')}" data-calendar-for="${i}" aria-label="${escapeHTML(names[i])} 납품 희망일 달력 열기" aria-haspopup="dialog" aria-controls="qa-date-popover" aria-expanded="false"><svg aria-hidden="true" viewBox="0 0 24 24" width="19" height="19"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 2v6 M17 2v6 M3 10h18" fill="none" stroke="currentColor" stroke-width="1.7"/></svg></button></div><p id="${dateID(i,'error')}" class="qa-date-error qa-inline-error" data-date-message="${view.code||''}" data-error="${error}" ${view.note?'':'hidden'}>${escapeHTML(view.note)}</p></div>`;
}
let calendarBoundaryTimer=null;
function calendarElement(){return $('qa-date-popover');}
function activeCalendarTrigger(){return state.calendarSite===null||state.calendarSite===undefined?null:$(dateID(state.calendarSite,'trigger'));}
function renderCalendar(focusDay=null){const el=calendarElement();if(!el||state.calendarSite===null)return;
 const {year:y,month:m}=state.calendarView,today=datePolicy.today(),d=dateData(),count=monthDayCount(y,m),offset=(new Date(Date.UTC(y,m-1,1)).getUTCDay()+6)%7;
 const enabled=Array.from({length:count},(_,j)=>j+1).filter(day=>dateInspection(state.calendarSite,{year:y,month:m,day},{selection:true}).valid);
 const selected=+d.year===y&&+d.month===m&&enabled.includes(+d.day)?+d.day:null,current=today.year===y&&today.month===m?today.day:null;
 const focus=enabled.includes(+focusDay)?+focusDay:selected||(enabled.includes(current)?current:enabled[0]);
 el.dataset.owner=dateKey(state.calendarSite);el.setAttribute('aria-label',names[state.calendarSite]+' 납품 희망일 달력');
 el.setAttribute('aria-labelledby','qa-calendar-title');el.setAttribute('aria-describedby','qa-calendar-help');el.setAttribute('aria-modal','false');
 const icon=path=>`<svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
 const heading=`<div class="qa-calendar-heading"><button type="button" class="ui-icon-button" data-calendar-nav="-1" aria-label="이전 달" ${y===dateBounds().minYear&&m<=dateBounds().minMonth?'disabled':''}>${icon('M12 5l-5 5 5 5')}</button><strong id="qa-calendar-title" aria-live="polite">${y}년 ${m}월</strong><button type="button" class="ui-icon-button" data-calendar-nav="1" aria-label="다음 달" ${y===dateBounds().maxYear&&m>=dateBounds().maxMonth?'disabled':''}>${icon('M8 5l5 5-5 5')}</button><button type="button" class="ui-icon-button" data-calendar-close aria-label="달력 닫기">${icon('M5 5l10 10M15 5L5 15')}</button></div>`;
 const covered=window.OrderHolidaySnapshot.get(y,m,1).covered;el.dataset.holidayCoverage=covered?'covered':'unknown';
 const cells=Array(offset).fill('<span aria-hidden="true"></span>').concat(Array.from({length:count},(_,j)=>{const day=j+1,past=!enabled.includes(day),isToday=today.year===y&&today.month===m&&today.day===day,holiday=window.OrderHolidaySnapshot.get(y,m,day).record,dow=new Date(Date.UTC(y,m-1,day)).getUTCDay(),kind=holiday?(holiday.type==='substitute'?'substitute':'holiday'):dow===0?'sunday':dow===6?'saturday':'weekday';
  return `<button type="button" data-calendar-day="${day}" data-day-kind="${kind}" ${holiday?`data-holiday-name="${escapeHTML(holiday.name)}" title="${escapeHTML(holiday.name)}"`:''} aria-label="${y}년 ${m}월 ${day}일${holiday?' '+escapeHTML(holiday.name):''}${past?' 선택 불가':''}" aria-pressed="${selected===day}" ${isToday?'aria-current="date"':''} ${past?'disabled aria-disabled="true"':''} tabindex="${focus===day?0:-1}">${day}</button>`;}));
 el.innerHTML=heading+`<div class="qa-calendar-weeknames" aria-hidden="true">${['월','화','수','목','금','토','일'].map((n,i)=>`<span ${i===5?'data-weekend="saturday"':i===6?'data-weekend="sunday"':''}>${n}</span>`).join('')}</div><div class="qa-calendar-grid" role="group" aria-label="날짜 선택">${cells.join('')}</div><p class="visually-hidden" id="qa-calendar-help">방향키로 날짜 이동, Page Up과 Page Down으로 월 이동, Enter로 선택, Escape로 닫기</p><div class="qa-calendar-actions"><button type="button" data-calendar-close>닫기</button></div>`;
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
 const d=dateData(i),today=datePolicy.today(),bounds=dateBounds(i),show=datePolicy.calendarValid(d)&&d.year>=bounds.minYear&&d.year<=bounds.maxYear?d:preferredDateActive(i)&&bounds.range?.min?preferredParts(bounds.range.min):today;
 state.calendarView={year:+show.year,month:+show.month};p.hidden=false;
 document.querySelectorAll('[data-calendar-for]').forEach(b=>b.setAttribute('aria-expanded',String(+b.dataset.calendarFor===i)));
 renderCalendar();positionCalendar();(p.querySelector('[data-calendar-day][tabindex="0"]')||p.querySelector('[data-calendar-close]'))?.focus({preventScroll:true});scheduleCalendarBoundary();
}
function syncDateFields(i){if(i===undefined||!regularContext)return;const d=dateData(i),view=datePresentation(i),v=view.result,error=view.error;
 for(const part of ['year','month','day']){const e=$(dateID(i,part));if(e){if(document.activeElement!==e)q4Numeric.replace(e,String(d[part]??''),{notify:false,history:'replace'});e.setAttribute('aria-invalid',String(error));if(part==='year'){const bounds=dateBounds(i);e.min=String(bounds.minYear);e.max=String(bounds.maxYear);e.readOnly=!!bounds.yearLocked;}}}
 const anchor=$(dateID(i,'day'))?.closest('.qa-date-anchor');if(anchor)anchor.dataset.dateError=String(error);
 const note=$(dateID(i,'error'));if(note){note.textContent=view.note;note.hidden=!view.note;note.dataset.dateMessage=view.code||'';note.dataset.error=String(error);}
 const trigger=$(dateID(i,'trigger'));if(trigger)trigger.setAttribute('aria-label',names[i]+' 납품 희망일 달력 '+(v.valid&&!v.empty?`${d.year}년 ${d.month}월 ${d.day}일 변경`:'열기'));
 refreshStatus(i);
 schedulePopupBadges();
}
function dateIssue(i){if(approvedDateActive(i))return approvedDateIssue(i);return siteMode(i)==='ONCE'||preferredDateActive(i)?dateInspection(i):{valid:true,empty:true};}
function revealDateIssue(i){if(dateIssue(i).valid)return false;if(approvedDateActive(i)){state.attempted=true;const id=approvedDateId(i),binding=approvedDateBindings.get(id);binding?.setError(approvedDateIssue(i).message);const target=$(id)?.querySelector('[data-order-date-part=day]')||$(id);if(target)q4ScrollFocusInvalid(target);return true;}state.attempted=true;state.dateTouched.add(dateKey(i));
 const motions=[];if(state.count>1){if(!isIndividual()){state.parentOpen=true;motions.push(setOpen('business-parent',true));}state.siteOpen=i;motions.push(setOpen(`site-${i}`,true));}
 syncDateFields(i);const target=()=>$(dateID(i,'day'));
 navigateAfterAccordionLayout(motions,target);
 const field=target()?.closest('.qa-delivery-date');if(field&&!matchMedia('(prefers-reduced-motion:reduce)').matches){field.classList.remove('qa-shake');void field.offsetWidth;field.classList.add('qa-shake');field.addEventListener('animationend',()=>field.classList.remove('qa-shake'),{once:true});}return true;
}
function chooseCalendarDay(day){if(!state.calendarOpen)return;refreshCalendarBoundary();const {year,month}=state.calendarView,desired={year,month,day:Number(day)};
 if(!dateInspection(state.calendarSite,desired,{selection:true}).valid){renderCalendar();return;}
 const i=state.calendarSite;if(preferredDateActive(i))storePreferredDate(i,desired);else state.datesByAllocation[dateKey(i)]=desired;state.dateTouched.add(dateKey(i));toggleCalendar(false);syncDateFields(i);if(preferredDateActive(i)&&activeRepeat(i).cadence?.kind==='MONTHLY'){const id=isIndividual()?`site-repeat-${i}-date`:'date',input=document.querySelector(`[data-month-date="${id}"]`);if(input){input.value=monthDateInputValue(activeRepeat(i).date);input.readOnly=activeRepeat(i).date==='말일';monthFeedback(input,{commit:true});}}
}
function moveCalendarMonth(delta){const v=state.calendarView,d=new Date(Date.UTC(v.year,v.month-1+delta,1)),year=d.getUTCFullYear(),month=d.getUTCMonth()+1;const bounds=dateBounds(),monthKey=year*12+month;if(monthKey<bounds.minYear*12+bounds.minMonth||monthKey>bounds.maxYear*12+bounds.maxMonth)return;
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
 if(next.year<dateBounds().minYear||next.year>dateBounds().maxYear)return true;if(preferredDateActive(state.calendarSite)){const bounds=dateBounds();if(bounds.range?.min&&datePolicy.key(next)<datePolicy.key(preferredParts(bounds.range.min)))next=preferredParts(bounds.range.min);if(bounds.range?.max&&datePolicy.key(next)>datePolicy.key(preferredParts(bounds.range.max)))next=preferredParts(bounds.range.max);}else if(datePolicy.key(next)<datePolicy.key(datePolicy.today()))next=datePolicy.today();
 // Disabled weekends/holidays are navigation gaps, never focus destinations.
 const bounds=dateBounds(),minimum=bounds.range?.min?preferredParts(bounds.range.min):datePolicy.today(),maximum=bounds.range?.max?preferredParts(bounds.range.max):{year:bounds.maxYear,month:bounds.maxMonth,day:datePolicy.days(bounds.maxYear,bounds.maxMonth)},direction=k==='Home'?1:k==='End'?-1:delta!==undefined?Math.sign(delta):k==='PageUp'?-1:1;
 while(!dateInspection(state.calendarSite,next,{selection:true}).valid){const cursor=new Date(Date.UTC(next.year,next.month-1,next.day+direction));next={year:cursor.getUTCFullYear(),month:cursor.getUTCMonth()+1,day:cursor.getUTCDate()};if(datePolicy.key(next)<datePolicy.key(minimum)||datePolicy.key(next)>datePolicy.key(maximum))return true;}
 state.calendarView={year:next.year,month:next.month};renderCalendar(next.day);positionCalendar();(p.querySelector(`[data-calendar-day="${next.day}"]:not(:disabled)`)||p.querySelector('[data-calendar-day][tabindex="0"]:not(:disabled)')||p.querySelector('[data-calendar-close]'))?.focus({preventScroll:true});return true;
}

// MSG0456: one shared presentation with the exact existing fixture arithmetic.

function onceQuantityData(){const indexes=Array.from({length:state.count},(_,i)=>i).filter(i=>siteMode(i)==='ONCE');
 const complete=indexes.length>0&&indexes.every(i=>isValid(state.values[i]?.once));
 const total=complete?indexes.reduce((sum,i)=>sum+Number(state.values[i].once),0):null;
 return {indexes,complete,total,value:total===null?'—':total.toLocaleString('ko-KR')+' '+unit(),siteCount:indexes.length+'개'};}

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
 const holiday=(!isIndividual()&&state.mode==='FIXED')?`<section class="qa-form-section" data-section="holiday">${acc('qa-holiday','휴무일 · 주말 · 공휴일 대응',holidayContent(),state.advancedOpen,holidayStatus(),'qa-site-parent',true)}</section>`:'';
 return (!isIndividual()&&state.count>1&&hasRecurring?contactField()+(state.mode==='FLEX'?holidayContent(null,true):''):'')+holiday+resultSection();
}
// Read-only preview uses the regular allocation validator. Display routing never
// commits, changes completion rules, or validates collapsed groups differently.
let popupBadgeFrame=0;
function schedulePopupBadges(){
 if(popupBadgeFrame)return;popupBadgeFrame=requestAnimationFrame(()=>{popupBadgeFrame=0;paintPopupBadges();});
}
function paintPopupBadges(){
 if(!regularContext||state.dialogClosed)return;
 const issues=bridge.inspect(serializedAllocations(true)).map(i=>({...i,groupKey:[i.stage,i.lineId||'',i.siteId||'',i.fieldKey||i.issueId].join('|')}));
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
  const approved=r.cadence?.version==='3.0.0',selection=weekdayState(r),bad=approved?selection.over:!!r.weeklyCheck&&!w.complete&&(state.attempted||w.over),note=$(group.id+'-error'),owner=group.closest('[data-ui-subaccordion]'),limit=approved?selection.limit:v.perWeek;
  group.setAttribute('aria-invalid',String(bad));group.closest('.qa-weekday-owner')?.setAttribute('data-weekday-error',String(bad));
  group.querySelectorAll('[data-weekday],[data-site-weekday]').forEach(button=>{const d=button.dataset.day,key=n+':'+d,chosen=!!r.weekdays?.[key],over=approved&&selection.excess.includes(key);button.setAttribute('aria-pressed',String(chosen));button.disabled=!chosen&&(!Number.isInteger(limit)||w.count>=limit);button.dataset.over=String(over);button.setAttribute('aria-invalid',String(over));});
  if(note){const hint=approved&&r.weeklyCheck&&selection.fixed&&selection.count<limit;note.className='qa-weekday-note ui-field-error';note.dataset.error=String(bad);note.hidden=!bad&&!hint;note.textContent=bad?(approved?`요일을 ${limit}개 이하로 줄여 주세요.`:`${n}주차에 희망요일 ${limit}개를 선택해 주세요. (현재 ${w.count}개)`):hint?`${limit}개 요일까지 선택할 수 있습니다.`:'';}
  if(owner){owner.dataset.complete=String(w.complete);owner.dataset.error=String(bad);owner.dataset.state=bad?'error':w.complete?'complete':'empty';if(!bad){owner.classList.remove('qa-shake');group.classList.remove('qa-shake');}}
 });
 schedulePopupBadges();
}
function render(){destroyApprovedDateFields();syncMonthlyFields();closeQ4Dropdown();if(state.calendarOpen)toggleCalendar(false);const resizePanel=$('q4-regular-dialog')?.querySelector('.q4-regular-panel');const beforeHeight=resizePanel?.getBoundingClientRect().height||0;const scroller=$('q4-regular-scroll');const sc=scroller?.scrollTop||0;
 $('q4-regular-title').textContent=regularContext.line.housing+'번 · '+regularContext.line.size+' · '+state.pack+'구';
 const modeChoices=[['FLEX','소진 시 주문'],['FIXED','정기 주문'],['ONCE','1회 주문']];
 const modeChoice=state.count>=2?`<section class="qa-form-section" data-section="delivery"><div class="qa-section-title ui-field-title ui-field-title--top">주문 방식 ${requiredStar}</div><div class="qa-bulk-row"><button type="button" class="qa-individual-button ui-choice" data-individual aria-pressed="${state.mode==='MIXED'}">사업장 개별 설정</button><div class="qa-bulk-dropdown">${dropdown('bulk','', ['소진 시 주문','정기 주문','1회 주문'],state.mode==='MIXED'?'사업장 일괄 설정':mName[state.mode])}</div></div></section>`:choice('주문 방식',modeChoices,state.mode,'delivery');
 $('q4-regular-fields').innerHTML=modeChoice+sitesSection()+(!isIndividual()&&state.mode==='ONCE'?contactField():'')+extras();q4Numeric.refresh();
 if(scroller)scroller.scrollTop=sc;
 const modal=$('q4-regular-dialog');modal.dataset.closed=String(state.dialogClosed);refreshHolidayStatus();if(isIndividual())for(let i=0;i<state.count;i++)siteHolidayMark(i);
 q4SeedCheckboxes($('q4-regular-fields'));bindApprovedDateFields();paintWeekDemo();if(state.weeklyCheck){for(const n of [1,2,3,4])refreshWeekStatus(n);}
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
 // A deferred disclosure measurement must not steal a newer input focus.
 // Otherwise an immediately following Undo can reach the accordion header.
 const expectedFocus=document.activeElement;
 requestAnimationFrame(()=>{if(document.activeElement!==expectedFocus)return;const x=$(`site-${i}`);if(!x?.isConnected)return;const scroll=$('q4-regular-scroll');if(scroll){const r=x.getBoundingClientRect(),b=scroll.getBoundingClientRect();if(r.top<b.top||r.top>b.bottom-55)scroll.scrollTop+=r.top-b.top-10;}header()?.focus({preventScroll:true});});
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
 destroyApprovedDateFields(body);const scroll=$('q4-regular-scroll'),oldY=scroll?.scrollTop||0,oldForm=body.querySelector(':scope > .qa-site-form');
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
 q4Numeric.refresh();if(scroll)scroll.scrollTop=oldY;q4SeedCheckboxes(newForm);bindApprovedDateFields(newForm);paintWeekDemo();refreshStatus(i);
}
function renderRepeatOnly(i=null){
 const old=i===null?document.querySelector('#q4-regular-fields .qa-repeat-section:not([data-site-repeat])'):$(`site-${i}`)?.querySelector(`[data-site-repeat="${i}"]`);if(!old){render();return;}
 destroyApprovedDateFields(old);const wrapper=document.createElement('div');wrapper.innerHTML=repeatSection(i);const fresh=wrapper.firstElementChild;
 const scroll=$('q4-regular-scroll'),y=scroll?.scrollTop||0;old.replaceWith(fresh);if(scroll)scroll.scrollTop=y;q4SeedCheckboxes(fresh);bindApprovedDateFields(fresh);paintWeekDemo();if(i!==null)refreshStatus(i);q4Numeric.refresh();refreshResultsOnly();
}

function changeVariant(i){
 // Do not destroy/recreate the actual checked input: preserve focus and its real check motion.
 const form=$(`site-${i}`)?.querySelector('.qa-site-form')||$('single-site')?.querySelector('.qa-site-form');
 if(!form)return;
 const existing=form.querySelector('.qa-var-range');
 if(state.variable[i]&&!existing){const block=document.createElement('div');block.className='qa-var-range ui-field-pair';block.innerHTML=quantity(i,'min','최소','13')+'<span class="qa-range-tilde" aria-hidden="true">~</span>'+quantity(i,'max','최대','17');const control=form.querySelector('.qa-var-row');control?.after(block);}
 else if(!state.variable[i]&&existing)existing.remove();
 q4Numeric.refresh();refreshStatus(i);refreshResultsOnly();
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
  if(key==='period'&&site===null&&state.count>1){const selections=Array.from({length:state.count},(_,i)=>selectCadence({repeat:repeatForSite(i),monthly:state.values[i].monthly,quantity:state.values[i].base,period:val,asOfLocalDate:state.asOfLocalDate}));if(selections.some(result=>!result.accepted))return;if(selections.some(result=>result.repeat.frequency!==selections[0].repeat.frequency)){materializeCommonSettings();for(let i=0;i<state.count;i++){state.siteRepeat[i]=selections[i].repeat;state.values[i].base=selections[i].quantity;state.quantityAdjusted[i]=selections[i].adjusted;}state.attempted=false;closeQ4Dropdown();render();return;}Object.assign(state,selections[0].repeat);if(!selections[0].repeat.monthlyMemory)delete state.monthlyMemory;state.commonMonthlyMemories=selections.map(result=>result.repeat.monthlyMemory?clone(result.repeat.monthlyMemory):null);for(let i=0;i<state.count;i++){state.values[i].base=selections[i].quantity;state.quantityAdjusted[i]=selections[i].adjusted;}if(val==='매월')syncPreferredRule(null);state.attempted=false;closeQ4Dropdown();render();return;}
  if(key==='period'){if(r.cadence?.version==='3.0.0'&&r.period===val&&r.cadenceSelection==='manual'){closeQ4Dropdown();return;}const i=site??0,before=quantityCadenceSnapshot(i),beforeQuantity=state.values[i].base,result=selectCadence({repeat:OrderRepeatContract.snapshot(r),monthly:state.values[i].monthly,quantity:state.values[i].base,period:val,asOfLocalDate:state.asOfLocalDate});if(!result.accepted)return;Object.assign(r,result.repeat);if(!result.repeat.cadenceSelection)delete r.cadenceSelection;if(!result.repeat.monthlyMemory)delete r.monthlyMemory;state.values[i].base=result.quantity;state.quantityAdjusted[i]=result.adjusted;if(r.period==='매월')syncPreferredRule(site);const input=document.querySelector(`[data-qty="${i}:base"]`);if(input){q4Numeric.replace(input,result.quantity,{notify:false,history:'append'});const history=q4Numeric.inspectHistory(input);if(history&&String(beforeQuantity)!==result.quantity){const edits=quantityCadenceHistory.get(input)||new Map();edits.set(history.key,{before,after:quantityCadenceSnapshot(i)});quantityCadenceHistory.set(input,edits);}}state.attempted=false;}
  else if(key==='freq'){r.frequency=val;r.legacyReviewRequired=false;r.semantics=r.cadence?.version==='3.0.0'?'cadence-v3':r.cadence?'cadence-v2':'per-week-v1';}
  else {r.date=val==='직접 입력'?'':val;r.dateMode=val==='직접 입력'?'custom':'preset';monthEditing.delete(id);if(!r.cadence)r.cadence=createCadence('매월');syncPreferredRule(site);}
  closeQ4Dropdown();renderRepeatOnly(site);
  (key==='date'?document.querySelector(`[data-month-date="${id}"]`):document.querySelector(`[data-combo="${id}"]`))?.focus({preventScroll:true});return;
 }
 if(id==='bulk'){state.mode=Object.keys(mName).find(k=>mName[k]===val)||'MIXED';closeQ4Dropdown();render();return;}
 if(id.startsWith('site-holiday-')){const m=id.match(/^site-holiday-(\d+)-(conflict|weekend|holiday|subholiday)$/);if(m)state.siteHolidays[+m[1]][m[2]]=val;}
 else if(id.startsWith('holiday-'))state.holiday[id.split('-')[1]]=val;
 else if(id.startsWith('site-mode-')){const n=Number(id.replace('site-mode-',''));state.siteModes[n]=Object.keys(mName).find(k=>mName[k]===val)||'FLEX';}
 closeQ4Dropdown();if(id.startsWith('site-holiday-')){const i=Number(id.match(/^site-holiday-(\d+)-/)[1]);q4ValidationEpoch++;const trigger=document.querySelector(`[data-combo="${id}"]`);if(trigger){trigger.querySelector('span')?.replaceChildren(document.createTextNode(val));trigger.dataset.selected=String(comboSelected(id,val));trigger.setAttribute('aria-invalid','false');trigger.focus({preventScroll:true});}siteHolidayMark(i);}else render();refreshHolidayStatus();refreshResultsOnly();
}
function disposeProductModal(){
 destroyApprovedDateFields();q4CancelNavigation();q4ValidationEpoch++;
 if($('qa-copy-confirm'))closeCopy(false);closeQ4Dropdown();if(state.calendarOpen)toggleCalendar(false);
 const dialog=$('q4-regular-dialog');if(state.dialogClosed||!dialog.open)return;
 state.dialogClosed=true;window.OrderModalShell.close(dialog,{after:endRegularClose});
}
function closeProductModal(reason='cancel'){return window.OrderModalShell.requestClose($('q4-regular-dialog'),reason);}
function openProductModal(){
 state.dialogClosed=false;const context=regularContext,original=returnFocus;
 window.OrderModalShell.open($('q4-regular-dialog'),{variant:'editor',history:true,returnFocus:()=>original?.isConnected?original:context.returnSelector?document.querySelector(context.returnSelector):document.querySelector(`[data-edit-allocation="${CSS.escape(context.allocations[context.selectedIndex||0].id)}"]`),initialFocus:()=> $('q4-regular-close')});q4Numeric.refresh();
}

function repeatValidationIssue(site=null){const r=repeatDraft(site),v=OrderRepeatContract.inspect(r),prefix=site===null?'':`site-repeat-${site}-`;if(v.valid)return null;const issue=v.issue;
 if(['start-date','preferred-date'].includes(issue.kind))return {kind:'desired-date',target:`#${CSS.escape(approvedDateId(site??0))} [data-order-date-part=day]`,message:issue.message};
 if(issue.kind==='weekdays')return {kind:'repeat-weekdays',target:site===null?`#q4-week-global-${issue.week}`:`#q4-week-site-${site}-${issue.week}`,week:issue.week,message:issue.message};
 const key=issue.kind==='period'?'period':issue.kind==='date'?'date':'freq';return {kind:'repeat',target:key==='date'?`[data-month-date="${prefix+key}"]`:`[data-combo="${prefix+key}"]`,message:issue.message};
}
function toggleRepeatDay(site,n,d,button){const r=repeatDraft(site),v=OrderRepeatContract.inspect(r),w=v.week[n-1],key=n+':'+d;if(!w||!OrderRepeatContract.days.includes(d))return;
 const selected=!!r.weekdays[key],limit=r.cadence?.version==='3.0.0'?weekdayState(r).limit:v.perWeek;if(!selected&&(!Number.isInteger(limit)||w.count>=limit))return;
 q4ValidationEpoch++;r.weekdays[key]=!selected;r.weekdayOrder=(r.weekdayOrder||Object.keys(r.weekdays).filter(k=>r.weekdays[k]&&k!==key)).filter(k=>k!==key);if(!selected)r.weekdayOrder.push(key);button.setAttribute('aria-pressed',String(!selected));paintWeekDemo();refreshWeekStatus(n,site);
 if(site!==null)refreshStatus(site);else for(let i=0;i<state.count;i++)refreshStatus(i);refreshResultsOnly();
}
function monthOwner(id){const m=id.match(/^site-repeat-(\d+)-date$/);return m?Number(m[1]):null;}
function monthFeedback(input,{commit=false}={}){if(commit)monthEditing.delete(input.dataset.monthDate);const id=input.dataset.monthDate,site=monthOwner(id),r=repeatDraft(site),valid=OrderRepeatContract.monthValue(r.date).valid,bad=state.attempted&&!valid;
 const shell=input.closest('.qa-combo-editable');const committed=valid&&!monthEditing.has(id);shell.dataset.selected=String(committed);shell.dataset.error=String(bad);shell.querySelector('.qa-month-suffix').hidden=!committed||r.date==='말일';input.size=Math.max(1,input.value.length);input.style.setProperty('--ui-month-width',r.date==='말일'?'2em':Math.max(1,input.value.length)+'ch');input.setAttribute('aria-invalid',String(bad));const note=document.querySelector(`[data-month-error="${id}"]`);if(note){note.hidden=!bad;note.textContent=rMonthMessage(r.date);}if(site!==null)refreshStatus(site);refreshResultsOnly();
}
const q4Numeric=bindNumericInputs($('q4-regular-dialog'),{selector:'[data-qty],[data-date-part],[data-month-date]',options:input=>{const part=input.dataset.datePart,i=Number(input.dataset.dateSite),d=part?dateData(i):null,bounds=part?dateBounds(i):null;return {grouped:input.matches('[data-qty]'),allowEmpty:true,allowZero:true,maxDigits:input.matches('[data-qty]')?12:input.matches('[data-month-date]')?null:part==='year'?4:2,clampMax:input.matches('[data-month-date]')?31:null,min:part==='year'?bounds.minYear:part||input.matches('[data-month-date]')?1:0,max:part==='year'?bounds.maxYear:part==='month'?12:part==='day'&&Number(d.year)&&Number(d.month)>=1&&Number(d.month)<=12?datePolicy.days(d.year,d.month):part==='day'||input.matches('[data-month-date]')?31:undefined};}});
function acceptMonthInput(input){input.dataset.monthPrevious=input.value;const site=monthOwner(input.dataset.monthDate),r=repeatDraft(site);r.date=input.value;r.dateMode='custom';if(!r.cadence)r.cadence=createCadence('매월');syncPreferredRule(site);monthEditing.add(input.dataset.monthDate);q4ValidationEpoch++;monthFeedback(input);}
$('q4-regular-dialog').addEventListener('input',e=>{if(e.target.matches('[data-month-date]')&&!e.isComposing)acceptMonthInput(e.target);});
$('q4-regular-dialog').addEventListener('keydown',e=>{
 const input=e.target.closest('[data-month-date]');
 if(input){if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();monthFeedback(input,{commit:true});return;}if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeQ4Dropdown();return;}if(e.key==='ArrowDown'&&e.altKey){e.preventDefault();e.stopImmediatePropagation();openQ4Dropdown(input.dataset.monthDate);$('qa-dropdown-host')?.querySelector('button')?.focus();return;}}
 const arrow=e.target.closest('[data-combo]');if(arrow&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();openQ4Dropdown(arrow.dataset.combo);const options=[...$('qa-dropdown-host').querySelectorAll('[role=option]:not(:disabled)')];(e.key==='ArrowUp'?options.at(-1):options[0])?.focus();return;}
 const option=e.target.closest('#qa-dropdown-host [role=option]');if(option&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();const options=[...$('qa-dropdown-host').querySelectorAll('[role=option]:not(:disabled)')],i=options.indexOf(option);const n=e.key==='Home'?0:e.key==='End'?options.length-1:(i+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options[n]?.focus();}
},true);

$('q4-regular-dialog').addEventListener('focusout',e=>{if(e.target.matches('[data-month-date]'))monthFeedback(e.target,{commit:true});});
function normalizeSavedRepeat(saved,a){const r=saved?clone(saved):OrderRepeatContract.fromAllocation(a);if(!a.cadence&&!a.qty&&!a.q4Review?.activeRepeat&&!a.q4Review?.draft?.repeat){Object.assign(r,{period:'협의',frequency:'협의',cadence:cadenceForPeriod('협의'),semantics:'cadence-v3',quantityEditVersion:'0540',weekdayOrder:[]});}if(a.cadence&&!r.cadence)r.cadence=clone(a.cadence);if(r.legacyReviewRequired===undefined)r.legacyReviewRequired=OrderRepeatContract.periods[r.period]>1&&r.semantics!=='per-week-v1';return r;}
$('q4-regular-dialog').addEventListener('click',e=>{if(!state.calendarOpen||e.target.closest('#qa-date-popover')||e.target.closest('[data-calendar-for]'))return;e.preventDefault();e.stopImmediatePropagation();toggleCalendar(false);},true);
$('q4-regular-dialog').addEventListener('focusin',()=>{if(state.calendarOpen)refreshCalendarBoundary();});
$('q4-regular-dialog').addEventListener('click',e=>{
 if(e.target.id==='qa-open'){openProductModal();return;}

 const trigger=e.target.closest('[data-calendar-for]');if(trigger){const i=Number(trigger.dataset.calendarFor);toggleCalendar(!(state.calendarOpen&&state.calendarSite===i),i);return;}
 if(e.target.closest('[data-calendar-close]')){toggleCalendar(false);return;}
 const cd=e.target.closest('[data-calendar-day]');if(cd){chooseCalendarDay(cd.dataset.calendarDay);return;}
 const cn=e.target.closest('[data-calendar-nav]');if(cn){moveCalendarMonth(Number(cn.dataset.calendarNav));return;}
 const option=e.target.closest('[data-combo-choice]');if(option&&!option.disabled){selectedOption(option.dataset.comboChoice,option.dataset.value);return;}
 const combo=e.target.closest('[data-combo]');if(combo){const id=combo.dataset.combo;if(state.drop===id)closeQ4Dropdown();else openQ4Dropdown(id);return;}
 if(state.drop&&!e.target.closest('.qa-combo')&&!e.target.closest('#qa-dropdown-host'))closeQ4Dropdown();
 const siteDay=e.target.closest('[data-site-weekday]');if(siteDay){const [si,n,d]=siteDay.dataset.siteWeekday.split(':');toggleRepeatDay(Number(si),Number(n),d,siteDay);return;}
 const day=e.target.closest('[data-weekday]');if(day){const [n,d]=day.dataset.weekday.split(':');toggleRepeatDay(null,Number(n),d,day);return;}
 const accB=e.target.closest('[data-acc]');if(accB){const id=accB.dataset.acc;if(id==='qa-copy-fields'){const open=accB.getAttribute('aria-expanded')!=='true';const card=document.querySelector('#qa-copy-confirm .qa-copy-card'),body=$('qa-copy-fields-body');const from=card?.getBoundingClientRect().height||0;const prior=body?.getBoundingClientRect().height||0;setOpen(id,open);const targetBody=open?(body?.scrollHeight||0):0;animateCopyCardHeight(from,from+targetBody-prior);return;}if(id==='business-parent'){state.parentOpen=!state.parentOpen;setOpen(id,state.parentOpen);}else if(id==='qa-holiday'){state.advancedOpen=!state.advancedOpen;setOpen(id,state.advancedOpen);}else if(id.startsWith('site-holiday-')){const i=Number(id.split('-').at(-1));state.siteHolidayOpen[i]=!state.siteHolidayOpen[i];setOpen(id,state.siteHolidayOpen[i]);}else if(id.startsWith('site-week-')){const m=id.match(/^site-week-(\d+)-(\d+)$/);if(m){const r=state.siteRepeat[+m[1]],n=+m[2];r.weekOpen=r.weekOpen===n?0:n;setOpen(id,r.weekOpen===n);}}else if(id.startsWith('week-')){state.weekOpen=state.weekOpen===Number(id.slice(5))?0:Number(id.slice(5));setOpen(id,state.weekOpen===Number(id.slice(5)));}else if(id.startsWith('site-')){const i=Number(id.slice(5));if(state.siteOpen===i){state.siteOpen=-1;setOpen(id,false);}else travel(i);}else if(id==='q1-ref'){setOpen(id,accB.getAttribute('aria-expanded')!=='true');}return;}
 if(e.target.closest('[data-individual]')){materializeCommonSettings();state.mode='MIXED';render();return;}
 const siteChoice=e.target.closest('[data-site-choice]');if(siteChoice){const i=Number(siteChoice.dataset.siteChoice);state.siteModes[i]=siteChoice.dataset.value;/* preserve existing per-site values and variable state */renderSite(i);refreshResultsOnly();travel(i);return;}
 const siteProcess=e.target.closest('[data-site-process]');if(siteProcess){const i=Number(siteProcess.dataset.siteProcess);state.siteProcess[i]=siteProcess.dataset.value;document.querySelectorAll(`[data-site-process="${i}"]`).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===state.siteProcess[i])));return;}
 const scday=e.target.closest('[data-site-closed-day]');if(scday){const [a,d]=scday.dataset.siteClosedDay.split(':');const i=Number(a),h=state.siteHolidays[i];h.none=false;h.irregular=false;h.days=h.days.includes(d)?h.days.filter(x=>x!==d):[...h.days,d];document.querySelectorAll(`[data-site-closed-day^="${i}:"]`).forEach(el=>el.setAttribute('aria-pressed',String(h.days.includes(el.dataset.siteClosedDay.split(':')[1]))));const none=$(`qa-holiday-none-site-${i}`),irr=$(`qa-holiday-irregular-site-${i}`);if(none)none.checked=false;if(irr)irr.checked=false;q4ValidationEpoch++;siteHolidayMark(i);return;}
 if(e.target.id==='qa-copy-confirm')return;
 const copy=e.target.closest('[data-copy-from]');if(copy){requestCopy(Number(copy.dataset.copyFrom));return;}
 if(e.target.closest('[data-copy-cancel]')){closeCopy();return;}
 if(e.target.closest('[data-copy-apply]')){applyCopy();return;}
 const closureDay=e.target.closest('[data-closed-day]');if(closureDay){const d=closureDay.dataset.closedDay;state.holidayNone=false;state.holidayIrregular=false;state.holidayDays=state.holidayDays.includes(d)?state.holidayDays.filter(v=>v!==d):[...state.holidayDays,d];document.querySelectorAll('[data-closed-day]').forEach(b=>b.setAttribute('aria-pressed',String(state.holidayDays.includes(b.dataset.closedDay))));const n=$('qa-holiday-none'),ir=$('qa-holiday-irregular');if(n){n.checked=false;q4CheckboxPrevious.set(n,false);}if(ir){ir.checked=false;q4CheckboxPrevious.set(ir,false);}refreshHolidayStatus();return;}
 if(e.target.closest('[data-global-holiday-done]')){if(!holidayComplete()){exposeHolidayInvalid();return;}state.advancedOpen=false;navigateAfterAccordionLayout([setOpen('qa-holiday',false)],()=>document.querySelector('[data-section="results"]'),{result:true});return;}
 const holidayDone=e.target.closest('[data-site-holiday-done]');if(holidayDone){completeSiteHoliday(Number(holidayDone.dataset.siteHolidayDone));return;}
 const next=e.target.closest('[data-next]');if(next){nextSite(Number(next.dataset.next));return;}
 const choice=e.target.closest('[data-choice]');if(choice){const k=choice.dataset.choice,v=choice.dataset.value;if(k==='delivery'){state.mode=v;state.drop=null;render();}if(k==='process'){state.process=v;document.querySelectorAll('[data-choice="process"]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.value===v)));}return;}
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
function materializeCommonSettings(){if(isIndividual()||state.count<2)return;const mode=state.mode,holiday={days:[...state.holidayDays],none:state.holidayNone,irregular:state.holidayIrregular,...state.holiday,request:state.request},repeat=OrderRepeatContract.snapshot(state),raw=state.preferredDates[preferredKey(0)],approvedParts=state.approvedDateParts[preferredKey(0)],touched=state.preferredTouched.has(preferredKey(0)),review=state.startDateReviews[preferredKey(0)],result=state.startDateResults[preferredKey(0)];
 for(let i=0;i<state.count;i++){state.siteModes[i]=mode;state.siteContacts[i]=clone(state.contact);state.siteHolidays[i]=clone(holiday);state.siteRepeat[i]=repeatForSite(i);state.siteProcess[i]=state.process;}
 state.mode='MIXED';for(let i=0;i<state.count;i++){if(approvedParts)state.approvedDateParts[preferredKey(i)]=clone(approvedParts);if(raw)state.preferredDates[preferredKey(i)]=clone(raw);else delete state.preferredDates[preferredKey(i)];if(review)state.startDateReviews[preferredKey(i)]=clone(review);else delete state.startDateReviews[preferredKey(i)];if(result)state.startDateResults[preferredKey(i)]=clone(result);else delete state.startDateResults[preferredKey(i)];if(touched)state.preferredTouched.add(preferredKey(i));else state.preferredTouched.delete(preferredKey(i));}
}
// Numeric history owns the quantity; this sidecar only couples the explicitly
// induced cadence change to that same edit. It is private to the popup draft.
const quantityCadenceHistory=new WeakMap();
function quantityCadenceSnapshot(i){const key=preferredKey(i),repeat=OrderRepeatContract.snapshot(activeRepeat(i));delete repeat.weekOpen;return {repeat,approvedParts:state.approvedDateParts[key]?clone(state.approvedDateParts[key]):null,preferred:state.preferredDates[key]?clone(state.preferredDates[key]):null,touched:state.preferredTouched.has(key),review:state.startDateReviews[key]?clone(state.startDateReviews[key]):null,result:state.startDateResults[key]?clone(state.startDateResults[key]):null};}
function quantityCadenceFingerprint(snapshot){const {result,...intent}=snapshot;return JSON.stringify(intent);}
function restoreQuantityCadence(i,snapshot){const r=activeRepeat(i),key=preferredKey(i),open=r.weekOpen;for(const field of Object.keys(OrderRepeatContract.snapshot(r)))if(field!=='weekOpen')delete r[field];Object.assign(r,clone(snapshot.repeat));r.weekOpen=open;
 for(const [field,value] of [['approvedDateParts',snapshot.approvedParts],['preferredDates',snapshot.preferred],['startDateReviews',snapshot.review],['startDateResults',snapshot.result]]){if(value===null)delete state[field][key];else state[field][key]=clone(value);}if(snapshot.touched)state.preferredTouched.add(key);else state.preferredTouched.delete(key);
}
function applyQuantityInput(i,key,raw,{phase='input',direct=true,input=null,composing=false,numericHistory=null}={}){
 if(composing||numericComposing.has(input))return false;let value=String(raw??''),structureChanged=false,repeatChanged=false;
 const cadenceEdit=siteMode(i)==='FIXED'&&['monthly','base'].includes(key),oldValue=String(state.values[i][key]??''),acceptedEdit=cadenceEdit&&oldValue!==value;
 const edits=input&&quantityCadenceHistory.get(input),undo=numericHistory?.phase==='undo',redo=numericHistory?.phase==='redo',transaction=edits?.get(undo?numericHistory.fromHistoryKey:redo?numericHistory.historyKey:null);
 let before=cadenceEdit?quantityCadenceSnapshot(i):null,restored=false,historyConflict=false;
 if(transaction&&cadenceEdit){const expected=undo?transaction.after:transaction.before,next=undo?transaction.before:transaction.after;if(quantityCadenceFingerprint(before)===quantityCadenceFingerprint(expected)){restoreQuantityCadence(i,next);restored=true;repeatChanged=true;}else historyConflict=true;}
 if(acceptedEdit&&!restored&&!historyConflict&&state.count>1&&!isIndividual()){materializeCommonSettings();structureChanged=true;before=quantityCadenceSnapshot(i);}
 if(key==='monthly'){monthlyEditor?.set(monthlyLocation(i),value,{composing:false,complete:direct});value=monthlyRow(i)?.quantity.raw??value;state.values[i].monthly=value;syncMonthlyFields();}
 else if(key==='base'&&siteMode(i)==='FLEX'){const result=orderQuantityInput({mode:'FLEX',monthlyPlan:monthlyRow(i)?.quantity.raw||'',quantity:value,asOfLocalDate:state.asOfLocalDate,phase,direct,composing:false});value=result.quantity;state.values[i][key]=value;}
 else state.values[i][key]=value;
 if(acceptedEdit&&!restored&&!historyConflict){const r=activeRepeat(i),result=editQuantityCadence({repeat:OrderRepeatContract.snapshot(r),monthly:state.values[i].monthly,quantity:state.values[i].base,field:key,value,asOfLocalDate:state.asOfLocalDate});Object.assign(r,result.repeat);if(!result.repeat.cadenceSelection)delete r.cadenceSelection;if(!result.repeat.monthlyMemory)delete r.monthlyMemory;state.values[i].base=result.quantity;state.quantityAdjusted[i]=result.adjusted;if(r.period==='매월'){delete state.preferredDates[preferredKey(i)];syncPreferredRule(isIndividual()?i:null);}value=state.values[i][key];repeatChanged=true;}
 if(!['monthly','base'].includes(key)&&oldValue!==value)state.quantityAdjusted[i]=false;if(key==='base'&&direct)state.qtySources[i]='user';state.deliveryPlans[i]=null;
 if(direct&&oldValue!==value)state.quantityTouched.add(`${i}:${key}`);if(input)q4Numeric.replace(input,value,{notify:false,history:'replace'});
 if(cadenceEdit&&acceptedEdit&&!restored&&!historyConflict){const history=input&&q4Numeric.inspectHistory(input);if(history){const entries=edits||new Map();for(const k of entries.keys())if(!history.keys.includes(k))entries.delete(k);entries.set(history.key,{before,after:quantityCadenceSnapshot(i)});quantityCadenceHistory.set(input,entries);}}
 if(structureChanged){const edited=input&&quantityEditedFields.has(input),transactions=input&&quantityCadenceHistory.get(input);state.siteOpen=i;render();const next=document.querySelector(`[data-qty="${i}:${key}"]`);if(input&&next&&q4Numeric.transfer(input,next).accepted){if(edited)quantityEditedFields.add(next);if(transactions)quantityCadenceHistory.set(next,transactions);}next?.focus({preventScroll:true});}
 else{if(repeatChanged)renderRepeatOnly(isIndividual()?i:null);refreshStatus(i);refreshResultsOnly();syncRegularQuantityErrors(i);}
 const note=document.querySelector(`[data-quantity-adjusted="${i}"]`);if(note){note.hidden=!state.quantityAdjusted[i];note.textContent=state.quantityAdjusted[i]?'월 수량에 맞춤':'';}
 return structureChanged||repeatChanged;
}
function completeQuantityInputs({latest=false}={}){if(latest)state.asOfLocalDate=localDateISO();for(let i=0;i<state.count;i++){if(siteMode(i)==='ONCE')continue;const input=document.querySelector(`[data-qty="${i}:base"]`);applyQuantityInput(i,'base',state.values[i].base,{phase:'commit',direct:false,input});}}
$('q4-regular-dialog').addEventListener('input',e=>{const el=e.target,packet=e.orderNumeric;if(packet?.valid&&packet.phase==='compositionend')numericComposing.delete(el);if(el.dataset.datePart){const i=Number(el.dataset.dateSite),k=el.dataset.datePart,raw=packet?.value??el.value;if(preferredDateActive(i)){preferredEditedFields.add(el);const d={...dateData(i),[k]:raw};storePreferredDate(i,d,{kind:k==='day'?'date':'month',completed:!!packet?.completed&&!e.isComposing});if(packet?.completed&&!e.isComposing)preferredEditedFields.delete(el);}else{state.datesByAllocation[dateKey(i)][k]=raw===''?'':Number(raw);state.dateTouched.add(dateKey(i));}syncDateFields(i);return;}if(el.matches('[data-qty]')){const parsed=packet||q4Numeric.read(el);if(!parsed.valid||e.isComposing)return;const [i,k]=el.dataset.qty.split(':'),phase=parsed.completed||['step-key','step-wheel','paste','drop','compositionend'].includes(parsed.phase)?'complete':'input',direct=!['undo','redo','correction'].includes(parsed.phase);if(direct)quantityEditedFields.add(el);else quantityEditedFields.delete(el);applyQuantityInput(Number(i),k,parsed.value,{phase,direct,input:el,composing:e.isComposing,numericHistory:parsed});return;}
 if(el.id==='qa-request'){state.request=el.value;const count=$('qa-request-count');if(count)count.textContent=state.request.length+'/120';}
 if(el.dataset.siteRequest!==undefined){const i=Number(el.dataset.siteRequest);state.siteHolidays[i].request=el.value;const count=$('qa-request-site-'+i+'-count');if(count)count.textContent=el.value.length+'/120';}
});

$('q4-regular-dialog').addEventListener('numericstatechange',()=>{if(regularContext)refreshResultsOnly();});
$('q4-regular-dialog').addEventListener('compositionstart',e=>{if(e.target.matches('[data-qty],[data-date-part],[data-month-date]')){numericComposing.add(e.target);refreshQuantitySupport();}});
$('q4-regular-dialog').addEventListener('compositionend',e=>{numericComposing.delete(e.target);refreshQuantitySupport();});
$('q4-regular-dialog').addEventListener('focusout',e=>{const input=e.target;if(!input.dataset.datePart)return;const i=Number(input.dataset.dateSite);if(!preferredDateActive(i)||!preferredEditedFields.has(input))return;preferredEditedFields.delete(input);storePreferredDate(i,dateData(i),{kind:input.dataset.datePart==='day'?'date':'month'});syncDateFields(i);if(activeRepeat(i).cadence?.kind==='MONTHLY'){const id=isIndividual()?`site-repeat-${i}-date`:'date',monthInput=document.querySelector(`[data-month-date="${id}"]`);if(monthInput){monthInput.value=monthDateInputValue(activeRepeat(i).date);monthInput.readOnly=activeRepeat(i).date==='말일';monthFeedback(monthInput,{commit:true});}}});
$('q4-regular-dialog').addEventListener('focusout',e=>{const input=e.target;if(!input.dataset.qty?.endsWith(':base'))return;const value=q4Numeric.read(input);if(!value.valid)return;const direct=quantityEditedFields.has(input);quantityEditedFields.delete(input);applyQuantityInput(Number(input.dataset.qty.split(':')[0]),'base',value.value,{phase:'complete',direct,input});});
$('q4-regular-dialog').addEventListener('focusout',e=>{if(e.target.dataset.qty?.endsWith(':monthly')){monthlyEditor?.refresh();syncMonthlyFields();}});
// MSG0441: navigating to another field must never auto-collapse the current business accordion.
$('q4-regular-dialog').addEventListener('keydown',e=>{if(calendarKeydown(e))return;if(e.key==='Enter'&&$('qa-copy-confirm')&&e.target.closest('#qa-copy-confirm')&&!e.target.matches('button')&&!e.target.matches('input[type=checkbox]')){e.preventDefault();if(copyEligibility().valid)applyCopy();else validateCopyAttempt();return;}if(e.key==='Tab'&&$('qa-copy-confirm')){const host=$('qa-copy-confirm');const items=[...host.querySelectorAll('button:not(:disabled),input:not(:disabled),summary,[tabindex]')].filter(el=>el.getClientRects().length>0&&el.tabIndex>=0);if(items.length){const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}else if(!host.contains(document.activeElement)){e.preventDefault();first.focus();}}return;}if(e.key==='Tab'&&!state.dialogClosed&&!state.calendarOpen){const roots=$('q4-regular-dialog');const items=[...roots.querySelectorAll('.q4-regular-dialog button:not(:disabled),.q4-regular-dialog input:not([disabled]),.q4-regular-dialog textarea:not([disabled])')].filter(x=>x.getClientRects().length && !x.closest('[hidden]'));if(items.length){let first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}if(e.key==='Escape'){e.preventDefault();if($('qa-copy-confirm')){closeCopy();return;}if(state.calendarOpen){e.preventDefault();toggleCalendar(false);return;}if(state.drop){const old=state.drop;closeQ4Dropdown();document.querySelector(`[data-combo="${old}"]`)?.focus({preventScroll:true});}else if(!state.dialogClosed){closeProductModal();}return;}
 const el=e.target;if(el.dataset.datePart&&e.key==='Enter'&&!e.isComposing){e.preventDefault();el.blur();return;}if(el.matches('[data-qty]')&&e.key==='Enter'){e.preventDefault();const i=Number(el.dataset.qty.split(':')[0]);if(el.dataset.qty.endsWith(':base')){const value=q4Numeric.read(el);if(value.valid){const direct=quantityEditedFields.has(el);quantityEditedFields.delete(el);applyQuantityInput(i,'base',value.value,{phase:'complete',direct,input:el});}}if(status(i,true)==='complete')nextSite(i);else el.blur();}
});
$('q4-regular-scroll')?.addEventListener('scroll',()=>{if(state.drop)positionQ4Dropdown();if(state.calendarOpen)positionCalendar();},{passive:true});window.addEventListener('resize',()=>{if(state.drop)positionQ4Dropdown();if(state.calendarOpen)positionCalendar();});



window.OrderModalShell.bind($('q4-regular-dialog'),disposeProductModal,{editable:true,isDirty:()=>!!regularContext&&dirtyFingerprint()!==dirtyBaseline,onExitIntent:()=>{commitEpoch++;commitAttempt++;committing=false;},beforeClose:()=>{if($('qa-copy-confirm')){closeCopy();return false;}if(state.calendarOpen){toggleCalendar(false);return false;}if(state.drop){const old=state.drop;closeQ4Dropdown();document.querySelector(`[data-combo="${old}"]`)?.focus({preventScroll:true});return false;}return true;}});

// MSG0460 real-state adapter. This module never writes regular state directly.
let regularContext=null,returnFocus=null,opening=false,committing=false,commitEpoch=0,commitAttempt=0,dirtyBaseline="";
function dirtyFingerprint(){const values=serializedAllocations(true);for(const a of values){delete a.monthlyAllocationDraftRevision;for(const r of [a.q4Review?.common?.repeat,a.q4Review?.draft?.repeat,a.q4Review?.activeRepeat])if(r)delete r.weekOpen;}return JSON.stringify({allocations:values,preferredDates:state.preferredDates});}
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
 commitEpoch++;monthEditing.clear();numericComposing.clear();context=clone(context);for(const a of context.allocations){if(a.q4Review?.pack&&String(a.q4Review.pack)!==String(context.line.pack)){a.qty='';a.oneTimeDeliveryQty='';a.monthlyPlanQty='';a.qtyMin='';a.qtyMax='';if(a.q4Review.draft)a.q4Review.draft.values={};}}
 regularContext=clone(context);names.splice(0,names.length,...context.locations.map(x=>x.name));holidayValidationAttempt.clear();q4ValidationEpoch++;q4CancelNavigation();
 const first=context.allocations[0],count=context.allocations.length;
 const {profile,modes:restoredModes,sites:restoredSites,common}=restoredDeliverySettings(context.allocations,{holidayFromAllocation:allocationHoliday,repeatFromAllocation:allocationRepeat});
 const baseDate=datePolicy.today();
 Object.assign(state,{count,mode:profile,asOfLocalDate:localDateISO(),pack:String(context.line.pack),stage:'INPUT',attempted:false,parentOpen:true,siteOpen:Math.max(0,context.selectedIndex),advancedOpen:false,weekOpen:1,copySource:null,copyTargets:[],copyFields:null,drop:null,dialogClosed:true,calendarOpen:false,estimate:null,
  datesByAllocation:Object.fromEntries(context.allocations.map(a=>[JSON.stringify([context.line.id,a.id]),clone(a.q4Review?.deliveryDate||datePolicy.blank())])),dateTouched:new Set(),approvedDateParts:{},preferredDates:{},preferredTouched:new Set(),startDateReviews:{},startDateResults:{},calendarSite:null,calendarView:{year:baseDate.year,month:baseDate.month},
  quantityAdjusted:Array(count).fill(false),quantityTouched:new Set(),values:context.allocations.map(a=>{const saved=a.q4Review?.draft?.values||{};const active=a.mode==='ONCE'?{once:String(a.oneTimeDeliveryQty??a.qty??'')}:{base:String(a.qty??''),monthly:String(a.monthlyPlanQty??''),min:String(a.qtyMin??''),max:String(a.qtyMax??'')};return {...saved,...active};}),
  planningReferences:context.allocations.map(a=>clone(a.planningReference||{year:baseDate.year,month:baseDate.month,anchorDate:'',nominal:true})),nominalVisitCounts:context.allocations.map(a=>a.nominalVisitCount||''),deliveryPlans:context.allocations.map(a=>clone(a.deliveryPlan||null)),qtySources:context.allocations.map(a=>a.qtySource||'user'),
  variable:context.allocations.map(a=>a.mode==='ONCE'?!!a.q4Review?.draft?.variable:!!a.variableQty),
  siteModes:restoredModes,
  siteProcess:restoredSites.map(site=>site.process),
  siteContacts:restoredSites.map(site=>clone(site.contact)),
  siteHolidays:restoredSites.map(site=>clone(site.holiday)),
  commonMonthlyMemories:restoredSites.map(site=>site.repeat?.monthlyMemory?clone(site.repeat.monthlyMemory):null),siteHolidayOpen:Array(count).fill(false),siteRepeat:restoredSites.map((site,i)=>normalizeSavedRepeat(site.repeat,context.allocations[i])),siteQuality:restoredSites.map(site=>site.quality)});
 const h=common.holiday,r=normalizeSavedRepeat(common.repeat,first);
 Object.assign(state,{contact:common.contact,process:common.process,quality:common.quality,period:r.period,frequency:r.frequency,date:r.date,dateMode:r.dateMode,semantics:r.semantics,weekdayOrder:clone(r.weekdayOrder||[]),monthlyMemory:r.monthlyMemory?clone(r.monthlyMemory):undefined,quantityEditVersion:r.quantityEditVersion,cadenceSelection:r.cadenceSelection,legacyReviewRequired:!!r.legacyReviewRequired,legacyOriginal:r.legacyOriginal,cadence:r.cadence?clone(r.cadence):undefined,weeklyCheck:r.weeklyCheck,weekdays:r.weekdays,weekOpen:r.weekOpen||0,
  holidayDays:[...h.days],holidayNone:h.none,holidayIrregular:h.irregular,holiday:{closed:'',conflict:h.conflict,weekend:h.weekend,holiday:h.holiday,subholiday:h.subholiday},request:h.request});
 monthlyEditor=createMonthlyAllocationDraft(context,{readCurrentContext:()=>bridge.allocationContext?.(context.line.id)||context});syncMonthlyFields();
 returnFocus=document.activeElement;render();dirtyBaseline=dirtyFingerprint();openProductModal();fitAllResultNumbers();
}
function serializedAllocations(forReview=false){const patches=regularContext.allocations.map((original,i)=>{
 const a=clone(original),m=siteMode(i),v=state.values[i],r=repeatForSite(i);
 const h=isIndividual()?state.siteHolidays[i]:{days:state.holidayDays,none:state.holidayNone,irregular:state.holidayIrregular,...state.holiday,request:state.request};
 const c=isIndividual()?state.siteContacts[i]:state.contact,process=isIndividual()?state.siteProcess[i]:state.process;
 const period=r.period==='매월'?0:r.period==='매주'?1:parseInt(r.period,10);
 const plans=Array.from({length:period===0?0:Math.max(1,period)},(_,w)=>({weekdays:['월','화','수','목','금','토','일'].filter(d=>r.weekdays?.[`${w+1}:${d}`])}));
 Object.assign(a,{mode:m,modeExplicit:true,qty:String(m==='ONCE'?v.once??'':v.base??''),qtySource:state.qtySources[i],deliveryQtyUnit:state.pack==='30'?'tray':'pack',variableQty:m!=='ONCE'&&!!state.variable[i],qtyMin:m!=='ONCE'&&state.variable[i]?v.min??'':'',qtyMax:m!=='ONCE'&&state.variable[i]?v.max??'':'',qualityTest:!!state.siteQuality[i]});
 if(m==='ONCE')a.oneTimeDeliveryQty=String(v.once??'');if(state.deliveryPlans[i])a.deliveryPlan=clone(state.deliveryPlans[i]);else delete a.deliveryPlan;
 if(m==='FIXED'){if(r.period==='매월'&&r.cadence?.version==='3.0.0'){const value=approvedDateValue(i);r.cadence.preferredDate=value;r.cadence.nominalAnchor=value;}const packed=OrderRepeatContract.serialize(r);if(!packed.ok&&!forReview)throw new Error(packed.issue.message);if(packed.ok)Object.assign(a,packed.value);else if(forReview){if(r.cadence)a.cadence=clone(r.cadence);else delete a.cadence;}}
 a.advanced={...(a.advanced||{}),contactChannels:Object.keys(c).filter(k=>c[k]),...(m!=='ONCE'?{storeOffDays:[...h.days],storeOffNone:!!h.none,storeOffIrregular:!!h.irregular,memo:h.request||''}:{}),...(m==='FIXED'?{storeOffPolicy:legacyPolicy(h.conflict,'conflict'),weekend:legacyPolicy(h.weekend,'weekend'),holiday:legacyPolicy(h.holiday,'holiday'),substituteHoliday:legacyPolicy(h.subholiday,'subholiday')}:{})};
 a.q4Review={version:'0460',asOfLocalDate:state.asOfLocalDate,...(m==='FIXED'&&r.cadence?.preferredDate?{startDateReview:clone(startDateReview(i))}:original.q4Review?.startDateReview?{startDateReview:clone(original.q4Review.startDateReview)}:{}),pack:String(regularContext.line.pack),profile:state.mode,activeHoliday:m==='ONCE'?clone(original.q4Review?.activeHoliday||h):clone(h),activeRepeat:m==='FIXED'?OrderRepeatContract.snapshot(r):clone(original.q4Review?.activeRepeat||OrderRepeatContract.snapshot(r)),deliveryDate:clone(state.datesByAllocation[dateKey(i)]),
  common:{contact:clone(state.contact),process:state.process,quality:state.quality,holiday:{days:[...state.holidayDays],none:state.holidayNone,irregular:state.holidayIrregular,...state.holiday,request:state.request},repeat:m==='FIXED'&&!isIndividual()?clone(r):OrderRepeatContract.snapshot(state)},
  draft:{mode:state.siteModes[i],process:state.siteProcess[i],values:clone(v),variable:state.variable[i],contact:clone(state.siteContacts[i]),holiday:clone(state.siteHolidays[i]),repeat:OrderRepeatContract.snapshot(state.siteRepeat[i]),quality:state.siteQuality[i]}};
 return a;
});return monthlyEditor?monthlyEditor.serialize(patches):patches;}
function validateForSave(){
 if([...approvedDateBindings.values()].some(binding=>binding.inspect().valid===false))return false;
 if(numericComposing.size||q4Numeric.inspect?.().valid===false)return false;completeQuantityInputs({latest:true});completePreferredDates();state.attempted=true;render();const globalIssue=q4GlobalValidationIssue();if(globalIssue){q4RevealGlobalIssue(globalIssue);return false;}
 const modes=Array.from({length:state.count},(_,i)=>siteMode(i));if(modes.some(m=>m!=='ONCE')&&!monthlyEditor?.evaluate().normalized?.canConfirm){const i=Array.from({length:state.count},(_,i)=>i).find(i=>siteMode(i)!=='ONCE'&&q4QuantityInvalid(i,'monthly'))??0;invalid(i);return false;}
 const bad=Array.from({length:state.count},(_,i)=>i).find(i=>status(i,true)!=='complete');
 if(bad!==undefined){if(state.count>1)travel(bad);invalid(bad);return false;}
 if(!isIndividual()&&state.mode!=='ONCE'&&!holidayComplete()){exposeHolidayInvalid();return false;}
 return true;
}
function showCommitError(result){let p=$('q4-commit-error');if(!p){p=document.createElement('p');p.id='q4-commit-error';p.className='ui-error';p.setAttribute('role','alert');$('q4-regular-fields').prepend(p);}p.classList.toggle('ui-feedback-sr',!!result.issues?.length);p.textContent=result.message||'입력값을 확인해 주세요.';p.setAttribute('tabindex','-1');p.focus({preventScroll:true});$('q4-regular-scroll').scrollTop=0;}
async function saveRegularDraft(){if(committing||state.dialogClosed)return;const attempt=++commitAttempt;committing=true;
 try{
  if(!validateForSave())return;
  const context=regularContext,patches=serializedAllocations(),fingerprint=JSON.stringify({patches,preferredDates:state.preferredDates});
  const epoch=commitEpoch;const sameEditor=()=>regularContext===context&&!state.dialogClosed;
  // Users can keep editing or cancel while storage waits for another tab.
  // Only the exact reviewed draft may cross the durable write boundary.
  const canCommit=()=>{if(!sameEditor()||commitEpoch!==epoch||state.asOfLocalDate!==localDateISO()||q4Numeric.inspect?.().valid===false||numericComposing.size||[...approvedDateBindings.values()].some(binding=>binding.inspect().valid===false))return false;try{return Array.from({length:state.count},(_,i)=>dateIssue(i).valid).every(Boolean)&&JSON.stringify({patches:serializedAllocations(),preferredDates:state.preferredDates})===fingerprint;}catch{return false;}};
  const prepared=monthlyEditor?.confirm({allocations:patches});
  if(!prepared?.ok){showCommitError(prepared||{message:'월 주문 수량을 확인해 주세요.'});return;}
  const result=await bridge.commit(prepared.allocations,null,canCommit);
  if(!sameEditor()||epoch!==commitEpoch||attempt!==commitAttempt)return;
  if(result.ok)disposeProductModal();
  else if(!result.confirmation)showCommitError(result.status==='CANCELLED'&&!canCommit()?{message:'입력값이 변경되었습니다. 다시 저장해 주세요.'}:result);
 }finally{if(attempt===commitAttempt)committing=false;}}
function monthlyResultData(){
 const usageValid=!!regularContext?.line&&validMonthlyQuantity(regularContext.line),indexes=Array.from({length:state.count},(_,i)=>i).filter(i=>siteMode(i)!=='ONCE');
 const [year,month]=String(state.asOfLocalDate||'').split('-').map(Number),reference={year,month},periodLabel=year&&month?`${year}년 ${month}월 납품 예상`:'월간 납품 예상';
 const base={usage:usageValid?monthlyQuantityText(regularContext.line):'—',value:'—',periodLabel,comparison:'pending',status:numericComposing.size?'수량 입력 중':'납품 일정 미확정',complete:false};
 if(!indexes.length||numericComposing.size)return base;
 const entries=[],omissions=[];
 for(const i of indexes){
  const entry={reference,value:null};entries.push(entry);const input={...supportInput(i),reference:{...state.planningReferences?.[i],...reference}};
  let reason='';
  if(siteMode(i)==='FLEX')reason='소진 시 주문으로 일정 미정';
  else if(input.repeat.period==='협의')reason='일정 협의 중';
  else{const visits=repeatVisitPlan(input.repeat,input.reference,input.count);
   if(visits.resolved){entry.value=nominalQuantity({...input,visits:visits.visits});if(!entry.value)reason='회당 수량 확인 필요';}
   else if(visits.reason==='PARTIAL_WEEKDAYS'){const selected=Object.values(input.repeat.weekdays||{}).filter(Boolean).length;reason=`주 ${String(input.repeat.frequency).replace(/^약\s*/,'')} 중 희망 요일 ${selected}개, 나머지 일정 미정`;}
   else reason=visits.reason==='OPTIONAL_ANCHOR_UNSELECTED'?'시작일 미선택':visits.reason==='WEEKDAYS_UNSELECTED'?'희망 요일 미선택':'납품 일정 미확정';
  }
  if(reason)omissions.push(`${names[i]||`사업장 ${i+1}`} ${reason}`);
 }
 const scope=sumNominalByReference(entries),status=[`반복 주문 ${indexes.length}곳 중 ${scope.resolvedCount}곳 반영`,...omissions].join(' · ');
 if(!scope.total)return {...base,status};
 const sum=scope.total,low=exactDisplay(toJSON(sum.low)),high=exactDisplay(toJSON(sum.high)),complete=scope.complete,plan=monthlyEditor?.evaluate().normalized?.planSumPacks;let comparison='pending';
 if(complete&&plan){const p=fromRatio(plan);comparison=compare(sum.low,p)===0&&compare(sum.high,p)===0?'match':compare(sum.high,p)<0?'short':compare(sum.low,p)>0?'over':'range';}
 return {...base,value:low===high?low:`${low} ~ ${high}`,comparison,status,complete};
}
function Q4ResultSummary(mode,monthly,once){
 const card=(kind,title,number)=>`<article class="q4-result-card" data-card-kind="${kind}"><div class="q4-result-card-title" data-result-title="${kind}">${escapeHTML(title)}</div><div class="q4-result-number-row"><span class="q4-result-number" data-result-value="${kind}" data-pending="${number==='—'}">${escapeHTML(number)}</span>${kind==='once'?`<span class="q4-result-once-unit" aria-hidden="true">${unit()}</span>`:''}</div><div class="q4-result-card-foot">${kind==='once'?`<span data-result-count>${once?.indexes.length||0}개 사업장</span>`:`${kind==='usage'?quantityLabel(regularContext.line):unit()} / 월`}</div></article>`;
 const onceValue=once?.complete?once.total.toLocaleString('ko-KR'):'—';
 return `<section class="qa-form-section q4-result-section" data-section="results" data-summary-mode="${mode}" aria-label="납품 예상 요약"><h3 class="qa-result-heading" tabindex="-1">${mode==='both'?'납품 예상 요약':mode==='monthly'?'월간 납품 예상':'1회 주문 예상'}</h3><div class="q4-result-grid">${monthly?card('usage','기존 사용량',monthly.usage)+card('monthly',monthly.periodLabel||'월간 납품 예상',monthly.value):''}${once?card('once','1회 주문',onceValue):''}${monthly?`<div class="q4-result-comparison" data-result-status data-comparison="${monthly.comparison}">${escapeHTML(monthly.status)}</div>`:''}</div></section>`;
}
function refreshResultsOnly(){refreshQuantitySupport();const host=$('q4-regular-fields');if(!host)return;const t=document.createElement('template');t.innerHTML=resultSection();const fresh=t.content.firstElementChild,current=host.querySelector(':scope > [data-section="results"]');
 if(!fresh){current?.remove();return;}if(!current){host.append(fresh);observeResults();return;}
 if(current.dataset.summaryMode!==fresh.dataset.summaryMode){current.dataset.summaryMode=fresh.dataset.summaryMode;current.replaceChildren(...fresh.childNodes);observeResults();return;}
 for(const s of ['[data-result-title="monthly"]','[data-result-value="usage"]','[data-result-value="monthly"]','[data-result-value="once"]','[data-result-count]','[data-result-status]']){const a=current.querySelector(s),b=fresh.querySelector(s);if(a&&b){if(a.textContent!==b.textContent)a.textContent=b.textContent;for(const k of ['pending','comparison'])if(b.dataset[k]!==undefined)a.dataset[k]=b.dataset[k];}}
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
function endRegularClose(){monthlyEditor?.cancel();monthlyEditor=null;cancelAnimationFrame(popupBadgeFrame);popupBadgeFrame=0;resultObserver?.disconnect();bridge.closed();regularContext=null;}
window.OrderQ4Review=Object.freeze({open:initializeFromRegular,close:closeProductModal,complete:disposeProductModal,validate:validateForSave,commitError:showCommitError,
 get allocation(){return monthlyEditor?clone({evaluation:monthlyEditor.evaluate(),rows:monthlyEditor.rows,revision:monthlyEditor.session?.revision}):null;},get draft(){return regularContext?clone(state):null;},get serialized(){return regularContext?serializedAllocations():null;},get context(){return regularContext?clone(regularContext):null;}});
// Global/single-site holiday view uses the same group-owned feedback as the preserved per-site view.
function refreshHolidayStatus(){const p=$('qa-holiday')||$('qa-holiday-direct');if(!p)return;const st=holidayStatus();p.dataset.state=st;p.dataset.complete=String(st==='complete');p.dataset.error=String(st==='error');
 const days=p.querySelector('.qa-holiday-days'),missing=!(state.holidayNone||state.holidayIrregular||state.holidayDays.length),dayBad=state.attempted&&missing;
 if(days){days.dataset.error=String(dayBad);days.setAttribute('tabindex','-1');days.setAttribute('aria-invalid',String(dayBad));days.setAttribute('aria-describedby','qa-global-holiday-days-error');let note=$('qa-global-holiday-days-error');if(!note){note=document.createElement('p');note.id='qa-global-holiday-days-error';note.className='qa-error ui-feedback-sr';days.after(note);}note.textContent=dayBad?'매장 정기 휴무일을 선택해주세요.':'';note.hidden=!dayBad;}
 const trigger=p.querySelector('[data-combo="holiday-conflict"]'),bad=state.attempted&&!comboSelected('conflict',state.holiday.conflict);if(trigger){trigger.dataset.error=String(bad);trigger.setAttribute('aria-invalid',String(bad));trigger.setAttribute('aria-describedby','qa-global-conflict-error');let note=$('qa-global-conflict-error');if(!note){note=document.createElement('p');note.id='qa-global-conflict-error';note.className='qa-error ui-feedback-sr';trigger.closest('.qa-combo').after(note);}note.textContent=bad?'휴무일 납품 충돌 시 대응을 선택해주세요.':'';note.hidden=!bad;}
 if(st==='complete'){p.classList.remove('qa-shake');p.getAnimations().filter(a=>a.animationName==='qaShake').forEach(a=>a.cancel());}
 schedulePopupBadges();
}
function exposeHolidayInvalid(){if(holidayComplete()){refreshHolidayStatus();return;}state.attempted=true;state.advancedOpen=true;const done=setOpen('qa-holiday',true);refreshHolidayStatus();const epoch=++q4ValidationEpoch;
 Promise.resolve(done).then(()=>q4AfterFrame()).then(()=>q4AfterFrame()).then(()=>{if(epoch!==q4ValidationEpoch||holidayComplete()||state.dialogClosed)return;const p=$('qa-holiday')||$('qa-holiday-direct'),missing=!(state.holidayNone||state.holidayIrregular||state.holidayDays.length),target=p?.querySelector(missing?'.qa-holiday-days':'[data-combo="holiday-conflict"]');if(!target)return;
 const scroll=$('q4-regular-scroll'),r=target.getBoundingClientRect(),s=scroll.getBoundingClientRect();scroll.scrollTop=Math.max(0,Math.min(scroll.scrollHeight-scroll.clientHeight,scroll.scrollTop+r.top-s.top-12));target.focus({preventScroll:true});
 if(!matchMedia('(prefers-reduced-motion:reduce)').matches){p.classList.remove('qa-shake');void p.offsetWidth;p.classList.add('qa-shake');p.addEventListener('animationend',()=>p.classList.remove('qa-shake'),{once:true});}
 });
}

// Quantity and range feedback use the same exact contract as the estimate.
function quantityFeedbackVisible(i,key){
 if(state.attempted||state.quantityTouched?.has(`${i}:${key}`))return true;
 const v=state.values[i]||{};
 // Editing M can invalidate the already entered Q. Paint the cause at Q,
 // while a never-edited, empty Q remains neutral until validation.
 if(key==='base'&&state.quantityTouched?.has(`${i}:monthly`)&&isValid(v.monthly)&&isValid(v.base)&&BigInt(v.base)>BigInt(v.monthly))return true;
 if(['min','max'].includes(key)){
  if(state.quantityTouched?.has(`${i}:${key==='min'?'max':'min'}`))return true;
  if(state.quantityTouched?.has(`${i}:base`)&&isValid(v[key])){const issue=quantityIssue({monthly:v.monthly,quantity:v.base,min:v.min,max:v.max,variable:state.variable[i],unit:unit()});return issue.field===key&&['Q_BELOW_MIN','Q_ABOVE_MAX'].includes(issue.code);}
 }
 return false;
}
function q4QuantityMessage(i,key){const v=state.values[i]||{},suffix=unit();
 if(key==='once')return !isValid(v.once)?`1${suffix} 이상 입력해 주세요.`:'';
 if(key==='monthly'){if(v.monthly==='')return '월 주문 수량을 입력해 주세요.';if(!isValid(v.monthly))return `월 수량은 1${suffix} 이상이어야 합니다.`;return q4QuantityInvalid(i,key)?'이 사업장 수량을 확인해 주세요.':'';}
 const issue=quantityIssue({monthly:v.monthly,quantity:v.base,min:v.min,max:v.max,variable:state.variable[i],unit:suffix});
 if(issue.field===key)return issue.message;
 if(key==='base'&&siteMode(i)==='FLEX'&&q4QuantityInvalid(i,key))return '회당 수량을 확인해 주세요.';
 return '';
}
function q4QuantityInvalid(i,key){const v=state.values[i]||{};if(key==='monthly'){const evaluation=monthlyEditor?.evaluate(),row=evaluation?.normalized?.sites?.find(x=>x.locationId===monthlyLocation(i));return !row||!['VALID'].includes(row.status)||evaluation.status==='INVALID'||evaluation.status==='POLICY_UNRESOLVED';}
 if(!isValid(v[key]))return true;if(siteMode(i)==='ONCE')return false;
 if(key==='base'){if(isValid(v.monthly)&&BigInt(v.base)>BigInt(v.monthly))return true;if(siteMode(i)==='FLEX'){const checked=orderQuantityInput({mode:'FLEX',monthlyPlan:monthlyRow(i)?.quantity.raw||'',quantity:v.base,asOfLocalDate:state.asOfLocalDate,phase:'commit',direct:false});if(!checked.valid||checked.changed)return true;}return false;}
 if(!state.variable[i])return false;
 const issue=quantityIssue({monthly:v.monthly,quantity:v.base,min:v.min,max:v.max,variable:true,unit:unit()});return !issue.valid&&issue.field===key;
}
function syncRegularQuantityErrors(i){const root=$(`site-${i}`)||$('single-site');root?.querySelectorAll('[data-qty]').forEach(el=>{const [si,key]=el.dataset.qty.split(':');if(+si!==i)return;const invalid=quantityFeedbackVisible(i,key)&&q4QuantityInvalid(i,key);el.setAttribute('aria-invalid',String(invalid));const group=el.closest('.qa-field');if(group){group.dataset.error=String(invalid);const note=group.querySelector('[data-quantity-error]');if(note){note.hidden=!invalid;note.textContent=invalid?q4QuantityMessage(i,key):'';}}});}


return window.OrderQ4Review;
}
