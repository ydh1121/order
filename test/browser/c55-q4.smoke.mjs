/** C55 Q4 actual product callers. CI owns browser launch; local authoring
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
const evidence=resolve(process.env.ORDER_C55_Q4_EVIDENCE_DIR||join(root,'browser-evidence/c55-q4'));
const KEY='order_q1_q4_v1',CLOCK='2026-11-05T10:00:00+09:00';
const report={schemaVersion:1,message:'MSG0549',classification:'ACTUAL_CHROMIUM_LOCAL_HTTP_NATIVE_STORAGE_SYNTHETIC_DNS',checks:[],errors:[],network:[],status:'RUNNING',notCovered:['CANONICAL_HTTPS','LIVE_PROVIDER','USER_OS','REAL_IME_DEVICE','USER_FINAL_ACCEPTANCE']};
let server,browser,base;
const ready=p=>p.waitForFunction(()=>document.documentElement.dataset.storageReady==='true'&&document.documentElement.dataset.storagePending!=='true');
const envelope=p=>p.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),KEY);
const writes=p=>p.evaluate(()=>window.__c55Q4Writes||0);
const field=p=>p.locator('#q4-regular-dialog [data-order-date-field]').first();
const segment=(p,name)=>field(p).locator(`[data-order-date-part="${name}"]`);
const raw=p=>p.evaluate(()=>window.OrderQ4Review.draft);
const parts=iso=>Object.fromEntries(['year','month','day'].map((key,i)=>[key,Number(iso.split('-')[i])]));
function fixture({count=1,monthly='600',quantity='40',period='매주',date='2026-11-05'}={}){return approvedFixture({count,monthly,quantity,period,date});}
async function combo(p,id,value){await p.locator(`[data-combo="${id}"]`).click();await p.locator(`[data-combo-choice="${id}"][data-value="${value}"]`).click();}
function bulkFixture(){const data=fixture({count:2,monthly:'167',period:'협의',date:''});data.allocations.forEach((a,i)=>Object.assign(a,{qty:i?'15':'14',monthlyPlanQty:i?'67':'100',monthlyPlanSource:'manual',monthlyDemandBasis:'package-plan',monthlyDemandSource:'manual'}));return data;}
async function openQ4(p){const stage=p.locator('.accordion-trigger[data-open="q4"]');if(await stage.getAttribute('aria-expanded')!=='true')await stage.click();await p.waitForFunction(()=>document.querySelector('#section-q4')?.dataset.open==='true'&&!document.querySelector('#body-q4>div')?.inert);const line=p.locator('[data-q4-body-toggle="qa-line"]');if(await line.getAttribute('aria-expanded')!=='true')await line.click();await p.locator('[data-edit-allocation]').first().click();await p.locator('#q4-regular-dialog[open]').waitFor();}
function freshAssignmentFixture(){const data=approvedFixture({count:1,monthly:'600',address:true});data.allocations=[];return data;}
async function openFreshQ4(p){const stage=p.locator('.accordion-trigger[data-open="q4"]');if(await stage.getAttribute('aria-expanded')!=='true')await stage.click();await p.waitForFunction(()=>document.querySelector('#section-q4')?.dataset.open==='true'&&!document.querySelector('#body-q4>div')?.inert);const line=p.locator('[data-q4-body-toggle="qa-line"]');if(await line.getAttribute('aria-expanded')!=='true')await line.click();await p.locator('[data-q4-select-sites="qa-line"]').click();await p.locator('#q4-assignment-dialog[open]').waitFor();await p.locator('label:has([data-assignment-site="qa-site-0"])').click();await p.locator('#q4-assignment-next').click();await p.locator('#q4-regular-dialog[open]').waitFor();assert.equal((await raw(p)).mode,'FLEX');assert.equal(await p.locator('[data-qty="0:base"]').inputValue(),'');}
async function enterFreshMode(p,mode){const quantity=mode==='FIXED'?'227':'40';await p.locator(`[data-choice="delivery"][data-value="${mode}"]`).click();await p.waitForFunction(mode=>document.querySelector(`[data-choice="delivery"][data-value="${mode}"]`)?.getAttribute('aria-pressed')==='true',mode);assert.equal((await raw(p)).mode,mode);const input=p.locator(`[data-qty="0:${mode==='ONCE'?'once':'base'}"]`);await input.fill(quantity);if(mode==='FIXED'){assert.equal((await raw(p)).period,'협의');const holiday=p.locator('#qa-holiday > .accordion-trigger');if(await holiday.getAttribute('aria-expanded')!=='true')await holiday.click();await p.locator('label:has([data-no-closure])').click();}else{assert.equal(await p.locator('[data-frequency-output]').count(),0);assert.equal(await segment(p,'day').inputValue(),'');}return quantity;}
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
  const seeded=await p.evaluate(async data=>{const {createBrowserStorage}=await import('/storage.mjs'),storage=createBrowserStorage(),loaded=await storage.load();return storage.commit(data,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'c55-q4-fixture-'+crypto.randomUUID()});},data);assert.equal(seeded.ok,true,JSON.stringify(seeded));
  await p.goto(base+'/#/form');await p.reload();await ready(p);
  await p.evaluate(key=>{window.__c55Q4Writes=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const result=original.call(this,k,v);if(this===localStorage&&k===key)window.__c55Q4Writes++;return result;};},KEY);
  await fn(p,row);row.status='PASS';
 }catch(error){row.status='FAIL';row.error=String(error.stack||error);process.exitCode=1;if(p)await p.screenshot({path:join(evidence,id+'-FAIL.png'),fullPage:true}).catch(()=>{});}
 finally{await context.close();await writeFile(join(evidence,'progress.json'),JSON.stringify(report,null,2)+'\n');console.log(id+' '+row.status);}
}
try{
 await mkdir(evidence,{recursive:true});report.build=JSON.parse(await readFile(join(dist,'build-identity.json'),'utf8'));assert.equal(report.build.scope,'INTEGRATED_PRODUCT');
 const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'},actual=await realpath(dist);
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=await realpath(resolve(dist,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname)));if(!path.startsWith(actual+sep))throw Error('PATH_OUTSIDE_DIST');res.writeHead(200,{'content-type':mime[extname(path)]||'application/octet-stream','cache-control':'no-store'}).end(await readFile(path));}catch{res.writeHead(404).end('Not found');}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});report.browser=browser.version();
 for(const mode of ['ONCE','FIXED'])for(const width of [320,1440])await check('C55-17_FRESH_FLEX_TO_'+mode+'_'+width,async(p,row)=>{
  const before=await envelope(p);assert.deepEqual(before.data.allocations,[]);await openFreshQ4(p);const quantity=await enterFreshMode(p,mode);assert.equal(await writes(p),0);await cancel(p);assert.deepEqual(await envelope(p),before,'cancel leaves the saved Q3 and empty Q4 assignment unchanged');
  await openFreshQ4(p);await enterFreshMode(p,mode);await save(p);const saved=await envelope(p);assert.equal(saved.data.allocations.length,1);assert.equal(saved.data.allocations[0].mode,mode);assert.equal(saved.data.allocations[0].qty,quantity);assert.equal(await writes(p),1);await p.reload();await ready(p);await openQ4(p);assert.equal((await raw(p)).mode,mode);assert.equal(await p.locator(`[data-qty="0:${mode==='ONCE'?'once':'base'}"]`).inputValue(),quantity);await p.locator(`[data-choice="delivery"][data-value="${mode==='ONCE'?'FIXED':'ONCE'}"]`).click();await cancel(p);assert.deepEqual(await envelope(p),saved,'cancel after reopening preserves the saved delivery mode and amount');row.saved={mode,quantity,allocationId:saved.data.allocations[0].id};
 },{data:freshAssignmentFixture(),width});
 for(let n=1;n<=7;n++)await check('C55-04_WEEKLY_'+n,async(p,row)=>{
  await openQ4(p);const input=p.locator('[data-qty="0:base"]');await input.fill('8');await input.fill('7');const draft=await raw(p);assert.equal(draft.period,'매주');assert.equal(draft.frequency,n+'회');await p.locator('[data-combo="period"]').click();assert.equal(await p.locator('[data-combo-choice="period"][data-value="매주"]').isEnabled(),true);await p.keyboard.press('Escape');row.expected=n+'회';await cancel(p);
 },{data:fixture({monthly:String(30*n),quantity:'7',period:'협의'})});
 for(const [M,Q,period,freq]of [['67','15','매주','약 1회'],['100','14','매주','약 2회'],['600','300','2주','1회'],['600','227','협의','협의']])await check('C55-05_EXAMPLE_'+M+'_'+Q,async(p,row)=>{
  await openQ4(p);const input=p.locator('[data-qty="0:base"]');await input.fill('1');await input.fill(Q);const draft=await raw(p);assert.equal(draft.period,period);assert.equal(draft.frequency,freq);await p.locator('[data-combo="period"]').click();assert.equal(await p.locator('[data-combo-choice="period"][data-value="매주"]').isEnabled(),period==='매주');await p.keyboard.press('Escape');row.expected={period,freq};await cancel(p);
 },{data:fixture({monthly:M,quantity:Q,period:'협의'})});
 for(const width of [320,375,1440])await check('C55-07_17_BULK_SAVE_REOPEN_RESTORE_'+width,async(p,row)=>{
  await openQ4(p);await combo(p,'period','매월');let draft=await raw(p);assert.equal(draft.mode,'FIXED');assert.deepEqual(draft.values.map(v=>v.base),['100','67']);await combo(p,'date','말일');await save(p);assert.equal(await writes(p),1);
  const saved=await envelope(p);assert.deepEqual(saved.data.allocations.map(a=>a.q4Review.activeRepeat.monthlyMemory.quantity),['14','15']);assert.deepEqual(saved.data.allocations.map(a=>a.q4Review.activeRepeat.monthlyMemory.period),['협의','협의']);
  await p.reload();await ready(p);await openQ4(p);draft=await raw(p);assert.equal(draft.mode,'FIXED');await combo(p,'period','협의');assert.deepEqual((await raw(p)).values.map(v=>v.base),['14','15']);await cancel(p);assert.deepEqual(await envelope(p),saved);
  await openQ4(p);await combo(p,'period','협의');await save(p);const restored=await envelope(p);assert.deepEqual(restored.data.allocations.map(a=>a.qty),['14','15']);assert.deepEqual(restored.data.allocations.map(a=>a.q4Review.activeRepeat.period),['협의','협의']);row.restored=restored.data.allocations.map(a=>a.qty);
 },{data:bulkFixture(),width});
 await check('C55-05_EXPLICIT_CONSULT_RETENTION',async(p,row)=>{await openQ4(p);await combo(p,'period','협의');await p.locator('[data-qty="0:base"]').fill('300');assert.equal((await raw(p)).period,'협의');await save(p);await p.reload();await ready(p);await openQ4(p);await p.locator('[data-qty="0:base"]').fill('40');assert.equal((await raw(p)).period,'협의');row.retained=true;await cancel(p);});
 for(const [id,start,expected]of [['START','2026-11-30','40'],['ZERO','2026-12-01','0']]){const data=fixture({date:start});for(const a of data.allocations)for(const repeat of [a.q4Review.activeRepeat,a.q4Review.common.repeat])Object.assign(repeat,{frequency:'4회',weeklyCheck:true,weekdays:{'1:월':true,'1:화':true,'1:목':true,'1:금':true}});await check('C55-09_10_'+id,async(p,row)=>{await openQ4(p);assert.equal(await p.locator('[data-result-value="monthly"]').innerText(),expected);assert.equal(await p.locator('[data-result-title="monthly"]').innerText(),'2026년 11월 납품 예상');row.expected=expected;await cancel(p);},{data});}
 const partial=fixture();for(const a of partial.allocations)for(const repeat of [a.q4Review.activeRepeat,a.q4Review.common.repeat])Object.assign(repeat,{frequency:'4회',weeklyCheck:true,weekdays:{'1:월':true,'1:화':true,'1:목':true}});
 for(const width of [320,375,1440])await check('C55-11_PARTIAL_WEEKDAYS_'+width,async(p,row)=>{await openQ4(p);const status=await p.locator('[data-result-status]').innerText();assert.match(status,/희망 요일 3개, 나머지 일정 미정/);assert.equal(await p.locator('[data-result-value="monthly"]').innerText(),'—');assert.equal(await p.locator('[data-weekday][aria-pressed="true"]').count(),3);const overflow=await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);await p.screenshot({path:join(evidence,'partial-'+width+'.png'),fullPage:true});await save(p);row.statusText=status;},{data:partial,width});
 report.status=report.checks.every(row=>row.status==='PASS')&&!report.errors.length?'PASS':'FAIL';if(report.status==='FAIL')process.exitCode=1;
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'c55-q4.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,errors:report.errors,error:report.error},null,2));}
