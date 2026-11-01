/** Actual Chromium + built product DOM. DNS/contact/address fixtures are synthetic.
 * Run after npm run build: node test/browser/product.smoke.mjs
 * No public QA host, provider success, mailbox ownership, OS or order acceptance.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import {dirname,resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const dist=join(root,'dist'),evidence=resolve(process.env.ORDER_SMOKE_EVIDENCE_DIR||join(root,'browser-evidence/product'));
const key='order_v015R2_draft';
const checks=[],pageErrors=[],network=[],externalBlocked=[],transportErrors=[];
const report={schemaVersion:1,classification:'ACTUAL_CHROMIUM_LOCAL_HTTP_PRODUCT_DOM_WITH_SYNTHETIC_DNS_AND_TEST_CONTACTS',
  browser:null,build:null,checks,pageErrors,network,externalBlocked,transportErrors,
  notCovered:['LIVE_DNS','REAL_ADDRESS_PROVIDER','MAILBOX_OWNERSHIP','REAL_PRICE','ORDER_OR_PAYMENT','WINDOWS','IPHONE','CANONICAL_HTTPS_DEPLOYMENT'],status:'RUNNING'};
let server,browser,page,base;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
async function check(id,fn){const row={id,status:'RUNNING'};checks.push(row);try{await fn();row.status='PASS';}catch(error){row.status='FAIL';row.error=String(error.stack||error);throw error;}}
const persisted=()=>page.evaluate(storageKey=>JSON.parse(sessionStorage.getItem(storageKey)||'null'),key);
async function formReady(){await page.locator('#page-form.active').waitFor({state:'visible'});assert.equal(new URL(page.url()).hash,'#/form');assert.equal(await page.locator('#page-form').evaluate(el=>el.inert||el.getAttribute('aria-hidden')==='true'),false);}
async function stage(name){await formReady();const trigger=page.locator(`.accordion-trigger[data-open="${name}"]`);if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();await page.waitForFunction(name=>document.querySelector(`#section-${name}`)?.dataset.open==='true'&&!document.querySelector(`#body-${name}>div`)?.inert,name);}
async function closed(id){await page.waitForFunction(id=>document.getElementById(id)?.open===false,id);await page.locator('#'+id).waitFor({state:'hidden'});}
async function editSite(id){await stage('q3');const trigger=page.locator(`[id="q3-site-${id}"] > .accordion-trigger`);if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();await page.locator(`[data-site-edit="${id}"]`).click();await page.locator('#site-editor-dialog[open]').waitFor({state:'visible'});}
async function phoneState(){return page.evaluate(()=>{const c=OrderPhone.instance(document.getElementById('site-contact-phone'));return {value:c.get(),valid:c.parse().valid,contract:typeof c.contract==='function'?c.contract():null,parts:c.parts.filter(p=>!p.hidden).map(p=>p.value)};});}
async function phonePaste(text){await page.locator('#site-contact-phone').focus();await page.locator('#site-contact-phone').evaluate((el,text)=>{const data=new DataTransfer();data.setData('text/plain',text);el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},text);}
async function emailReady(){await page.waitForFunction(()=>window.OrderEmailDomain&&OrderEmailDomain.isSuccess(OrderEmailDomain.status('qa@example.com')),{},{timeout:10000});}
async function editAllocation(){await stage('q4');const toggle=page.locator('[data-q4-body-toggle="qa-line"]');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await page.locator('[data-edit-allocation="qa-allocation"]').click();await page.locator('#q4-regular-dialog[open]').waitFor();}
async function allocationSite(index){const trigger=page.locator(`[data-acc="site-${index}"]`);if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();}

// Explicit restore fixture reaches Q4 while real address entry remains a separate gate.
function q4Fixture(){
 const holiday={days:[],none:true,irregular:false,conflict:'협의 후 조정',weekend:'협의 후 조정',holiday:'협의 후 조정',subholiday:'협의 후 조정',request:''};
 const repeat={period:'매주',frequency:'1회',date:'',dateMode:'custom',weeklyCheck:false,weekdays:{},weekOpen:0,semantics:'per-week-v1',legacyReviewRequired:false};
 return {lines:[{id:'qa-line',housing:'4',size:'특란',pack:'30',qty:'120',price:'8000'}],current:'qa-line',open:'q4',
 locations:[{id:'qa-site',name:'합성 QA 사업장',road:'합성 주소 — 실제 공급자 조회 아님',detail:'합성 상세',postal:'00000',contactPhone:'010-2345-6789',email:'qa@example.com',storePhone:'',status:'QA_SYNTHETIC',providerId:'QA_SYNTHETIC_NOT_PROVIDER',addressState:'PRESENT_REQUIRES_PROVIDER_POLICY',basicInfoDraft:false,mailboxVerified:false}],
 allocations:[{id:'qa-allocation',lineId:'qa-line',locationId:'qa-site',mode:'FLEX',modeExplicit:true,qty:'10',monthlyDemandQty:'120',variableQty:false,qtyMin:'',qtyMax:'',qualityTest:false,
 advanced:{contactChannels:['phone'],fixedOrderProcess:'seller',flexOrderProcess:'store',storeOffDays:[],storeOffNone:true,storeOffPolicy:'ask',weekend:'ask',holiday:'ask',substituteHoliday:'ask'},
 q4Review:{version:'0460',pack:'30',profile:'FLEX',activeHoliday:holiday,activeRepeat:repeat,common:{contact:{phone:true,sms:false,kakao:false,email:false},process:'shop',quality:false,holiday,repeat}}}]};
}
function multiSiteFixture(){
 const fixture=q4Fixture();fixture.lines[0].qty='200';fixture.lines[0].qtyUnit='each';
 fixture.locations.push({...structuredClone(fixture.locations[0]),id:'qa-site-b',name:'합성 QA 사업장 B'});
 fixture.allocations[0].monthlyDemandQty='50';fixture.allocations[0].monthlyDemandUnit='each';fixture.allocations[0].monthlyDemandSource='manual';
 fixture.allocations.push({...structuredClone(fixture.allocations[0]),id:'qa-allocation-b',locationId:'qa-site-b',monthlyDemandQty:''});
 return fixture;
}

try{
 await mkdir(evidence,{recursive:true});
 const identity=JSON.parse(await readFile(join(dist,'build-identity.json'),'utf8'));
 assert.equal(identity.scope,'INTEGRATED_PRODUCT','Build the integrated product first; engine-only output is not a webpage');
 assert.equal(identity.canonicalUrl,'https://order-ooo.pages.dev/');report.build={commitSha:identity.commitSha,uxHandoff:identity.uxHandoff};
 const realDist=await realpath(dist);
 server=createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
   const file=await realpath(resolve(dist,'.'+relative));if(!file.startsWith(realDist+sep))throw Error('PATH_OUTSIDE_DIST');
   const bytes=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(bytes);
  }catch{res.writeHead(404,{'content-type':'text/plain'}).end('Not found');}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});report.browser=browser.version();
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.route('**/*',async route=>{
  try{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===base){assert.equal(request.method(),'GET','product smoke must not send writes');return await route.continue();}
  if(['cloudflare-dns.com','dns.google'].includes(url.hostname)){
   const name=url.searchParams.get('name'),type=url.searchParams.get('type');
   assert.ok(name&&!name.includes('@'),'DNS receives domain only');
   const typeId={A:1,MX:15,AAAA:28}[type];assert.ok(typeId,'unexpected DNS type');network.push({name,type,fixture:true});
   let answers=[];
   if(name==='example.com'&&type==='MX')answers=[{name,type:15,TTL:60,data:'10 mx.example.com.'}];
   else if(name==='mx.example.com'&&type==='A')answers=[{name,type:1,TTL:60,data:'192.0.2.1'}];
   else if(name!=='mx.example.com')throw Error('UNDECLARED_DNS_FIXTURE:'+name+'/'+type);
   return await route.fulfill({status:200,headers:{'content-type':'application/dns-json','access-control-allow-origin':'*','cache-control':'no-store'},body:JSON.stringify({Status:0,Question:[{name,type:typeId}],Answer:answers,Authority:answers.length?[]:[{name:'example.com',type:6,TTL:60,data:'ns.example.com. hostmaster.example.com. 1 60 60 60 60'}]})});
  }
  externalBlocked.push(url.origin+url.pathname);return await route.abort('blockedbyclient');
  }catch(error){transportErrors.push(String(error.stack||error));await route.abort('failed').catch(()=>{});}
 });
 page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>pageErrors.push(String(error)));
 await page.goto(base);await page.locator('#start').waitFor();
 await check('P01_F00_Q1_Q2_REAL_DOM',async()=>{
  await page.locator('#start').click();await formReady();assert.equal(await page.locator('#page-home').evaluate(el=>el.inert&&el.getAttribute('aria-hidden')==='true'),true);
  for(const [field,value]of [['housing','4'],['size','특란'],['pack','30']])await page.locator(`[data-pick="${field}"][data-value="${value}"]`).click();
  await page.locator('[data-line-qty]').fill('120');await page.locator('[data-line-price]').fill('8000');
  assert.equal((await persisted()).lines[0].qty,'120');assert.equal((await persisted()).lines[0].price,'8000');
  assert.match(await page.locator('#q2-total').innerText(),/960,000/);
  await page.locator('[data-line-qty-unit]').selectOption('each');
  assert.equal((await persisted()).lines[0].qtyUnit,'each');assert.equal((await persisted()).lines[0].qty,'3600');
  assert.match(await page.locator('#q2-total').innerText(),/960,000/,'unit changes preserve 3,600 eggs and the original current purchase cost');
  await page.locator('[data-line-qty-unit]').selectOption('tray');assert.equal((await persisted()).lines[0].qty,'120');assert.match(await page.locator('#q2-total').innerText(),/960,000/);
  await page.locator('[data-line-qty-unit]').selectOption('each');await page.locator('[data-line-qty]').fill('50');await page.locator('[data-line-qty-unit]').selectOption('tray');
  const fractional=(await persisted()).lines[0];assert.equal(fractional.qty,'5/3');assert.deepEqual(fractional.qtyExact,{representation:'rational',conversionReviewed:true,numerator:'5',denominator:'3'});
  assert.equal(await page.locator('[data-line-qty]').inputValue(),'5/3');assert.match(await page.locator('#q2-total').innerText(),/40,000\/3/,'50 eggs retain their exact current purchase cost without invented rounding');
  await page.reload();await stage('q2');assert.equal(await page.locator('[data-line-qty]').inputValue(),'5/3');
  await page.locator('[data-line-qty-unit]').selectOption('each');assert.equal((await persisted()).lines[0].qty,'50');await page.locator('[data-line-qty]').fill('3600');await page.locator('[data-line-qty-unit]').selectOption('tray');assert.equal((await persisted()).lines[0].qty,'120');
  await page.locator('#q2-next').click();await page.locator('#add-site').click();await page.locator('#site-editor-dialog[open]').waitFor();
 });
 await check('P02_PHONE_KEYBOARD_02_EXPLICIT_3',async()=>{
  await page.locator('#site-name').fill('합성 QA 사업장 A');await page.locator('#site-contact-phone').focus();await page.keyboard.type('02');
  await page.locator('#site-contact-phone-part2').focus();await page.keyboard.type('234');await page.keyboard.press('Tab');await page.keyboard.type('5678');
  const state=await phoneState();assert.equal(state.value,'02-234-5678');assert.equal(state.valid,true);assert.equal(state.contract?.status,'VALID','product must mount core-backed adapter');
 });
 await check('P03_PHONE_070_PLUS82_REPRESENTATIVE_SYNTHETIC_PASTE',async()=>{
  await phonePaste('07023456789');assert.deepEqual((await phoneState()).parts,['070','2345','6789']);
  const middle=page.locator('#site-contact-phone-part2');await middle.fill('234');assert.equal((await phoneState()).valid,false,'070 middle3 never completed');
  await phonePaste('+82 10 2345 6789');assert.deepEqual((await phoneState()).parts,['010','2345','6789']);
  await page.locator('#site-contact-phone-part3').focus();await page.locator('#site-contact-phone-part3').evaluate(el=>{el.setSelectionRange(1,3);const data=new DataTransfer();data.setData('text/plain','12345678');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
  assert.equal((await phoneState()).value,'010-2345-6789','invalid partial paste must not truncate or overwrite a complete number');
  assert.deepEqual(await page.locator('#site-contact-phone-part3').evaluate(el=>[el.selectionStart,el.selectionEnd]),[1,3]);
  await page.locator('#site-store-phone').evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','15881234');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
  assert.equal(await page.evaluate(()=>OrderPhone.get(document.getElementById('site-store-phone'))),'1588-1234');
 });
 await check('P04_Q3_SAVE_CANCEL_RELOAD_SYNTHETIC_DNS_ADDRESS_PENDING',async()=>{
  await page.locator('#site-email').fill('qa@example.com');await page.locator('#site-name').focus();await emailReady();
  await page.locator('#save-site').click();await closed('site-editor-dialog');
  const saved=(await persisted()).locations;assert.equal(saved.length,1);assert.equal(saved[0].contactPhone,'010-2345-6789');assert.equal(saved[0].storePhone,'1588-1234');assert.equal(saved[0].road,'');assert.equal(saved[0].basicInfoDraft,true,'address pending is not false product completion');
  await editSite(saved[0].id);await page.locator('#site-name').fill('취소할 합성 변경');await page.locator('#cancel-site').click();await closed('site-editor-dialog');assert.deepEqual((await persisted()).locations,saved);
  await page.reload();await stage('q3');assert.deepEqual((await persisted()).locations,saved);
  await editSite(saved[0].id);assert.equal((await phoneState()).value,'010-2345-6789');await page.locator('#cancel-site').click();await closed('site-editor-dialog');
 });
 await check('P05_Q4_SYNTHETIC_RESTORE_CANCEL_ATOMICITY',async()=>{
  const fixture=q4Fixture();await page.evaluate(({key,fixture})=>sessionStorage.setItem(key,JSON.stringify(fixture)),{key,fixture});await page.reload();await page.locator('[data-open="q4"]').waitFor();await emailReady();
  const prior=(await persisted()).allocations;await editAllocation();await page.locator('[data-qty="0:base"]').fill('11');await page.locator('#q4-regular-cancel').click();await closed('q4-regular-dialog');assert.deepEqual((await persisted()).allocations,prior);
 });
 await check('P06_Q4_SYNTHETIC_RESTORE_SAVE_AND_RELOAD',async()=>{
  await editAllocation();await page.locator('[data-qty="0:base"]').fill('12');await page.locator('#q4-regular-save').click();await closed('q4-regular-dialog');
  assert.equal((await persisted()).allocations[0].qty,'12');await page.reload();await editAllocation();assert.equal(await page.locator('[data-qty="0:base"]').inputValue(),'12');
  await page.locator('#q4-regular-cancel').click();await closed('q4-regular-dialog');
 });
 await check('P07_Q4_MONTH_31_AND_LAST_REMAIN_DISTINCT_CANCELLED',async()=>{
  const prior=(await persisted()).allocations;await editAllocation();await page.locator('[data-choice="delivery"][data-value="FIXED"]').click();
  await page.locator('[data-combo="period"]').click();await page.locator('[data-combo-choice="period"][data-value="매월"]').click();
  const date=page.locator('[data-month-date="date"]');await date.fill('32');assert.equal(await date.inputValue(),'31');await date.press('Enter');
  await page.locator('[data-combo="date"]').click();await page.locator('[data-combo-choice="date"][data-value="말일"]').click();assert.equal(await date.inputValue(),'말일');
  await page.locator('#q4-regular-cancel').click();await closed('q4-regular-dialog');assert.deepEqual((await persisted()).allocations,prior);
 });
 await check('P08_Q4_MULTISITE_DERIVED_REMAINDER_EXCESS_CANCEL',async()=>{
  const fixture=multiSiteFixture();await page.evaluate(({key,fixture})=>sessionStorage.setItem(key,JSON.stringify(fixture)),{key,fixture});await page.reload();await emailReady();
  const prior=(await persisted()).allocations;await editAllocation();
  assert.equal(await page.locator('[data-qty="0:monthly"]').inputValue(),'50');assert.equal(await page.locator('[data-qty="1:monthly"]').inputValue(),'150');
  assert.equal(await page.locator('[data-field-group="1-monthly"]').getAttribute('data-quantity-source'),'derived');
  assert.match(await page.locator('[data-monthly-feedback="0"]').innerText(),/남은 배분량 150개/);assert.match(await page.locator('[data-monthly-feedback="0"]').innerText(),/현재 입력 상한 200개/);
  await allocationSite(0);await page.locator('[data-qty="0:monthly"]').fill('60');assert.equal(await page.locator('[data-qty="1:monthly"]').inputValue(),'140');assert.deepEqual((await persisted()).allocations,prior);
  await allocationSite(1);await page.locator('[data-qty="1:monthly"]').fill('150');await page.locator('#q4-regular-save').click();
  assert.equal(await page.locator('#q4-regular-dialog').evaluate(el=>el.open),true,'210 eggs cannot overwrite a 200-egg monthly allocation');assert.deepEqual((await persisted()).allocations,prior);
  await page.locator('#q4-regular-cancel').click();await closed('q4-regular-dialog');assert.deepEqual((await persisted()).allocations,prior);
 });
 await check('P09_Q4_MULTISITE_CONFIRM_DERIVED_SAVE_RELOAD',async()=>{
  await editAllocation();await allocationSite(0);await page.locator('[data-qty="0:monthly"]').fill('60');assert.equal(await page.locator('[data-qty="1:monthly"]').inputValue(),'140');
  await page.locator('#q4-regular-save').click();await closed('q4-regular-dialog');
  const saved=(await persisted()).allocations;assert.deepEqual(saved.map(a=>a.monthlyDemandQty),['60','140']);assert.deepEqual(saved.map(a=>a.monthlyDemandUnit),['each','each']);assert.deepEqual(saved.map(a=>a.qty),['10','10'],'monthly distribution never overwrites per-delivery quantity');
  await page.reload();await emailReady();assert.deepEqual((await persisted()).allocations,saved);await editAllocation();assert.equal(await page.locator('[data-qty="0:monthly"]').inputValue(),'60');assert.equal(await page.locator('[data-qty="1:monthly"]').inputValue(),'140');
  await page.locator('#q4-regular-cancel').click();await closed('q4-regular-dialog');
 });
 await check('P10_BROWSER_ERRORS_NETWORK_SCOPE_AND_MOBILE_OVERFLOW',async()=>{
  assert.deepEqual(pageErrors,[]);assert.deepEqual(externalBlocked,[]);assert.deepEqual(transportErrors,[]);assert.ok(network.length>0,'the DNS transport fixture must actually have been exercised');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 });
 report.status='PASS';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;if(page)await page.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{});
}finally{
 await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
 await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'product.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}
