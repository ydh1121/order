/** CI-authored browser contract suite. Run only in the approved CI/browser
 * environment after npm run build. Real built createOrderApp/Q4/storage and
 * result DOM consume an explicitly synthetic injected quote provider.
 * This is neither the approved comparison shell nor a real backend/API test.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {createServer} from 'node:http';
import {dirname,resolve,join,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {approvedFixture} from '../fixtures/qa-lab-0540.mjs';
import {syntheticDns} from '../fixtures/qa-lab.mjs';
import {researchCase,fixtureTime} from '../fixtures/qa-price-comparison-0579.mjs';
import {calculateQuote} from '../../src/engine/calculation/quote.mjs';
import {customerQuoteResponse} from '../../src/engine/contracts/quote-response.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dist=join(root,'dist');
const evidence=resolve(process.env.ORDER_QUOTE0579_EVIDENCE_DIR||join(root,'browser-evidence/quote-result-0579'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const report={schemaVersion:1,status:'NOT_RUN',classification:'ACTUAL_BUILT_APP_FACTORY_LOCAL_CHROMIUM_SYNTHETIC_QUOTE_PROVIDER',checks:[],pageErrors:[],externalBlocked:[],dnsFixtureCalls:[],captures:[],
  notCovered:['REAL_QUOTE_BACKEND','REAL_PRICE_OR_SUPPLIER','APPROVED_PRODUCT_TO_OFFER_MAPPING','SERVER_AUTHORIZATION','BACKEND_CANCEL','CANONICAL_HTTPS','USER_OS','USER_VISUAL_APPROVAL','APPROVED_OCT30_QA_SHELL_BINDING','REAL_NETWORK_LATENCY']};
let browser,context,page,server,base,configuration,scenarioSequence=0;
const jsonResponse=results=>customerQuoteResponse({requestId:'research-config',inputRevision:1,results});
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
const ids=['receipt','quote-outcome-value','quote-outcome-label','quote-current-value','quote-supply-value','quote-result-status'];
async function check(id,run){const row={id,status:'RUNNING'};report.checks.push(row);try{await run();row.status='PASS';}catch(error){row.status='FAIL';row.error=String(error.stack||error);throw error;}}
async function ready(){await page.waitForFunction(()=>document.documentElement.dataset.quote0579Ready==='true'&&document.documentElement.dataset.storageReady==='true'&&document.documentElement.dataset.storagePending!=='true');}
async function stored(){return page.evaluate(()=>window.__quote0579.storage());}
async function state(){return page.evaluate(()=>window.__quote0579.current());}
async function calls(){return page.evaluate(()=>window.__quote0579.calls());}
async function waitStatus(status){await page.waitForFunction(expected=>document.getElementById('receipt')?.dataset.quoteStatus===expected,status);assert.equal((await state()).status,status);}
async function open({provider='controlled',invalid=false}={}){
  // Same URL with only a changed hash is same-document navigation: it must not
  // retain another scenario's provider promises and call list.
  await page.goto(`${base}/?provider=${provider}&scenario=${++scenarioSequence}${invalid?'&seed=invalid':''}#/form`);await ready();
  await page.waitForFunction(()=>window.OrderEmailDomain?.isSuccess(OrderEmailDomain.status('qa@example.com')));
  await page.locator('#page-form.active').waitFor({state:'visible'});
}
async function enterResult(){await page.locator('#to-result').click();await page.locator('#page-result.active').waitFor({state:'visible'});}
async function rememberNodes(){await page.evaluate(ids=>{window.__quote0579Nodes=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));},ids);}
async function nodesStable(){assert.equal(await page.evaluate(()=>Object.entries(window.__quote0579Nodes).every(([id,node])=>node&&node===document.getElementById(id))),true,'request updates must patch existing nodes');}
async function text(id){return (await page.locator('#'+id).textContent()).replace(/[,\s]/g,'');}
async function noSupplyAmount(){assert.doesNotMatch(await text('quote-supply-value'),/\d/);assert.doesNotMatch(await text('quote-outcome-value'),/\d/);}
async function finish(requestId,kind='valid'){await page.evaluate(({requestId,kind})=>window.__quote0579.finish(requestId,kind),{requestId,kind});}
async function nativeWrites(){return page.evaluate(()=>window.__quote0579NativeWrites.length);}

try{
  await mkdir(evidence,{recursive:true});
  const identity=JSON.parse(await readFile(join(dist,'build-identity.json'),'utf8'));
  assert.equal(identity.scope,'INTEGRATED_PRODUCT');assert.equal(identity.canonicalUrl,'https://order-ooo.pages.dev/');
  // A separate browser clock preserves the actual committed IANA freshness
  // gate. The PC-01~16 unit fixtures keep their original November 6 clock.
  const referenceBytes=await readFile(join(dist,'assets/iana-reference.json'));
  const reference=JSON.parse(referenceBytes),collected=Date.parse(reference.manifest?.collectedAt);
  assert.ok(Number.isFinite(collected),'Built IANA collection clock is explicit');
  const browserTime=new Date(collected+1000).toISOString(),validUntil=new Date(collected+1000+86400000).toISOString();
  assert.ok(Date.parse(browserTime)>=Date.parse(fixtureTime),'This browser adaptation requires the current committed reference');
  const timedQuote=(id,comparisonTotal)=>{
    const request=researchCase(id).request;request.input.asOf=browserTime;
    for(const offer of request.priceBook.offers)offer.effectiveTo=validUntil;
    if(comparisonTotal!==undefined)request.input.comparisonTotal=comparisonTotal;
    return calculateQuote(request);
  };
  configuration={seed:approvedFixture({mode:'FLEX',monthly:'10',quantity:'10',price:'5000',address:true}),responses:{
    valid:jsonResponse([timedQuote('PC-01')]),higher:jsonResponse([timedQuote('PC-02')]),
    revised:jsonResponse([timedQuote('PC-01','51000')]),empty:jsonResponse([]),
    expired:jsonResponse([calculateQuote(researchCase('PC-09').request)]),
  }};
  assert.doesNotMatch(JSON.stringify(configuration.responses),/replay|RESEARCH_ONLY_NOT_REAL_SELLER|priceBook|approvedBy/);
  assert.equal(configuration.responses.valid.status,'OK');assert.equal(configuration.responses.expired.status,'EXPIRED');
  report.build=identity;report.originalPcFixtureTime=fixtureTime;
  report.browserFixtureClock={asOf:browserTime,validUntil,basis:'BUILT_IANA_COLLECTED_AT_PLUS_1000MS',ianaVersion:reference.manifest.version,ianaCollectedAt:reference.manifest.collectedAt,ianaSha256:hash(referenceBytes)};
  report.responseFixtureSha256=hash(JSON.stringify(configuration.responses));
  report.sourceHashes=[];
  for(const relative of ['test/browser/quote-result-0579.smoke.mjs','test/browser/quote-result-0579.fixture.mjs','web/app.mjs','web/quote-result.mjs','src/engine/adapters/quote-request.mjs','src/engine/contracts/quote-response.mjs']){
    const bytes=await readFile(join(root,relative));report.sourceHashes.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});
  }
  const entry=await readFile(join(root,'test/browser/quote-result-0579.fixture.mjs'));
  const realDist=await realpath(dist);
  server=createServer(async(req,res)=>{
    try{
      assert.equal(req.method,'GET','No real network mutation in quote fixture suite');
      const url=new URL(req.url,'http://localhost');
      if(url.pathname==='/main.mjs'){res.writeHead(200,{'content-type':mime['.mjs'],'cache-control':'no-store'}).end(entry);return;}
      if(url.pathname==='/__quote0579-config.json'){res.writeHead(200,{'content-type':mime['.json'],'cache-control':'no-store'}).end(JSON.stringify(configuration));return;}
      const file=await realpath(resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)));
      if(!file.startsWith(realDist+sep))throw new Error('QUOTE0579_PATH_OUTSIDE_DIST');
      res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(await readFile(file));
    }catch{res.writeHead(404,{'content-type':'text/plain'}).end('Not found');}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
  report.runtime={browser:browser.version(),node:process.version,platform:process.platform,viewport:{width:390,height:844},reducedMotion:'reduce'};
  context=await browser.newContext({viewport:report.runtime.viewport,reducedMotion:'reduce'});
  await context.addInitScript(fixed=>{
    const RealDate=Date,instant=RealDate.parse(fixed);
    window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}};
    const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;window.__quote0579NativeWrites=[];
    Storage.prototype.setItem=function(key,value){window.__quote0579NativeWrites.push({op:'set',key:String(key)});return set.call(this,key,value);};
    Storage.prototype.removeItem=function(key){window.__quote0579NativeWrites.push({op:'remove',key:String(key)});return remove.call(this,key);};
  },browserTime);
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base)return route.continue();
    if(['cloudflare-dns.com','dns.google'].includes(url.hostname)){
      const name=url.searchParams.get('name'),type=url.searchParams.get('type');
      try{const body=syntheticDns(name,type);report.dnsFixtureCalls.push({name,type});return route.fulfill({status:200,headers:{'content-type':'application/dns-json','access-control-allow-origin':'*','cache-control':'no-store'},body:JSON.stringify(body)});}catch{}
    }
    report.externalBlocked.push(url.origin+url.pathname);return route.abort('blockedbyclient');
  });
  page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>report.pageErrors.push(String(error)));
  report.status='RUNNING';
  await check('QR01_REAL_COMPLETION_GATE_DOES_NOT_QUERY_INVALID_INPUT',async()=>{
    await open({invalid:true});const before=await stored();await page.locator('#to-result').click();
    assert.equal(await page.locator('#page-form').evaluate(el=>el.classList.contains('active')),true);
    assert.equal((await calls()).length,0);assert.deepEqual((await stored()).data,before.data);
  });
  await check('QR02_NO_PROVIDER_REMAINS_UNAVAILABLE_NO_FAKE_AMOUNT_OR_STORAGE_WRITE',async()=>{
    await open({provider:'absent'});const before=await stored(),writes=await nativeWrites();await enterResult();await waitStatus('UNAVAILABLE');
    assert.equal((await calls()).length,0);await noSupplyAmount();assert.deepEqual((await stored()).data,before.data);assert.equal(await nativeWrites(),writes);
    assert.equal((await state()).proof.orderConfirmed,false);
  });
  await check('QR03_PARTIAL0_PARTIAL1_COMPLETE_PATCH_STABLE_DOM_NO_PERSISTED_PROOF',async()=>{
    await open();const before=await stored(),writes=await nativeWrites();await enterResult();await waitStatus('PENDING');await rememberNodes();
    const [call]=await calls();assert.equal(call.input.version,'order-product-quote-input-1');
    assert.equal(call.input.purchases.length,1);assert.equal(call.input.sites.length,1);assert.equal(call.input.allocations.length,1);
    assert.deepEqual(Object.fromEntries(['id','housing','size','pack','qty','qtyUnit','price'].map(key=>[key,call.input.purchases[0][key]])),{id:'qa-line',housing:'4',size:'특란',pack:'30',qty:'10',qtyUnit:'tray',price:'5000'});
    assert.doesNotMatch(JSON.stringify(call.input),/qa@example\.com|contactPhone|priceBook|legalSellerId|approvedBy|합성 QA 도로/);
    await page.evaluate(id=>window.__quote0579.partial(id,'empty'),call.requestId);await waitStatus('PARTIAL');await noSupplyAmount();await nodesStable();
    assert.equal((await state()).proof.viewPartialAllowed,false);
    await page.evaluate(id=>window.__quote0579.partial(id),call.requestId);await waitStatus('PARTIAL');await nodesStable();assert.equal((await state()).proof.viewPartialAllowed,true);
    await finish(call.requestId);await waitStatus('COMPLETE');await nodesStable();
    assert.match(await text('quote-current-value'),/50000/);assert.match(await text('quote-supply-value'),/48000/);assert.match(await text('quote-outcome-value'),/2000/);
    assert.equal((await state()).proof.savingsAllowed,true);assert.equal((await state()).proof.globalMinimum,false);
    assert.deepEqual((await stored()).data,before.data);assert.equal(await nativeWrites(),writes);
    const capture='quote-complete-390.png';await page.screenshot({path:join(evidence,capture),fullPage:true});report.captures.push(capture);
  });
  await check('QR04_FAILURE_VS_EMPTY_AND_CONTRACT_RETRY_NEW_ID',async()=>{
    await open();await enterResult();await waitStatus('PENDING');await rememberNodes();const [old]=await calls();
    await page.evaluate(id=>window.__quote0579.fail(id),old.requestId);await waitStatus('FAILED');await noSupplyAmount();await nodesStable();
    assert.equal((await state()).proof.emptyAllowed,false);assert.equal((await state()).proof.errorAllowed,true);
    // Returned controller contract only: no retry button is claimed.
    const retry=await page.evaluate(()=>{const run=window.__quote0579.app.quoteService.retry();return {requestId:run.requestId};});await waitStatus('PENDING');
    assert.notEqual(retry.requestId,old.requestId);await finish(retry.requestId,'empty');await waitStatus('EMPTY');await nodesStable();await noSupplyAmount();
    assert.equal((await state()).proof.emptyAllowed,true);assert.equal((await state()).proof.errorAllowed,false);
  });
  await check('QR05_ACTUAL_EDIT_REENTER_REVISION_AND_LATE_RESPONSE_REJECTION',async()=>{
    await open();await enterResult();await waitStatus('PENDING');const [old]=await calls();
    await page.locator('#result-edit').click();await page.locator('#page-form.active').waitFor();assert.equal((await state()).status,'DETACHED');
    const toggle=page.locator('[data-open="q2"]');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
    await page.locator('[data-line-price]').fill('5100');await page.waitForFunction(()=>document.documentElement.dataset.storagePending!=='true');
    const committed=await stored();assert.equal(committed.data.lines[0].price,'5100');
    await enterResult();await waitStatus('PENDING');const current=(await calls()).at(-1);
    assert.notEqual(current.requestId,old.requestId);assert.notEqual(current.inputRevision,old.inputRevision);assert.equal((await calls())[0].aborted,true);
    await finish(current.requestId,'revised');await waitStatus('COMPLETE');await rememberNodes();
    assert.match(await text('quote-current-value'),/51000/);assert.match(await text('quote-outcome-value'),/3000/);
    const before=await state(),supply=await text('quote-supply-value'),outcome=await text('quote-outcome-value'),writes=await nativeWrites();
    await finish(old.requestId);await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));
    assert.deepEqual(await state(),before);assert.equal(await text('quote-supply-value'),supply);assert.equal(await text('quote-outcome-value'),outcome);await nodesStable();
    assert.deepEqual((await stored()).data,committed.data);assert.equal(await nativeWrites(),writes);
  });
  await check('QR06_CONTRACT_LOCAL_CANCEL_IS_NOT_BACKEND_CONFIRMATION',async()=>{
    await open();await enterResult();await waitStatus('PENDING');await rememberNodes();const [call]=await calls();
    const cancel=await page.evaluate(()=>window.__quote0579.app.quoteService.cancel());await waitStatus('DETACHED');
    assert.equal(cancel.backendCancellation,'UNKNOWN');assert.equal((await calls())[0].aborted,true);await noSupplyAmount();
    await finish(call.requestId);await page.evaluate(()=>new Promise(resolve=>queueMicrotask(resolve)));await waitStatus('DETACHED');await nodesStable();await noSupplyAmount();
  });
  await check('QR07_EXPIRED_RESPONSE_DOES_NOT_REVEAL_STALE_AMOUNTS',async()=>{
    await open();await enterResult();await waitStatus('PENDING');const [call]=await calls();await finish(call.requestId,'expired');await waitStatus('EXPIRED');await noSupplyAmount();assert.equal((await state()).proof.expiredAllowed,true);
  });
  await check('QR08_IMMEDIATE_PROVIDER_RESULT_IS_CONSUMED_WITHOUT_STORAGE_WRITE',async()=>{
    await open({provider:'immediate'});const before=await stored(),writes=await nativeWrites();await enterResult();await waitStatus('COMPLETE');
    assert.equal((await state()).elapsedMs,0,'fixed clock observation, not real latency measurement');assert.match(await text('quote-supply-value'),/48000/);assert.equal((await calls()).length,1);
    assert.deepEqual((await stored()).data,before.data);assert.equal(await nativeWrites(),writes);
  });
  await check('QR09_DELIVERY_COST_INCREASE_IS_NOT_DISPLAYED_AS_SAVINGS',async()=>{
    await open();await enterResult();await waitStatus('PENDING');await rememberNodes();const [call]=await calls();
    await finish(call.requestId,'higher');await waitStatus('COMPLETE');await nodesStable();
    assert.match(await text('quote-current-value'),/50000/);assert.match(await text('quote-supply-value'),/51000/);assert.match(await text('quote-outcome-value'),/1000/);
    assert.equal(await text('quote-outcome-label'),'비용증가');assert.equal(await page.locator('#quote-outcome').evaluate(el=>el.classList.contains('is-loss')),true);
    assert.equal((await state()).proof.increaseAllowed,true);assert.equal((await state()).proof.savingsAllowed,false);
  });
  assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.externalBlocked,[]);
  report.status='PASS_SCOPED_BUILT_APP_SYNTHETIC_PROVIDER';
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{
  await context?.close();await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));
  await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'quote-result-0579.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,checks:report.checks.length,failed:report.checks.filter(x=>x.status==='FAIL').map(x=>x.id),error:report.error,evidence:join(evidence,'quote-result-0579.json')},null,2));
}
