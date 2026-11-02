import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {buildBrowserReference} from './engine/build-browser-reference.mjs';

const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const fixturePath='test/fixtures/qa-lab.mjs';
const buildSourcePaths=['scripts/build-qa-lab.mjs','scripts/engine/build-browser-reference.mjs','scripts/engine/update-iana.mjs','src/engine/reference/iana.mjs','package.json','package-lock.json'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const moduleKey=path=>'order-qa/source/'+path;
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c');
const dataUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const substitutions=new Map([
 ['web/storage.mjs','order-qa/virtual/storage.mjs'],
 ['web/address-service.mjs','order-qa/virtual/address.mjs'],
 ['src/engine/adapters/iana-browser.mjs','order-qa/virtual/iana.mjs'],
 ['src/engine/adapters/email-browser.mjs','order-qa/virtual/email.mjs'],
]);
const extraQaPaths=new Set(['test/fixtures/qa-lab-0528.mjs','test/fixtures/qa-run-0528.mjs']);
const allowed=path=>/^(?:web\/|src\/(?:engine|browser)\/)[a-zA-Z0-9_./-]+\.mjs$/.test(path)||path===fixturePath||extraQaPaths.has(path);

async function readSource(root,path){
 if(path.startsWith('/')||path.includes('\\')||path.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('QA_PATH_FORBIDDEN:'+path);
 let cursor=root;for(const part of path.split('/')){cursor=resolve(cursor,part);if((await lstat(cursor)).isSymbolicLink())throw Error('QA_SYMLINK_FORBIDDEN:'+path);}
 const full=await realpath(resolve(root,path));if(!full.startsWith(await realpath(root)+sep))throw Error('QA_PATH_OUTSIDE_ROOT');
 return readFile(full,'utf8');
}
function moduleImports(source,path){
 const ast=parse(source,{ecmaVersion:2024,sourceType:'module'}),imports=[];
 const walk=node=>{if(!node||typeof node!=='object')return;
  if(node.type==='ImportExpression')throw Error('QA_DYNAMIC_IMPORT_FORBIDDEN:'+path);
  if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source)imports.push(node.source);
  for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);
 };walk(ast);return imports;
}
export async function collectQaModules(root=repositoryRoot,{extraEntries=[]}={}){
 if(extraEntries.some(path=>!extraQaPaths.has(path)))throw Error('QA_EXTRA_ENTRY_NOT_ALLOWED');
 const files=new Map(),pending=['web/main.mjs',fixturePath,...extraEntries];
 while(pending.length){
  const path=pending.pop();if(files.has(path))continue;if(!allowed(path))throw Error('QA_MODULE_OUTSIDE_PRODUCT:'+path);
  const source=await readSource(root,path),imports=moduleImports(source,path).map(node=>{
   if(!/^(?:\.\/|\.\.\/)/.test(node.value))throw Error('QA_EXTERNAL_IMPORT:'+node.value);
   const target=relative(root,resolve(root,dirname(path),node.value)).split(sep).join('/');
   if(!allowed(target))throw Error('QA_IMPORT_OUTSIDE_PRODUCT:'+target);pending.push(target);return {...node,target};
  });files.set(path,{source,imports});
 }
 for(const required of substitutions.keys())if(!files.has(required))throw Error('QA_SHARED_ADAPTER_REQUIRED:'+required);
 return files;
}

function runtimeSource({identity,reference}){
 return `import {createBrowserStorage} from ${json(moduleKey('web/storage.mjs'))};
import {createAddressSearchService} from ${json(moduleKey('web/address-service.mjs'))};
import {allocationFixture,syntheticDns,syntheticAddressResult} from ${json(moduleKey(fixturePath))};
const source=${json({commitSha:identity.commitSha,sourceState:identity.sourceState})};
const reference=${json(reference)};
const values=new Map(),sessionValues=new Map();let failNext=false,tail=Promise.resolve();
const storage={getItem:key=>values.has(String(key))?values.get(String(key)):null,setItem(key,value){if(failNext){failNext=false;throw new DOMException('QA forced next storage write failure','QuotaExceededError');}values.set(String(key),String(value));},removeItem:key=>values.delete(String(key))};
const sessionStorage={getItem:key=>sessionValues.get(String(key))??null,setItem:(key,value)=>sessionValues.set(String(key),String(value)),removeItem:key=>sessionValues.delete(String(key))};
const locks={request(_name,_options,callback){const task=tail.then(()=>callback({name:_name,mode:'exclusive'}));tail=task.catch(()=>{});return task;}};
const key='order_qa_lab_'+source.commitSha;
export function createQaStorage(options={}){return createBrowserStorage({...options,localStorage:storage,sessionStorage,locks,key,lockName:key});}
const writer=createQaStorage();
const status=text=>{document.getElementById('qa-lab-status').textContent=text;};
const comparisonSeed=window.__orderQaEnvelope?.state??(typeof window.name==='string'&&window.name.startsWith('order-qa-seed:')?JSON.parse(window.name.slice(14)):typeof window.name==='string'&&window.name.startsWith('order-qa-envelope:')?JSON.parse(window.name.slice(18)).state:null);
const seed=location.hash==='#qa-allocation-200'||!!comparisonSeed;
if(seed){const loaded=await writer.load();const applied=await writer.commit(comparisonSeed||allocationFixture(),{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'qa-explicit-fixture'});if(!applied.ok)throw Error('QA_FIXTURE_REJECTED:'+applied.status);}
const dnsControl=document.getElementById('qa-lab-dns');
const addressControl=document.getElementById('qa-lab-address'),addressServices=new Set();
export function createQaAddressService(options={}){const service=createAddressSearchService({...options,origin:'https://qa-lab.invalid',fetcher:qaFetch});addressServices.add(service);return service;}
export async function qaFetch(url,{signal,method,body:requestBody}={}){
 if(signal?.aborted)throw new DOMException('Aborted','AbortError');
 const target=new URL(url);let body,responseStatus=200;
 if(target.origin==='https://qa-lab.invalid'&&target.pathname==='/assets/iana-reference.json')body=reference;
 else if(['https://cloudflare-dns.com/dns-query','https://dns.google/resolve'].includes(target.origin+target.pathname)&&dnsControl.value==='example-route')body=syntheticDns(target.searchParams.get('name'),target.searchParams.get('type'));
 else if(target.origin==='https://qa-lab.invalid'&&target.pathname==='/api/address/search'&&method==='POST'){
  const request=JSON.parse(requestBody);body=syntheticAddressResult(request.query,request.page,addressControl.value);if(body.status==='UNAVAILABLE')responseStatus=503;
 }
 else throw TypeError('QA_OFFLINE_NO_EXTERNAL_NETWORK');
 return new Response(JSON.stringify(body),{status:responseStatus,headers:{'content-type':'application/json','cache-control':'no-store'}});
}
document.getElementById('qa-lab-fixture').addEventListener('click',()=>{location.hash='qa-allocation-200';location.reload();});
document.getElementById('qa-lab-restart').addEventListener('click',()=>{location.hash='';location.reload();});
document.getElementById('qa-lab-fail-next').addEventListener('click',()=>{failNext=true;status('다음 저장 1회 실패를 설정했습니다. 입력은 유지됩니다.');});
document.getElementById('qa-lab-conflict').addEventListener('click',async()=>{
 const loaded=await writer.load();if(!loaded.ok||!loaded.data||loaded.revision<1){status('먼저 제품에서 입력을 한 번 확정해 주세요.');return;}
 const changed=await writer.commit(loaded.data,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'qa-conflict-'+crypto.randomUUID()});
 status(changed.ok?'다른 작성자의 revision을 만들었습니다. 다음 제품 확정에서 충돌을 확인하세요.':'충돌 준비 실패: '+changed.status);
});
dnsControl.addEventListener('change',()=>{window.OrderEmailDomain?.clearCache();status(dnsControl.value==='example-route'?'example.com만 합성 DNS 응답을 사용합니다. 실제 이메일 검증이 아닙니다.':'외부 DNS를 호출하지 않습니다.');});
addressControl.addEventListener('change',()=>{for(const service of addressServices){service.cancel();service.clearCache();}status(addressControl.value==='synthetic'?'합성 주소 후보를 사용합니다. 실제 제공자 조회가 아닙니다.':addressControl.value==='empty'?'주소 후보 없음 모의 응답입니다.':'주소 검색 장애 모의 응답입니다.');});
document.documentElement.dataset.qaLabStorage='ISOLATED_MEMORY';
document.documentElement.dataset.qaLabFixture=seed?'allocation-200':'none';
status(seed?'명시적으로 선택한 합성 200 / A50 / B제안 fixture입니다.':'빈 상태입니다. LAB 입력은 메모리에만 보관합니다.');
`;
}

/** Builds a local, offline, single-file derivative of the current product graph. */
export async function buildQaLab({root=repositoryRoot,outputPath=resolve(root,'.qa-lab/order-qa-lab.html'),allowDirty=false,write=true,now=Date.now(),qaEntry=null}={}){
 root=resolve(root);const output=resolve(outputPath),dist=resolve(root,'dist');
 if(output===dist||output.startsWith(dist+sep))throw Error('QA_OUTPUT_MUST_NOT_BE_DIST');
 if(!output.endsWith('.html'))throw Error('QA_OUTPUT_MUST_BE_HTML');
 for(let cursor=output;cursor!==dirname(cursor);cursor=dirname(cursor)){try{if((await lstat(cursor)).isSymbolicLink())throw Error('QA_OUTPUT_SYMLINK_FORBIDDEN');}catch(error){if(error.code!=='ENOENT')throw error;}}
 const commitSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 if(!/^[a-f0-9]{40}$/.test(commitSha))throw Error('QA_COMMIT_INVALID');
 const modules=await collectQaModules(root,{extraEntries:qaEntry?[qaEntry]:[]}),html=await readSource(root,'web/index.html'),css=await readSource(root,'web/styles.css');
 const reference=await buildBrowserReference({directory:pathToFileURL(resolve(root,'src/engine/reference')+sep),now});
 const sourceFiles=new Map([...modules].map(([path,file])=>[path,file.source]));
 for(const path of ['web/index.html','web/styles.css',...buildSourcePaths,'src/engine/reference/iana-manifest.json','src/engine/reference/'+reference.manifest.rawFile])sourceFiles.set(path,await readSource(root,path));
 const dirtySourceFiles=[];
 for(const [path,source]of sourceFiles){let committed=null;try{committed=execFileSync('git',['show',commitSha+':'+path],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']});}catch{}if(committed!==source)dirtySourceFiles.push(path);}
 if(dirtySourceFiles.length&&!allowDirty)throw Error('QA_UNCOMMITTED_SOURCE:'+dirtySourceFiles.join(','));
 const identity={schemaVersion:1,builderImplementationSha256:hash(await readFile(fileURLToPath(import.meta.url))),scope:'LOCAL_QA_LAB_SYNTHETIC_OFFLINE',repository:'ydh1121/order',commitSha,sourceState:dirtySourceFiles.length?'DIRTY_WORKTREE':'EXACT_GIT_COMMIT',dirtySourceFiles,
  storage:'ISOLATED_MEMORY_ONLY',network:'NO_EXTERNAL_NETWORK_SYNTHETIC_OPT_IN',extraQaEntry:qaEntry,reference:{version:reference.manifest.version,sourceSha256:reference.manifest.sourceSha256},
  sourceFiles:[...sourceFiles].map(([path,source])=>({path,sha256:hash(source),bytes:Buffer.byteLength(source)})).sort((a,b)=>a.path.localeCompare(b.path)),
  substitutions:[...substitutions].map(([path,shim])=>({path,shim})),generatedAt:new Date(now).toISOString()};
 const imports={},transformed=[];
 for(const [path,file]of modules){let source=file.source;for(const node of [...file.imports].sort((a,b)=>b.start-a.start))source=source.slice(0,node.start)+json(substitutions.get(node.target)??moduleKey(node.target))+source.slice(node.end);
  imports[moduleKey(path)]=dataUrl(source);transformed.push({path,sha256:hash(source)});
 }
 const runtime='order-qa/virtual/runtime.mjs';
 imports[runtime]=dataUrl(runtimeSource({identity,reference}));
 imports[substitutions.get('web/storage.mjs')]=dataUrl(`export * from ${json(moduleKey('web/storage.mjs'))};export {createQaStorage as createBrowserStorage} from ${json(runtime)};`);
 imports[substitutions.get('web/address-service.mjs')]=dataUrl(`export * from ${json(moduleKey('web/address-service.mjs'))};export {createQaAddressService as createAddressSearchService} from ${json(runtime)};`);
 imports[substitutions.get('src/engine/adapters/iana-browser.mjs')]=dataUrl(`export * from ${json(moduleKey('src/engine/adapters/iana-browser.mjs'))};import {createBrowserIanaProvider as original} from ${json(moduleKey('src/engine/adapters/iana-browser.mjs'))};import {qaFetch} from ${json(runtime)};export const createBrowserIanaProvider=options=>original({...options,origin:'https://qa-lab.invalid',fetcher:qaFetch});`);
 imports[substitutions.get('src/engine/adapters/email-browser.mjs')]=dataUrl(`export * from ${json(moduleKey('src/engine/adapters/email-browser.mjs'))};import {createBrowserEmailService as original} from ${json(moduleKey('src/engine/adapters/email-browser.mjs'))};import {qaFetch} from ${json(runtime)};export const createBrowserEmailService=options=>original({...options,fetcher:qaFetch});`);
 identity.transformedModules=transformed;identity.bundleGraphSha256=hash(JSON.stringify(imports));
 const styleTag='<link rel="stylesheet" href="/styles.css">',entryTag='<script type="module" src="/main.mjs"></script>';
 if(html.split(styleTag).length!==2||html.split(entryTag).length!==2||/<script\b/i.test(html.replace(entryTag,'')))throw Error('QA_HTML_ENTRY_CONTRACT_CHANGED');
 if(/@import\b|url\s*\(/i.test(css))throw Error('QA_EXTERNAL_CSS_ASSET_REQUIRES_EXPLICIT_BUNDLING');
 const banner=`<aside id="qa-lab-toolbar" aria-label="로컬 QA LAB"><strong>로컬 QA LAB</strong><code id="qa-lab-commit" data-source-state="${identity.sourceState}">${commitSha}</code><span>${identity.sourceState==='EXACT_GIT_COMMIT'?'고정 Git 소스':'미커밋 변경 포함 · 검토용'}</span><p>제품과 격리된 메모리 저장 · 실제 지속 저장/온라인 DNS/주소 제공자 검증 아님 · 실제 개인정보를 입력하지 마세요.</p><div><button type="button" id="qa-lab-fixture">합성 200 / A50 / B제안 불러오기</button><button type="button" id="qa-lab-fail-next">다음 저장 1회 실패</button><button type="button" id="qa-lab-conflict">다른 작성자 충돌 만들기</button><button type="button" id="qa-lab-restart">LAB 다시 시작</button><label>DNS <select id="qa-lab-dns"><option value="offline">오프라인 UNKNOWN</option><option value="example-route">example.com 합성 경로</option></select></label><label>주소 <select id="qa-lab-address"><option value="offline">오프라인 · 검색 장애</option><option value="synthetic">합성 주소 후보</option><option value="empty">후보 없음</option><option value="unavailable">검색 장애</option></select></label></div><output id="qa-lab-status" aria-live="polite"></output></aside>`;
 const qaStyles='#qa-lab-toolbar{position:relative;z-index:2;padding:12px 16px;border-bottom:2px solid #333;background:#fff9db;color:#222;font:13px/1.5 system-ui;overflow-wrap:anywhere}#qa-lab-toolbar>strong,#qa-lab-toolbar>code,#qa-lab-toolbar>span{display:inline-block;margin-right:12px}#qa-lab-toolbar p{margin:6px 0}#qa-lab-toolbar>div{display:flex;flex-wrap:wrap;gap:8px;align-items:center}#qa-lab-toolbar button,#qa-lab-toolbar select{min-height:44px;padding:8px;border:1px solid #777;border-radius:6px;background:white;color:#222;font:inherit;cursor:pointer}#qa-lab-status{display:block;margin-top:6px}';
 const policy=`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' data:; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">`;
 let outputHtml=html.replace(styleTag,policy+'<style>'+css.replace(/<\/style/gi,'<\\/style')+'\n'+qaStyles+'</style>')
  .replace('<body>','<body>'+banner)
  .replace(entryTag,`<script type="application/json" id="qa-lab-identity">${json(identity)}</script><script type="importmap">${json({imports})}</script><script>{const raw=window.frameElement?.getAttribute('data-qa-envelope');const meta=raw?JSON.parse(raw):window.name.startsWith('order-qa-envelope:')?JSON.parse(window.name.slice(18)):null;if(meta){window.__orderQaEnvelope=meta;document.documentElement.dataset.qaSeedGeneration=String(meta.seedGeneration??'');document.documentElement.dataset.qaSeedCase=String(meta.caseId??'');if(meta.asOf){const OriginalDate=Date,at=OriginalDate.parse(meta.asOf+'T03:00:00Z');if(Number.isFinite(at)){window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}};document.documentElement.dataset.qaClock=meta.asOf;}}}}</script><script type="module">import ${json(moduleKey('web/main.mjs'))};${qaEntry?`import * as cases from ${json(moduleKey(qaEntry))};window.OrderQa0528=cases;`:''}document.documentElement.dataset.qaLabReady='true';</script>`);
 if(!outputHtml.includes(banner))throw Error('QA_BODY_CONTRACT_CHANGED');
 if(write){await mkdir(dirname(output),{recursive:true});await writeFile(output,outputHtml);}
 return {identity,html:outputHtml,outputPath:output,bytes:Buffer.byteLength(outputHtml),sha256:hash(outputHtml)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const args=process.argv.slice(2),at=args.indexOf('--out'),result=await buildQaLab({allowDirty:args.includes('--allow-dirty'),...(at>=0?{outputPath:args[at+1]}:{})});console.log(JSON.stringify({outputPath:result.outputPath,commitSha:result.identity.commitSha,sourceState:result.identity.sourceState,bytes:result.bytes,sha256:result.sha256},null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
