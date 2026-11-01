/** MSG0510: real Chromium profile, native Web Locks/localStorage and built product.
 * Synthetic contact/DNS data only; local HTTP deployment revision is a controlled
 * asset refresh, never a claim that canonical HTTPS or a user's device was tested.
 * Run after npm run build: node test/browser/storage.smoke.mjs
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,mkdtemp,realpath,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {storageDiagnostics} from './storage-diagnostics.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dist=join(root,'dist');
const evidence=resolve(process.env.ORDER_STORAGE_EVIDENCE_DIR||join(root,'browser-evidence/storage'));
const KEY='order_q1_q4_v1',LOCK='order-q1-q4-storage',R2='order_v015R2_draft',R1='order_v015R1_draft';
const checks=[],errors=[],requests=[],profileLaunches=[],assetRequests=[],ianaRequests=[],diagnostics=[];
const report={schemaVersion:1,classification:'ACTUAL_CHROMIUM_NATIVE_STORAGE_WEB_LOCKS_PERSISTENT_PROFILE_LOCAL_HTTP',checks,errors,requests,profileLaunches,assetRequests,ianaRequests,diagnostics,
 scope:{syntheticContacts:true,syntheticDns:true,nativeLocalStorage:false,nativeWebLocks:false,uniqueTemporaryProfile:true,profileProcessRelaunch:false,sameOriginControlledAssetRefresh:false,canonicalDeployment:false,personalBrowserProfile:false},
 notCovered:['CANONICAL_HTTPS_DEPLOYMENT','USER_PC','WINDOWS','IPHONE','ANDROID','LIVE_DNS','MAILBOX_OWNERSHIP','REAL_ADDRESS_PROVIDER','REAL_PRICE','ORDER_OR_PAYMENT'],status:'RUNNING'};
let server,context,page,harness,base,profile,chromium,buildIdentity,deploymentRevision=1;
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
function fixture(){
 const holiday={days:[],none:true,irregular:false,conflict:'협의 후 조정',weekend:'협의 후 조정',holiday:'협의 후 조정',subholiday:'협의 후 조정',request:''};
 const repeat={period:'매주',frequency:'1회',date:'',dateMode:'custom',weeklyCheck:false,weekdays:{},weekOpen:0,semantics:'per-week-v1',legacyReviewRequired:false};
 return {allocationRevision:0,current:'storage-sku',open:'q4',lines:[{id:'storage-sku',housing:'4',size:'특란',pack:'30',qty:'200',qtyUnit:'each',price:'8000'}],
 locations:['A','B'].map(id=>({id:'storage-'+id,name:'합성 저장 검사 '+id,road:'합성 주소 — 실제 공급자 조회 아님',detail:'합성 상세',postal:'00000',contactPhone:'010-2345-6789',storePhone:'',email:'qa@example.com',addressState:'PRESENT_REQUIRES_PROVIDER_POLICY',basicInfoDraft:false,mailboxVerified:false})),
 allocations:['A','B'].map((id,index)=>({id:'storage-allocation-'+id,lineId:'storage-sku',locationId:'storage-'+id,mode:'FLEX',modeExplicit:true,qty:'10',monthlyDemandQty:index?'150':'50',monthlyDemandUnit:'each',monthlyDemandSource:index?'derived':'manual',variableQty:false,qtyMin:'',qtyMax:'',qualityTest:false,
 advanced:{contactChannels:['phone'],fixedOrderProcess:'seller',flexOrderProcess:'store',storeOffDays:[],storeOffNone:true,storeOffPolicy:'ask',weekend:'ask',holiday:'ask',substituteHoliday:'ask'},
 q4Review:{version:'0460',pack:'30',profile:'FLEX',activeHoliday:structuredClone(holiday),activeRepeat:structuredClone(repeat),common:{contact:{phone:true,sms:false,kakao:false,email:false},process:'shop',quality:false,holiday:structuredClone(holiday),repeat:structuredClone(repeat)}}}))};
}
async function check(id,fn){const item={id,status:'RUNNING'};checks.push(item);try{await fn(item);item.status='PASS';}catch(error){item.status='FAIL';item.error=String(error.stack||error);throw error;}}
async function adapter(tab,action,args=[],options={}){return tab.evaluate(async({action,args,options})=>{
 const {createBrowserStorage}=await import('/storage.mjs');const dependencies={};
 if(options.noLocks)dependencies.locks=null;
 if(options.failWrites)dependencies.localStorage={getItem:key=>localStorage.getItem(key),setItem(){throw new DOMException('Synthetic quota failure','QuotaExceededError');},removeItem:key=>localStorage.removeItem(key)};
 const store=createBrowserStorage(dependencies);return store[action](...args);
},{action,args,options});}
const envelope=tab=>tab.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),KEY);
const rawRecord=tab=>tab.evaluate(key=>localStorage.getItem(key),KEY);
async function settled(tab=page){await tab.waitForFunction(()=>document.documentElement.dataset.storageReady==='true'&&document.documentElement.dataset.storagePending!=='true');}
async function newHarness(){const tab=await context.newPage();tab.setDefaultTimeout(15000);await tab.goto(base+'/__storage_test_harness');return tab;}
async function clean(tab=harness){await tab.evaluate(()=>{localStorage.clear();sessionStorage.clear();});}
async function seed(data=fixture()){const loaded=await adapter(harness,'load');assert.equal(loaded.ok,true,JSON.stringify(loaded));const saved=await adapter(harness,'commit',[data,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'fixture-'+crypto.randomUUID()}]);assert.equal(saved.ok,true,JSON.stringify(saved));return saved;}
async function product(tab=page){await tab.goto(base+'/#/form');await settled(tab);await tab.locator('#page-form.active').waitFor({state:'visible'});}
async function stage(tab,name){await settled(tab);const trigger=tab.locator(`.accordion-trigger[data-open="${name}"]`);if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();await settled(tab);}
async function openQ4(){await stage(page,'q4');const toggle=page.locator('[data-q4-body-toggle="storage-sku"]');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await page.locator('[data-edit-allocation="storage-allocation-A"]').click();await page.locator('#q4-regular-dialog[open]').waitFor({state:'visible'});}
async function closeQ4(){await page.waitForFunction(()=>!document.getElementById('q4-regular-dialog').open);await settled();}
async function revealSite(index){const trigger=page.locator(`[data-acc="site-${index}"]`);if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();}
async function dnsReady(tab=page){try{await tab.waitForFunction(()=>window.OrderEmailDomain&&OrderEmailDomain.isSuccess(OrderEmailDomain.status('qa@example.com')));}
 catch(error){const snapshot=await tab.evaluate(storageDiagnostics,{key:KEY}).catch(()=>({status:'SNAPSHOT_UNAVAILABLE'}));diagnostics.push({phase:'DNS_READY_TIMEOUT',launch:profileLaunches.length,at:new Date().toISOString(),...snapshot,syntheticDnsRequestsThisLaunch:requests.filter(r=>r.launch===profileLaunches.length).length,ianaRequestsThisLaunch:ianaRequests.filter(r=>r.launch===profileLaunches.length)});throw error;}}
async function launchProfile(){
 context=await chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox'],viewport:{width:390,height:844},reducedMotion:'reduce'});
 context.on('page',tab=>{tab.setDefaultTimeout(15000);tab.on('pageerror',error=>errors.push(String(error)));
  const tracked=new Map();
  tab.on('request',request=>{if(new URL(request.url()).pathname!=='/assets/iana-reference.json')return;const row={launch:profileLaunches.length,requestedAt:new Date().toISOString(),resource:'SAME_ORIGIN_IANA_REFERENCE',status:'REQUESTED'};tracked.set(request,row);ianaRequests.push(row);});
  tab.on('response',response=>{const row=tracked.get(response.request());if(row)Object.assign(row,{httpStatus:response.status(),status:'RESPONSE',respondedAt:new Date().toISOString()});});
  tab.on('requestfailed',request=>{const row=tracked.get(request);if(row)Object.assign(row,{status:'REQUEST_FAILED',failedAt:new Date().toISOString()});});
 });
 profileLaunches.push({number:profileLaunches.length+1,at:new Date().toISOString(),sameUserDataDir:true,closed:false});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===base)return route.continue();
  if(['cloudflare-dns.com','dns.google'].includes(url.hostname)){
   const name=url.searchParams.get('name'),type=url.searchParams.get('type'),kind={MX:15,A:1,AAAA:28}[type];requests.push({name,type,synthetic:true,launch:profileLaunches.length});
   let answers=[];if(name==='example.com'&&type==='MX')answers=[{name,type:15,TTL:60,data:'10 mx.example.com.'}];else if(name==='mx.example.com'&&type==='A')answers=[{name,type:1,TTL:60,data:'192.0.2.1'}];
   if(!kind||![ 'example.com','mx.example.com'].includes(name)){errors.push('UNDECLARED_DNS_FIXTURE');return route.abort('failed');}
   return route.fulfill({status:200,headers:{'content-type':'application/dns-json','access-control-allow-origin':'*'},body:JSON.stringify({Status:0,Question:[{name,type:kind}],Answer:answers})});
  }
  errors.push('UNEXPECTED_EXTERNAL_REQUEST:'+url.origin+url.pathname);return route.abort('blockedbyclient');
 });
 page=await context.newPage();page.setDefaultTimeout(15000);harness=await newHarness();
 report.browser=await harness.evaluate(()=>navigator.userAgent);assert.equal(await harness.evaluate(()=>!!navigator.locks?.request),true,'native Web Locks required');report.scope.nativeWebLocks=true;report.scope.nativeLocalStorage=true;
}
async function closeProfile(){await context.close();profileLaunches.at(-1).closed=true;profileLaunches.at(-1).closedAt=new Date().toISOString();context=null;}
try{
 await mkdir(evidence,{recursive:true});buildIdentity=JSON.parse(await readFile(join(dist,'build-identity.json'),'utf8'));assert.equal(buildIdentity.scope,'INTEGRATED_PRODUCT');report.build={commitSha:buildIdentity.commitSha,uxHandoff:buildIdentity.uxHandoff};
 const realDist=await realpath(dist);
 server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost');if(url.pathname==='/__storage_test_harness'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end('<!doctype html><title>Test-owned storage harness</title>');return;}
  const path=await realpath(resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)));if(!path.startsWith(realDist+sep))throw Error('OUTSIDE_DIST');let bytes=await readFile(path);
  if(path.endsWith('/index.html'))bytes=Buffer.from(bytes.toString().replace('</head>',`<meta name="test-deployment-revision" content="${deploymentRevision}"></head>`));
  if(path.endsWith('/main.mjs')){assetRequests.push({asset:'main.mjs',deploymentRevision});bytes=Buffer.concat([bytes,Buffer.from(`\n// TEST-ONLY controlled same-origin asset revision ${deploymentRevision}\n`)]);}
  res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store','x-test-deployment-revision':String(deploymentRevision)}).end(bytes);
 }catch{res.writeHead(404).end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;report.origin=base;
 ({chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'));
 profile=await mkdtemp(join(tmpdir(),'order-storage-profile-'));await launchProfile();
 await check('S01_COMMITTED_Q1_Q4_ID_UNIT_SOURCE_AND_PRODUCT_RELOAD',async()=>{
  await clean();await seed();await product();await dnsReady();const stored=await envelope(page);
  assert.equal(stored.schemaVersion,3);assert.equal(stored.state,'data');assert.equal(stored.data.lines[0].qty,'200');assert.equal(stored.data.lines[0].qtyUnit,'each');
  assert.deepEqual(stored.data.allocations.map(a=>[a.locationId,a.monthlyDemandQty,a.monthlyDemandSource,a.qty]),[['storage-A','50','manual','10'],['storage-B','150','derived','10']]);
  assert.equal(stored.data.locations[0].contactPhone,'010-2345-6789');await page.reload();await settled();assert.deepEqual((await envelope(page)).data,stored.data);
 });
 await check('S04_NEW_TAB_SAME_ORIGIN_ASSET_REFRESH_AND_DNS_RECHECK',async()=>{
  const before=await envelope(page),requestsBefore=requests.length;const tab=await context.newPage();await product(tab);await dnsReady(tab);assert.deepEqual((await envelope(tab)).data,before.data);assert.ok(requests.length>requestsBefore,'new tab must query DNS instead of restoring a persisted PASS');await tab.close();
  deploymentRevision=2;await page.reload();await settled();assert.equal(await page.locator('meta[name="test-deployment-revision"]').getAttribute('content'),'2');assert.ok(assetRequests.some(r=>r.deploymentRevision===2));assert.deepEqual((await envelope(page)).data,before.data);report.scope.sameOriginControlledAssetRefresh=true;
 });
 await check('S04_FULL_BROWSER_PROFILE_CLOSE_AND_RELAUNCH',async()=>{
  const before=await envelope(page),requestsBefore=requests.length;await closeProfile();assert.equal(profileLaunches.length,1);assert.equal(profileLaunches[0].closed,true);await launchProfile();await product();await dnsReady();
  assert.deepEqual((await envelope(page)).data,before.data);assert.ok(requests.length>requestsBefore);report.scope.profileProcessRelaunch=true;
 });
 await check('S02_PRODUCT_CANCEL_ESCAPE_AND_DUPLICATE_CONFIRM_ONE_WRITE',async()=>{
  await openQ4();const before=await envelope(page);await revealSite(0);await page.locator('[data-qty="0:monthly"]').fill('60');assert.equal(await page.locator('[data-qty="1:monthly"]').inputValue(),'140');assert.deepEqual(await envelope(page),before);
  await page.keyboard.press('Escape');await closeQ4();assert.deepEqual(await envelope(page),before);
  await openQ4();await revealSite(0);await page.locator('[data-qty="0:monthly"]').fill('60');await page.locator('#q4-regular-save').evaluate(button=>{button.click();button.click();});await closeQ4();
  const after=await envelope(page);assert.equal(after.revision,before.revision+1);assert.deepEqual(after.data.allocations.map(a=>a.monthlyDemandQty),['60','140']);assert.deepEqual(after.data.allocations.map(a=>a.qty),['10','10']);
 });
 await check('S02_BROWSER_BACK_DROPS_UNCONFIRMED_DOCUMENT_DRAFT',async()=>{
  await page.goto(base+'/__storage_test_harness');await product();await dnsReady();const before=await envelope(page);await openQ4();await page.locator('[data-qty="0:base"]').fill('13');await page.goBack();assert.equal(new URL(page.url()).pathname,'/__storage_test_harness');assert.deepEqual(await envelope(page),before);await product();await dnsReady();await openQ4();assert.equal(await page.locator('[data-qty="0:base"]').inputValue(),before.data.allocations[0].qty);await page.locator('#q4-regular-cancel').click();await closeQ4();
 });
 await check('S02_CANCEL_WHILE_REAL_WEB_LOCK_QUEUES_COMMIT',async()=>{
  await openQ4();await page.locator('[data-qty="0:base"]').fill('11');const before=await envelope(page);
  await harness.evaluate(async name=>{let entered;const acquired=new Promise(resolve=>entered=resolve);window.__storageTestHeld=navigator.locks.request(name,async()=>{entered();await new Promise(resolve=>window.__storageTestRelease=resolve);});await acquired;},LOCK);
  try{await page.locator('#q4-regular-save').click();await page.waitForFunction(()=>document.documentElement.dataset.storagePending==='true');await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('q4-regular-dialog').open);}
  finally{await harness.evaluate(()=>window.__storageTestRelease());}
  await settled();assert.deepEqual(await envelope(page),before,'cancelled queued draft cannot later commit');assert.equal(await page.locator('#q4-commit-error').count(),0,'late cancelled response cannot paint an error into a closed editor');
 });
 await check('S03_PRODUCT_QUOTA_FAILURE_RETAINS_DRAFT_AND_DURABLE_DATA',async()=>{
  await openQ4();await page.locator('[data-qty="0:base"]').fill('12');const before=await envelope(page);
  await page.evaluate(key=>{window.__storageTestOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,value){if(k===key)throw new DOMException('Test quota','QuotaExceededError');return window.__storageTestOriginalSet.call(this,k,value);};},KEY);
  try{await page.locator('#q4-regular-save').click();await settled();assert.equal(await page.locator('#q4-regular-dialog').evaluate(el=>el.open),true);assert.equal(await page.locator('[data-qty="0:base"]').inputValue(),'12');assert.deepEqual(await envelope(page),before);assert.equal(await page.evaluate(()=>document.documentElement.dataset.storageStatus),'WRITE_FAILED');}
  finally{await page.evaluate(()=>{Storage.prototype.setItem=window.__storageTestOriginalSet;delete window.__storageTestOriginalSet;});}
  await page.locator('#q4-regular-save').click();await closeQ4();assert.equal((await envelope(page)).data.allocations[0].qty,'12');
 });
 await check('S03_TWO_PRODUCT_TABS_STALE_Q2_DRAFT_AND_EXPLICIT_RESET',async()=>{
  await page.close();await clean();const data=fixture();data.open='q2';await seed(data);page=await context.newPage();await product();const tab=await context.newPage();await product(tab);
  await stage(page,'q2');await stage(tab,'q2');await page.locator('[data-line-qty]').fill('240');await settled();const committed=await envelope(page);
  await tab.locator('[data-line-qty]').fill('100');await settled(tab);assert.equal(await tab.locator('[data-line-qty]').inputValue(),'100');assert.equal(await tab.evaluate(()=>document.documentElement.dataset.storageStatus),'CONFLICT');assert.equal(await tab.locator('#form-error').isVisible(),true);assert.deepEqual(await envelope(tab),committed);
  await page.locator('#reset-input').click();await page.locator('#reset-input-confirm').waitFor({state:'visible'});await page.locator('[data-reset-confirm]').click();await settled();const reset=await envelope(page);assert.equal(reset.state,'reset');assert.equal(reset.revision,committed.revision+1);
  await tab.evaluate(({R2,data})=>sessionStorage.setItem(R2,JSON.stringify(data)),{R2,data});await tab.locator('[data-line-qty]').fill('110');await settled(tab);assert.deepEqual(await envelope(tab),reset);await tab.reload();await settled(tab);assert.equal((await envelope(tab)).state,'reset');await tab.close();
 });
 await check('S02_R2_AND_R1_MIGRATE_ONCE_KEEP_UNRELATED_SESSION',async()=>{
  await page.close();page=harness;
  for(const legacyKey of [R2,R1]){await clean();const source=fixture();await harness.evaluate(({legacyKey,source})=>{sessionStorage.setItem(legacyKey,JSON.stringify(source));sessionStorage.setItem('unrelated-test-value','keep');},{legacyKey,source});
   const loaded=await adapter(harness,'load');assert.equal(loaded.ok,true,JSON.stringify(loaded));assert.equal(loaded.status,'MIGRATED');assert.equal(loaded.data.lines[0].qty,'200');const durable=await rawRecord(harness);
   await harness.evaluate(({legacyKey,source})=>{source.lines[0].qty='999';sessionStorage.setItem(legacyKey,JSON.stringify(source));},{legacyKey,source});assert.equal((await adapter(harness,'load')).status,'LOADED');assert.equal(await rawRecord(harness),durable);assert.equal(await harness.evaluate(()=>sessionStorage.getItem('unrelated-test-value')),'keep');
  }
 });
 await check('S03_FAILED_MIGRATION_PRESERVES_ORIGINAL_SESSION',async()=>{
  await clean();const original=JSON.stringify(fixture());await harness.evaluate(({R2,original})=>sessionStorage.setItem(R2,original),{R2,original});const result=await adapter(harness,'load',[],{failWrites:true});assert.equal(result.ok,false);assert.equal(result.status,'WRITE_FAILED');assert.equal(await rawRecord(harness),null);assert.equal(await harness.evaluate(key=>sessionStorage.getItem(key),R2),original);
 });
 await check('S03_CORRUPT_UNKNOWN_VERSION_NEVER_FALLBACK_OR_OVERWRITE',async()=>{
  for(const [raw,status]of [['{broken-json','CORRUPT'],[JSON.stringify({schemaVersion:999,revision:1,state:'data',data:fixture()}),'UNSUPPORTED']]){
   await clean();await harness.evaluate(({KEY,R2,raw,data})=>{localStorage.setItem(KEY,raw);sessionStorage.setItem(R2,JSON.stringify(data));},{KEY,R2,raw,data:fixture()});
   const result=await adapter(harness,'load');assert.equal(result.ok,false);assert.equal(result.status,status);assert.equal(await rawRecord(harness),raw);const attempted=await adapter(harness,'commit',[fixture(),{expectedRevision:result.revision,expectedToken:result.versionToken,transactionId:'invalid-source'}]);assert.equal(attempted.ok,false);assert.equal(await rawRecord(harness),raw);const reset=await adapter(harness,'reset',[{expectedRevision:result.revision,expectedToken:result.versionToken,transactionId:'explicit-damaged-reset'}]);assert.equal(reset.ok,true);assert.equal(reset.status,'RESET');assert.equal(reset.recoveredFrom,status);assert.equal((await adapter(harness,'load')).status,'RESET');
  }
 });
 await check('S03_NATIVE_WEB_LOCKS_CONCURRENT_WRITERS_AND_IDEMPOTENCE',async()=>{
  await clean();const tab=await newHarness(),a=fixture(),b=fixture();a.lines[0].qty='240';b.lines[0].qty='100';const readA=await adapter(harness,'load'),readB=await adapter(tab,'load');assert.equal(readA.revision,0);assert.equal(readB.revision,0);
  const results=await Promise.all([adapter(harness,'commit',[a,{expectedRevision:readA.revision,expectedToken:readA.versionToken,transactionId:'race-A'}]),adapter(tab,'commit',[b,{expectedRevision:readB.revision,expectedToken:readB.versionToken,transactionId:'race-B'}])]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.status==='CONFLICT').length,1);const winner=results[0].ok?{data:a,tx:'race-A'}:{data:b,tx:'race-B'},before=await rawRecord(harness);
  const repeat=await adapter(harness,'commit',[winner.data,{expectedRevision:0,expectedToken:readA.versionToken,transactionId:winner.tx}]);assert.equal(repeat.status,'IDEMPOTENT');assert.equal(await rawRecord(harness),before);assert.equal((await envelope(harness)).revision,1);await tab.close();
 });
 await check('S02_RESET_TOMBSTONE_BLOCKS_OLD_SESSION_AND_STALE_TAB',async()=>{
  const before=await adapter(harness,'load'),tab=await newHarness();const stale=await adapter(tab,'load');assert.equal(stale.revision,before.revision);const reset=await adapter(harness,'reset',[{expectedRevision:before.revision,expectedToken:before.versionToken,transactionId:'reset-final'}]);assert.equal(reset.ok,true);assert.equal(reset.status,'RESET');const raw=await rawRecord(harness);
  await tab.evaluate(({R2,R1,data})=>{sessionStorage.setItem(R2,JSON.stringify(data));sessionStorage.setItem(R1,JSON.stringify(data));},{R2,R1,data:fixture()});assert.equal((await adapter(tab,'load')).status,'RESET');const revived=await adapter(tab,'commit',[fixture(),{expectedRevision:stale.revision,expectedToken:stale.versionToken,transactionId:'stale-resurrection'}]);assert.equal(revived.status,'CONFLICT');assert.equal(await rawRecord(harness),raw);await tab.close();
  await closeProfile();await launchProfile();assert.equal((await adapter(harness,'load')).status,'RESET');assert.equal(await rawRecord(harness),raw);
 });
 await check('S03_MISSING_WEB_LOCKS_FAILS_CLOSED',async()=>{
  const before=await rawRecord(harness),loaded=await adapter(harness,'load');const result=await adapter(harness,'commit',[fixture(),{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'without-locks'}],{noLocks:true});assert.equal(result.ok,false);assert.equal(await rawRecord(harness),before);
 });
 await check('S04_NO_DURABLE_DNS_PASS_AND_NO_BROWSER_ERRORS',async()=>{
  assert.deepEqual(errors,[]);assert.ok(requests.length>0);assert.ok(profileLaunches.length>=3&&profileLaunches.slice(0,-1).every(x=>x.closed));
  const before=await adapter(harness,'load');const data=fixture();data.dnsResult={status:'VALID'};data.errorExposure=true;data.locations[0].domainContract={status:'VALID'};data.locations[0].mailboxVerified=true;
  const result=await adapter(harness,'commit',[data,{expectedRevision:before.revision,expectedToken:before.versionToken,transactionId:'proof-must-not-persist'}]);
  if(result.ok){const stored=(await envelope(harness)).data;assert.equal(stored.dnsResult,undefined);assert.equal(stored.errorExposure,undefined);assert.equal(stored.locations[0].domainContract,undefined);assert.notEqual(stored.locations[0].mailboxVerified,true);}else assert.equal(result.status,'INVALID_DATA');
 });
 report.status='PASS';
}catch(error){report.status=/Operation not permitted|socket\(\) failed|Executable doesn't exist/.test(String(error))?'BLOCKED_BROWSER_ENVIRONMENT':'FAIL';report.error=String(error.stack||error);process.exitCode=1;await page?.screenshot({path:join(evidence,'failure.png'),fullPage:true}).catch(()=>{});}
finally{if(context)await closeProfile().catch(()=>{});if(server)await new Promise(resolve=>server.close(resolve));if(profile)await rm(profile,{recursive:true,force:true});await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'storage.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
