/** Actual Chromium, canonical product HTML and brand/result source modules.
 * Account transport and login receipt are explicit test adapters in this file.
 * This proves consumer integration, not a real authentication/provider success.
 * Run: node test/browser/brand-account-menu.smoke.mjs
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const evidence=resolve(process.env.ORDER_BRAND_EVIDENCE_DIR||join(root,'browser-evidence/brand-account-menu'));
const checks=[],errors=[],report={classification:'CANONICAL_PRODUCT_HTML_AND_MODULES_WITH_EXPLICIT_TEST_ACCOUNT_ADAPTER',checks,errors,status:'RUNNING',notCovered:['REAL_AUTHENTICATION','REAL_ACCOUNT_DATA','CANONICAL_HTTPS_DEPLOYMENT']};
const mime={'.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.html':'text/html; charset=utf-8'};
let server,browser,page,base;
const fixture=String.raw`
import * as OrderProductBrand from '/brand.mjs';
import {mountQuoteResult,quoteResultScreenCss} from '/quote-result-screen.mjs';
let arrivalAvailable=false,arrivalConsumed=0;
const test={rendered:[],normal:null,result:null};
window.__brandTest=test;
test.authenticatedContext=(arrival=false)=>{
 arrivalAvailable=arrival;
 return {authenticated:true,consumeArrival(){if(!arrivalAvailable)return false;arrivalAvailable=false;arrivalConsumed++;return true;},
  renderPanel({id,container}){test.rendered.push(id);const p=document.createElement('p');p.textContent='TEST ADAPTER '+id;container.append(p);},
  canAccess:()=>true};
};
test.mount=(authenticated=false,arrival=false)=>{
 window.ORDER_BRAND_ACCOUNT_CONTEXT=authenticated?test.authenticatedContext(arrival):undefined;
 const pageStyle=()=>{const style=getComputedStyle(document.getElementById('page-home'));return Object.fromEntries(['position','opacity','transform','filter','willChange'].map(key=>[key,style[key]]));};
 test.pageStyleBefore=pageStyle();
 test.originalPaths=[...document.querySelectorAll('header.header .brand-mark g>path')];
 test.normal=OrderProductBrand.mountOrderBrand();test.pageStyleAfter=pageStyle();return test.normal;
};
test.showResult=(state='saving')=>{
 document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-result'));
 if(!test.result){const style=document.createElement('style');style.textContent=quoteResultScreenCss;document.head.append(style);
  test.result=mountQuoteResult(document.getElementById('receipt'),{brandFactory:OrderProductBrand,get brandAccount(){return window.ORDER_BRAND_ACCOUNT_CONTEXT||{};}});}
 test.result.show({state,current:'50000',proposed:'48000',annualSaving:'24000',savingRate:'4',annualCount:12});
};
test.returnHome=()=>{test.result?.clear();document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id==='page-home'));};
test.receipt=()=>({arrivalConsumed,rendered:[...test.rendered]});
document.documentElement.dataset.brandFixtureReady='true';
`;
async function check(id,fn){const item={id,status:'RUNNING'};checks.push(item);try{await fn();item.status='PASS';}catch(error){
 item.status='FAIL';item.error=String(error.stack||error);
 if(page){try{await page.screenshot({path:join(evidence,'failed-check.png')});report.failedGeometry=await bounds('header.header .brand');}catch(capture){report.captureError=String(capture);}}
 throw error;
}}
async function fresh({authenticated=false,arrival=false,reduced=true}={}){
 await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
 await page.goto(base+'/?authenticated=true&view=member');
 await page.waitForFunction(()=>document.documentElement.dataset.brandFixtureReady==='true');
 await page.evaluate(({authenticated,arrival})=>{document.documentElement.dataset.r3QuotePartition='test-partition-is-not-authentication';__brandTest.mount(authenticated,arrival);},{authenticated,arrival});
}
async function bounds(selector){return page.locator(selector).evaluate(brand=>{
 const paths=[...brand.querySelectorAll('.brand-mark g>path')].map(el=>el.getBoundingClientRect());
 const left=Math.min(...paths.map(r=>r.left)),top=Math.min(...paths.map(r=>r.top)),right=Math.max(...paths.map(r=>r.right)),bottom=Math.max(...paths.map(r=>r.bottom));
 const inspect=el=>{const style=getComputedStyle(el);return {rect:el.getBoundingClientRect().toJSON(),style:Object.fromEntries(['display','position','width','height','left','top','margin','padding','gap','alignItems','justifyContent','transform','translate','fontSize'].map(key=>[key,style[key]]))};};
 return {left,top,width:right-left,height:bottom-top,word:brand.querySelector('.brand-word').getBoundingClientRect().toJSON(),auth:brand.dataset.authenticated,source:brand.dataset.orderBrandSource,
  geometry:{viewport:{width:innerWidth,height:innerHeight},header:inspect(brand.parentElement),brand:inspect(brand),trigger:inspect(brand.querySelector('.obm-trigger')),svg:inspect(brand.querySelector('svg')),groups:[...brand.querySelectorAll('svg>g')].map(el=>({transform:el.getAttribute('transform'),...inspect(el)})),variables:Object.fromEntries([...brand.style].filter(key=>key.startsWith('--obm')).map(key=>[key,brand.style.getPropertyValue(key)]))}};
});}
function closeTo(value,expected,label){assert.ok(Math.abs(value-expected)<.65,`${label}: ${value} vs ${expected}`);}
function geometry(actual,{width=375,authenticated=true}={}){
 closeTo(actual.left,authenticated?width-76:104,'visible mark x');closeTo(actual.top,authenticated?32:31.266745,'visible mark y');
 closeTo(actual.width,51.874008,'visible mark width');closeTo(actual.height,20.747786,'visible mark height');
 closeTo(actual.word.left,24,'word x');closeTo(actual.word.top,29.0234375,'word y');closeTo(actual.word.width,72,'word width');
 assert.equal(actual.auth,String(authenticated));assert.equal(actual.source,'canonical');
}

try{
 await mkdir(evidence,{recursive:true});
 const html=(await readFile(join(root,'web/index.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>','<script type="module" src="/__brand-fixture.mjs"></script></body>');
 server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
  if(pathname==='/__brand-fixture.mjs'){res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(fixture);return;}
  const path=await realpath(join(root,'web',decodeURIComponent(pathname).replace(/^\//,''))),web=await realpath(join(root,'web'));
  if(!path.startsWith(web+sep))throw Error('PATH_OUTSIDE_WEB');
  res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'});res.end(await readFile(path));
 }catch{res.writeHead(404);res.end('Not found');}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});base='http://127.0.0.1:'+server.address().port;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});report.browser=browser.version();
 page=await browser.newPage({viewport:{width:375,height:828},deviceScaleFactor:1});
 page.on('pageerror',error=>errors.push(String(error)));

 await check('guest URL and storage partition cannot grant member menu',async()=>{
  await fresh();geometry(await bounds('header.header .brand'),{authenticated:false});
  await page.locator('header.header .obm-trigger').click();
  assert.equal(await page.locator('[data-order-account-panel]:not([hidden])').count(),0);
  assert.deepEqual(await page.evaluate(()=>__brandTest.pageStyleAfter),await page.evaluate(()=>__brandTest.pageStyleBefore),'account recipes must not change the product page owner');
  assert.equal(await page.evaluate(()=>__brandTest.originalPaths.every((path,i)=>path===document.querySelectorAll('header.header .brand-mark g>path')[i])),true);
  await page.screenshot({path:join(evidence,'guest-375.png')});
 });

 await check('authenticated reload uses exact resting geometry without arrival',async()=>{
  await fresh({authenticated:true});geometry(await bounds('header.header .brand'));
  assert.equal(await page.locator('header.header .brand').getAttribute('data-account-arrival'),null);
  assert.equal(await page.locator('.brand-word>.brand-dot').evaluate(el=>getComputedStyle(el).opacity),'0');
  assert.equal((await page.evaluate(()=>__brandTest.receipt())).arrivalConsumed,0);
  const before=await bounds('header.header .brand');
  await page.evaluate(()=>{const mode=document.createElement('div');mode.className='order-menu';mode.innerHTML='<button type="button" class="order-menu-trigger">▾</button>';document.querySelector('header.header').append(mode);});
  const after=await bounds('header.header .brand');closeTo(after.left,before.left,'mode button does not move member mark');
  await page.screenshot({path:join(evidence,'member-375.png')});
 });

 await check('actual mount consumes one supplied login arrival receipt and settles',async()=>{
  await fresh({authenticated:true,arrival:true,reduced:false});
  await page.waitForFunction(()=>document.querySelector('header.header .brand').dataset.accountArrival==='moving');
  const moving=await bounds('header.header .brand');assert.ok(moving.left<298,'mark travels from guest side before settling');
  await page.screenshot({path:join(evidence,'login-travel-375.png')});
  await page.waitForFunction(()=>document.querySelector('header.header .brand').dataset.accountArrival!=='moving');
  await page.waitForTimeout(1200);geometry(await bounds('header.header .brand'));
  assert.equal((await page.evaluate(()=>__brandTest.receipt())).arrivalConsumed,1);
  await page.screenshot({path:join(evidence,'login-settled-375.png')});
 });

 await check('three roots and their subpages remain in one panel with reverse navigation',async()=>{
  await fresh({authenticated:true});const url=page.url();await page.locator('header.header .obm-trigger').click();
  assert.deepEqual(await page.locator('[data-obm-page=root]>.obm-row>.obm-label').allTextContents(),['프로필','알림','관리']);
  await page.locator('[data-obm-item=profile]').click();
  assert.deepEqual(await page.locator('[data-obm-page=profile] .obm-label').allTextContents(),['계정','개인정보','연결된 계정']);
  await page.locator('[data-obm-item="profile.account"]').click();
  await page.getByText('TEST ADAPTER profile.account').waitFor();
  assert.equal(page.url(),url);
  await page.locator('[data-obm-page="profile.account"] [data-obm-back]').click();
  await page.locator('[data-obm-page=profile] [data-obm-back]').click();
  await page.locator('[data-obm-item=manage]').click();
  assert.deepEqual(await page.locator('[data-obm-page=manage] .obm-label').allTextContents(),['납품일정','결제 및 정산','내 견적','사업장 정보','대시보드']);
  await page.screenshot({path:join(evidence,'manage-panel-375.png')});
  await page.keyboard.press('Escape');assert.equal(await page.locator('[data-order-account-panel]:not([hidden])').count(),0);
  assert.equal(await page.locator('header.header .obm-trigger').evaluate(el=>el===document.activeElement),true);
 });

 await check('visible result consumes canonical original path menu without remounting price nodes',async()=>{
  await page.evaluate(()=>__brandTest.showResult());
  geometry(await bounds('[data-order-result] .oq-brand'));
  assert.equal(await page.locator('[data-order-result] .brand-mark circle').count(),0);
  assert.equal(await page.locator('[data-order-result] .brand-mark g>path').count(),3);
  await page.evaluate(()=>{window.__retainedResultNumber=document.querySelector('.oq-number');__brandTest.showResult('equal');});
  assert.equal(await page.evaluate(()=>window.__retainedResultNumber===document.querySelector('.oq-number')),true);
  await page.locator('[data-order-result] .obm-trigger').click();
  assert.equal(await page.locator('[data-order-account-panel]:not([hidden]) [data-obm-item=profile]').count(),1);
  await page.screenshot({path:join(evidence,'result-member-menu-375.png')});
  await page.evaluate(()=>__brandTest.returnHome());assert.equal(await page.locator('[data-order-account-panel]:not([hidden])').count(),0);
  assert.equal(await page.locator('[data-order-account-panel]').count(),1);
 });

 await check('result and normal consumer retain mobile geometry on resize',async()=>{
  await page.setViewportSize({width:390,height:844});geometry(await bounds('header.header .brand'),{width:390});
  await page.evaluate(()=>__brandTest.showResult('offer'));geometry(await bounds('[data-order-result] .oq-brand'),{width:390});
  await page.screenshot({path:join(evidence,'result-member-390.png')});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 });
 assert.deepEqual(errors,[]);
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{
 if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));
 report.sourceHashes={};for(const name of ['web/brand.mjs','web/brand-account-menu.mjs','web/quote-result-screen.mjs','web/styles.css','web/app.mjs']){
  try{report.sourceHashes[name]=createHash('sha256').update(await readFile(join(root,name))).digest('hex');}catch{}
 }
 await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({status:report.status,checks:checks.map(({id,status})=>({id,status})),errors,evidence,error:report.error,failedGeometry:report.failedGeometry}));
}
