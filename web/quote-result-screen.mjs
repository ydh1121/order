// This surface accepts an already authorized projection, or an explicitly isolated design fixture.
// It owns no network transport, credentials, quote persistence, contract rates or fixture amounts.
export function mountQuoteResult(host, options = {}) {
  const doc = host.ownerDocument;
  const clock = options.now || Date.now;
  const motion = () => !doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const node = (tag, cls, parent) => {
    const el = doc.createElement(tag);
    el.className = 'oq-' + cls;
    if (parent) parent.append(el);
    return el;
  };
  const text = (el, value) => {
    const next = value == null ? '' : String(value);
    if (el.textContent !== next) el.textContent = next;
  };
  const amount = value => {
    if (typeof value !== 'string' || !/^\d{1,100}(\.\d{1,12})?$/.test(value)) return '';
    const [whole, decimal] = value.split('.');
    const fraction = decimal?.replace(/0+$/, '');
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction ? '.' + fraction : '');
  };
  const won = value => amount(value) ? amount(value) + '원' : '';
  const dated = value => {
    if (!Number.isFinite(value)) return '';
    const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Seoul', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(value);
    const fields = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return fields.year + '.' + fields.month + '.' + fields.day;
  };
  let model = null, selection = null, detailRequest = 0, timer = 0, counter = 0;
  let guideSeen = false, dialog = null;
  const stage = node('article', 'screen');
  stage.setAttribute('data-order-result','');
  const brand = node('div','brand',stage);
  brand.setAttribute('role','img'); brand.setAttribute('aria-label','Order.'); brand.hidden=options.brand===false;
  const word = node('b','word',brand); text(word,'Order.');
  const ns='http://www.w3.org/2000/svg', icon=doc.createElementNS(ns,'svg');
  icon.setAttribute('viewBox','0 0 500 200'); icon.setAttribute('aria-hidden','true');
  // Resting geometry of the product's CODE1 jelly mark, in its native 200-unit circles.
  for(const [cx,fill] of [[100,'#F5800B'],[250,'#F59E0B'],[400,'#FFCC00']]){
    const circle=doc.createElementNS(ns,'circle'); circle.setAttribute('cx',cx); circle.setAttribute('cy','100');
    circle.setAttribute('r','100'); circle.setAttribute('fill',fill); icon.append(circle);
  }
  brand.append(icon);
  const heading = node('header','heading',stage);
  const lead = node('p','lead',heading), title = node('h2','title',heading);
  const number = node('span','number',heading), unit = node('span','unit',heading);
  const ending = node('p','ending',heading), sub = node('p','sub',heading);
  const meta = node('div','meta',stage);
  const dates = Array.from({length:3},()=>node('p','meta-line',meta));
  const plot = node('div','plot',stage);
  plot.setAttribute('role','group'); plot.setAttribute('aria-label','1회 납품가 비교');
  const series = {};
  for (const kind of ['current','proposed']) {
    const button = node('button','series',plot); button.type = 'button'; button.dataset.kind = kind;
    const graphLabel = node('span','graph-label',button);
    const name = node('span','name',graphLabel), price = node('strong','price',graphLabel);
    const priceValue = node('span','price-value',price), priceUnit = node('small','price-unit',price);
    const details = node('span','card-copy',button);
    const detailName = node('b','card-name',details), detailPrice = node('strong','card-price',details);
    const detailValue = node('span','card-value',detailPrice), detailUnit = node('small','card-unit',detailPrice);
    const annual = node('span','annual',details), rate = node('span','rate',details);
    const expiryNote = node('span','expiry-note',details), expiry = node('span','clock',details);
    const back = node('span','back-label',button);
    button.onclick = () => select(selection === kind ? null : kind);
    series[kind] = {button,name,priceValue,priceUnit,detailName,detailValue,detailUnit,annual,rate,expiryNote,expiry,back};
  }
  const guide = node('button','guide',stage); guide.type = 'button';
  text(guide,'그래프를 눌러 상세 가격을 확인하세요');
  function dismissGuide() {guideSeen = true; guide.hidden = true; options.onGuideSeen?.();}
  guide.onclick = dismissGuide;
  const notice = node('div','notice',stage);
  const note = node('p','note',notice), basis = node('p','basis',notice);
  const footer = node('footer','actions',stage);
  const first = node('button','secondary',footer), second = node('button','primary',footer);
  first.type = second.type = 'button';
  const stop = () => {clearTimeout(timer); cancelAnimationFrame(counter);};
  const clear = () => {
    detailRequest++; stop(); dialog?.close(); model = null; selection = null;
    host.replaceChildren(); delete host.dataset.state;
    // Remove sensitive text even from detached nodes owned by the controller.
    for(const el of [number,lead,ending,sub,...dates,note,basis,...Object.values(series).flatMap(s => [s.name,s.priceValue,s.priceUnit,s.detailName,s.detailValue,s.detailUnit,s.annual,s.rate,s.expiry,s.expiryNote,s.back])]) text(el,'');
    for(const s of Object.values(series)) s.button.removeAttribute('aria-label');
  };
  function chooseConditions() {
    if (dialog?.open) return;
    dialog = node('dialog','dialog',stage);
    dialog.setAttribute('aria-label','동일한 조건으로 다시 비교하겠어요?');
    const label = node('p','dialog-title',dialog); text(label,'동일한 조건으로 다시 비교하겠어요?');
    for (const [kind,label] of [['new','새로운 견적'],['same','동일한 조건'],['close','닫기']]) {
      const button = node('button','choice',dialog); button.type='button'; text(button,label);
      button.onclick=()=>{dialog.close(); if (kind !== 'close') options.onAction?.(kind);};
    }
    const own = dialog; own.addEventListener('close',()=>{own.remove(); if (dialog === own) dialog=null;},{once:true});
    own.showModal();
  }
  async function select(kind) {
    if (!model || !['saving','equal','current-lower','offer'].includes(model.state)) return;
    const generation = ++detailRequest;
    if (!guide.hidden) dismissGuide();
    try {
      const fresh = options.onDetail ? await options.onDetail(kind) : model;
      if (generation !== detailRequest) return;
      show(fresh,kind);
      options.onSelected?.(kind);
    } catch (err) {
      if (generation === detailRequest) show({state:[401,403].includes(err?.status) || err?.message==='ACCESS_REQUIRED' ? 'unverified' : 'unavailable'});
    }
  }
  function tick() {
    clearTimeout(timer);
    if (!model || !Number.isFinite(model.end) || !['saving','equal','current-lower','offer'].includes(model.state)) return;
    const ms = model.end - clock();
    if (ms <= 0) {show({state:'expired',issued:model.issued,end:model.end});return;}
    const seconds = Math.ceil(ms/1000);
    const pad = n => String(n).padStart(2,'0');
    text(series.proposed.expiry,Math.floor(seconds/86400)+'일 '+pad(Math.floor(seconds/3600)%24)+'시간 '+pad(Math.floor(seconds/60)%60)+'분 '+pad(seconds%60)+'초');
    timer = setTimeout(tick,Math.min(ms,1000));
  }
  function animatePrice(el,value) {
    const [whole,fraction=''] = value.split('.');
    const scale = 10n**BigInt(fraction.length), target = BigInt(whole+fraction);
    const start = performance.now();
    function frame(t) {
      const fractionDone = Math.min(1000,Math.max(0,Math.round((t-start)*1000/460)));
      const n = target*BigInt(fractionDone)/1000n;
      text(el,amount(String(n/scale)+(fraction?'.'+String(n%scale).padStart(fraction.length,'0'):'')));
      series.proposed.button.style.setProperty('--grow',String(fractionDone/1000));
      if (fractionDone<1000) counter=requestAnimationFrame(frame);
    }
    frame(start);
  }
  function show(raw,selected=null) {
    detailRequest++; stop();
    const prior = model, lastSelected = selection;
    const available = ['saving','equal','current-lower','offer'];
    let m = raw || {state:'unavailable'};
    if (available.includes(m.state) && Number.isFinite(m.end) && m.end<=clock()) m={state:'expired',end:m.end,issued:m.issued};
    model=m;
    const active=available.includes(m.state), detail=active && (selected==='proposed' || selected==='current' && m.current!==undefined);
    selection=detail ? selected : null;
    if (stage.parentNode !== host) host.replaceChildren(stage);
    stage.dataset.state=host.dataset.state=m.state;
    stage.dataset.selection=selection||'';
    // The source uses a zoomed price axis. Its two original unequal states
    // span the same reference-relative range (reference is the current price).
    // Project other relative differences continuously; retain a 12% touch target
    // for tiny positive prices, while a genuinely free quote gets no visible bar.
    const currentMoney=Number(m.current), proposedMoney=Number(m.proposed);
    const relativeSpread=currentMoney>0 && Number.isFinite(proposedMoney)
      ? Math.abs(proposedMoney-currentMoney)/currentMoney : 1;
    const shortLevel=Math.min(1,Math.max(.12,1-relativeSpread*5.38));
    const same=prior && prior.state===m.state && prior.proposed===m.proposed && prior.end===m.end && prior.current===m.current;
    const switched=detail && selection!==lastSelected && Boolean(prior) && same;
    stage.toggleAttribute('data-morph',Boolean(prior && same && selection!==lastSelected));
    const reduced=!motion();
    stage.toggleAttribute('data-static',!active || reduced);
    stage.dataset.kind=m.state==='saving'?'saving':m.state;
    const summaryTitles = {equal:'현재 납품가와\n가격이 동일해요','current-lower':'현재 납품가가\n더 낮아요',offer:'현재 가격 없이\n새 납품가를 확인해요',expired:'견적이 만료됐어요',recompare:'어떤 조건으로\n다시 비교할까요?',unverified:'사업자 확인 후\n납품가를 볼 수 있어요','no-offer':'길을 잃으셨나요?',unavailable:'견적을 불러올 수 없어요',pending:'납품가를 비교하고 있어요'};
    const labels={equal:'거래 변경 혜택을 확인해보세요','current-lower':'필요한 납품 조건을 요청해 주세요',offer:'이번 조건의 제안 납품가를 확인하세요.',expired:'새 견적으로 납품가를 확인해 보세요','no-offer':'표시할 견적을 찾을 수 없어요.',unavailable:'사업장과 견적 조건을 확인해 주세요.'};
    const saving = m.state==='saving', numeric=saving && Boolean(amount(m.difference));
    const currentSelected=selection==='current';
    const subject = m.productLabel || '';
    text(lead,numeric ? currentSelected ? '현재 납품가' : subject ? subject+(detail?', 이번 견적으로':' 구매가격') : '이번 견적으로' : '');
    text(number,numeric?amount(m.difference):''); text(unit,numeric?'원':'');
    text(ending,numeric?(currentSelected?'높은 가격이에요':'원가를 줄였어요'):'');
    text(title,numeric?'':summaryTitles[m.state]||'견적을 확인해 주세요'); text(sub,numeric?'':labels[m.state]);
    if (switched && !reduced && heading.animate) heading.animate([{opacity:0,transform:'translateY(.3em)'},{opacity:1,transform:'translateY(0)'}],{duration:210,easing:'ease-out'});
    for(const [kind,s] of Object.entries(series)) {
      const rawValue=active ? m[kind] : undefined;
      const formatted=amount(rawValue);
      s.button.hidden=!active || !formatted;
      const label=kind==='current'?'현재 납품가':saving?'최저가':m.state==='offer'?'제안 납품가':'검색된 가격';
      text(s.name,label); text(s.detailName,label); text(s.back,label);
      text(s.priceValue,formatted); text(s.detailValue,formatted);
      text(s.priceUnit,formatted?'원':''); text(s.detailUnit,formatted?'원':'');
      s.button.dataset.front=String(selection===kind);
      s.button.dataset.accent=String(kind===(m.state==='current-lower'?'current':'proposed'));
      s.button.setAttribute('aria-label',(kind==='proposed'?'제안 납품가':label)+' '+won(rawValue)+(selection===kind?' 요약 보기':' 상세 보기'));
      s.button.setAttribute('aria-pressed',String(selection===kind));
      const high=m.state==='offer'||m.state==='equal'||(kind==='current'?saving:m.state==='current-lower');
      s.button.style.setProperty('--level',Number(rawValue)===0?'0':high?'1':String(shortLevel));
      s.button.style.setProperty('--grow','1');
      const annual=active && saving && amount(m.annualSaving) ? '연간 약 '+won(m.annualSaving)+(kind==='current'?' 추가 지출':' 절감') : '';
      text(s.annual,annual);
      const rate=kind==='current' ? amount(m.unitDifference)?'한 판당 '+won(m.unitDifference)+' 더 비싼 가격':amount(m.currentPremium)?'최저가 대비 약 '+m.currentPremium+'% 비싸요':'' : amount(m.savingRate??m.rate)?'절감율 약 '+(m.savingRate??m.rate)+'%':'';
      text(s.rate,active && saving ? rate : '');
      text(s.expiryNote,kind==='proposed' && active && Number.isFinite(m.end)?'견적 만료 시 가격이 변동될 수 있어요':'');
      text(s.expiry,'');
    }
    const freshGraph=active && !detail && !same && !reduced && amount(m.proposed);
    if (freshGraph) animatePrice(series.proposed.priceValue,m.proposed);
    for(const [i,v] of (selection==='proposed'?[[m.basis || (m.quantityLabel?'동일한 1회 납품 기준':''),m.quantityLabel].filter(Boolean).join(' / '),dated(m.issued)?'견적 기준일 '+dated(m.issued):'',dated(m.end)?'견적 만료일 '+dated(m.end):'']:['','','']).entries()) text(dates[i],v);
    text(note,active?saving?'최종 가격과 납품 조건은 공급처 확인이 필요해요.':'납품 요청 시 공급 증빙이 필요해요.':m.state==='expired'&&dated(m.end)?'견적 만료일 '+dated(m.end):'');
    text(basis,active && Number.isSafeInteger(m.annualCount) && m.annualCount>0 ? '연 '+m.annualCount+'회 납품 기준' : '');
    guide.hidden=!(active && !detail && !guideSeen && (options.guide===true || m.guide===true));
    const buttons=active || m.state==='expired' ? [['consult','상담 예약'],detail?['delivery','납품 요청']:['recompare','다시 비교하기']]:
      m.state==='recompare'?[['new','새로운 견적'],['same','동일한 조건']]:m.state==='unverified'?[['back','내 입력 내용'],['verify','사업자 확인']]:[['back','이전 페이지로 돌아가기']];
    [first,second].forEach((b,i)=>{const choice=buttons[i];b.hidden=!choice;if(!choice)return;
      text(b,choice[1]);b.dataset.action=choice[0];b.onclick=()=>choice[0]==='recompare'?chooseConditions():options.onAction?.(choice[0]);});
    tick();
  }
  return {show,clear,chooseConditions,gate:()=>show({state:'unverified'}),empty:()=>show({state:'no-offer'})};
}

export const quoteResultScreenCss = `
[data-order-result]{--blue:#315de6;--ink:#20272b;--grey:#535f70;--muted:#7a879a;--pad:clamp(16px,6.4%,24px);--tall:clamp(122px,28.63svh,237px);--detail:clamp(164px,32.25svh,267px);position:relative;display:block;isolation:isolate;box-sizing:border-box;width:100%;max-width:590px;height:clamp(640px,100svh,920px);margin:0 auto;padding:0;background:#fff;color:var(--ink);font:400 16px/1.5 Arial,"Noto Sans KR","Noto Sans CJK KR",sans-serif;text-align:center}
[data-order-result] *,[data-order-result] *::before{box-sizing:border-box}
[data-order-result] [hidden]{display:none!important}
[data-order-result] :where(p,h2,footer){margin:0;padding:0;border:0;background:none}
[data-order-result] button{appearance:none;border:0;cursor:pointer;font:inherit;text-transform:none;letter-spacing:inherit;box-shadow:none}
[data-order-result] button:focus-visible{outline:3px solid #197ac4;outline-offset:3px}
[data-order-result] .oq-brand{position:absolute;left:var(--pad);top:23px;height:33px;display:flex;align-items:center;gap:3px;color:#20272b}.oq-brand .oq-word{font:1000 25px/1 Arial,sans-serif;letter-spacing:-1.6px;transform:scaleX(1.08);transform-origin:left;margin-right:4px}.oq-brand svg{width:52px;height:21px;display:block}
[data-order-result] .oq-heading{position:absolute;left:var(--pad);right:var(--pad);top:clamp(80px,13.4%,122px);padding:0;display:block;text-align:center;color:var(--ink);font:inherit;background:none}
[data-order-result] .oq-heading>*{padding:0;margin:0;color:inherit}
[data-order-result] .oq-lead{font-size:16px;font-weight:700;line-height:24px;margin-bottom:6px}
[data-order-result] .oq-title,[data-order-result] .oq-ending{font-size:27px;font-weight:700;line-height:1.46;white-space:pre-line;letter-spacing:-.045em}
[data-order-result] .oq-number{display:inline;font-size:44px;font-weight:700;letter-spacing:-.035em;line-height:56px;color:var(--blue);font-variant-numeric:tabular-nums}
[data-order-result] .oq-unit{font-size:28px;font-weight:700;line-height:1;color:var(--blue)}
[data-order-result][data-selection=current] :is(.oq-number,.oq-unit){color:#e53a2b}
[data-order-result] .oq-ending{margin-top:3px}
[data-order-result] .oq-sub{font-size:14px;color:var(--grey);margin:15px 0 0}
[data-order-result] :is(.oq-lead,.oq-title,.oq-number,.oq-unit,.oq-ending,.oq-sub,.oq-rate,.oq-annual,.oq-clock,.oq-expiry-note,.oq-meta-line):empty{display:none}
[data-order-result] .oq-plot{position:absolute;left:var(--pad);right:var(--pad);bottom:170px;height:var(--detail);isolation:isolate;pointer-events:none}
[data-order-result] .oq-series{position:absolute;bottom:0;width:53px;height:calc(var(--tall)*var(--level)*var(--grow));margin:0;padding:0;background:#dadada;color:var(--grey);border:0 solid transparent;border-radius:10px 10px 0 0;pointer-events:auto;box-shadow:0 15px 35px rgba(52,76,123,.035);overflow:visible;min-height:0;max-width:none}
[data-order-result] .oq-series[data-accent=true]{background:var(--blue);color:var(--blue)}
[data-order-result] .oq-series[data-kind=current]{left:calc(50% - 68.5px)}
[data-order-result] .oq-series[data-kind=proposed]{left:calc(50% + 16.5px)}
[data-order-result][data-state=offer] .oq-series[data-kind=proposed]{left:calc(50% - 26.5px)}
[data-order-result] .oq-graph-label{position:absolute;display:grid;gap:2px;min-width:max-content;bottom:calc(100% + 11px);line-height:20px;font-weight:700}
[data-order-result] [data-kind=current] .oq-graph-label{right:0;text-align:right}
[data-order-result] [data-kind=proposed] .oq-graph-label{left:0;text-align:left}
[data-order-result] .oq-name,[data-order-result] .oq-back-label{font-size:13px;letter-spacing:-.035em}
[data-order-result] .oq-price{font-size:16px;letter-spacing:-.035em;line-height:20px}
[data-order-result] .oq-price-unit{font-size:10px;margin-left:1px}
[data-order-result] .oq-card-copy,[data-order-result] .oq-back-label{position:absolute;inset:0;opacity:0;visibility:hidden;pointer-events:none}
[data-order-result][data-morph]:not([data-static]) .oq-series{transition:height .39s cubic-bezier(.25,.74,.2,1),width .39s cubic-bezier(.25,.74,.2,1),left .39s cubic-bezier(.25,.74,.2,1),border-radius .36s,background-color .34s,border-color .34s}
[data-order-result]:not([data-selection=""]) .oq-graph-label{visibility:hidden}
[data-order-result]:not([data-selection=""]) .oq-series{border-radius:18px}
[data-order-result]:not([data-selection=""]) [data-kind=current]{left:0;background:#dadada;color:var(--grey)}
[data-order-result]:not([data-selection=""]) [data-kind=proposed]{background:var(--blue);color:white}
[data-order-result]:not([data-selection=""]) [data-front=false]{height:calc(var(--detail)*.6592)}
[data-order-result][data-selection=proposed] [data-front=false]{width:38.55%}
[data-order-result][data-selection=current] [data-front=false]{left:52%;width:48%}
[data-order-result]:not([data-selection=""]) [data-front=false] .oq-back-label{display:flex;align-items:center;visibility:visible;opacity:1;font-weight:700}
[data-order-result] [data-kind=current] .oq-back-label{justify-content:flex-start;padding-left:6%}
[data-order-result] [data-kind=proposed] .oq-back-label{justify-content:flex-end;padding-right:20%}
[data-order-result]:not([data-selection=""]) [data-front=true]{z-index:2;height:var(--detail);width:70%;border:3px solid;box-shadow:0 10px 24px rgba(44,87,184,.1)}
[data-order-result][data-selection=proposed] [data-kind=proposed]{left:30%;background:white;color:var(--blue);border-color:var(--blue)}
[data-order-result][data-selection=current] [data-kind=current]{left:0;background:#f1f3f6;color:var(--grey);border-color:#818995}
[data-order-result] [data-front=true] .oq-card-copy{display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:1;visibility:visible;padding:8px;line-height:1.45}
[data-order-result][data-morph]:not([data-static]) [data-front=true] .oq-card-copy{animation:oq-detail-in .18s ease-out .39s backwards}
@keyframes oq-detail-in{from{opacity:0;visibility:hidden;transform:translateY(3px)}to{opacity:1;visibility:visible;transform:none}}
[data-order-result] .oq-card-name{font-size:17px;letter-spacing:-.045em;white-space:nowrap}
[data-order-result] .oq-card-price{font-size:27px;letter-spacing:-.045em;line-height:40px;font-weight:700;margin:6px 0 5px;overflow-wrap:anywhere}
[data-order-result] .oq-card-unit{font-size:17px}
[data-order-result] .oq-annual,[data-order-result] .oq-rate{font-size:12px;margin-top:4px;white-space:normal}
[data-order-result] .oq-rate{margin-top:11px}
[data-order-result] [data-kind=proposed] .oq-card-name{color:var(--ink)}
[data-order-result] [data-kind=proposed] .oq-card-copy{justify-content:flex-start;padding-top:clamp(7px,2.7svh,22px)}
[data-order-result] [data-kind=proposed] .oq-card-price{margin:6px 0 1px}
[data-order-result] .oq-expiry-note{position:absolute;bottom:25.8%;font-size:9px;color:var(--muted)}
[data-order-result] .oq-clock{position:absolute;bottom:7.5%;left:7.7%;right:7.7%;height:16%;min-height:26px;border-radius:10px;display:grid;place-items:center;color:#fff;background:var(--blue);font-size:12px;font-weight:700;white-space:nowrap}
[data-order-result] .oq-meta{position:absolute;background:none;top:auto;bottom:calc(178px + var(--detail));right:var(--pad);text-align:right;font-size:11px;line-height:18px;color:var(--muted)}
[data-order-result] .oq-meta-line{margin:0;font:inherit}
[data-order-result] .oq-meta-line:last-child{color:var(--blue)}
[data-order-result] .oq-guide{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(178px + var(--tall) + 58px);border-radius:16px;padding:5px 11px;white-space:nowrap;color:white;background:#374359;font-size:12px;min-height:34px}
[data-order-result] .oq-notice{position:absolute;bottom:108px;left:var(--pad);right:var(--pad);color:var(--muted);font-size:12px;line-height:18px}
[data-order-result] .oq-notice p{margin:0;font:inherit}
[data-order-result] .oq-notice .oq-basis{font-size:10px;line-height:14px;min-height:14px;margin-top:7px}
[data-order-result] .oq-actions{position:absolute;left:var(--pad);right:var(--pad);bottom:30px;display:flex;gap:10px;align-items:center;background:transparent;padding:0;margin:0}
[data-order-result] .oq-actions button{flex:1;min-width:0;height:54px;margin:0;padding:0 6px;border-radius:12px;font:700 17px/1.3 Arial,"Noto Sans KR","Noto Sans CJK KR",sans-serif;letter-spacing:-.045em}
[data-order-result] .oq-secondary{background:#f1f3f6;color:#353e4a}
[data-order-result] .oq-primary{background:var(--blue);color:white}
[data-order-result][data-state=unverified] .oq-plot{filter:blur(8px);background:linear-gradient(to top,#dadada,#dadada) 35% bottom / 15% 72% no-repeat,linear-gradient(to top,#697ea9,#697ea9) 65% bottom / 15% 54% no-repeat}
[data-order-result] .oq-dialog{border:0;border-radius:16px;padding:20px;max-width:calc(100% - 32px);color:var(--ink);background:white}
[data-order-result] .oq-dialog::backdrop{background:rgba(0,0,0,.35)}
[data-order-result] .oq-dialog-title{font-size:17px;font-weight:700;margin:0 0 15px}
[data-order-result] .oq-choice{min-height:44px;padding:0 12px;background:#f1f3f6;border-radius:8px;margin:2px;color:var(--ink)}
@media(max-height:720px){[data-order-result] .oq-meta{bottom:calc(164px + var(--detail))}[data-order-result] .oq-heading{top:74px}[data-order-result] .oq-number{font-size:38px;line-height:44px}[data-order-result] .oq-plot{bottom:156px}[data-order-result] .oq-expiry-note{display:none}[data-order-result] .oq-card-price{font-size:22px;line-height:28px}[data-order-result] .oq-annual,[data-order-result] .oq-rate{margin-top:2px}}
@media(prefers-reduced-motion:reduce){[data-order-result] .oq-series,[data-order-result] .oq-card-copy{animation:none!important;transition:none!important}}
`;
