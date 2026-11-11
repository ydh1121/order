/** MSG0581 candidate-only browser contract. The normal built main.mjs selects
 * ?mode=simple; no replacement app, auth provider, calculator or backend.
 * CI owns browser launch. These checks do not authorize merge or deployment. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {dirname,resolve,join,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {chooseQuantityUnit} from './approved-contract-helpers.mjs';
import {closedAfterExplicitDiscard} from './modal-test-helpers.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dist=join(root,'dist');
const evidence=resolve(process.env.ORDER_SIMPLE0581_EVIDENCE_DIR||join(root,'browser-evidence/simple-quote-0581'));
const SIMPLE_KEY='order_simple_prework_0581',DETAIL_KEY='order_q1_q4_v1',LEGACY_KEY='order_v015R2_draft';
const SNAPSHOT='ORDER-PARTIAL-20261112-063305-R1',hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schemaVersion:1,message:'MSG0581',snapshot:SNAPSHOT,status:'NOT_RUN',classification:'ACTUAL_BUILT_MAIN_SIMPLE_CANDIDATE_NATIVE_STORAGE_SYNTHETIC_AUTH_RESUME_NO_PROVIDER',checks:[],pageErrors:[],unexpectedNetwork:[],captures:[],
 notCovered:['REAL_AUTH_PROVIDER','BUSINESS_VERIFICATION','REAL_CONSULTATION_OR_CUSTOMER_CONTACT','REAL_QUOTE_BACKEND','USER_OS','VISUAL_ACCEPTANCE','APPROVED_QA_SHELL_BINDING','MAIN_MERGE','PRODUCTION_DEPLOYMENT']};
let browser,server,base,browserTime;
const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.storageReady==='true'&&document.documentElement.dataset.storagePending!=='true');
const envelope=(p,key=SIMPLE_KEY)=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),key);
const raw=(p,key=SIMPLE_KEY)=>p.evaluate(key=>localStorage.getItem(key),key);
const writes=(p,key=SIMPLE_KEY)=>p.evaluate(key=>window.__simple0581Writes.filter(row=>row.key===key).length,key);
const inspect=p=>p.evaluate(()=>window.OrderSimpleQuoteReview.inspect());
async function stage(p,key){const trigger=p.locator(`.accordion-trigger[data-open="${key}"]`);if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();await p.waitForFunction(key=>document.querySelector(`#section-${key}`)?.dataset.open==='true'&&!document.querySelector(`#body-${key}>div`)?.inert,key);}
async function start(p){await p.locator('#start').click();await p.locator('#page-form.active').waitFor();}
async function known(p,{quantity='17',price='8000'}={}){
 await start(p);
 for(const [field,value]of [['housing','4'],['size','특란'],['pack','30']])await p.locator(`[data-pick="${field}"][data-value="${value}"]`).click();
 await p.locator('[data-line-qty]').waitFor();await p.locator('[data-line-qty]').fill(quantity);await p.locator('[data-line-price]').fill(price);
 await p.waitForFunction(({key,quantity,price})=>{const e=JSON.parse(localStorage.getItem(key)||'null');return document.documentElement.dataset.storagePending!=='true'&&e?.data.lines.length===1&&e.data.lines[0].qty===quantity&&e.data.lines[0].price===price;},{key:SIMPLE_KEY,quantity,price});
}
async function region(p,{count='1',value='서울특별시 강남구 역삼동'}={}){await stage(p,'q3');await p.locator('#simple-site-count').fill(count);await p.locator('#simple-region').fill(value);await ready(p);}
async function openOrder(p){await stage(p,'q4');await p.locator('#simple-order-edit').click();await p.locator('#simple-order-dialog[open]').waitFor();}
async function saveOrder(p){await p.locator('[data-simple-order-confirm]').click();await p.waitForFunction(()=>!document.getElementById('simple-order-dialog')?.open);await p.locator('#simple-order-dialog').waitFor({state:'hidden'});await ready(p);}
async function order(p,kind='ONCE',basis=''){await openOrder(p);await p.locator(`[data-simple-kind="${kind}"]`).click();if(basis)await p.locator(`[data-simple-basis="${basis}"]`).click();await saveOrder(p);}
async function cancelOrder(p){await p.locator('[data-simple-order-cancel]').click();await closedAfterExplicitDiscard(p,'simple-order-dialog');await ready(p);}
async function dateField(p){const field=p.locator('#simple-order-dialog [data-order-date-field][data-readonly="false"]');assert.equal(await field.count(),1,'one real editable date owner');return field;}
async function dateParts(p){const field=await dateField(p);return Object.fromEntries(await Promise.all(['year','month','day'].map(async key=>[key,await field.locator(`[data-order-date-part="${key}"]`).inputValue()])));}
async function chooseDate(p){const field=await dateField(p);await field.locator('[data-order-calendar-open]').click();const day=p.locator('#order-common-calendar[open] [data-order-calendar-key]:not([disabled])').first();const selected=await day.getAttribute('data-order-calendar-key');assert.match(selected,/^\d{4}-\d{2}-\d{2}$/);await day.click();await p.locator('#order-common-calendar').waitFor({state:'hidden'});return selected;}
async function capture(p,id){const file=id+'.png';await p.screenshot({path:join(evidence,file),fullPage:true});report.captures.push(file);}
async function check(id,fn,{mode='simple',width=390}={}){
 const row={id,status:'RUNNING'},context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});report.checks.push(row);let p;
 try{
  context.on('page',tab=>tab.on('pageerror',error=>report.pageErrors.push({id,error:String(error)})));
  await context.addInitScript(({clock,keys})=>{
   const NativeDate=Date,instant=NativeDate.parse(clock);window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
   window.__simple0581Writes=[];const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){const result=original.call(this,key,value);if(this===localStorage&&keys.includes(String(key)))window.__simple0581Writes.push({key:String(key)});return result;};
  },{clock:browserTime,keys:[SIMPLE_KEY,DETAIL_KEY]});
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin===base&&request.method()==='GET')return route.continue();report.unexpectedNetwork.push({id,method:request.method(),url:url.origin+url.pathname});return route.abort('blockedbyclient');});
  p=await context.newPage();p.setDefaultTimeout(12000);await p.goto(`${base}/${mode==='simple'?'?mode=simple':''}#/home`);await ready(p);
  await fn({p,context,row});row.status='PASS';
 }catch(error){row.status='FAIL';row.error=String(error.stack||error);process.exitCode=1;if(p)await p.screenshot({path:join(evidence,id+'-FAIL.png'),fullPage:true}).catch(()=>{});}
 finally{await context.close();await writeFile(join(evidence,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(id+' '+row.status);}
}

try{
 await mkdir(evidence,{recursive:true});report.build=JSON.parse(await readFile(join(dist,'build-identity.json'),'utf8'));assert.equal(report.build.scope,'INTEGRATED_PRODUCT');
 const referenceBytes=await readFile(join(dist,'assets/iana-reference.json')),reference=JSON.parse(referenceBytes),collected=Date.parse(reference.manifest?.collectedAt);assert.ok(Number.isFinite(collected));browserTime=new Date(collected+1000).toISOString();
 report.clock={asOf:browserTime,basis:'CURRENT_BUILT_IANA_COLLECTED_AT_PLUS_1000MS',ianaVersion:reference.manifest.version,ianaSha256:hash(referenceBytes)};
 report.sourceHashes=[];for(const path of ['test/browser/simple-quote-0581.smoke.mjs','web/main.mjs','web/app.mjs','web/simple-quote-ui.mjs','web/simple-quote-contract.mjs','web/storage.mjs','web/date-field.mjs']){const bytes=await readFile(join(root,path));report.sourceHashes.push({path,bytes:bytes.length,sha256:hash(bytes)});}
 const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'},actual=await realpath(dist);
 server=createServer(async(req,res)=>{try{assert.equal(req.method,'GET');const url=new URL(req.url,'http://localhost'),path=await realpath(resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)));if(!path.startsWith(actual+sep))throw Error('PATH_OUTSIDE_DIST');res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'}).end(await readFile(path));}catch{res.writeHead(404).end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});report.runtime={browser:browser.version(),node:process.version,platform:process.platform};report.status='RUNNING';

 await check('SQ01_DEFAULT_DETAILED_ENTRY_RETAINS_EXISTING_Q1_Q2',async({p})=>{
  assert.notEqual(await p.locator('html').getAttribute('data-quote-mode'),'simple');await start(p);
  for(const [field,value]of [['housing','4'],['size','특란'],['pack','30']])await p.locator(`[data-pick="${field}"][data-value="${value}"]`).click();
  await p.locator('[data-line-qty]').fill('17');await p.locator('[data-line-price]').fill('8000');await ready(p);
  assert.equal((await envelope(p,DETAIL_KEY)).data.lines[0].qty,'17');assert.equal(await raw(p),null);assert.equal(await p.locator('#simple-site-count').count(),0);
  await stage(p,'q1');await p.locator('#add-line').click();await p.locator('#sku-dialog[open]').waitFor();assert.equal(await p.locator('#simple-auth-dialog[open]').count(),0);
 },{mode:'detailed'});

 await check('SQ02_SINGLE_SKU_AUTH_HANDOFF_PRESERVES_INPUT_NO_AUTH_SUCCESS',async({p})=>{
  assert.equal(await p.locator('html').getAttribute('data-quote-mode'),'simple');await known(p);await stage(p,'q1');const before=await envelope(p),beforeWrites=await writes(p);
  await p.locator('#add-line').click();await p.locator('#simple-auth-dialog[open]').waitFor();assert.equal(await p.locator('#sku-dialog[open]').count(),0);
  await p.locator('[data-simple-auth-request]').click();await p.locator('#simple-auth-status').waitFor();const state=await inspect(p);
  assert.equal(state.authStatus,'UNAVAILABLE');assert.equal(state.lastHandoff.input.authentication,'UNKNOWN');assert.equal(state.lastHandoff.input.businessVerification,'UNKNOWN');
  assert.equal(state.lastHandoff.input.product.line.qty,'17');assert.equal(state.lastHandoff.input.product.line.price,'8000');assert.equal(state.lastHandoff.input.snapshotId,SNAPSHOT);
  assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);await p.locator('[data-simple-auth-cancel]').click();await p.locator('#simple-auth-dialog').waitFor({state:'hidden'});
  assert.equal((await envelope(p)).data.lines.length,1);await p.reload();await ready(p);assert.deepEqual(await envelope(p),before);
 });

 await check('SQ03_SIMPLE_NAMESPACE_DOES_NOT_IMPORT_OR_MODIFY_DETAILED_DRAFT',async({p,context})=>{
  const seed={lines:[{id:'detail-existing',housing:'4',size:'대란',pack:'20',qty:'31',qtyUnit:'each',price:'7000'}],current:'detail-existing',locations:[],allocations:[],open:'q1',allocationRevision:0};
  const result=await p.evaluate(async({seed,legacyKey})=>{const {createBrowserStorage}=await import('/storage.mjs'),store=createBrowserStorage(),loaded=await store.load();sessionStorage.setItem(legacyKey,JSON.stringify(seed));return store.commit(seed,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'simple0581-detailed-isolation'});},{seed,legacyKey:LEGACY_KEY});assert.equal(result.ok,true);
  const detailedRaw=await raw(p,DETAIL_KEY),legacyRaw=await p.evaluate(key=>sessionStorage.getItem(key),LEGACY_KEY);await p.reload();await ready(p);assert.equal(await raw(p),null);
  await known(p);assert.equal(await raw(p,DETAIL_KEY),detailedRaw);assert.equal(await p.evaluate(key=>sessionStorage.getItem(key),LEGACY_KEY),legacyRaw);
  const tab=await context.newPage();await tab.goto(base+'/#/form');await ready(tab);assert.equal((await envelope(tab,DETAIL_KEY)).data.lines[0].id,'detail-existing');assert.equal(await raw(tab,DETAIL_KEY),detailedRaw);assert.notEqual(await tab.locator('html').getAttribute('data-quote-mode'),'simple');await tab.close();
 });

 await check('SQ04_UNKNOWN_SPEC_AND_UNCHECKED_INTEREST_CAN_CONTINUE_WITHOUT_CONSENT',async({p})=>{
  await start(p);await p.locator('#simple-spec-unknown').check();await ready(p);assert.equal(await p.locator('#simple-consultation-interest').isChecked(),false);
  const unknown=(await envelope(p)).data;assert.equal(unknown.simpleQuote.specUnknown,true);assert.equal(unknown.simpleQuote.consultationInterest,false);assert.equal(unknown.lines.length,1);
  for(const key of ['housing','size','pack','price'])assert.equal(unknown.lines[0][key],'',key+' must remain unknown');
  await p.locator('[data-line-qty]').fill('23');await ready(p);await p.locator('#q2-next').click();await p.locator('#simple-site-count').waitFor({state:'visible'});
  await stage(p,'q1');await p.locator('#simple-consultation-interest').check();await ready(p);assert.equal((await envelope(p)).data.simpleQuote.consultationInterest,true);
  await p.locator('#simple-consultation-interest').uncheck();await ready(p);assert.equal((await envelope(p)).data.simpleQuote.consultationInterest,false);
  assert.doesNotMatch(JSON.stringify((await envelope(p)).data),/AUTHENTICATED|CONSULTATION_ACCEPTED|BUSINESS_VERIFIED|telephoneConsent/);await p.reload();await ready(p);assert.equal((await envelope(p)).data.simpleQuote.specUnknown,true);
 });

 await check('SQ05_MONTHLY_RAW_QUANTITY_SEPARATE_FROM_DELIVERY_AND_SCOPE',async({p})=>{
  await known(p,{quantity:'17',price:'8000'});await chooseQuantityUnit(p.locator('[data-line-qty-unit]'),'each');await ready(p);
  const data=(await envelope(p)).data;assert.equal(data.lines[0].qty,'17');assert.equal(data.lines[0].qtyUnit,'tray');assert.equal(data.lines[0].qtyDisplayUnit,'each');assert.equal(data.simpleQuote.monthlyScope,'UNCONFIRMED');assert.deepEqual(data.allocations,[]);assert.deepEqual(data.locations,[]);
  assert.equal((await p.locator('[data-line-qty]').inputValue()).replaceAll(',',''),'510');assert.match(await p.locator('#q2-total').innerText(),/136,000/);
  await region(p,{count:'2'});assert.equal((await envelope(p)).data.lines[0].qty,'17');assert.deepEqual((await envelope(p)).data.allocations,[]);
 });

 await check('SQ06_OPTIONAL_SAME_CITY_DISTRICTS_REMAIN_DISTINCT_NO_ADDRESS_OR_PACK_PROMPT',async({p})=>{
  await known(p);await region(p,{count:'2'});assert.equal(await p.locator('[data-simple-site-region]').count(),0);await p.locator('#simple-regions-differ').check();
  const inputs=p.locator('[data-simple-site-region]');assert.equal(await inputs.count(),2);await inputs.nth(0).fill('서울특별시 강남구 역삼동');await inputs.nth(1).fill('서울특별시 송파구 잠실동');await ready(p);
  const saved=(await envelope(p)).data.simpleQuote;assert.deepEqual(saved.sites.map(site=>site.region),['서울특별시 강남구 역삼동','서울특별시 송파구 잠실동']);assert.notEqual(saved.sites[0].id,saved.sites[1].id);
  assert.equal(await p.locator('#q3-sites [data-line-qty], #q3-sites [data-pick="pack"], #q3-sites input[autocomplete="street-address"]').count(),0);
  await p.locator('#q3-next').click();await p.locator('#simple-order-edit').waitFor({state:'visible'});await p.reload();await ready(p);assert.deepEqual((await envelope(p)).data.simpleQuote.sites,saved.sites);await stage(p,'q3');await capture(p,'simple-regions-390');
 });

 await check('SQ07_FLEX_WEEK_MONTH_ARE_DISTINCT_RAW_INTENT',async({p})=>{
  await known(p);await order(p,'FLEX','WEEK');let data=(await envelope(p)).data;assert.equal(data.simpleQuote.orderKind,'FLEX');assert.equal(data.simpleQuote.flexBasis,'WEEK');assert.deepEqual(data.allocations,[]);
  await order(p,'FLEX','MONTH');data=(await envelope(p)).data;assert.equal(data.simpleQuote.flexBasis,'MONTH');assert.equal(data.lines[0].qty,'17');assert.equal(data.simpleQuote.preferredDate,'');
  for(const field of ['freq','frequencyPerWeek','intervalWeeks','cadence','visitCount','deliveryQty'])assert.equal(Object.hasOwn(data.simpleQuote,field),false);
  await p.reload();await ready(p);assert.equal((await envelope(p)).data.simpleQuote.flexBasis,'MONTH');
 });

 await check('SQ08_FIXED_CONSULTATION_ONCE_NO_CONFIRMED_SCHEDULE',async({p})=>{
  await known(p);await openOrder(p);await p.locator('[data-simple-kind="FIXED"]').click();assert.equal((await p.locator('#simple-consult-fixed').innerText()).trim(),'협의');await saveOrder(p);
  let data=(await envelope(p)).data;assert.equal(data.simpleQuote.orderKind,'FIXED');assert.equal(data.simpleQuote.preferredDate,'');assert.deepEqual(data.allocations,[]);
  await order(p,'ONCE');data=(await envelope(p)).data;assert.equal(data.simpleQuote.orderKind,'ONCE');assert.equal(data.simpleQuote.preferredDate,'');assert.equal(data.simpleQuote.monthlyScope,'UNCONFIRMED');await capture(p,'simple-order-1440');
 },{width:1440});

 await check('SQ09_CALENDAR_OPEN_NAVIGATE_CLOSE_CANCEL_ZERO',async({p})=>{
  await known(p);await order(p,'ONCE');await openOrder(p);const before=await envelope(p),beforeWrites=await writes(p),parts=await dateParts(p),field=await dateField(p);
  await field.locator('[data-order-calendar-open]').click();const next=p.locator('#order-common-calendar[open] [data-order-calendar-nav="1"]');if(await next.isEnabled())await next.click();await p.locator('#order-common-calendar[open] [data-order-calendar-close]').click();await p.locator('#order-common-calendar').waitFor({state:'hidden'});
  assert.equal(await p.locator('#simple-order-dialog').evaluate(dialog=>dialog.open),true);assert.deepEqual(await dateParts(p),parts);assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);await cancelOrder(p);assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);
 });

 await check('SQ10_CALENDAR_SELECTION_PARENT_CANCEL_RESTORES_WITH_ZERO_WRITES',async({p})=>{
  await known(p);await order(p,'ONCE');const before=await envelope(p),beforeWrites=await writes(p);await openOrder(p);const selected=await chooseDate(p);
  assert.equal((await inspect(p)).draft.preferredDate,selected);assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);await cancelOrder(p);
  assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);await openOrder(p);assert.equal((await inspect(p)).draft.preferredDate,'');await cancelOrder(p);
 });

 await check('SQ11_DATE_CONFIRM_ONE_DUPLICATE_ZERO_RELOAD_NEW_TAB_PRESERVES',async({p,context,row})=>{
  await known(p);await order(p,'ONCE');const before=await envelope(p),beforeWrites=await writes(p);await openOrder(p);const selected=await chooseDate(p);
  await p.evaluate(()=>{const button=document.querySelector('[data-simple-order-confirm]');button.click();button.click();});await p.waitForFunction(()=>!document.getElementById('simple-order-dialog')?.open);await ready(p);
  const committed=await envelope(p);assert.equal(committed.data.simpleQuote.preferredDate,selected);assert.equal(committed.revision,before.revision+1);assert.equal(await writes(p),beforeWrites+1);
  await openOrder(p);assert.equal((await inspect(p)).draft.preferredDate,selected);await cancelOrder(p);assert.equal(await writes(p),beforeWrites+1);
  await p.reload();await ready(p);assert.deepEqual(await envelope(p),committed);assert.equal(await writes(p),0);
  const tab=await context.newPage();await tab.goto(base+'/?mode=simple#/form');await ready(tab);assert.deepEqual(await envelope(tab),committed);assert.equal(await writes(tab),0);await openOrder(tab);assert.equal((await inspect(tab)).draft.preferredDate,selected);await cancelOrder(tab);assert.equal(await writes(tab),0);await tab.close();row.selectedDate=selected;
 });

 await check('SQ12_MISSING_CURRENT_COST_UNCONFIRMED_SCOPE_NO_FALSE_QUOTE',async({p})=>{
  await known(p,{price:''});await region(p);await order(p,'ONCE');const before=await envelope(p),beforeWrites=await writes(p);await p.locator('#to-result').click();await p.locator('#page-result.active').waitFor();
  for(const id of ['quote-supply-value','quote-outcome-value'])assert.doesNotMatch(await p.locator('#'+id).innerText(),/\d/);
  assert.equal((await envelope(p)).data.simpleQuote.monthlyScope,'UNCONFIRMED');assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);assert.doesNotMatch(await p.locator('#receipt').innerText(),/주문 확정|재고 확보|납품 보장|가입 완료/);await capture(p,'simple-result-unresolved-390');
 });
 await check('SQ13_SYNTHETIC_AUTH_RESUME_CONTRACT_NO_AUTO_MIGRATION_OR_BUSINESS_PROOF',async({p})=>{
  await known(p);await stage(p,'q1');await p.locator('#add-line').click();await p.locator('[data-simple-auth-request]').click();
  const handoff=(await inspect(p)).lastHandoff,before=await envelope(p),beforeWrites=await writes(p);
  // Direct callback contract only. No provider or real authentication occurred.
  const resumed=await p.evaluate(handoff=>window.OrderSimpleQuoteReview.resumeAuth({requestId:handoff.requestId,inputRevision:handoff.inputRevision,authentication:'AUTHENTICATED'}),handoff);
  assert.equal(resumed.status,'RESUMED');assert.equal(resumed.businessVerification,'UNKNOWN');assert.deepEqual(resumed.input,handoff.input);assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);
  const mismatch=await p.evaluate(handoff=>window.OrderSimpleQuoteReview.resumeAuth({requestId:handoff.requestId,inputRevision:handoff.inputRevision+1,authentication:'AUTHENTICATED'}),handoff);assert.equal(mismatch.status,'STALE');assert.equal(mismatch.authentication,'UNKNOWN');assert.deepEqual(await envelope(p),before);
  await p.locator('[data-simple-auth-cancel]').click();await p.locator('#simple-auth-dialog').waitFor({state:'hidden'});await stage(p,'q2');await p.locator('[data-line-qty]').fill('18');await ready(p);const edited=await envelope(p),editedWrites=await writes(p);
  const cancelled=await p.evaluate(handoff=>window.OrderSimpleQuoteReview.resumeAuth({requestId:handoff.requestId,inputRevision:handoff.inputRevision,authentication:'AUTHENTICATED'}),handoff);
  assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.authentication,'CANCELLED');assert.equal(cancelled.businessVerification,'UNKNOWN');assert.deepEqual(await envelope(p),edited);assert.equal(await writes(p),editedWrites);
  await stage(p,'q1');await p.locator('#add-line').click();await p.locator('#simple-auth-dialog[open]').waitFor();assert.equal((await envelope(p)).data.lines.length,1);assert.equal(await raw(p,DETAIL_KEY),null);
 });
 await check('SQ14_TYPED_PARTIAL_DATE_IS_NOT_SILENTLY_DISCARDED_ON_CONFIRM',async({p})=>{
  await known(p);await order(p,'ONCE');const before=await envelope(p),beforeWrites=await writes(p);await openOrder(p);const field=await dateField(p);
  // Emptying month is a stable incomplete draft. A short year such as "2"
  // may legally clamp back to today's year under existing D1R6 on blur.
  await field.locator('[data-order-date-part="month"]').fill('');await p.locator('[data-simple-order-confirm]').click();
  assert.equal(await p.locator('#simple-order-dialog').evaluate(dialog=>dialog.open),true);await p.locator('#simple-order-error').waitFor({state:'visible'});assert.match(await p.locator('#simple-order-error').innerText(),/날짜/);assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);
  await cancelOrder(p);assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),beforeWrites);await openOrder(p);await (await dateField(p)).locator('[data-order-date-part="month"]').fill('');
  await p.locator('#simple-date-clear').click();await saveOrder(p);assert.equal((await envelope(p)).data.simpleQuote.preferredDate,'');
 });
 report.status=report.checks.every(row=>row.status==='PASS')&&!report.pageErrors.length&&!report.unexpectedNetwork.length?'PASS_SCOPED_BUILT_SIMPLE_CANDIDATE':'FAIL';if(report.status==='FAIL')process.exitCode=1;
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'simple-quote-0581.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length,failed:report.checks.filter(row=>row.status==='FAIL').map(row=>row.id),pageErrors:report.pageErrors,unexpectedNetwork:report.unexpectedNetwork,error:report.error,evidence:join(evidence,'simple-quote-0581.json')},null,2));}
