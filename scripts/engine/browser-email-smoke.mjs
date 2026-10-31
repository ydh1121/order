// Actual HTTPS adapter probe. No mocks, interception, CSP bypass, or QA host.
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {relative,dirname} from 'node:path';
import {release} from 'node:os';

const require=createRequire(import.meta.url);
const root=fileURLToPath(new URL('../../',import.meta.url));
const sourceRoot=fileURLToPath(new URL('../../src/engine/',import.meta.url));
const requestedOrigin=process.argv[2];
const playwrightModule=process.env.PLAYWRIGHT_MODULE||'playwright';
const report={schemaVersion:1,mode:'ACTUAL_HTTPS_BROWSER_ADAPTER_PROBE',startedAt:new Date().toISOString(),requestedOrigin,
  scope:{moduleDelivery:'LOCAL_CHECKOUT_MODULE_BYTES_AS_DATA_URLS',networkMocked:false,cspBypassed:false,
    deployedBuildVerified:false,deployedIanaVerified:false,productAcceptance:false,publicQaHosted:false},
  runtime:{node:process.version,platform:process.platform,arch:process.arch,osRelease:release(),headless:true},
  source:{commit:null,dirtyPaths:[],modules:[]},page:{errors:[],console:[]},network:[],assertions:[],online:[],browserFetches:[],
  outcome:{status:'FAIL_EXECUTION',structural:'NOT_RUN',online:'NOT_RUN'},exitCode:2};
const safeError=value=>String(value?.message??value).replace(/data:text\/javascript[^\s)]*/g,'[checkout-module-data-url]').slice(0,2000);
const check=(id,actual,expected=true)=>{const passed=JSON.stringify(actual)===JSON.stringify(expected);report.assertions.push({id,passed,actual,expected});return passed;};
let browser;

try{
  if(!['https://example.com','https://order-ooo.pages.dev'].includes(requestedOrigin))throw Error('Explicit permitted HTTPS origin required: https://example.com or https://order-ooo.pages.dev');
  report.source.commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  report.source.dirtyPaths=execFileSync('git',['status','--porcelain','--','src/engine','scripts/engine/browser-email-smoke.mjs'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
  // Resolve a normally pinned repository dependency, or an explicitly supplied path.
  const {chromium}=require(playwrightModule);
  const resolvedPlaywright=require.resolve(playwrightModule);
  report.runtime.playwrightModule=resolvedPlaywright;
  try{report.runtime.playwrightVersion=require(dirname(resolvedPlaywright)+'/package.json').version;}catch{report.runtime.playwrightVersion='UNAVAILABLE';}
  const memo=new Map(),visiting=new Set();
  async function moduleUrl(url){
    if(memo.has(url.href))return memo.get(url.href);
    const path=fileURLToPath(url);
    if(!path.startsWith(sourceRoot)||visiting.has(url.href))throw Error('Browser module graph escapes engine or contains cycle');
    visiting.add(url.href);const original=await readFile(url,'utf8');
    if(/from\s*['"]node:|\bBuffer\b|\bprocess\./.test(original))throw Error('Node-only dependency in browser module graph');
    report.source.modules.push({path:relative(root,path),sha256:createHash('sha256').update(original).digest('hex'),bytes:Buffer.byteLength(original)});
    let source=original;
    for(const match of [...source.matchAll(/(from\s*|import\s*)['"](\.[^'"]+)['"]/g)]){
      const child=await moduleUrl(new URL(match[2],url));source=source.replace(match[0],`${match[1]}${JSON.stringify(child)}`);
    }
    const value='data:text/javascript;base64,'+Buffer.from(source).toString('base64');memo.set(url.href,value);visiting.delete(url.href);return value;
  }
  const adapter=await moduleUrl(new URL('../../src/engine/adapters/dns-browser.mjs',import.meta.url));
  const core=await moduleUrl(new URL('../../src/engine/validation/email-dns.mjs',import.meta.url));
  report.source.modules.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  report.source.graphSha256=createHash('sha256').update(JSON.stringify(report.source.modules)).digest('hex');
  browser=await chromium.launch({headless:true});report.runtime.browserVersion=await browser.version();
  const page=await browser.newPage();page.setDefaultTimeout(20000);
  page.on('pageerror',error=>report.page.errors.push({at:new Date().toISOString(),message:safeError(error)}));
  page.on('console',message=>{if(['error','warning'].includes(message.type()))report.page.console.push({at:new Date().toISOString(),type:message.type(),text:safeError(message.text())});});
  const requests=new Map();
  function isDoh(url){try{const parsed=new URL(url);return (parsed.origin==='https://cloudflare-dns.com'&&parsed.pathname==='/dns-query')||(parsed.origin==='https://dns.google'&&parsed.pathname==='/resolve');}catch{return false;}}
  page.on('request',request=>{if(!isDoh(request.url()))return;const row={id:requests.size+1,at:new Date().toISOString(),url:request.url(),method:request.method(),resourceType:request.resourceType()};requests.set(request,row);report.network.push(row);});
  page.on('response',response=>{const row=requests.get(response.request());if(!row)return;const headers=response.headers();Object.assign(row,{responseAt:new Date().toISOString(),httpStatus:response.status(),responseUrl:response.url(),contentType:headers['content-type']??null,accessControlAllowOrigin:headers['access-control-allow-origin']??null,accessControlExposeHeaders:headers['access-control-expose-headers']??null,age:headers.age??null});});
  page.on('requestfailed',request=>{const row=requests.get(request);if(row)Object.assign(row,{failedAt:new Date().toISOString(),failure:request.failure()?.errorText??'UNKNOWN'});});
  const navigation=await page.goto(requestedOrigin,{waitUntil:'domcontentloaded',timeout:20000});
  report.page.navigationHttpStatus=navigation?.status()??null;report.page.url=page.url();
  if(!navigation?.ok())throw Error(`HTTPS origin navigation failed with HTTP ${report.page.navigationHttpStatus}`);
  const baseline=await page.evaluate(()=>({origin:location.origin,isSecureContext,userAgent:navigator.userAgent}));
  Object.assign(report.page,baseline);
  check('ACTUAL_ORIGIN_MATCHES_REQUEST',baseline.origin,requestedOrigin);check('HTTPS_SECURE_CONTEXT',baseline.isSecureContext,true);
  if(report.assertions.some(row=>!row.passed)){report.outcome={status:'FAIL_STRUCTURAL',structural:'FAIL',online:'NOT_RUN'};report.exitCode=1;}
  else{
    const observed=await page.evaluate(async({adapter,core})=>{
      const {browserDomainToASCII,createBrowserDnsResolver,readBoundedJson}=await import(adapter);
      const {validateEmailDomain}=await import(core);
      const browserFetches=[],audits=[];
      const fetcher=async(url,options)=>{
        const parsed=new URL(url),entry={id:browserFetches.length+1,startedAt:new Date().toISOString(),url:parsed.href,
          domain:parsed.searchParams.get('name'),recordType:parsed.searchParams.get('type'),mode:options.mode,credentials:options.credentials,referrerPolicy:options.referrerPolicy};
        browserFetches.push(entry);
        try{
          const response=await fetch(url,options);
          Object.assign(entry,{resolvedAt:new Date().toISOString(),fetchResolved:true,httpStatus:response.status,responseType:response.type,
            contentType:response.headers.get('content-type'),accessControlAllowOriginExposed:response.headers.get('access-control-allow-origin'),corsReadable:response.type==='cors'});
          let timer;
          const audit=Promise.race([readBoundedJson(response.clone()).then(data=>Object.assign(entry,{dnsStatus:data.Status??null,
            question:Array.isArray(data.Question)?data.Question.map(q=>({name:q.name,type:q.type})):null,
            answerCount:Array.isArray(data.Answer)?data.Answer.length:0})),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('AUDIT_BODY_TIMEOUT')),1500);})])
            .catch(error=>{entry.auditError=String(error?.message??error).slice(0,200);}).finally(()=>clearTimeout(timer));
          audits.push(audit);return response;
        }catch(error){Object.assign(entry,{failedAt:new Date().toISOString(),fetchResolved:false,corsReadable:false,errorName:error?.name??'Error',error:String(error?.message??error).slice(0,300)});throw error;}
      };
      const online=[];
      for(const domain of ['example.com','iana.org']){
        const resolver=createBrowserDnsResolver({fetcher,maxRequests:16,timeoutMs:1500});
        const result=await validateEmailDomain(domain,{resolver,now:Date.now,maxQueries:16,timeoutMs:1600,totalTimeoutMs:6000});
        online.push({domain,httpRequests:resolver.requests,result});
      }
      await Promise.allSettled(audits);
      return {checkedAt:new Date().toISOString(),idna:{russian:browserDomainToASCII('пример.рф'),korean:browserDomainToASCII('예시.한국'),
        malformed:browserDomainToASCII('xn--a.com'),urlInjection:browserDomainToASCII('example.com:443')},online,browserFetches};
    },{adapter,core});
    report.checkedAt=observed.checkedAt;report.idna=observed.idna;report.online=observed.online;report.browserFetches=observed.browserFetches;
    check('IDNA_RUSSIAN',observed.idna.russian,'xn--e1afmkfd.xn--p1ai');check('IDNA_KOREAN',observed.idna.korean,'xn--vv4b11d.xn--3e0b707e');
    check('IDNA_MALFORMED_ALABEL_REJECTED',observed.idna.malformed,'');check('IDNA_URL_INJECTION_REJECTED',observed.idna.urlInjection,'');
    check('NO_UNCAUGHT_PAGE_ERRORS',report.page.errors.length,0);
    for(const row of observed.online){
      check(`${row.domain}:NORMALIZED_DOMAIN`,row.result.normalized?.domain,row.domain);
      check(`${row.domain}:QUERY_BUDGET`,Number.isInteger(row.result.evidence?.queries)&&row.result.evidence.queries>0&&row.result.evidence.queries<=16);
      check(`${row.domain}:HTTP_BUDGET`,Number.isInteger(row.httpRequests)&&row.httpRequests>0&&row.httpRequests<=16);
      check(`${row.domain}:REAL_OBSERVATIONS`,Array.isArray(row.result.evidence?.observations)&&row.result.evidence.observations.length>0);
      check(`${row.domain}:SUPPORTED_VERDICT`,['VALID','INVALID','UNKNOWN'].includes(row.result.status));
      check(`${row.domain}:NOT_INPUT_CONTRACT_FAILURE`,!row.result.reasonCodes?.includes('DNS_INPUT_CONTRACT'));
      const definitive=['VALID','INVALID'].includes(row.result.status);
      const readable=observed.browserFetches.some(fetch=>fetch.domain===row.domain&&fetch.httpStatus===200&&fetch.corsReadable&&Number.isInteger(fetch.dnsStatus));
      row.classification=definitive&&readable?'DEFINITIVE_DNS_OBSERVATION':'ONLINE_INCONCLUSIVE';
    }
    const structural=report.assertions.every(row=>row.passed);
    const definitive=report.online.every(row=>row.classification==='DEFINITIVE_DNS_OBSERVATION');
    report.outcome=structural?{status:definitive?'PASS':'ONLINE_INCONCLUSIVE',structural:'PASS',online:definitive?'DEFINITIVE_OBSERVATIONS':'INCONCLUSIVE'}:{status:'FAIL_STRUCTURAL',structural:'FAIL',online:'SEE_OBSERVATIONS'};
    report.exitCode=!structural?1:definitive?0:3;
  }
}catch(error){report.failure={name:error?.name??'Error',message:safeError(error)};report.outcome={status:'FAIL_EXECUTION',structural:report.assertions.length?'INCOMPLETE':'NOT_RUN',online:report.online.length?'SEE_OBSERVATIONS':'NOT_RUN'};report.exitCode=2;}
finally{
  if(browser)await browser.close().catch(error=>{report.closeError=safeError(error);});
  report.finishedAt=new Date().toISOString();console.log(JSON.stringify(report,null,2));process.exitCode=report.exitCode;
}
