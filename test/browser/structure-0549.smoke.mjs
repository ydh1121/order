/** Scoped CI-only Chromium check. One synthetic DOM, baseline/current CSS swap.
 * No product JS, storage, provider, server, or browser acceptance claim. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const evidence=resolve(process.env.ORDER_STRUCTURE_EVIDENCE_DIR||join(root,'browser-evidence/structure-0549'));
const base='c3800a2dacec92f9a6a8b99345e34eee151ddd84';
const baselineHash='c1d59233e2c9e7117495f373b695b211f254b1796bbf0ab5330b386620ce5a79';
const hash=data=>createHash('sha256').update(data).digest('hex');
const report={classification:'ACTUAL_CHROMIUM_SAME_SYNTHETIC_DOM_CSS_SWAP',status:'RUNNING',comparisons:[],captures:[],errors:[],requests:[],notCovered:['PRODUCT_JS','LIVE_PROVIDER','STORAGE','USER_OS','PERCEPTUAL_ACCEPTANCE','REAL_BROWSER_ZOOM']};
const properties=['display','color','backgroundColor','borderBottomWidth','borderBottomStyle','borderBottomColor','opacity','cursor','rowGap','columnGap','gridTemplateColumns','alignItems','fontFamily','fontSize','fontWeight','lineHeight','fontVariantNumeric','paddingTop','paddingBottom','paddingLeft','paddingRight','marginTop','marginBottom','width','height','minWidth','minHeight','maxWidth','overflowX','overflowY','outlineWidth','outlineColor','outlineStyle'];
const fixture=`<dialog id="q4-regular-dialog" class="q4-regular-dialog"><div class="q4-regular-panel"><header class="q4-regular-head"><strong>구조·스타일 합성 검사</strong></header><div class="q4-regular-scroll">
 <div><div class="allocation-item" data-probe="allocation-first">합성 사업장 A</div><div class="allocation-item" data-probe="allocation-last">합성 사업장 B</div></div>
 <p class="ui-site-summary" data-valid="false" data-probe="site-summary">긴 한국어 사업장명 · 지점과 우편주소 확인 안내</p>
 <div class="qa-site-field" data-probe="site-field"><label class="qa-site-label">희망 납품일 안내</label><input aria-label="검사 입력" data-focus type="text" value="합성 값"></div>
 <div class="qa-field" data-probe="field"><label class="qa-label">월 주문 수량</label><div class="ui-egg-number"><input aria-label="합성 수량" value="999999999999"><span>판</span></div></div>
 <div class="qa-holiday-fields" data-probe="holiday-fields"><span>매장 정기 휴무일</span><span>휴무일 대응 안내</span></div>
 <div class="qa-calendar-grid"><button type="button" data-probe="calendar-day" aria-pressed="false">15</button></div>
 <div data-section="repeat"><div class="qa-inline-pair ui-field-pair qa-repeat-pair" data-probe="repeat-pair"><div class="qa-field"><label class="qa-label">주문 주기</label><button type="button">매주</button></div><div class="qa-field"><label class="qa-label">예상 주문 횟수</label><button type="button">약 7회</button></div></div></div>
 <div class="qa-inline-pair ui-field-pair qa-order-quantity-pair" data-probe="quantity-pair"><div class="qa-field"><label class="qa-label">회당 예상 주문 수량</label><span>999,999판</span></div><div class="qa-field"><label class="qa-label">예상 횟수</label><span>주 약 7회</span></div></div>
 </div></div></dialog>`;
let browser;
const settle=page=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
async function snapshot(page){return page.evaluate(properties=>{
 const output={};
 for(const el of document.querySelectorAll('[data-probe]')){
  const style=getComputedStyle(el),rect=el.getBoundingClientRect();
  output[el.dataset.probe]={style:Object.fromEntries(properties.map(key=>[key,style[key]])),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},state:{disabled:el.matches(':disabled'),selected:el.getAttribute('aria-pressed'),error:el.getAttribute('data-error')}};
 }
 const active=document.querySelector('[data-focus]');output.focus={active:document.activeElement===active,visible:active.matches(':focus-visible')};return output;
},properties);}
function diff(before,after,path='',out=[]){
 for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
  const a=before[key],b=after[key],name=path?`${path}.${key}`:key;
  if(a&&b&&typeof a==='object'&&typeof b==='object')diff(a,b,name,out);
  else if(typeof a==='number'&&typeof b==='number'?Math.abs(a-b)>.05:a!==b)out.push({path:name,before:a,after:b});
 }
 return out;
}
try{
 await mkdir(evidence,{recursive:true});
 const before=execFileSync('git',['show',`${base}:web/styles.css`],{cwd:root,maxBuffer:1024*1024});
 assert.equal(hash(before),baselineHash,'Exact pre-consolidation stylesheet');
 const after=await readFile(join(root,'dist/styles.css')),source=await readFile(join(root,'web/styles.css'));
 assert.equal(hash(after),hash(source),'Built CSS must match this working source');
 const identity=JSON.parse(await readFile(join(root,'dist/build-identity.json'),'utf8'));
 assert.equal(identity.scope,'INTEGRATED_PRODUCT');
 report.source={before:{commit:base,sha256:hash(before)},after:{sha256:hash(after),buildIdentity:identity}};
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
 report.runtime={node:process.version,browser:browser.version(),platform:process.platform};
 const context=await browser.newContext({reducedMotion:'reduce'});
 await context.route('**/*',async route=>{report.requests.push(route.request().url());await route.abort('blockedbyclient');});
 const page=await context.newPage();page.on('pageerror',error=>report.errors.push(String(error)));
 for(const width of [320,375,1440])for(const state of ['normal','disabled','error','focus','selected']){
  const id=`STYLE-${width}-${state}`;await page.setViewportSize({width,height:1000});
  await page.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style id="tested">${before}</style><body>${fixture}</body></html>`);
  await page.evaluate(state=>{
   document.querySelector('dialog').showModal();document.activeElement?.blur();
   document.querySelector('[data-probe="calendar-day"]').disabled=state==='disabled';
   document.querySelector('[data-probe="calendar-day"]').setAttribute('aria-pressed',String(state==='selected'));
   document.querySelectorAll('.qa-field,.qa-site-field').forEach(el=>el.dataset.error=String(state==='error'));
   document.querySelector('[data-focus]').setAttribute('aria-invalid',String(state==='error'));
  },state);
  if(state==='focus'){await page.keyboard.press('Tab');await page.locator('[data-focus]').focus();}
  await settle(page);const old=await snapshot(page);
  if(state==='disabled')assert.equal(old['calendar-day'].state.disabled,true);
  if(state==='selected')assert.equal(old['calendar-day'].state.selected,'true');
  if(state==='error')assert.equal(old.field.state.error,'true');
  if(state==='focus')assert.deepEqual(old.focus,{active:true,visible:true});
  const beforeImage=`${id}-before.png`;await page.screenshot({path:join(evidence,beforeImage)});report.captures.push(beforeImage);
  await page.locator('#tested').evaluate((style,css)=>style.textContent=css,after.toString());
  await settle(page);const current=await snapshot(page),changes=diff(old,current);
  const afterImage=`${id}-after.png`;await page.screenshot({path:join(evidence,afterImage)});report.captures.push(afterImage);
  report.comparisons.push({id,width,state,status:changes.length?'FAIL':'PASS',before:old,after:current,changes});
 }
 assert.equal(report.requests.length,0);assert.equal(report.errors.length,0);
 assert.equal(report.comparisons.filter(row=>row.status==='FAIL').length,0,'Exact CSS consolidation must preserve all inspected styles and geometry');
 report.status='PASS_SCOPED_STYLE_COMPARISON';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{
 await browser?.close();await mkdir(evidence,{recursive:true});
 await writeFile(join(evidence,'structure-styles.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,comparisons:report.comparisons.length,failures:report.comparisons.filter(row=>row.status==='FAIL').map(({id,changes})=>({id,changes})),error:report.error,evidence:join(evidence,'structure-styles.json')},null,2));
}
