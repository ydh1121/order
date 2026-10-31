// Optional actual HTTPS browser adapter probe; never a mocked product/UI acceptance.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/':import.meta.url);
const {chromium}=require('playwright');
const origin=process.argv[2];
if(!['https://example.com','https://order-ooo.pages.dev'].includes(origin))throw Error('Explicit permitted HTTPS origin required');
const memo=new Map();
async function moduleUrl(url){
  if(memo.has(url.href))return memo.get(url.href);
  let source=await readFile(url,'utf8');
  const matches=[...source.matchAll(/(from\s*|import\s*)['"](\.[^'"]+)['"]/g)];
  for(const match of matches){const child=await moduleUrl(new URL(match[2],url));source=source.replace(match[0],`${match[1]}${JSON.stringify(child)}`);}
  const value='data:text/javascript;base64,'+Buffer.from(source).toString('base64');memo.set(url.href,value);return value;
}
const adapter=await moduleUrl(new URL('../../src/engine/adapters/dns-browser.mjs',import.meta.url));
const core=await moduleUrl(new URL('../../src/engine/validation/email-dns.mjs',import.meta.url));
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin,{waitUntil:'domcontentloaded',timeout:20000});
  const result=await page.evaluate(async({adapter,core})=>{
    const {browserDomainToASCII,createBrowserDnsResolver}=await import(adapter);
    const {validateEmailDomain}=await import(core);
    const domains=['example.com','iana.org'];const online=[];
    for(const domain of domains){const resolver=createBrowserDnsResolver({maxRequests:16,timeoutMs:1500});online.push({domain,...await validateEmailDomain(domain,{resolver,now:Date.now,maxQueries:16,timeoutMs:1600,totalTimeoutMs:6000})});}
    return {origin:location.origin,isSecureContext,checkedAt:new Date().toISOString(),userAgent:navigator.userAgent,idna:{russian:browserDomainToASCII('пример.рф'),korean:browserDomainToASCII('예시.한국'),malformed:browserDomainToASCII('xn--a.com')},online};
  },{adapter,core});
  console.log(JSON.stringify({mode:'ACTUAL_HTTPS_BROWSER_ADAPTER_PROBE',requestedOrigin:origin,browser:await browser.version(),sourcePath:fileURLToPath(new URL('../../src/engine/adapters/dns-browser.mjs',import.meta.url)),errors,...result},null,2));
}finally{await browser.close();}
