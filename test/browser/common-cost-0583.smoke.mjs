/** MSG0583 common lane: actual built main entry, native storage and numeric owner.
 * Synthetic input fixtures only. Run in the approved CI browser environment after
 * npm run build; this script is not a user-OS or production acceptance result.
 * Monetary oracles below are independent integer examples, never calculateQuote
 * or currentPurchaseCost calls. Reels are observed through actual DOM/rAF frames.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,resolve,join,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chooseQuantityUnit} from './approved-contract-helpers.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dist=join(root,'dist');
const evidence=resolve(process.env.ORDER_COMMON0583_EVIDENCE_DIR||join(root,'browser-evidence/common-cost-0583'));
const KEY='order_q1_q4_v1',LOCK='order-q1-q4-storage',A='common-0583-A',B='common-0583-B';
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={schemaVersion:1,message:'MSG0583',status:'NOT_RUN',classification:'ACTUAL_BUILT_MAIN_NATIVE_STORAGE_NUMERIC_OWNER_AND_RAF_MOTION',checks:[],pageErrors:[],externalBlocked:[],captures:[],motion:[],
  oracleBasis:'Whole packages ceil(qty × unitFactor / pack), priced per row, then sum. Literal independent integer examples; no production calculator imported.',
  notCovered:['REAL_PRICE_OR_SUPPLIER','REAL_QUOTE_BACKEND','USER_OS','USER_VISUAL_ACCEPTANCE','CANONICAL_PRODUCTION_DEPLOYMENT','SIMPLE_PR17_CANDIDATE']};
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
let browser,context,page,harness,server,base,sequence=0;
const row=(id,overrides={})=>({id,housing:id===A?'4':'3',size:'특란',pack:id===A?'30':'20',qty:'',qtyUnit:id===A?'each':'pack',price:'',...overrides});
const fixture=(lines=[row(A),row(B)],open='q2')=>({lines,current:lines[0]?.id??null,locations:[],allocations:[],open,allocationRevision:0});
const complete=()=>fixture([row(A,{qty:'31',price:'5000'}),row(B,{qty:'3',price:'2100'})]);
const qty=id=>page.locator(`[data-line-qty="${id}"]`),price=id=>page.locator(`[data-line-price="${id}"]`);
const output=id=>page.locator(id==='total'?'#q2-total':`[data-line-subtotal="${id}"]`);
const panel=id=>page.locator(id==='total'?'#q2-aggregate':`#q2-lines [data-line-id="${id}"] .line-subtotal`);
const won=s=>s.replace(/\B(?=(\d{3})+(?!\d))/g,',')+'원';
async function check(id,fn){const item={id,status:'RUNNING'};report.checks.push(item);try{await fn(item);item.status='PASS';}catch(error){item.status='FAIL';item.error=String(error.stack||error);throw error;}}
async function ready(tab=page){await tab.waitForFunction(()=>document.documentElement.dataset.storageReady==='true'&&document.documentElement.dataset.storagePending!=='true');}
async function stored(){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),KEY);}
async function open(data=fixture(),{reducedMotion='reduce',route='form'}={}){
  if(await page.evaluate(()=>document.documentElement.dataset.storageReady==='true'))await ready();
  await page.goto(base+'/__common0583-fixture');await page.emulateMedia({reducedMotion});
  const result=await harness.evaluate(async({data,key})=>{localStorage.clear();sessionStorage.clear();const {createBrowserStorage}=await import('/storage.mjs'),storage=createBrowserStorage();const loaded=await storage.load();if(!loaded.ok)return loaded;return storage.commit(data,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'common-fixture-'+crypto.randomUUID()});},{data,key:KEY});
  assert.equal(result.ok,true,JSON.stringify(result));
  await page.goto(`${base}/?common0583=${++sequence}#/${route}`);
  // The separate native-storage fixture tab must not leave the real product in
  // the background: Chromium can throttle its rAF to about one frame per second,
  // skipping the selected effect's entire anticipation/spring interval.
  await page.bringToFront();await ready();await page.locator(`#page-${route}.active`).waitFor({state:'visible'});
  assert.equal(await page.locator('[data-open="q2"]').getAttribute('aria-expanded'),data.open==='q2'?'true':'false');
}
async function amount(id,expected){
  const el=output(id);assert.equal(await panel(id).isVisible(),true,`${id}: cost area visible`);
  assert.equal(await el.locator('.order-counter-value').count(),1,'one semantic final amount');
  assert.equal(await el.locator('.order-counter-value').textContent(),won(expected));
  assert.equal(await el.getAttribute('data-counter-target'),won(expected),'exact formatted target is immediate');
  assert.equal(await el.locator('.t-reel').getAttribute('aria-hidden'),'true');
  if(await el.getAttribute('data-counter-state')==='settled')await visualAmount(id,expected);
}
async function visualAmount(id,expected){
  const actual=await output(id).evaluate(el=>[...el.querySelectorAll('.t-reel-col')].map(col=>[...col.querySelectorAll('.t-reel-digit')].filter(d=>Number(getComputedStyle(d).opacity)>.999).map(d=>d.textContent)));
  assert.ok(actual.every(column=>column.length===1),'settled reel has exactly one visible digit per column');assert.equal(actual.flat().join(''),expected,'visible final digits match the independent exact amount');
}
async function hidden(id){
  assert.equal(await panel(id).isVisible(),false,`${id}: no incomplete cost area`);
  assert.equal(await panel(id).evaluate(el=>el.getBoundingClientRect().height),0,'hidden cost reserves no card space');
  assert.equal(await output(id).getAttribute('data-counter-state'),'hidden');
  assert.equal(await output(id).locator('.order-counter-value').textContent(),'');
  assert.notEqual(await output(id).getAttribute('data-counter-target'),'0','absence is not a zero target');
}
async function settle(id){await output(id).evaluate(el=>new Promise((resolve,reject)=>{const started=performance.now();function tick(){if(el.dataset.counterState==='settled')return resolve();if(performance.now()-started>10000)return reject(Error('Counter did not settle'));requestAnimationFrame(tick);}tick();}));}
async function framePause(ms){await page.evaluate(ms=>new Promise(resolve=>{const start=performance.now();function tick(){if(performance.now()-start>=ms)resolve();else requestAnimationFrame(tick);}requestAnimationFrame(tick);}),ms);}
async function remember(){await page.evaluate(()=>{window.__common0583Nodes=[...document.querySelectorAll('#q2-lines .line-panel,#q2-lines input,#q2-lines output,#q2-total')];});}
async function stable(){assert.equal(await page.evaluate(()=>window.__common0583Nodes.every(node=>node.isConnected&&document.querySelector(node.id?'#'+CSS.escape(node.id):node.matches('.line-panel')?`#q2-lines .line-panel[data-line-id="${node.dataset.lineId}"]`:`[data-line-subtotal="${node.dataset.lineSubtotal}"]`)===node)),true,'existing rows, inputs and amount outputs remain mounted');}
async function capture(name){await page.screenshot({path:join(evidence,name),fullPage:true});report.captures.push(name);}
async function frames(id,ms=5000){return output(id).evaluate((el,ms)=>new Promise(resolve=>{const samples=[],start=performance.now();function tick(){samples.push({t:performance.now()-start,state:el.dataset.counterState,generation:el.dataset.counterGeneration,target:el.dataset.counterTarget,columns:[...el.querySelectorAll('.t-reel-col')].map(col=>({place:col.dataset.counterPlace,from:col.dataset.counterFrom,target:col.dataset.counterTarget,moving:col.dataset.counterMoving,cells:[...col.querySelectorAll('.t-reel-digit')].map(cell=>({digit:cell.textContent,transform:getComputedStyle(cell).transform,scale:Math.hypot(new DOMMatrixReadOnly(getComputedStyle(cell).transform).a,new DOMMatrixReadOnly(getComputedStyle(cell).transform).b),opacity:Number(getComputedStyle(cell).opacity),filter:getComputedStyle(cell).filter}))})),separators:[...el.querySelectorAll('.t-reel-sep')].map(sep=>({text:sep.textContent,transform:getComputedStyle(sep).transform}))});if(el.dataset.counterState==='settled'||performance.now()-start>=ms)resolve(samples);else requestAnimationFrame(tick);}requestAnimationFrame(tick);}),ms);}
async function stage(name){const trigger=page.locator(`#section-${name}>.accordion-trigger`);if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();await ready();}

try{
  await mkdir(evidence,{recursive:true});report.build=JSON.parse(await readFile(join(dist,'build-identity.json'),'utf8'));assert.equal(report.build.scope,'INTEGRATED_PRODUCT');
  if(process.env.EXPECTED_SOURCE_SHA)assert.equal(report.build.commitSha,process.env.EXPECTED_SOURCE_SHA);
  report.sourceHashes=[];for(const path of ['test/browser/common-cost-0583.smoke.mjs','web/main.mjs','web/app.mjs','web/styles.css','web/quantity-contract.mjs','web/q2-cost.mjs','web/numeric-input.mjs','web/spinning-counter.mjs','web/spinning-counter.css']){const bytes=await readFile(join(root,path));report.sourceHashes.push({path,bytes:bytes.length,sha256:hash(bytes)});}
  const realDist=await realpath(dist);
  server=createServer(async(req,res)=>{try{assert.equal(req.method,'GET');const url=new URL(req.url,'http://localhost');if(url.pathname==='/__common0583-fixture'){res.writeHead(200,{'content-type':mime['.html'],'cache-control':'no-store'}).end('<!doctype html><title>Test-only native-storage fixture seeding</title>');return;}const file=await realpath(resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)));if(!file.startsWith(realDist+sep))throw Error('OUTSIDE_DIST');res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(await readFile(file));}catch{res.writeHead(404).end('Not found');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
  context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();report.externalBlocked.push(url.origin+url.pathname);return route.abort('blockedbyclient');});
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.pageErrors.push(String(error)));harness=await context.newPage();await harness.goto(base+'/__common0583-fixture');
  report.runtime={browser:browser.version(),node:process.version,platform:process.platform,clock:'REAL_BROWSER_PERFORMANCE_CLOCK',nativeStorage:true,nativeWebLocks:await harness.evaluate(()=>!!navigator.locks?.request)};
  assert.equal(report.runtime.nativeWebLocks,true);report.status='RUNNING';

  await check('CC01_TWO_ROWS_INCOMPLETE_ONE_COMPLETE_ALL_COMPLETE',async()=>{
    await open();await hidden(A);await hidden(B);await hidden('total');await remember();
    await qty(A).fill('31');await hidden(A);await price(A).fill('5000');await amount(A,'10000');await hidden(B);await hidden('total');
    await qty(B).fill('3');await hidden(B);await price(B).fill('2100');await amount(B,'6300');await amount('total','16300');await ready();await stable();
    assert.deepEqual((await stored()).data.lines.map(l=>[l.id,l.qty,l.qtyUnit,l.price]),[[A,'31','each','5000'],[B,'3','pack','2100']]);
    await capture('common-cost-complete-390.png');
  });
  await check('CC02_EMPTY_AND_ZERO_HIDE_WITHOUT_ZERO_TARGET_OR_RESERVED_SPACE',async()=>{
    for(const raw of ['', '0']){await price(A).fill(raw);await hidden(A);await amount(B,'6300');await hidden('total');await price(A).fill('5000');await amount(A,'10000');await amount('total','16300');}
    await qty(A).fill('0');await hidden(A);await hidden('total');await qty(A).fill('31');await amount('total','16300');await stable();
  });
  await check('CC03_IME_HIDES_OLD_VALID_MODEL_AND_REJECTED_INPUT_RETAINS_VALID_COST',async()=>{
    await ready();await price(A).focus();const before=(await stored()).data.lines[0].price;
    await price(A).evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));el.value='가';el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'가',isComposing:true}));});
    assert.equal(await price(A).getAttribute('data-numeric-state'),'composing');await hidden(A);await hidden('total');assert.equal((await stored()).data.lines[0].price,before);
    await price(A).evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'가'})));
    assert.equal(await price(A).inputValue(),'5,000');assert.equal(await price(A).getAttribute('data-numeric-state'),'valid');await amount(A,'10000');await amount('total','16300');
    await price(A).press('End');await page.keyboard.insertText('x');assert.equal(await price(A).inputValue(),'5,000');assert.equal(await price(A).getAttribute('data-numeric-state'),'valid');await amount(A,'10000');
    await price(A).evaluate(el=>{el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));el.value='5200';el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:'5200',isComposing:true}));});await hidden(A);
    await price(A).evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'5200'})));await amount(A,'10400');await amount('total','16700');await ready();await stable();
  });
  await check('CC04_RESTORED_INVALID_RAW_REMAINS_HIDDEN_UNTIL_REAL_REPAIR',async()=>{
    await open(fixture([row(A,{qty:'31',price:'bad'}),row(B,{qty:'3',price:'2100'})]));assert.equal(await price(A).inputValue(),'bad');await hidden(A);await hidden('total');await amount(B,'6300');
    await price(A).fill('5000');await amount(A,'10000');await amount('total','16300');await ready();
  });
  await check('CC05_PENDING_AUTOSAVE_DOES_NOT_HIDE_VALID_COST',async()=>{
    await harness.evaluate(async name=>{let entered;const acquired=new Promise(resolve=>entered=resolve);window.__common0583Held=navigator.locks.request(name,async()=>{entered();await new Promise(resolve=>window.__common0583Release=resolve);});await acquired;},LOCK);
    try{await price(A).fill('5100');await page.waitForFunction(()=>document.documentElement.dataset.storagePending==='true');await amount(A,'10200');await amount('total','16500');await framePause(180);await amount(A,'10200');assert.equal((await stored()).data.lines[0].price,'5000','still pending actual lock');}
    finally{await harness.evaluate(()=>window.__common0583Release());await ready();}
    assert.equal((await stored()).data.lines[0].price,'5100');await amount('total','16500');
  });
  await check('CC06_UNIT_PROJECTION_PRESERVES_DEMAND_COST_AND_NO_RESTART',async()=>{
    await open(complete());await settle(A);const before=(await stored()).data.lines[0],generation=await output(A).getAttribute('data-counter-generation');await remember();
    await chooseQuantityUnit(page.locator(`[data-line-qty-unit="${A}"]`),'tray');await ready();assert.equal(await qty(A).inputValue(),'2');const after=(await stored()).data.lines[0];assert.equal(after.qty,before.qty);assert.equal(after.qtyUnit,'each');assert.equal(after.qtyDisplayUnit,'tray');await amount(A,'10000');
    await stable();assert.equal(await output(A).getAttribute('data-counter-generation'),generation,'same exact cost has no new roll');
    await qty(A).fill('2');await ready();assert.equal((await stored()).data.lines[0].qtyUnit,'tray');assert.equal((await stored()).data.lines[0].qty,'2');await amount(A,'10000');
  });
  await check('CC07_FOCUS_CARET_UNDO_AND_NODE_IDENTITY_DURING_REELS',async()=>{
    await open(complete(),{reducedMotion:'no-preference'});await settle(A);await settle('total');await remember();await price(A).focus();await price(A).evaluate(el=>el.setSelectionRange(1,1));await page.keyboard.insertText('2');
    await amount(A,'104000');await amount('total','110300');assert.equal(await price(A).evaluate(el=>document.activeElement===el&&el.selectionStart===2&&el.selectionEnd===2),true);await stable();
    await price(A).press('Control+z');await amount(A,'10000');await amount('total','16300');assert.equal(await price(A).evaluate(el=>document.activeElement===el),true);await stable();await ready();
  });
  await check('CC08_SELECTED_REEL_MOTION_CHANGED_DIGITS_PUNCTUATION_AND_ACCESSIBILITY',async item=>{
    await settle(A);await settle('total');item.environment=await page.evaluate(()=>({visibilityState:document.visibilityState,hasFocus:document.hasFocus()}));assert.equal(item.environment.visibilityState,'visible','motion evidence requires a foreground product document');await price(A).fill('5001');await amount(A,'10002');
    const observation=frames(A);await framePause(470);await capture('common-cost-reel-intermediate-390.png');const sample=await observation;const gaps=sample.slice(1).map((s,i)=>s.t-sample[i].t);item.frameCadence={samples:sample.length,firstMs:sample[0]?.t,lastMs:sample.at(-1)?.t,maxGapMs:gaps.length?Math.max(...gaps):null,gapsMs:gaps};report.motion.push({id:item.id,environment:item.environment,frameCadence:item.frameCadence,samples:sample});assert.ok(sample.length>=10,'actual frame cadence must resolve the spring, not background-tab timer throttling');
    assert.ok(sample.some(s=>s.state==='rolling'),'actual rAF rolling state observed');
    assert.ok(sample.some(s=>s.columns.some(c=>c.moving==='true'&&c.cells.some(d=>d.transform!=='none'&&d.opacity>0&&d.opacity<1))),'moving drum has transformed faint adjacent digits');
    assert.ok(sample.every(s=>s.columns.filter(c=>c.from===c.target).every(c=>c.moving==='false'&&c.cells.every(d=>d.transform==='none'))),'unchanged digits stay still');
    assert.ok(sample.every(s=>s.separators.every(p=>p.transform==='none')),'comma/currency remain stationary');
    const landing=sample.flatMap(s=>s.columns.filter(c=>c.from!==c.target).flatMap(c=>c.cells.filter(d=>d.digit===c.target&&d.opacity>.99)));
    assert.ok(landing.some(d=>d.scale<.97),'target anticipation contracts before landing');assert.ok(landing.some(d=>d.scale>1.005),'selected spring visibly overshoots final size');assert.equal(sample.at(-1).state,'settled');
    const tokens=await output(A).evaluate(el=>{const css=getComputedStyle(el);return Object.fromEntries(['--reel-step-dur','--reel-stagger','--reel-antic-dur','--reel-land-dur','--reel-land-peak'].map(k=>[k,css.getPropertyValue(k).trim()]));});
    assert.deepEqual(tokens,{'--reel-step-dur':'130ms','--reel-stagger':'90ms','--reel-antic-dur':'100ms','--reel-land-dur':'740ms','--reel-land-peak':'1.03'});item.tokens=tokens;
    await amount(A,'10002');
  });
  await check('CC09_RAPID_VALUES_SETTLE_ONLY_LATEST_GENERATION',async()=>{
    await price(A).fill('5999');await price(A).fill('5002');await price(A).fill('5003');await amount(A,'10006');await amount('total','16306');const generation=await output(A).getAttribute('data-counter-generation');await settle(A);await settle('total');await amount(A,'10006');await ready();assert.equal(await output(A).getAttribute('data-counter-generation'),generation);assert.equal((await stored()).data.lines[0].price,'5003');
  });
  await check('CC10_RUNTIME_REDUCED_MOTION_CANCELS_TO_EXACT_FINAL',async()=>{
    await price(A).fill('5999');assert.equal(await output(A).getAttribute('data-counter-state'),'rolling');await page.emulateMedia({reducedMotion:'reduce'});await settle(A);await settle('total');await amount(A,'11998');await amount('total','18298');
    const cells=await output(A).evaluate(el=>[...el.querySelectorAll('.t-reel-col')].map(col=>({target:col.dataset.counterTarget,visible:[...col.querySelectorAll('.t-reel-digit')].filter(d=>getComputedStyle(d).opacity==='1').map(d=>({digit:d.textContent,transform:getComputedStyle(d).transform,filter:getComputedStyle(d).filter}))})));
    assert.ok(cells.every(c=>c.visible.length===1&&c.visible[0].digit===c.target&&c.visible[0].transform==='none'&&c.visible[0].filter==='none'));
    await price(A).fill('5000');await amount(A,'10000');assert.equal(await output(A).getAttribute('data-counter-state'),'settled','reduced motion begins at final');
  });
  await check('CC11_EXACT_HUGE_COST_RESTORE_AND_NO_COUNTER_DATA_PERSISTENCE',async()=>{
    await open(fixture([row(A,{qty:'999999999999',qtyUnit:'tray',price:'999999999999'}),row(B,{qty:'3',price:'2100'})]));
    await amount(A,'999999999998000000000001');await amount('total','999999999998000000006301');const saved=await stored();assert.doesNotMatch(JSON.stringify(saved.data),/counter|reel|animation|generation/);
    for(const id of [A,'total']){const bounds=await output(id).evaluate(el=>{const out=el.getBoundingClientRect(),reel=el.querySelector('.t-reel').getBoundingClientRect();return {left:out.left,right:out.right,width:out.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,reelLeft:reel.left,reelRight:reel.right,viewport:innerWidth};});assert.ok(bounds.scrollWidth<=bounds.clientWidth+1,'complete huge amount fits its output');assert.ok(bounds.reelLeft>=bounds.left-1&&bounds.reelRight<=bounds.right+1&&bounds.reelRight<=bounds.viewport+1,'huge exact digits are not clipped by their ancestor');}
    await capture('common-cost-huge-390.png');
    await page.reload();await ready();await amount(A,'999999999998000000000001');await amount('total','999999999998000000006301');assert.deepEqual((await stored()).data,saved.data);
  });
  await check('CC12_DELETE_RESET_AND_ROUTE_EXIT_CANCEL_OLD_VISUAL_WORK',async()=>{
    await open(complete(),{reducedMotion:'no-preference'});await settle(A);await price(A).fill('5999');await output(A).evaluate(el=>{window.__common0583OldOutput=el;});await ready();await page.locator('#form-back').click();await page.locator('#page-home.active').waitFor();
    assert.notEqual(await page.evaluate(()=>window.__common0583OldOutput.dataset.counterState),'rolling','route exit stops reel');await page.locator('#start').click();await ready();
    await price(A).fill('999999999999');assert.equal(await output(A).getAttribute('data-counter-state'),'rolling');await output(A).evaluate(el=>{window.__common0583DeletedOutput=el;});await ready();await stage('q1');
    await page.locator(`[data-remove="${A}"]`).click();await page.locator('#sku-delete-dialog[open]').waitFor();await page.locator('#sku-delete-commit').click();await page.waitForFunction(id=>!document.querySelector(`#q2-lines [data-line-id="${id}"]`),A);await ready();await stage('q2');await amount('total','6300');
    assert.equal((await stored()).data.lines.length,1);assert.equal((await stored()).data.lines[0].id,B);
    assert.equal(await page.evaluate(()=>window.__common0583DeletedOutput.dataset.counterState),'destroyed');
    await page.evaluate(()=>{window.__common0583StaleMutations=0;window.__common0583StaleObserver=new MutationObserver(records=>window.__common0583StaleMutations+=records.length);window.__common0583StaleObserver.observe(window.__common0583DeletedOutput,{subtree:true,attributes:true,childList:true,characterData:true});});
    await price(B).fill('999999999999');assert.equal(await output(B).getAttribute('data-counter-state'),'rolling');await output(B).evaluate(el=>{window.__common0583ResetOutput=el;});await ready();
    await page.locator('#reset-input').click();await page.locator('#reset-input-confirm[open]').waitFor();await page.locator('[data-reset-confirm]').click();await page.waitForFunction(()=>document.querySelectorAll('#q2-lines .line-panel').length===0);await ready();assert.equal((await stored()).state,'reset');await hidden('total');
    assert.equal(await page.evaluate(()=>window.__common0583ResetOutput.dataset.counterState),'destroyed');await framePause(320);assert.equal(await page.locator('#q2-lines .line-panel').count(),0);await hidden('total');assert.equal(await page.evaluate(()=>window.__common0583StaleMutations),0,'detached generation has no later rAF writes');await page.evaluate(()=>window.__common0583StaleObserver.disconnect());
  });
  await check('CC13_ARROW_OPEN_NEGATIVE_CLOSE_POSITIVE_AND_INTERRUPTED_TOGGLES',async item=>{
    await open(complete(),{reducedMotion:'no-preference'});await framePause(300);const trigger=page.locator('#section-q2>.accordion-trigger');
    const sample=async(action)=>trigger.evaluate((button,action)=>new Promise(resolve=>{const arrow=button.querySelector('.t-acc-chevron'),rows=[],start=performance.now();const angle=()=>{const m=new DOMMatrixReadOnly(getComputedStyle(arrow).transform);let a=Math.atan2(m.b,m.a)*180/Math.PI;if(a>0.001)a-=360;return a;};rows.push({t:0,angle:angle()});button.click();function tick(){rows.push({t:performance.now()-start,angle:angle(),expanded:button.getAttribute('aria-expanded')});if(performance.now()-start>340)resolve({action,rows});else requestAnimationFrame(tick);}requestAnimationFrame(tick);}),action);
    const closing=await sample('close'),opening=await sample('open');report.motion.push({id:item.id,closing,opening});
    const interior=r=>r.rows.filter(x=>x.angle<-1&&x.angle>-179);
    assert.ok(interior(opening).length>=2&&interior(opening).at(-1).angle<interior(opening)[0].angle,'opening progresses counterclockwise');
    assert.ok(interior(closing).length>=2&&interior(closing).at(-1).angle>interior(closing)[0].angle,'closing progresses clockwise');
    assert.equal(await trigger.getAttribute('aria-expanded'),'true');
    const rapid=await trigger.evaluate(button=>new Promise(resolve=>{const a=button.querySelector('.t-acc-chevron'),rows=[],start=performance.now();let first=false,second=false,reversal,firstExpanded;const angle=()=>{const m=new DOMMatrixReadOnly(getComputedStyle(a).transform);let degrees=Math.atan2(m.b,m.a)*180/Math.PI;if(degrees>0.001)degrees-=360;return degrees;};function tick(){const t=performance.now()-start;if(!first){button.click();firstExpanded=button.getAttribute('aria-expanded');first=true;}if(t>60&&!second){const before=angle();button.click();reversal={t,before,after:angle(),expanded:button.getAttribute('aria-expanded')};second=true;}rows.push({t,angle:angle()});if(t>420)resolve({rows,reversal,firstExpanded});else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
    assert.ok(rapid.rows.every(x=>x.angle>=-180.1&&x.angle<=0.1),'interrupted turn stays in its half rotation');assert.equal(rapid.firstExpanded,'false');assert.equal(rapid.reversal.expanded,'true');assert.ok(Math.abs(rapid.reversal.after-rapid.reversal.before)<5,'reversal has no jump');const reversed=rapid.rows.filter(x=>x.t>rapid.reversal.t+20&&x.t<rapid.reversal.t+180);assert.ok(reversed.length>=2&&reversed.at(-1).angle<reversed[0].angle,'interrupted opening progresses negatively');report.motion.push({id:item.id+'-rapid',...rapid});await trigger.focus();await trigger.press('Enter');assert.equal(await trigger.getAttribute('aria-expanded'),'false');await trigger.press('Enter');assert.equal(await trigger.getAttribute('aria-expanded'),'true');
  });
  await check('CC14_FULL_WIDTH_390_1440_AND_INITIAL_REVEAL',async()=>{
    for(const width of [390,1440]){await page.setViewportSize({width,height:900});await open(fixture([row(A),row(B)]),{reducedMotion:'no-preference'});await price(A).fill('5000');await qty(A).fill('31');await amount(A,'10000');assert.equal(await output(A).getAttribute('data-counter-state'),'rolling');await settle(A);await price(B).fill('2100');await qty(B).fill('3');await amount('total','16300');await settle('total');await ready();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'full-width page has no horizontal overflow');await capture(`common-cost-full-${width}.png`);
    }
  });
  await check('CC15_RESTORED_OFFSCREEN_AMOUNT_ROLLS_ON_FIRST_VISIBLE_PRESENTATION_ONLY',async item=>{
    await page.setViewportSize({width:390,height:900});const seed=complete();seed.open='q1';await open(seed,{reducedMotion:'no-preference',route:'home'});
    // Read the already-created product instances through their idempotent
    // factory. No set/settle method or replacement counter is called by QA.
    const inspect=()=>page.evaluate(async ids=>{const {createSpinningCounter}=await import('/spinning-counter.mjs');return ids.map(id=>{const el=document.querySelector(id==='total'?'#q2-total':`[data-line-subtotal="${id}"]`);if(!el?.classList.contains('order-spinning-counter')||!el.dataset.counterState)throw Error('PRODUCT_COUNTER_NOT_MOUNTED');return {id,...createSpinningCounter(el).inspect()};});},[A,B,'total']);
    for(const [id,expected]of [[A,'10000'],[B,'6300'],['total','16300']]){assert.equal(await output(id).locator('.order-counter-value').textContent(),won(expected));assert.equal(await output(id).getAttribute('data-counter-state'),'settled');}
    const first=await inspect();assert.ok(first.every(c=>c.active===false&&c.presented===false));item.homeInitial=first;
    // More than the maximum initial roll for these five-digit amounts under
    // the selected130ms steps/90ms stagger/100+740ms landing tokens.
    await framePause(2700);const afterHome=await inspect();assert.deepEqual(afterHome,first,'waiting on home never consumes the first visible roll');item.homeAfter2700ms=afterHome;
    await page.locator('#start').click();await page.locator('#page-form.active').waitFor({state:'visible'});await ready();assert.equal(await page.locator('#section-q2>.accordion-trigger').getAttribute('aria-expanded'),'false');assert.ok((await inspect()).every(c=>c.active===false&&c.presented===false),'closed Q2 has no visual rAF work');await remember();
    await page.locator('#section-q2>.accordion-trigger').click();const firstVisible=await inspect();assert.ok(firstVisible.every(c=>c.presented===true&&c.active===true&&c.state==='rolling'),'both restored rows and total start their first visible roll');item.firstVisible=firstVisible;await amount(A,'10000');await amount('total','16300');
    const observation=frames(A);await framePause(200);await capture('common-cost-restored-first-visible-390.png');const samples=await observation;report.motion.push({id:item.id,samples});assert.ok(samples.some(s=>s.state==='rolling'&&s.columns.some(c=>c.cells.some(d=>d.transform!=='none'&&d.opacity>0))),'first visible presentation has actual transformed reel frames');await Promise.all([settle(A),settle(B),settle('total')]);await amount(A,'10000');await amount('total','16300');await stable();
    const presented=await inspect();assert.ok(presented.every(c=>c.presented===true&&c.active===false));item.afterFirstPresentation=presented;
    const trigger=page.locator('#section-q2>.accordion-trigger');await trigger.click();await framePause(280);await trigger.click();await framePause(280);const reopened=await inspect();assert.deepEqual(reopened,presented,'same settled values do not replay when closed and reopened');await amount(A,'10000');await amount('total','16300');await stable();assert.deepEqual((await stored()).data.lines,seed.lines);item.afterReopen=reopened;
  });
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalBlocked,[]);report.status='PASS_SCOPED_COMMON_BUILT_UI_AND_MOTION';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;try{if(page)await capture('common-cost-failure.png');}catch{}}
finally{await context?.close();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'common-cost-0583.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,failed:report.checks.filter(c=>c.status==='FAIL').map(c=>c.id),error:report.error,evidence:join(evidence,'common-cost-0583.json')},null,2));}
