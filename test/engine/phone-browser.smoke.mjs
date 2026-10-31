// Optional real Chromium DOM check; deliberately separate from deterministic node:test.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const html=`<!doctype html><meta charset="utf-8"><label for="phone">Phone</label><input id="phone" aria-required="true"><label for="optional">Optional</label><input id="optional"><button id="outside">Outside</button><script type="module">import {createOrderPhoneAdapter} from '/src/engine/adapters/phone-browser.mjs';window.phoneAPI=createOrderPhoneAdapter();phoneAPI.mount(document.querySelector('#phone'));phoneAPI.mount(document.querySelector('#optional'));window.ready=true;</script>`;
const server=createServer(async(req,res)=>{
  if(req.url==='/'){res.writeHead(200,{'content-type':'text/html'}).end(html);return;}
  if(!req.url.startsWith('/src/engine/')||req.url.includes('..')){res.writeHead(404).end();return;}
  try{const body=await readFile(resolve(root,'.'+req.url));res.writeHead(200,{'content-type':'text/javascript'}).end(body);}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
const checks=[];
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.ready);
  const set=raw=>page.evaluate(raw=>phoneAPI.set(document.querySelector('#phone'),raw),raw);
  const state=()=>page.evaluate(()=>{const c=phoneAPI.instance(document.querySelector('#phone'));return {value:c.get(),verdict:c.parse(),snapshot:c.snapshot(),projection:c.projection()};});
  await set('+82 10 2345 6789');let s=await state();assert.equal(s.value,'010-2345-6789');assert.equal(s.verdict.valid,true);assert.equal(s.snapshot.originalRaw,'+82 10 2345 6789');checks.push('PLUS82_RAW_AND_NORMALIZED');
  await set('02');await page.locator('#phone-part2').focus();await page.keyboard.type('234');await page.keyboard.press('Tab');await page.keyboard.type('5678');s=await state();assert.equal(s.value,'02-234-5678');assert.equal(s.verdict.valid,true);assert.equal(s.snapshot.explicitMiddle,true);checks.push('EXPLICIT_MIDDLE_3_TAB');
  await set('02');await page.locator('#phone-part2').focus();await page.keyboard.type('234');await page.locator('#phone-part3').focus();await page.keyboard.type('5678');s=await state();assert.equal(s.snapshot.explicitMiddle,false);assert.equal(s.verdict.valid,true);checks.push('PROGRAMMATIC_FOCUS_NOT_EXPLICIT');
  await set('010-2345-6789');await page.locator('#phone-part3').focus();await page.evaluate(()=>{const c=phoneAPI.instance(document.querySelector('#phone')),p=c.parts[2];p.setSelectionRange(1,3);const data=new DataTransfer();data.setData('text/plain','12345678');p.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});s=await state();assert.equal(s.value,'010-2345-6789');assert.equal(s.snapshot.selection.start,1);assert.equal(s.snapshot.selection.end,3);checks.push('PARTIAL_PASTE_REJECTS_WITH_SELECTION_RESTORED');
  await page.evaluate(()=>{const p=phoneAPI.instance(document.querySelector('#phone')).parts[2];const data=new DataTransfer();data.setData('text/plain','15881234');p.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});s=await state();assert.equal(s.value,'1588-1234');assert.equal(s.verdict.valid,true);checks.push('WHOLE_REPRESENTATIVE_PASTE');
  await set('010-1234-12345678');s=await state();assert.equal(s.value,'010-1234-12345678');assert.equal(s.snapshot.rawMode,true);assert.equal(s.verdict.valid,false);await page.locator('#phone').focus();await page.keyboard.press('Control+A');await page.keyboard.press('Backspace');s=await state();assert.equal(s.value,'');assert.equal(s.snapshot.explicitClear,true);assert.equal(s.snapshot.originalRaw,'010-1234-12345678');checks.push('CORRUPT_RESTORE_AND_EXPLICIT_CLEAR');
  await page.evaluate(()=>phoneAPI.set(document.querySelector('#optional'),'070-2345-6789'));await page.locator('#optional').focus();await page.keyboard.press('Control+A');await page.keyboard.press('Backspace');const optional=await page.evaluate(()=>phoneAPI.instance(document.querySelector('#optional')).projection());assert.equal(optional.saveAllowed,true);checks.push('OPTIONAL_CLEAR_GATE');
  await set('02-234-5678');await page.locator('#phone-part2').focus();await page.evaluate(()=>{const p=document.querySelector('#phone-part2');p.setSelectionRange(1,2);p.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));p.value='2한4';p.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'한'}));});s=await state();assert.equal(s.value,'02-234-5678');assert.equal(s.snapshot.selection.start,1);assert.equal(s.snapshot.selection.end,2);checks.push('IME_REJECT_PRESERVES_DIGITS_AND_SELECTION');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({environment:'Linux Chromium local HTTP, synthetic input only',browser:browser.version(),passed:checks.length,checks,pageErrors:errors,onlineTelecom:false,windows:false,iPhone:false},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
