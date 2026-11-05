/** C55-13/14/15 actual product callers. CI owns browser launch; local authoring
 * does not stand in for user OS or canonical HTTPS acceptance. Synthetic DNS,
 * no address queries, native storage, frozen Seoul dates and real DOM events. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,realpath} from 'node:fs/promises';
import {dirname,resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {approvedFixture} from '../fixtures/qa-lab-0540.mjs';
import {syntheticDns} from '../fixtures/qa-lab.mjs';
import {closedAfterExplicitDiscard} from './modal-test-helpers.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),dist=join(root,'dist');
const evidence=resolve(process.env.ORDER_C55_DATE_EVIDENCE_DIR||join(root,'browser-evidence/c55-date'));
const KEY='order_q1_q4_v1',CLOCK='2026-11-05T10:00:00+09:00';
const report={schemaVersion:1,message:'MSG0549',classification:'ACTUAL_CHROMIUM_LOCAL_HTTP_NATIVE_STORAGE_SYNTHETIC_DNS',checks:[],errors:[],network:[],status:'RUNNING',notCovered:['CANONICAL_HTTPS','LIVE_PROVIDER','USER_OS','REAL_IME_DEVICE','USER_FINAL_ACCEPTANCE']};
let server,browser,base;
const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.storageReady==='true'&&document.documentElement.dataset.storagePending!=='true');
const envelope=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),KEY);
const writes=p=>p.evaluate(()=>window.__c55DateWrites||0);
const field=p=>p.locator('#q4-regular-dialog [data-order-date-field]').first();
const segment=(p,name)=>field(p).locator(`[data-order-date-part="${name}"]`);
const raw=p=>p.evaluate(()=>window.OrderQ4Review.draft);
const parts=iso=>Object.fromEntries(['year','month','day'].map((key,i)=>[key,Number(iso.split('-')[i])]));
function fixture(date='',mixed=false){
 const data=approvedFixture({mode:'ONCE',count:mixed?2:1});
 data.allocations.forEach(a=>{a.oneTimeDeliveryQty='40';a.q4Review.deliveryDate=date?parts(date):{year:2026,month:11,day:''};});
 if(mixed){const a=data.allocations[1];a.mode='FLEX';a.q4Review.profile='MIXED';data.allocations[0].q4Review.profile='MIXED';}
 return data;
}
async function openQ4(p){const stage=p.locator('.accordion-trigger[data-open="q4"]');if(await stage.getAttribute('aria-expanded')!=='true')await stage.click();await p.waitForFunction(()=>document.querySelector('#section-q4')?.dataset.open==='true'&&!document.querySelector('#body-q4>div')?.inert);const line=p.locator('[data-q4-body-toggle="qa-line"]');if(await line.getAttribute('aria-expanded')!=='true')await line.click();await p.locator('[data-edit-allocation="qa-allocation-0"]').click();await p.locator('#q4-regular-dialog[open]').waitFor();}
async function cancel(p){await p.locator('#q4-regular-cancel').click();await closedAfterExplicitDiscard(p,'q4-regular-dialog');await ready(p);}
async function save(p){await p.locator('#q4-regular-save').click();await p.waitForFunction(()=>!document.querySelector('#q4-regular-dialog').open);await ready(p);}
async function check(id,fn,{data=fixture(),clock=CLOCK,width=1440}={}){
 const row={id,status:'RUNNING'},context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});report.checks.push(row);let p;
 try{
  context.on('page',tab=>tab.on('pageerror',error=>report.errors.push({id,error:String(error)})));
  await context.route('**/*',async route=>{const url=new URL(route.request().url());
   if(url.origin===base&&url.pathname!=='/api/address/search')return route.continue();
   if(['cloudflare-dns.com','dns.google'].includes(url.hostname)){report.network.push({id,kind:'SYNTHETIC_DNS'});return route.fulfill({status:200,contentType:'application/dns-json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(syntheticDns(url.searchParams.get('name'),url.searchParams.get('type')))});}
   report.errors.push({id,error:'UNEXPECTED_REQUEST '+url.origin+url.pathname});return route.abort();
  });
  p=await context.newPage();p.setDefaultTimeout(12000);await p.goto(base);await ready(p);await p.clock.setFixedTime(new Date(clock));
  const seeded=await p.evaluate(async data=>{const {createBrowserStorage}=await import('/storage.mjs'),storage=createBrowserStorage(),loaded=await storage.load();return storage.commit(data,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'c55-date-fixture-'+crypto.randomUUID()});},data);assert.equal(seeded.ok,true,JSON.stringify(seeded));
  await p.goto(base+'/#/form');await p.reload();await ready(p);
  await p.evaluate(key=>{window.__c55DateWrites=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const result=original.call(this,k,v);if(this===localStorage&&k===key)window.__c55DateWrites++;return result;};},KEY);
  await fn(p,row);row.status='PASS';
 }catch(error){row.status='FAIL';row.error=String(error.stack||error);process.exitCode=1;if(p)await p.screenshot({path:join(evidence,id+'-FAIL.png'),fullPage:true}).catch(()=>{});}
 finally{await context.close();await writeFile(join(evidence,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(id+' '+row.status);}
}
try{
 await mkdir(evidence,{recursive:true});report.build=JSON.parse(await readFile(join(dist,'build-identity.json'),'utf8'));assert.equal(report.build.scope,'INTEGRATED_PRODUCT');
 const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'},actual=await realpath(dist);
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=await realpath(resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)));if(!path.startsWith(actual+sep))throw Error('PATH_OUTSIDE_DIST');res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'}).end(await readFile(path));}catch{res.writeHead(404).end('Not found');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});report.browser=browser.version();
 const scenarios=[
  ['MORNING','2026-11-05',CLOCK,'당일 납품은 납품사 확인이 필요합니다.'],
  ['AFTERNOON','2026-11-05','2026-11-05T12:00:00+09:00','당일 납품은 시간이 촉박해 어려울 수 있습니다.'],
  ['TOMORROW','2026-11-06',CLOCK,'내일 납품은 준비 일정 확인이 필요합니다.'],
  ['SATURDAY','2026-11-07',CLOCK,'토요일 납품은 납품사 일정 확인이 필요합니다.'],
  ['SUNDAY','2026-11-08',CLOCK,'일요일 납품은 납품사 일정 확인이 필요합니다.'],
  ['NEW_YEAR','2027-01-01','2026-12-31T10:00:00+09:00','신정에는 납품이 쉬거나 늦어질 수 있습니다.']
 ];
 for(const [name,date,clock,message]of scenarios)await check('C55-13_'+name,async(p,row)=>{
  const before=await envelope(p);await openQ4(p);assert.equal(await field(p).count(),1);
  assert.ok((await field(p).locator('[data-order-date-notices]').innerText()).includes(message));
  await field(p).locator('[data-order-calendar-open]').click();const calendar=p.locator('#order-common-calendar[open]');assert.ok((await calendar.locator('.order-calendar-guidance').innerText()).includes(message));assert.equal(await calendar.locator(`[data-order-calendar-key="${date}"]`).isEnabled(),true);await p.keyboard.press('Escape');
  await field(p).locator('[data-order-calendar-open]').click();assert.ok((await calendar.locator('.order-calendar-guidance').innerText()).includes(message));await p.keyboard.press('Escape');await cancel(p);assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),0);row.advice=message;
 },{data:fixture(date),clock});
 for(const mixed of [false,true])await check('C55-14_CLAMP_'+(mixed?'MIXED':'SINGLE'),async(p,row)=>{
  await openQ4(p);await segment(p,'year').fill('3');assert.equal(await segment(p,'year').inputValue(),'3');
  await segment(p,'year').fill('3333');assert.equal(await segment(p,'year').inputValue(),'2100');
  await segment(p,'month').fill('22');assert.equal(await segment(p,'month').inputValue(),'12');
  await segment(p,'day').fill('33');assert.equal(await segment(p,'day').inputValue(),'31');
  assert.equal(await segment(p,'day').evaluate(e=>e===document.activeElement),true);
  const draft=await raw(p),value=Object.values(draft.datesByAllocation)[0];assert.deepEqual(Object.fromEntries(Object.entries(value).map(([k,v])=>[k,Number(v)])),{year:2100,month:12,day:31});
  await field(p).locator('[data-order-calendar-open]').click();assert.equal(await p.locator('[data-order-calendar-key="2100-12-31"]').isEnabled(),true);await p.keyboard.press('Escape');await cancel(p);assert.equal(await writes(p),0);row.corrected=value;
 },{data:fixture('',mixed),width:mixed?320:1440});
 await check('C55-15_OPTIONAL_SAVE_RESTORE',async(p,row)=>{
  await openQ4(p);assert.equal(await segment(p,'day').getAttribute('aria-required'),'false');assert.equal(await segment(p,'day').inputValue(),'');
  await field(p).locator('[data-order-calendar-open]').click();assert.match(await p.locator('#order-common-calendar .order-calendar-guidance').innerText(),/납품사 사정에 따라 납품일이 바뀔 수 있습니다/);await p.keyboard.press('Escape');await save(p);
  const saved=await envelope(p);assert.equal(saved.data.allocations[0].q4Review.deliveryDate.day,'');await p.reload();await ready(p);await openQ4(p);assert.equal(await segment(p,'day').inputValue(),'');await cancel(p);row.optional=true;
 });
 for(const date of ['2027-01-10','2026-01-10','2101-01-10'])await check('C55-15_PURE_'+date,async(p,row)=>{
  const before=await envelope(p);await openQ4(p);const original=await raw(p);assert.equal(await segment(p,'year').inputValue(),date.slice(0,4));assert.equal(await segment(p,'day').inputValue(),'10');
  await field(p).locator('[data-order-calendar-open]').click();await p.keyboard.press('Escape');assert.deepEqual((await raw(p)).datesByAllocation,original.datesByAllocation);await cancel(p);assert.deepEqual(await envelope(p),before);assert.equal(await writes(p),0);row.storedDate=date;
 },{data:fixture(date)});
 await check('C55-13_SAVE_ADVICE_RESTORE',async(p,row)=>{
  await openQ4(p);await field(p).locator('[data-order-calendar-open]').click();await p.locator('[data-order-calendar-key="2026-11-08"]').click();await save(p);
  const saved=await envelope(p);assert.equal(Number(saved.data.allocations[0].q4Review.deliveryDate.day),8);assert.equal(await writes(p),1);await p.reload();await ready(p);await openQ4(p);assert.match(await field(p).locator('[data-order-date-notices]').innerText(),/일요일/);await field(p).locator('[data-order-calendar-open]').click();assert.match(await p.locator('#order-common-calendar .order-calendar-guidance').innerText(),/일요일/);await p.keyboard.press('Escape');await cancel(p);row.savedDate=saved.data.allocations[0].q4Review.deliveryDate;
 });
 report.status=report.checks.every(row=>row.status==='PASS')&&!report.errors.length?'PASS':'FAIL';if(report.status==='FAIL')process.exitCode=1;
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'c55-date.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,errors:report.errors,error:report.error},null,2));}
