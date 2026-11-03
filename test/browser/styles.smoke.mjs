/** Actual Chromium computed-style comparison of a pinned CSS fixture and build.
 * Representative synthetic DOM only: no product JS, DNS, storage or public host.
 * npm run build && node test/browser/styles.smoke.mjs
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const currentPath=resolve(root,process.env.ORDER_STYLE_CURRENT_CSS||'dist/styles.css');
const evidence=resolve(process.env.ORDER_STYLE_EVIDENCE_DIR||join(root,'browser-evidence/styles'));
const widths=[320,375,390,768,1440],checks=[],observations=[],pageErrors=[],externalRequests=[];
const report={schemaVersion:1,classification:'ACTUAL_CHROMIUM_COMPUTED_STYLES_SYNTHETIC_DOM_SET_CONTENT',status:'RUNNING',
 scope:{productJavaScript:false,sourceDelivery:'setContent',publicHosting:false,dns:false,storage:false,
   visualAcceptance:false,runtimePerformance:false,fullProductRegression:false},checks,observations,pageErrors,externalRequests};
const hash=b=>createHash('sha256').update(b).digest('hex');
const check=(id,passed,details={})=>{checks.push({id,status:passed?'PASS':'FAIL',...details});return passed;};
const chevron='<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M4 7l6 6 6-6"/></svg>';
const properties=['display','color','backgroundColor','borderTopColor','borderTopWidth','borderTopStyle','borderRadius',
 'borderBottomColor','borderBottomWidth','borderBottomStyle','boxShadow','outlineColor','outlineStyle','outlineWidth','outlineOffset','fontFamily','fontSize','fontWeight','lineHeight',
 'letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft',
 'columnGap','rowGap','gridTemplateColumns','gridTemplateRows','gridColumnStart','gridColumnEnd','gridRowStart','gridRowEnd',
 'alignItems','justifyContent','opacity','cursor','minHeight','maxWidth','overflowX','overflowY'];
const q4Shell=body=>`<dialog id="q4-regular-dialog" class="q4-regular-dialog" data-probe="shell"><div class="q4-regular-panel"><header class="q4-regular-head"><strong>납품 조건</strong></header><div class="q4-regular-scroll">${body}</div></div></dialog>`;
const pairDOM='<main id="page-form" class="page active"><div class="main"><div id="q2-lines"><fieldset class="line-panel"><legend>합성 품목</legend><div class="pair" data-probe="pair"><div class="numeric-field ui-egg-field" data-probe="first"><label>월 구매량</label><div class="input-unit ui-egg-number"><input value="200"><span class="qa-unit" data-probe="input-unit">판</span></div></div><div class="numeric-field ui-egg-field" data-probe="second"><label>현재 구매가격</label><div class="input-unit ui-egg-number"><input value="8000"><span>원/판</span></div></div></div></fieldset></div></div></main>';
function inputDOM(owner,invalid){
 const attr=`aria-invalid="${invalid}" data-probe="input" value="200"`;
 if(owner==='q2')return `<main id="page-form" class="page active"><div class="main"><div id="q2-lines"><div class="numeric-field ui-egg-field"><label>합성 월 구매량</label><div class="input-unit ui-egg-number" data-probe="input-parent"><input type="text" ${attr}><span class="qa-unit" data-probe="input-unit">판</span></div></div></div></div></main>`;
 if(owner==='q3')return `<div class="main"><div id="site-editor"><label>합성 사업장</label><div class="ui-input-field" data-field-size="name" data-probe="input-parent"><input class="text-input ui-input-control" type="text" ${attr}></div></div></div>`;
 return q4Shell(`<div class="ui-input-field ui-egg-field" data-field-size="quantity"><div class="qa-number input-unit ui-egg-number" data-probe="input-parent"><input type="text" inputmode="numeric" ${attr}><span class="qa-unit" data-probe="input-unit">판</span></div></div>`);
}
function buttonDOM(owner){
 const cancel='<button type="button" class="ui-transaction-action" data-probe="cancel">취소</button>';
 const apply='<button type="button" class="ui-transaction-action ui-transaction-action--danger" data-probe="confirm">삭제</button>';
 if(owner==='q4editor')return `<dialog id="q4-regular-dialog" class="q4-regular-dialog" data-probe="shell"><div class="q4-regular-panel"><header class="q4-regular-head"><strong>납품 조건</strong></header><div class="q4-regular-scroll"><p>합성 조건</p></div><footer class="q4-regular-actions ui-transaction-group" data-probe="actions">${cancel}${apply.replace('ui-transaction-action--danger','ui-transaction-action--primary').replace('삭제','저장')}</footer></div></dialog>`;
 const id={q1:'sku-delete-dialog',q3:'q3-action-confirm',q4:'q4-delete-confirm'}[owner];
 return `<dialog id="${id}" class="q1-sku-dialog q1-delete-dialog t-modal" data-probe="shell"><p>합성 항목을 삭제할까요?</p><div class="sku-delete-actions ui-transaction-group" data-probe="actions">${cancel}${apply}</div></dialog>`;
}
function monthDOM(value){
 const blank=value==='',last=value==='말일',selected=!blank;
 return q4Shell(`<section class="qa-form-section qa-repeat-section" data-section="repeat"><div class="qa-inline-pair" style="display:block"><div class="qa-field"><label class="qa-label">납품일</label><div class="qa-combo-trigger qa-combo-editable" data-probe="month-control" data-selected="${selected}" data-error="false" data-variant="editable"><span class="qa-month-value" data-probe="month-value"><input type="text" data-month-date="date" data-probe="month-input" inputmode="numeric" autocomplete="off" placeholder="직접 입력" value="${value}" ${last?'readonly':''} size="${Math.max(1,value.length)}" style="--ui-month-width:${last?'2em':Math.max(1,value.length)+'ch'}"><span class="qa-month-suffix" data-probe="month-suffix" ${blank||last?'hidden':''}>일</span></span><button type="button" data-combo="date" data-probe="month-arrow"><span class="t-acc-chevron">${chevron}</span></button></div></div></div></section>`);
}
function restoredDOM(kind,invalid){
 const attr=`aria-invalid="${invalid}"`,input=(extra='')=>`<input data-probe="input" ${attr} value="대표 입력" ${extra}>`;
 if(kind==='phone')return `<div class="main"><div class="ui-phone-shell" data-probe="control" ${attr}>${input('class="ui-phone-part"')}<span class="ui-phone-separator">-</span><input class="ui-phone-part" value="2345"><span class="ui-phone-separator">-</span><input class="ui-phone-part" value="6789"></div></div>`;
 if(kind==='address')return `<div class="main"><div class="ui-search-field ui-field__control ui-input-control" data-probe="control">${chevron}${input('class="text-input"')}</div></div>`;
 if(kind==='dropdown')return q4Shell(`<div class="qa-field"><button data-probe="input" class="qa-combo-trigger ui-input-control" ${attr}><span>매주</span>${chevron}</button></div>`);
 if(kind==='date')return q4Shell(`<div class="qa-date-anchor" data-probe="control" data-date-error="${invalid}"><div class="qa-date-segments">${input('data-date-part="year"')}<span>년</span><input value="11"><span>월</span><input value="30"><span>일</span></div><button class="qa-calendar-trigger">${chevron}</button></div>`);
 return q4Shell(`<div class="qa-field"><textarea data-probe="input" class="ui-input-control" ${attr}>추가 요청</textarea></div>`);
}

const flatten=(obj,prefix='',out={})=>{for(const [key,value]of Object.entries(obj)){const p=prefix?prefix+'.'+key:key;if(value!==null&&typeof value==='object')flatten(value,p,out);else out[p]=value;}return out;};
function differences(a,b){const x=flatten(a),y=flatten(b);return [...new Set([...Object.keys(x),...Object.keys(y)])].filter(k=>typeof x[k]==='number'&&typeof y[k]==='number'?Math.abs(x[k]-y[k])>0.05:x[k]!==y[k]).map(path=>({path,before:x[path],after:y[path]}));}
// MSG0528 authorizes only egg-number geometry and the shared pair gap.
// Non-egg morphology is compared exactly against the pinned 6768f95 source.
const near=(a,b)=>Math.abs(a-b)<=.1;
function eggContract(after,options){
 const i=after.input,p=after['input-parent'],u=after['input-unit'];
 const color=options.invalid?'rgb(217, 45, 72)':options.state==='focus-visible'?'rgb(49, 93, 222)':'rgb(203, 213, 220)';
 return near(i.rect.height,44)&&near(p.rect.height,45)&&near(i.rect.y,p.rect.y)&&i.style.fontSize==='19px'&&i.style.fontWeight==='750'&&i.style.color==='rgb(32, 39, 42)'&&i.style.paddingTop==='0px'&&i.style.paddingBottom==='0px'&&i.style.borderRadius==='0px'&&p.style.borderTopWidth==='0px'&&p.style.borderBottomWidth==='1px'&&p.style.borderBottomColor===color&&p.style.backgroundColor==='rgb(255, 255, 255)'&&p.style.alignItems==='center'&&u&&near(u.rect.x-i.rect.x-i.rect.width,6)&&p.rect.width<160&&i.rect.width>=30;
}
function pairContract(after){
 const p=after.pair,a=after.first.rect,b=after.second.rect,sameRow=near(a.y,b.y);
 return p.style.columnGap==='24px'&&p.style.rowGap==='18px'&&near(a.width,b.width)&&a.width>0&&(sameRow?near(b.x-a.x-a.width,24):near(a.x,b.x)&&near(b.y-a.y-a.height,18));
}
const numericPairDOM=({qty,price,unit,invalid})=>`<main id="page-form" class="page active"><div class="main"><div id="q2-lines"><fieldset class="line-panel"><legend>합성 품목</legend><div class="pair"><div class="numeric-field ui-egg-field"><label data-probe="qty-label">월 구매량</label><div class="input-unit ui-egg-number" data-probe="qty-row" data-order-invalid="${invalid}"><input data-probe="qty-input" value="${qty}" aria-invalid="${invalid}" placeholder="0"><select class="ui-quantity-unit" data-probe="qty-unit"><option>${unit}</option></select></div></div><div class="numeric-field ui-egg-field"><label data-probe="price-label">현재 구매가격</label><div class="input-unit ui-egg-number" data-probe="price-row" data-order-invalid="${invalid}"><input data-probe="price-input" value="${price}" aria-invalid="${invalid}" placeholder="0"><span data-probe="price-unit">원/판</span></div></div></div></fieldset></div></div></main>`;
let browser;
async function observe(page,css,html,{width,state='default',target=null,kind,id}){
 await page.setViewportSize({width,height:900});await page.mouse.move(0,0);
 await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body>${html}</body></html>`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{document.querySelector('dialog')?.showModal();document.activeElement?.blur();document.querySelectorAll('.ui-egg-number>input').forEach(el=>el.style.setProperty('--ui-number-ch',String(el.value.length)));});
 if(target){
  const control=page.locator(`[data-probe="${target}"]`);
  if(state==='disabled')await control.evaluate(el=>el.disabled=true);
  if(state==='hover'||state==='active')await control.hover();
  if(state==='active')await page.mouse.down();
  if(state==='focus-visible'){await page.keyboard.press('Tab');await control.focus();}
 }
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const values=await page.evaluate(({properties,kind})=>{
  const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const output={};for(const el of document.querySelectorAll('[data-probe]')){
   const key=el.dataset.probe;
   // Pair's child geometry is an explicit expected-delta target. Do not broadly
   // allow arbitrary child style differences when malformed CSS is repaired.
   if(kind==='pair'&&key!=='pair'){output[key]={rect:rect(el)};continue;}
   const cs=getComputedStyle(el),style=Object.fromEntries(properties.map(p=>[p,cs[p]]));
   const r=rect(el);output[key]={style,rect:r};
   if(el.matches('button,input'))output[key].pseudo={hover:el.matches(':hover'),active:el.matches(':active'),focusVisible:el.matches(':focus-visible'),disabled:el.matches(':disabled')};
   if(el.matches('button')&&el.firstChild){const range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect();output[key].text={width:t.width,height:t.height,x:t.x-r.x,y:t.y-r.y};}
  }return output;
 },{properties,kind});
 if(state==='active')await page.mouse.up();
 if(process.env.ORDER_STYLE_SCREENSHOTS==='1'&&width===320&&state==='default')await page.screenshot({path:join(evidence,`${id}-${kind}.png`)});
 return values;
}
try{
 await mkdir(evidence,{recursive:true});
 const parent=await readFile(join(root,'test/fixtures/browser/styles-6768f95.css'));
 if(parent.length!==177192||hash(parent)!=='63e34cefe835ae172b4bb70af17920a8e48c7be2f0ac0cc29db0b960dbe7a916')throw Error('Pinned 6768f95 CSS fixture mismatch');
 const current=await readFile(currentPath);
 report.source={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  parent:{commitSha:'6768f95e759652bdaadbd15fab406e0deebf0393',cssSha256:hash(parent),bytes:parent.length},
  current:{path:relative(root,currentPath),cssSha256:hash(current),bytes:current.length,builtAsset:currentPath===join(root,'dist/styles.css')}};
 if(report.source.current.builtAsset){
  const identity=JSON.parse(await readFile(join(root,'dist/build-identity.json'),'utf8'));
  if(identity.scope!=='INTEGRATED_PRODUCT')throw Error('Style comparison requires the integrated product build');
  report.source.buildIdentity={commitSha:identity.commitSha,uxHandoff:identity.uxHandoff,scope:identity.scope};
 }
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 report.runtime={node:process.version,platform:process.platform,browser:browser.version(),headless:true};
 const context=await browser.newContext({reducedMotion:'reduce'});
 await context.route('**/*',async route=>{externalRequests.push(route.request().url());await route.abort('blockedbyclient');});
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>pageErrors.push(String(e)));
 async function compare(id,html,options){
  const before=await observe(page,parent.toString(),html,{...options,id:id+'-before'});
  const after=await observe(page,current.toString(),html,{...options,id:id+'-after'});
  const delta=differences(before,after),egg=options.kind==='input'&&options.owner!=='q3',pair=options.kind==='pair';
  const accepted=egg?eggContract(after,options):pair?pairContract(after):delta.length===0;
  observations.push({id,...options,before,after,delta,classification:egg?'EXPECTED_MSG0528_EGG_COMPACT_VARIANT':pair?'EXPECTED_MSG0528_COMMON_PAIR_GAP':delta.length?'UNEXPECTED_STYLE_OR_GEOMETRY_CHANGE':'UNCHANGED'});
  check(id+':COMPARISON',accepted,{deltaCount:delta.length,eggVariant:egg,sharedPair:pair});
  if(options.target&&['hover','active','focus-visible','disabled'].includes(options.state)){
   const key={'focus-visible':'focusVisible',hover:'hover',active:'active',disabled:'disabled'}[options.state];
   if(before[options.target].pseudo)check(id+':STATE_ACTUALLY_ACTIVE',before[options.target].pseudo[key]&&after[options.target].pseudo[key]);
  }
  if(options.kind==='input'&&options.invalid)check(id+':INVALID_FOCUS_OWNER',before.input.style.boxShadow==='none'&&after.input.style.boxShadow==='none');
  if(options.kind==='month'){
   const control=after['month-control'],value=after['month-value'],arrow=after['month-arrow'];
   check(id+':ONE_ROW_CENTER',value.style.gridRowStart==='1'&&arrow.style.gridRowStart==='1'&&Math.abs(value.rect.y+value.rect.height/2-control.rect.y-control.rect.height/2)<=0.5&&Math.abs(value.rect.x+value.rect.width/2-control.rect.x-control.rect.width/2)<=0.5);
  }
  return after;
 }

 for(const width of widths){
  await compare(`PAIR_${width}`,pairDOM,{width,kind:'pair'});
  for(const value of ['','1','123456789'])for(const unit of ['개','판'])for(const invalid of [false,true])for(const state of ['default','focus-visible']){
   const id=`NUMERIC_CURRENT_${width}_${value||'BLANK'}_${unit}_${invalid?'ERROR':'NORMAL'}_${state}`;
   const currentValues=await observe(page,current.toString(),numericPairDOM({qty:value,price:value,unit,invalid}),{width,state,target:'qty-input',kind:'numeric-current',id});
   const q=currentValues['qty-input'],p=currentValues['price-input'],qr=currentValues['qty-row'],pr=currentValues['price-row'],ql=currentValues['qty-label'],pl=currentValues['price-label'];
   const equal=keys=>keys.every(k=>q.style[k]===p.style[k]);
   check(id+':CONTROL_HEIGHT_BASELINE',Math.abs(qr.rect.height-45)<.1&&Math.abs(pr.rect.height-45)<.1&&Math.abs(q.rect.height-44)<.1&&Math.abs(p.rect.height-44)<.1&&equal(['fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingBottom']));
   check(id+':LABEL_SPACING_TARGET',Math.abs(qr.rect.y-ql.rect.y-ql.rect.height-10.4)<.1&&Math.abs(pr.rect.y-pl.rect.y-pl.rect.height-10.4)<.1&&currentValues['qty-unit'].rect.height>=44&&currentValues['qty-unit'].rect.width>=44);
   observations.push({id,width,value,unit,invalid,state,after:currentValues,classification:'MSG0528_CURRENT_EGG_NUMERIC_EQUALITY'});
  }

  for(const owner of ['phone','address','dropdown','date','request'])for(const invalid of [false,true])for(const state of ['default','hover','focus-visible'])await compare(`RESTORE_${width}_${owner}_${invalid?'INVALID':'NORMAL'}_${state}`,restoredDOM(owner,invalid),{width,kind:'restored',owner,invalid,state,target:'input'});
  for(const owner of ['q2','q3','q4'])for(const invalid of [false,true])for(const state of ['default','hover','focus-visible'])
   await compare(`INPUT_${width}_${owner}_${invalid?'INVALID':'NORMAL'}_${state}`,inputDOM(owner,invalid),{width,kind:'input',owner,invalid,state,target:'input'});
  for(const owner of ['q1','q3','q4','q4editor'])for(const target of ['cancel','confirm'])for(const state of ['default','hover','active','focus-visible','disabled']){
   const after=await compare(`BUTTON_${width}_${owner}_${target}_${state}`,buttonDOM(owner),{width,kind:'button',owner,state,target});
   check(`BUTTON_${width}_${owner}_${target}_${state}:MINIMUM_TARGET`,after[target].rect.height>=44&&after[target].rect.width>=44);
  }
  for(const value of ['','1','9','10','31','말일'])for(const state of ['default','focus-visible'])
   await compare(`MONTH_${width}_${value||'BLANK'}_${state}`,monthDOM(value),{width,kind:'month',value,state,target:'month-input'});
 }
 check('NO_PAGE_ERRORS',pageErrors.length===0,{pageErrors});check('NO_EXTERNAL_REQUESTS',externalRequests.length===0,{externalRequests});
 report.status=checks.every(c=>c.status==='PASS')?'PASS_SCOPED_STYLE_COMPARISON':'FAIL_UNEXPECTED_DIFFERENCES';
 if(report.status!=='PASS_SCOPED_STYLE_COMPARISON')process.exitCode=1;
}catch(error){report.status='FAIL_EXECUTION';report.error=String(error.stack||error);process.exitCode=1;}
finally{
 await browser?.close();await mkdir(evidence,{recursive:true});
 report.summary={comparisons:observations.length,checks:checks.length,failures:checks.filter(c=>c.status==='FAIL').length,unchanged:observations.filter(o=>o.classification==='UNCHANGED').length,eggVariantCases:observations.filter(o=>o.classification==='EXPECTED_MSG0528_EGG_COMPACT_VARIANT').length,commonPairCases:observations.filter(o=>o.classification==='EXPECTED_MSG0528_COMMON_PAIR_GAP').length,currentNumericCases:observations.filter(o=>o.classification==='MSG0528_CURRENT_EGG_NUMERIC_EQUALITY').length};
 await writeFile(join(evidence,'styles.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,source:report.source,runtime:report.runtime,summary:report.summary,error:report.error,failedChecks:checks.filter(c=>c.status==='FAIL'),evidence:join(evidence,'styles.json')},null,2));
}
