/** One-file local QA LAB: same product code, isolated memory, controlled failures.
 * Run: node scripts/build-qa-lab.mjs --out .qa-lab/order-qa-lab.html
 *      node test/browser/qa-lab.smoke.mjs [.qa-lab/order-qa-lab.html]
 * This suite does not claim durable storage, online DNS or canonical acceptance.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const labPath=resolve(process.argv[2]||join(root,'.qa-lab/order-qa-lab.html'));
const evidence=resolve(process.env.ORDER_QA_LAB_EVIDENCE_DIR||join(root,'browser-evidence/qa-lab'));
const checks=[],pageErrors=[],network=[];
const report={schemaVersion:1,classification:'ACTUAL_CHROMIUM_LOCAL_FILE_QA_LAB_WITH_ISOLATED_SYNTHETIC_MEMORY',checks,pageErrors,network,status:'RUNNING',
 notCovered:['PRODUCT_DURABLE_STORAGE','BROWSER_RESTART_RESTORE','CANONICAL_HTTPS_DEPLOYMENT','LIVE_DNS','REAL_PRICE','REAL_ADDRESS_PROVIDER','WINDOWS','IPHONE','USER_ACCEPTANCE']};
let browser,context,page,server;
async function check(id,fn){const row={id,status:'RUNNING'};checks.push(row);try{await fn();row.status='PASS';}catch(error){row.status='FAIL';row.error=String(error.stack||error);throw error;}}
async function ready(){await page.waitForFunction(()=>document.documentElement.dataset.qaLabReady==='true'&&document.documentElement.dataset.storageReady==='true'&&document.documentElement.dataset.storagePending!=='true');}
async function settled(){await page.waitForFunction(()=>document.documentElement.dataset.storagePending!=='true');}
async function form(){await ready();if(await page.locator('#page-home.active').isVisible())await page.locator('#start').click();await page.locator('#page-form.active').waitFor({state:'visible'});}
async function stage(name){const toggle=page.locator(`.accordion-trigger[data-open="${name}"]`);if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await settled();}
async function openQ4(){await stage('q4');const toggle=page.locator('[data-q4-body-toggle="qa-line"]');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await page.locator('[data-edit-allocation="qa-allocation-a"]').click();await page.locator('#q4-regular-dialog[open]').waitFor({state:'visible'});}
async function site(i){const toggle=page.locator(`[data-acc="site-${i}"]`);if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();}
async function closed(){await page.waitForFunction(()=>!document.getElementById('q4-regular-dialog').open);await settled();}
async function committed(){await settled();return page.evaluate(()=>OrderRegularQ4Bridge.committed);}
async function prepareFixture(){
 await page.locator('#qa-lab-fixture').click();await ready();assert.equal(await page.evaluate(()=>document.documentElement.dataset.qaLabFixture),'allocation-200');
 await page.locator('#qa-lab-dns').selectOption('example-route');await form();await stage('q2');await page.locator('[data-line-price]').fill('8000');await settled();
 await page.waitForFunction(()=>window.OrderEmailDomain&&OrderEmailDomain.isSuccess(OrderEmailDomain.status('qa@example.com')),{},{timeout:15000});
}
try{
 await mkdir(evidence,{recursive:true});const bytes=await readFile(labPath);report.lab={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});report.browser=browser.version();
 context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(()=>{
  const originalGet=Storage.prototype.getItem,originalSet=Storage.prototype.setItem,originalRemove=Storage.prototype.removeItem;window.__qaLabNativeAccess=[];
  Storage.prototype.getItem=function(key){window.__qaLabNativeAccess.push({op:'get',key});return originalGet.call(this,key);};
  Storage.prototype.setItem=function(key,value){window.__qaLabNativeAccess.push({op:'set',key});return originalSet.call(this,key,value);};
  Storage.prototype.removeItem=function(key){window.__qaLabNativeAccess.push({op:'remove',key});return originalRemove.call(this,key);};
  window.__qaLabReadNative=(kind,key)=>originalGet.call(kind==='local'?localStorage:sessionStorage,key);
 });
 await context.route('**/*',route=>{const url=route.request().url();if(url.startsWith('file:')||url.startsWith('data:')||url.startsWith('http://127.0.0.1:'))return route.continue();network.push(url);return route.abort('blockedbyclient');});
 page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>pageErrors.push(String(error)));
 await check('L01_SINGLE_FILE_SOURCE_IDENTITY_EMPTY_ISOLATED_BOOT',async()=>{
  await page.goto(pathToFileURL(labPath).href);await ready();const identity=JSON.parse(await page.locator('#qa-lab-identity').textContent());report.source={commitSha:identity.commitSha,sourceState:identity.sourceState,bundleGraphSha256:identity.bundleGraphSha256};
  assert.match(identity.commitSha,/^[a-f0-9]{40}$/);assert.equal(await page.locator('#qa-lab-commit').textContent(),identity.commitSha);assert.equal(identity.storage,'ISOLATED_MEMORY_ONLY');assert.equal(await page.evaluate(()=>document.documentElement.dataset.qaLabStorage),'ISOLATED_MEMORY');assert.equal((await committed()).lines.length,0);assert.deepEqual(await page.evaluate(()=>window.__qaLabNativeAccess),[]);
 });
 await check('L02_OPT_IN_FIXTURE_CURRENT_ENGINE_DERIVED_AND_CANCEL',async()=>{
  await prepareFixture();const before=await committed();await openQ4();assert.equal(await page.locator('[data-qty="1:monthly"]').inputValue(),'150');await site(0);await page.locator('[data-qty="0:monthly"]').fill('60');assert.equal(await page.locator('[data-qty="1:monthly"]').inputValue(),'140');
  await page.locator('#q4-regular-cancel').click();await closed();assert.deepEqual(await committed(),before);await openQ4();assert.equal(await page.locator('[data-qty="0:monthly"]').inputValue(),'50');await page.keyboard.press('Escape');await closed();assert.deepEqual(await committed(),before);
 });
 await check('L03_CONTROLLED_STORAGE_FAILURE_RETAINS_UNCONFIRMED_DRAFT',async()=>{
  const before=await committed();await page.locator('#qa-lab-fail-next').click();await openQ4();await site(0);await page.locator('[data-qty="0:monthly"]').fill('60');await page.locator('#q4-regular-save').click();await settled();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.storageStatus),'WRITE_FAILED');assert.equal(await page.locator('#q4-regular-dialog').evaluate(el=>el.open),true);assert.equal(await page.locator('[data-qty="0:monthly"]').inputValue(),'60');assert.deepEqual(await committed(),before);
  await page.locator('#q4-regular-save').click();await closed();assert.deepEqual((await committed()).allocations.map(a=>a.monthlyDemandQty),['60','140']);
 });
 await check('L04_SECOND_WRITER_CONFLICT_BLOCKS_PRODUCT_CONFIRM',async()=>{
  const before=await committed();await page.locator('#qa-lab-conflict').click();await page.waitForFunction(()=>document.getElementById('qa-lab-status').textContent.match(/다른 작성자.*revision/));
  await openQ4();await page.locator('[data-qty="0:base"]').fill('11');await page.locator('#q4-regular-save').click();await settled();assert.equal(await page.evaluate(()=>document.documentElement.dataset.storageStatus),'CONFLICT');assert.equal(await page.locator('#q4-regular-dialog').evaluate(el=>el.open),true);assert.equal(await page.locator('[data-qty="0:base"]').inputValue(),'11');assert.deepEqual(await committed(),before);
  await page.locator('#q4-regular-cancel').click();await closed();
 });
 await check('L05_RESTART_IS_MEMORY_RESET_NOT_DURABLE_RESTORE',async()=>{
  await page.locator('#qa-lab-restart').click();await ready();assert.equal((await committed()).lines.length,0);assert.equal(await page.locator('#qa-lab-dns').inputValue(),'offline');assert.deepEqual(await page.evaluate(()=>window.__qaLabNativeAccess),[]);
 });
 await check('L06_SAME_ORIGIN_NATIVE_PRODUCT_STORAGE_SENTINELS_UNTOUCHED',async()=>{
  server=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end(req.url==='/lab.html'?bytes:'<!doctype html><title>Test-owned sentinel setup</title>');});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base);await page.evaluate(()=>{localStorage.setItem('order_q1_q4_v1','TEST_PRODUCT_SENTINEL_NOT_LAB_DATA');sessionStorage.setItem('order_v015R2_draft','TEST_LEGACY_SENTINEL');});await page.goto(base+'/lab.html');await ready();
  assert.deepEqual(await page.evaluate(()=>window.__qaLabNativeAccess),[]);await prepareFixture();assert.deepEqual(await page.evaluate(()=>window.__qaLabNativeAccess),[]);assert.equal(await page.evaluate(()=>window.__qaLabReadNative('local','order_q1_q4_v1')),'TEST_PRODUCT_SENTINEL_NOT_LAB_DATA');assert.equal(await page.evaluate(()=>window.__qaLabReadNative('session','order_v015R2_draft')),'TEST_LEGACY_SENTINEL');
 });
 await check('L07_NO_EXTERNAL_NETWORK_OR_UNCAUGHT_PRODUCT_ERRORS',async()=>{assert.deepEqual(network,[]);assert.deepEqual(pageErrors,[]);});report.status='PASS';
}catch(error){report.status=/Operation not permitted|socket\(\) failed|Executable doesn't exist/.test(String(error))?'BLOCKED_BROWSER_ENVIRONMENT':'FAIL';report.error=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'qa-lab.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
