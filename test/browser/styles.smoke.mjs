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
const pairDOM='<main id="page-form" class="page active"><div class="main"><div id="q2-lines"><fieldset class="line-panel"><legend>합성 품목</legend><div class="pair" data-probe="pair"><div class="numeric-field" data-probe="first"><label>월 구매량</label><div class="input-unit"><input value="200"><span>판</span></div></div><div class="numeric-field" data-probe="second"><label>현재 구매가격</label><div class="input-unit"><input value="8000"><span>원/판</span></div></div></div></fieldset></div></div></main>';
function inputDOM(owner,invalid){
 const attr=`aria-invalid="${invalid}" data-probe="input" value="200"`;
 if(owner==='q2')return `<main id="page-form" class="page active"><div class="main"><div id="q2-lines"><div class="numeric-field"><label>합성 월 구매량</label><div class="input-unit" data-probe="input-parent"><input type="text" ${attr}><span>판</span></div></div></div></div></main>`;
 if(owner==='q3')return `<div class="main"><div id="site-editor"><label>합성 사업장</label><div class="ui-input-field" data-field-size="name" data-probe="input-parent"><input class="text-input ui-input-control" type="text" ${attr}></div></div></div>`;
 return q4Shell(`<div class="ui-input-field" data-field-size="quantity"><div class="qa-number input-unit" data-probe="input-parent"><input type="text" inputmode="numeric" ${attr}><span class="qa-unit">판</span></div></div>`);
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
 return q4Shell(`<section class="qa-form-section qa-repeat-section" data-section="repeat"><div class="qa-inline-pair"><div><label class="qa-label">주기</label><button type="button" class="qa-combo-trigger"><span>매월</span><span>${chevron}</span></button></div><div><label class="qa-label">날짜</label><div class="qa-combo-trigger qa-combo-editable" data-probe="month-control" data-selected="${selected}" data-error="false" data-variant="editable"><span class="qa-month-value" data-probe="month-value"><input type="text" data-month-date="date" data-probe="month-input" inputmode="numeric" autocomplete="off" placeholder="직접 입력" value="${value}" ${last?'readonly':''} size="${Math.max(1,value.length)}" style="--ui-month-width:${last?'2em':Math.max(1,value.length)+'ch'}"><span class="qa-month-suffix" data-probe="month-suffix" ${blank||last?'hidden':''}>일</span></span><button type="button" data-combo="date" data-probe="month-arrow"><span class="t-acc-chevron">${chevron}</span></button></div></div></div></section>`);
}
const flatten=(obj,prefix='',out={})=>{for(const [key,value]of Object.entries(obj)){const p=prefix?prefix+'.'+key:key;if(value!==null&&typeof value==='object')flatten(value,p,out);else out[p]=value;}return out;};
function differences(a,b){const x=flatten(a),y=flatten(b);return [...new Set([...Object.keys(x),...Object.keys(y)])].filter(k=>typeof x[k]==='number'&&typeof y[k]==='number'?Math.abs(x[k]-y[k])>0.05:x[k]!==y[k]).map(path=>({path,before:x[path],after:y[path]}));}
// The pinned fixture and current product already share horizontal gutters.
// F02 changes only the four heights below; accepting an older 22px gutter repair
// here would both reject the intended height change and mask a new width change.
const pairAllow=new Set(['pair.style.gridTemplateRows','pair.rect.height','first.rect.height','second.rect.height']);
const numericAllow=new Set(['input.rect.height','input.rect.y','input.style.paddingTop','input.style.paddingBottom','input.style.lineHeight',
 'input-parent.rect.height','input-parent.style.alignItems','input-parent.style.minHeight']);
const numericContract=values=>{
 const i=values.input,p=values['input-parent'];
 return Math.abs(i.rect.height-44)<.1&&Math.abs(p.rect.height-45)<.1&&Math.abs(i.rect.y-p.rect.y)<.1&&
 i.style.paddingTop==='0px'&&i.style.paddingBottom==='0px'&&p.style.alignItems==='center'&&p.style.minHeight==='45px'&&
 Math.abs(parseFloat(i.style.lineHeight)-parseFloat(i.style.fontSize)*1.5)<.1;
};
// MSG0521 authorizes common header inset, a borderless editor footer and an
// 18px compact-confirm gap. Check the resulting geometry algebra explicitly;
// do not allow unrelated style, width, focus, colour or control-size changes.
const near=(a,b)=>Math.abs(a-b)<=.06;
function msg0521ShellDelta(before,after,options,delta){
 const editor=options.kind==='button'&&options.owner==='q4editor';
 const q4=options.kind==='month'||options.kind==='input'&&options.owner==='q4'||editor;
 const compact=options.kind==='button'&&['q1','q3','q4'].includes(options.owner);
 if(!q4&&!compact)return false;
 const header=q4?1.6:0,footer=editor?-1:0,gap=compact?18-parseFloat(before.actions.style.marginTop):0;
 const height=header+footer+gap,dy=-height/2;
 // Native showModal() resolves auto block margins to used pixel values. A
 // centered height change must move both computed margins by the same dy;
 // their one-layout-unit rounding may differ from the rect by < 0.06px.
 const allowed=new Set(['shell.rect.height','shell.rect.y','shell.style.marginTop','shell.style.marginBottom']);
 for(const name of Object.keys(after))if(name!=='shell')allowed.add(name+'.rect.y');
 if(editor)for(const path of ['actions.rect.height','actions.style.borderTopColor','actions.style.borderTopWidth','actions.style.borderTopStyle'])allowed.add(path);
 if(compact)allowed.add('actions.style.marginTop');
 if(!delta.every(d=>allowed.has(d.path))||!near(after.shell.rect.height-before.shell.rect.height,height)||!near(after.shell.rect.y-before.shell.rect.y,dy))return false;
 for(const margin of ['marginTop','marginBottom'])if(!near(parseFloat(after.shell.style[margin])-parseFloat(before.shell.style[margin]),dy))return false;
 for(const name of Object.keys(after))if(name!=='shell'){
  if(before[name].style.display==='none'&&after[name].style.display==='none'){
   if(!Object.values(before[name].rect).every(value=>value===0)||!Object.values(after[name].rect).every(value=>value===0))return false;
   continue;
  }
  const expected=compact?dy+gap:editor&&['cancel','confirm'].includes(name)?dy+header+footer:dy+header;
  if(!near(after[name].rect.y-before[name].rect.y,expected))return false;
 }
 if(editor&&(!near(after.actions.rect.height-before.actions.rect.height,-1)||after.actions.style.borderTopWidth!=='0px'||after.actions.style.borderTopStyle!=='none'||after.actions.style.borderTopColor!==after.actions.style.color))return false;
 if(compact&&after.actions.style.marginTop!=='18px')return false;
 return true;
}
// MSG0526 replaces box borders/padding with the existing Q2 underline owner.
// Only geometry and these declared primitive properties may differ from c024.
const fieldStyleDelta=new Set(['display','backgroundColor','borderTopColor','borderTopWidth','borderTopStyle','borderBottomColor','borderBottomWidth','borderBottomStyle','borderRadius','boxShadow','outlineColor','outlineStyle','outlineWidth','outlineOffset','fontSize','fontWeight','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','columnGap','rowGap','gridTemplateColumns','gridTemplateRows','alignItems','minHeight','maxWidth']);
function msg0526FieldDelta(before,after,options,delta){
 if(options.kind!=='input')return false;
 const i=after.input,p=after['input-parent'],q3=options.owner==='q3';
 const pathsAllowed=delta.every(d=>{
  const [probe,group,property]=d.path.split('.');
  if(!['input','input-parent','shell'].includes(probe))return false;
  if(group==='rect')return ['x','y','width','height'].includes(property);
  if(probe==='shell')return ['marginTop','marginBottom'].includes(property);
  return group==='style'&&fieldStyleDelta.has(property);
 });
 const underline=q3?i:p;
 const expectedFocus=options.state==='focus-visible',expectedLine=options.invalid?'rgb(217, 45, 72)':expectedFocus?'rgb(49, 93, 222)':'rgb(203, 213, 220)';
 const baseline=near(i.rect.height,q3?45:44)&&i.style.paddingTop==='0px'&&i.style.paddingBottom==='0px'&&i.style.borderRadius==='0px'&&i.style.fontSize===(q3?'16px':'19px')&&i.style.fontWeight===(q3?'400':'750')&&underline.style.borderTopWidth==='0px'&&underline.style.borderBottomWidth==='1px'&&underline.style.borderBottomColor===expectedLine&&underline.style.backgroundColor==='rgb(255, 255, 255)';
 const widthLimit=q3?288:208;
 return pathsAllowed&&baseline&&underline.rect.width<=widthLimit+.1&&underline.rect.width>=100&&(!q3?numericContract(after):true);
}
const numericPairDOM=({qty,price,unit,invalid})=>`<main id="page-form" class="page active"><div class="main"><div id="q2-lines"><fieldset class="line-panel"><legend>합성 품목</legend><div class="pair"><div class="numeric-field"><label data-probe="qty-label">월 구매량</label><div class="input-unit" data-probe="qty-row" data-order-invalid="${invalid}"><input data-probe="qty-input" value="${qty}" aria-invalid="${invalid}" placeholder="0"><select class="ui-quantity-unit" data-probe="qty-unit"><option>${unit}</option></select></div></div><div class="numeric-field"><label data-probe="price-label">현재 구매가격</label><div class="input-unit" data-probe="price-row" data-order-invalid="${invalid}"><input data-probe="price-input" value="${price}" aria-invalid="${invalid}" placeholder="0"><span data-probe="price-unit">원/판</span></div></div></div></fieldset></div></div></main>`;
let browser;
async function observe(page,css,html,{width,state='default',target=null,kind,id}){
 await page.setViewportSize({width,height:900});await page.mouse.move(0,0);
 await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body>${html}</body></html>`,{waitUntil:'domcontentloaded'});
 await page.evaluate(()=>{document.querySelector('dialog')?.showModal();document.activeElement?.blur();});
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
 const parent=await readFile(join(root,'test/fixtures/browser/ux-c024.css'));
 if(parent.length!==171298||hash(parent)!=='9b507e09260b8d76c59136b4231fe86977f4130a3910ae9fb8c3175335de34c6')throw Error('Pinned c024 CSS fixture mismatch');
 const current=await readFile(currentPath);
 report.source={commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  parent:{htmlSha256:'c02467f859829b438b3142435fe4698f335c42bae592d9f32255774ffe210e16',cssSha256:hash(parent),bytes:parent.length},
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
  const delta=differences(before,after),known=options.kind==='pair'&&delta.length>0,numeric=options.kind==='input'&&options.owner==='q2';
  let accepted=delta.length===0;
  if(known){
   const b=before.pair.style,a=after.pair.style,expectedGap=options.width<375?'15px':'25px';
   accepted=delta.every(d=>pairAllow.has(d.path))&&a.columnGap===expectedGap&&b.columnGap===expectedGap&&a.rowGap==='12px'&&b.rowGap==='12px'&&
    Math.abs(after.first.rect.width-before.first.rect.width)<=.1&&Math.abs(after.second.rect.width-before.second.rect.width)<=.1&&
    Math.abs(after.first.rect.x-before.first.rect.x)<=.1&&Math.abs(after.second.rect.x-before.second.rect.x)<=.1&&
    Math.abs(after.second.rect.width-after.first.rect.width)<=.1&&
    Math.abs(after.second.rect.x-(after.first.rect.x+after.first.rect.width+parseFloat(expectedGap)))<=.1&&
    Math.abs(after.first.rect.height-(options.width<768?73.6:76.4))<=.1&&Math.abs(after.second.rect.height-after.first.rect.height)<=.1&&Math.abs(after.pair.rect.height-after.first.rect.height)<=.1;

  }
  if(numeric)accepted=delta.every(d=>numericAllow.has(d.path))&&numericContract(after);
  const msg0526=msg0526FieldDelta(before,after,options,delta);
  if(msg0526)accepted=true;
  const msg0521=delta.length>0&&msg0521ShellDelta(before,after,options,delta);
  if(msg0521)accepted=true;
  const expectedClass=msg0526?'EXPECTED_MSG0526_SHARED_INPUT_PRIMITIVE':msg0521?'EXPECTED_MSG0521_COMMON_MODAL_INSET_GAP_FOOTER':numeric?'EXPECTED_MSG0517_NUMERIC_ROW_GEOMETRY':known?'EXPECTED_MSG0517_PAIR_NUMERIC_HEIGHT':null;
  observations.push({id,...options,before,after,delta,classification:delta.length?(accepted?expectedClass:'UNEXPECTED_STYLE_OR_GEOMETRY_CHANGE'):'UNCHANGED'});
  check(id+':COMPARISON',accepted,{deltaCount:delta.length,knownPairDelta:known,msg0517Numeric:numeric,msg0521CommonShell:msg0521,msg0526SharedInput:msg0526});
  if(numeric)check(id+':NUMERIC_ROW_CONTRACT',numericContract(after));
  if(options.target&&['hover','active','focus-visible','disabled'].includes(options.state)){
   const key={'focus-visible':'focusVisible',hover:'hover',active:'active',disabled:'disabled'}[options.state];
   check(id+':STATE_ACTUALLY_ACTIVE',before[options.target].pseudo[key]&&after[options.target].pseudo[key]);
  }
  if(options.kind==='input'&&options.invalid){const expected=options.owner==='q3'&&options.state==='focus-visible'?'rgb(217, 45, 72) 0px -1px 0px 0px inset':'none';check(id+':INVALID_FOCUS_OWNER',before.input.style.boxShadow==='none'&&after.input.style.boxShadow===expected,{before:before.input.style.boxShadow,after:after.input.style.boxShadow,expected});}
  if(options.kind==='month'){
   const control=after['month-control'],value=after['month-value'],arrow=after['month-arrow'];
   check(id+':ONE_ROW_CENTER',value.style.gridRowStart==='1'&&arrow.style.gridRowStart==='1'&&
    Math.abs(value.rect.y+value.rect.height/2-control.rect.y-control.rect.height/2)<=0.5&&
    Math.abs(value.rect.x+value.rect.width/2-control.rect.x-control.rect.width/2)<=0.5,
    {valueRow:value.style.gridRowStart,arrowRow:arrow.style.gridRowStart});
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
   check(id+':CONTROL_HEIGHT_BASELINE',Math.abs(qr.rect.height-45)<.1&&Math.abs(pr.rect.height-45)<.1&&Math.abs(q.rect.height-44)<.1&&Math.abs(p.rect.height-44)<.1&&Math.abs(q.rect.y-p.rect.y)<.1&&Math.abs(qr.rect.y+qr.rect.height-pr.rect.y-pr.rect.height)<.1&&equal(['fontFamily','fontSize','fontWeight','lineHeight','paddingTop','paddingBottom']));
   check(id+':LABEL_SPACING_TARGET',Math.abs(qr.rect.y-ql.rect.y-ql.rect.height-10.4)<.1&&Math.abs(pr.rect.y-pl.rect.y-pl.rect.height-10.4)<.1&&currentValues['qty-unit'].rect.height>=44&&currentValues['qty-unit'].rect.width>=44);
   observations.push({id,width,value,unit,invalid,state,after:currentValues,classification:'MSG0517_CURRENT_NUMERIC_EQUALITY'});
  }

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
 report.summary={comparisons:observations.length,checks:checks.length,failures:checks.filter(c=>c.status==='FAIL').length,
  unchanged:observations.filter(o=>o.classification==='UNCHANGED').length,knownPairDeltas:observations.filter(o=>o.classification==='EXPECTED_MSG0517_PAIR_NUMERIC_HEIGHT').length,msg0517NumericDeltas:observations.filter(o=>o.classification==='EXPECTED_MSG0517_NUMERIC_ROW_GEOMETRY').length,msg0517CurrentNumericCases:observations.filter(o=>o.classification==='MSG0517_CURRENT_NUMERIC_EQUALITY').length,msg0521CommonShellDeltas:observations.filter(o=>o.classification==='EXPECTED_MSG0521_COMMON_MODAL_INSET_GAP_FOOTER').length};
 await writeFile(join(evidence,'styles.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,source:report.source,runtime:report.runtime,summary:report.summary,error:report.error,failedChecks:checks.filter(c=>c.status==='FAIL'),evidence:join(evidence,'styles.json')},null,2));
}
