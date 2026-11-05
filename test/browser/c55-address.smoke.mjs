/** C55 address acceptance against built product. CI executes Chromium; all
 * provider/DNS responses below are synthetic and no live API key is used. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile,realpath} from 'node:fs/promises';
import {dirname,resolve,join,extname,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {allocationFixture,syntheticDns} from '../fixtures/qa-lab.mjs';
import {createAddressSearchHandler} from '../../functions/api/address/search.js';
import {closedAfterExplicitDiscard} from './modal-test-helpers.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const evidence=resolve(process.env.ORDER_C55_ADDRESS_EVIDENCE_DIR||join(root,'browser-evidence/c55-address'));
const KEY='order_q1_q4_v1',road='서울 강남구 합성검사로 10';
const report={classification:'CHROMIUM_BUILT_PRODUCT_SYNTHETIC_PROVIDER_AND_DNS',status:'RUNNING',checks:[],captures:[],requests:[],providerCalls:[],errors:[],notCovered:['LIVE_KAKAO','PRODUCTION_SECRET','CANONICAL_DEPLOYMENT','USER_OS','VISUAL_ACCEPTANCE']};
const address={address_type:'ROAD_ADDR',road_address:{address_name:road,zone_no:'01234',region_1depth_name:'서울',region_2depth_name:'강남구'},address:{address_name:'서울 강남구 합성동 1'}};
const provider=(documents=[],is_end=true,total=documents.length)=>({meta:{total_count:total,pageable_count:total,is_end},documents});
const place=(id,name)=>({id,place_name:name,road_address_name:road,address_name:'서울 강남구 합성동 1'});
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
let browser,server;
async function serve(){
 const dist=await realpath(join(root,'dist'));
 server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=await realpath(resolve(dist,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname)));
  if(!file.startsWith(dist+sep))throw Error('PATH_OUTSIDE_DIST');
  res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'}).end(await readFile(file));
 }catch{res.writeHead(404).end('Not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${server.address().port}`;
}
const ready=page=>page.waitForFunction(()=>document.documentElement.dataset.storageReady==='true'&&document.documentElement.dataset.storagePending!=='true');
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
const writes=page=>page.evaluate(()=>window.__c55Writes);
async function until(predicate,label){const end=Date.now()+5000;while(!predicate()){assert.ok(Date.now()<end,label);await new Promise(resolve=>setTimeout(resolve,20));}}
async function site(page){
 const q3=page.locator('.accordion-trigger[data-open="q3"]');if(await q3.getAttribute('aria-expanded')!=='true')await q3.click();
 const toggle=page.locator('[id="q3-site-qa-site-0"] > .accordion-trigger');if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 await page.locator('[data-site-edit="qa-site-0"]').click();await page.locator('#site-editor-dialog[open]').waitFor();
}
async function child(page){await page.locator('#q3-address-slot').click();await page.locator('#address-editor-dialog[open]').waitFor();}
async function close(page,id){await closedAfterExplicitDiscard(page,id);}
async function setup(base,width){
 const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
 const control={pagination:false,failedPage:false,holdResolve:false,held:[],requests:[],calls:[]};
 const handler=createAddressSearchHandler({fetcher:async(url,options)=>{
  const u=new URL(url),query=u.searchParams.get('query'),page=Number(u.searchParams.get('page'));
  assert.equal(u.origin,'https://dapi.kakao.com');assert.equal(options.redirect,'manual');
  control.calls.push({path:u.pathname,query,page});report.providerCalls.push({width,path:u.pathname,query,page,synthetic:true});
  if(u.pathname.endsWith('/address.json'))return json(provider(query===road?[address]:[]));
  assert.ok(u.pathname.endsWith('/keyword.json'));
  if(control.pagination){
   if(page===3&&!control.failedPage){control.failedPage=true;throw Error('synthetic page failure');}
   return json(provider(page===1?[place('101','엽기떡볶이 언주역점'),place('102','같은 건물 별도 매장')]:[{...place('103','주소 미확인 장소'),road_address_name:'',address_name:''}],page===3,35));
  }
  return json(provider(query===road?[]:[place('101',query==='엽기떡볶이 언주역'?'엽기떡볶이 언주역점':query),place('102','같은 건물 다른 매장 아주 긴 상호와 지점명을 표시하는 합성검사점')]));
 }});
 await context.addInitScript(key=>{const original=Storage.prototype.setItem;window.__c55Writes=0;Storage.prototype.setItem=function(k,v){const result=original.call(this,k,v);if(k===key&&this===localStorage)window.__c55Writes++;return result;};},KEY);
 await context.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());try{
   if(u.origin===base&&u.pathname==='/api/address/search'){
    assert.equal(req.method(),'POST');assert.equal(u.search,'');const body=req.postDataJSON();
    control.requests.push(body);report.requests.push({width,...body,synthetic:true});
    assert.deepEqual(Object.keys(body).sort(),(body.action==='resolve'?['action','page','placeId','query']:['page','query']));
    if(control.holdResolve&&body.action==='resolve'){control.held.push({route,body});return;}
    const response=await handler({request:new Request(req.url(),{method:'POST',headers:{'content-type':'application/json',origin:base},body:JSON.stringify(body)}),env:{KAKAO_REST_API_KEY:'c55-synthetic'}});
    return await route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});
   }
   if(u.origin===base)return route.continue();
   if(['cloudflare-dns.com','dns.google'].includes(u.hostname))return route.fulfill({status:200,contentType:'application/dns-json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(syntheticDns(u.searchParams.get('name'),u.searchParams.get('type')))});
   report.errors.push({type:'UNEXPECTED_EXTERNAL',origin:u.origin});await route.abort('blockedbyclient');
  }catch(error){report.errors.push({type:'TRANSPORT',message:String(error)});await route.abort().catch(()=>{});}
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push({type:'PAGE_ERROR',message:String(error)}));
 await page.goto(base);await ready(page);
 const fixture=allocationFixture();fixture.open='q3';fixture.allocations=[];fixture.locations=[{...fixture.locations[0],id:'qa-site-0',name:'합성 주소 검사 사업장',road:'',postal:'',detail:'',dropoff:'',jibun:'',region:'',providerId:'',addressProvider:'',addressState:'ADDRESS_UI_PENDING',contactPhone:'010-2345-6789',email:'qa@example.com',storePhone:'',basicInfoDraft:true}];
 const seeded=await page.evaluate(async data=>{const {createBrowserStorage}=await import('/storage.mjs'),adapter=createBrowserStorage(),loaded=await adapter.load();return adapter.commit(data,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'c55-address-'+crypto.randomUUID()});},fixture);
 assert.equal(seeded.ok,true,JSON.stringify(seeded));await page.goto(base+'/#/form');await page.reload();await ready(page);
 await page.waitForFunction(()=>window.OrderEmailDomain?.isSuccess(OrderEmailDomain.status('qa@example.com')),null,{timeout:15000});await page.evaluate(()=>window.__c55Writes=0);
 return {context,page,control};
}
async function capture(page,width,label){
 const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,rows:[...document.querySelectorAll('#address-results [data-address-option]')].map(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth};}),actions:(()=>{const r=document.querySelector('#address-editor-dialog .q4-regular-actions').getBoundingClientRect();return{top:r.top,bottom:r.bottom};})(),height:innerHeight}));
 assert.equal(geometry.overflow,false);assert.ok(geometry.rows.every(row=>row.height>=44&&row.scrollWidth<=row.clientWidth+1));assert.ok(geometry.actions.top>=0&&geometry.actions.bottom<=geometry.height+1);
 const file=`${label}-${width}.png`;await page.screenshot({path:join(evidence,file)});report.captures.push({file,width,geometry});
}
async function check(id,run){try{await run();report.checks.push({id,status:'PASS'});}catch(error){report.checks.push({id,status:'FAIL',error:String(error.stack||error)});process.exitCode=1;}}

try{
 await mkdir(evidence,{recursive:true});report.build=JSON.parse(await readFile(join(root,'dist/build-identity.json'),'utf8'));assert.equal(report.build.scope,'INTEGRATED_PRODUCT');
 for(const name of ['address-contract.mjs','address-service.mjs','address-ui.mjs']){
  const source=await readFile(join(root,'web',name)),built=await readFile(join(root,'dist',name));assert.deepEqual(built,source,'browser must use current address source: '+name);
  assert.equal(report.build.files.find(file=>file.path===name)?.sha256,createHash('sha256').update(source).digest('hex'));
 }
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});report.browser=browser.version();const base=await serve();
 for(const [width,query] of [[320,'엽기떡볶이 언주역'],[375,'서울시청'],[1440,'관악구청']])await check(`C55-01_02_CHILD0_PARENT1_RESTORE_${width}`,async()=>{
  const h=await setup(base,width),{page:p,control:c}=h;try{
   const before=await saved(p);await site(p);await child(p);await p.locator('#address-query').fill(query);await p.locator('[data-address-option]').nth(1).waitFor();
   assert.equal(c.calls.length,2);assert.match(await p.locator('[data-address-option]').first().innerText(),new RegExp(query==='엽기떡볶이 언주역'?'언주역점':query));await capture(p,width,'place-results');
   await p.locator('[data-address-option]').first().click();await p.locator('#address-detail').waitFor({state:'visible'});assert.equal(c.calls.length,4);assert.equal(c.requests.filter(r=>r.action==='resolve').length,1);
   await p.locator('#address-detail').fill('2층 매장');await p.locator('#address-confirm').click();await close(p,'address-editor-dialog');assert.equal(await writes(p),0);assert.deepEqual(await saved(p),before);
   await p.locator('#save-site').click();await close(p,'site-editor-dialog');const after=await saved(p);assert.equal(await writes(p),1);assert.equal(after.revision,before.revision+1);assert.equal(after.data.locations[0].postal,'01234');assert.equal(after.data.locations[0].detail,'2층 매장');assert.match(after.data.locations[0].providerId,/^KAKAO:v1:[a-f0-9]{64}$/);
   await p.reload();await ready(p);assert.deepEqual((await saved(p)).data,after.data);await site(p);await child(p);assert.equal(await p.locator('#address-detail').inputValue(),'2층 매장');assert.equal(c.calls.length,4);
   await p.locator('#address-query').fill(query);await p.locator('[data-address-option]').nth(1).waitFor();await p.locator('[data-address-option]').nth(1).click();await p.waitForFunction(()=>document.querySelector('#address-query').getAttribute('aria-busy')==='false'&&document.querySelector('#address-detail').value==='');assert.equal(await p.locator('#address-detail').inputValue(),'');
   await p.locator('#address-cancel').click();await close(p,'address-editor-dialog');await p.locator('#cancel-site').click();await close(p,'site-editor-dialog');assert.deepEqual((await saved(p)).data,after.data);
  }finally{await h.context.close();}
 });
 await check('C55-03_EMPTY_MORE_FAILURE_RETRY_AND_ROAD_CONTROL',async()=>{
  const h=await setup(base,375),{page:p,control:c}=h;try{
   c.pagination=true;await site(p);await child(p);await p.locator('#address-query').fill('여러 매장');await p.locator('[data-address-option]').nth(1).waitFor();
   await p.locator('#address-next-page').click();await p.waitForFunction(()=>document.querySelector('#address-next-page').hidden===false&&document.querySelector('#address-query').getAttribute('aria-busy')==='false');assert.equal(await p.locator('[data-address-option]').count(),2);assert.doesNotMatch(await p.locator('#address-status').innerText(),/검색 결과가 없습니다/);
   await p.locator('#address-next-page').click();await p.locator('#address-retry').waitFor({state:'visible'});assert.equal(await p.locator('#address-results').isVisible(),true);await p.locator('#address-retry').click();await p.waitForFunction(()=>document.querySelector('#address-query').getAttribute('aria-busy')==='false'&&document.querySelector('#address-retry').hidden);assert.deepEqual(c.requests.map(r=>r.page),[1,2,3,3]);assert.equal(await p.locator('[data-address-option]').count(),2);assert.equal(await p.locator('#address-next-page').isVisible(),false);
   c.pagination=false;await p.locator('#address-query').fill(road);await p.locator('[data-address-option]').first().waitFor();const calls=c.calls.length;await p.locator('[data-address-option]').first().click();await p.locator('#address-detail').waitFor({state:'visible'});assert.equal(c.calls.length,calls,'road candidate has verified postal without an extra resolve');assert.equal(await writes(p),0);
  }finally{await h.context.close();}
 });
 await check('C55-02_LATE_PLACE_RESOLUTION_AFTER_NEW_SEARCH_CANCEL_REOPEN',async()=>{
  const h=await setup(base,375),{page:p,control:c}=h;try{
   await site(p);await child(p);await p.locator('#address-query').fill('서울시청');await p.locator('[data-address-option]').first().waitFor();c.holdResolve=true;await p.locator('[data-address-option]').first().click();await until(()=>c.held.length===1,'one selected-place resolution must actually reach held transport');await p.waitForFunction(()=>document.querySelector('#address-status').textContent.includes('우편주소 확인 중'));
   await p.locator('#address-query').fill(road);await p.locator('[data-address-option]').first().waitFor();await p.locator('[data-address-option]').first().click();await p.locator('#address-detail').waitFor({state:'visible'});
   for(const held of c.held.splice(0))await held.route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:3,status:'OK',reason:'RESOLVED',placeId:'101',item:{road:'서울 중구 늦은응답검사길 1',postal:'04524',jibun:'서울 중구 합성동 1',region:'서울 중구',addressProvider:'KAKAO',providerId:'KAKAO:v1:'+'b'.repeat(64)}})}).catch(()=>{});
   assert.equal(await p.locator('#address-query').inputValue(),road);assert.equal(await writes(p),0);await p.locator('#address-cancel').click();await close(p,'address-editor-dialog');await child(p);assert.equal(await p.locator('#address-query').inputValue(),'');assert.equal(await writes(p),0);
  }finally{for(const held of c.held)await held.route.abort().catch(()=>{});await h.context.close();}
 });
 report.status=report.checks.some(check=>check.status==='FAIL')||report.errors.length?'FAIL':'PASS';if(report.status==='FAIL')process.exitCode=1;
}catch(error){report.status='FAIL';report.error=String(error.stack||error);process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'c55-address.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
