import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash,webcrypto} from 'node:crypto';
import {parse} from 'acorn';
import {buildQaLab,collectQaModules} from '../../scripts/build-qa-lab.mjs';
import {buildQaComparison} from '../../scripts/build-qa-comparison.mjs';
import {allocationFixture,syntheticDns,syntheticAddressResult} from '../fixtures/qa-lab.mjs';
import {createAddressSearchService} from '../../web/address-service.mjs';
import {isVerifiedAddress,selectAddress} from '../../web/address-contract.mjs';
import {projectStoredPayload} from '../../web/storage.mjs';
import {q4ComparisonFixture} from '../fixtures/qa-lab-0526.mjs';
import {quantityCases0528,dateCases0528,quantityFixture0528,dateFixture0528,contactFixture0528} from '../fixtures/qa-lab-0528.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=source=>createHash('sha256').update(source).digest('hex');
const decode=data=>Buffer.from(data.split(',')[1],'base64').toString('utf8');

test('C28 every comparison seed satisfies the actual strict product schema without silently discarding legacy weekdays',()=>{
 const inputs=[...['200','5000','known','legacy'].map(id=>[id,q4ComparisonFixture(id)]),...quantityCases0528.map(c=>[c.id,quantityFixture0528(c.id)]),...dateCases0528.map(c=>[c.id,dateFixture0528(c.id)]),['contacts20',contactFixture0528(20)]];
 for(const [id,data]of inputs){const expected=structuredClone(data);for(const site of expected.locations){delete site.status;delete site.mailboxVerified;}assert.deepEqual(projectStoredPayload(data),expected,id+' must seed the actual storage adapter; volatile validation flags are deliberately omitted');}
 const legacy=q4ComparisonFixture('legacy');assert.equal(legacy.allocations[0].q4Review.activeRepeat.period,'2주');assert.equal(legacy.allocations[1].q4Review.activeRepeat.period,'4주');assert.equal(legacy.allocations[0].q4Review.activeRepeat.weekdays['1:월'],true);assert.equal(legacy.allocations[0].q4Review.activeRepeat.semantics,'per-week-v1');
});

test('S05 local LAB reuses a fixed Git product graph and isolates every controlled dependency',async t=>{
 const directory=await mkdtemp(resolve(tmpdir(),'order-qa-lab-test-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 const modules=await collectQaModules(root);
 const manifest=JSON.parse(await readFile(resolve(root,'src/engine/reference/iana-manifest.json'),'utf8'));
 const now=Date.parse(manifest.collectedAt)+3600000;
 const html=await readFile(resolve(root,'web/index.html'),'utf8'),stylePaths=[...html.matchAll(/<link rel="stylesheet" href="(\/[a-zA-Z0-9_.-]+\.css)">/g)].map(m=>'web'+m[1]);
 const imagePaths=[...html.matchAll(/<img\b[^>]*\bsrc="(\/assets\/[a-zA-Z0-9_.-]+\.svg)"/g)].map(m=>'web'+m[1]);
 const paths=[...modules.keys(),'web/index.html',...stylePaths,...imagePaths,'scripts/build-qa-lab.mjs','scripts/engine/build-browser-reference.mjs','scripts/engine/update-iana.mjs','src/engine/reference/iana.mjs','package.json','package-lock.json','src/engine/reference/iana-manifest.json','src/engine/reference/'+manifest.rawFile];
 for(const path of paths){await mkdir(dirname(resolve(directory,path)),{recursive:true});await writeFile(resolve(directory,path),await readFile(resolve(root,path)));}
 const git=args=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','ignore']});
 git(['init']);git(['add','.']);git(['-c','user.name=QA fixture','-c','user.email=qa@example.invalid','commit','-m','Isolated source fixture']);
 const result=await buildQaLab({root:directory,now,write:false});
 const imports=JSON.parse(result.html.match(/<script type="importmap">(.*?)<\/script>/s)[1]).imports;

 await t.test('source SHA and all original bytes are traceable; module transformation changes imports only',async()=>{
  assert.equal(result.identity.commitSha,git(['rev-parse','HEAD']).trim());
  assert.equal(result.identity.sourceState,'EXACT_GIT_COMMIT');assert.deepEqual(result.identity.dirtySourceFiles,[]);
  assert.match(result.html,/connect-src 'none'/);assert.doesNotMatch(result.html,/<script[^>]+src=|<link[^>]+href=/i);
  assert.match(result.html,/id="qa-lab-commit"/);assert.match(result.html,/ISOLATED_MEMORY_ONLY/);
  const css=await readFile(resolve(directory,'web/styles.css'),'utf8');assert.ok(result.html.includes(css));
  for(const file of result.identity.sourceFiles)assert.equal(file.sha256,sha(await readFile(resolve(directory,file.path))));
  const mapped=new Map(result.identity.substitutions.map(s=>[s.path,s.shim]));
  for(const [path,file]of modules){let expected=file.source;for(const node of [...file.imports].sort((a,b)=>b.start-a.start))expected=expected.slice(0,node.start)+JSON.stringify(mapped.get(node.target)??'order-qa/source/'+node.target)+expected.slice(node.end);
   assert.equal(decode(imports['order-qa/source/'+path]),expected,path);
  }
  for(const source of Object.values(imports))parse(decode(source),{ecmaVersion:2024,sourceType:'module'});
  for(const match of result.html.matchAll(/<script>([\s\S]*?)<\/script>/g))parse(match[1],{ecmaVersion:2024,sourceType:'script'});
 });

 await t.test('LAB runtime uses the actual storage adapter with memory only, one-shot failure and revision conflict',async()=>{
  const {createBrowserStorage}=await import('../../web/storage.mjs');
  const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'offline',textContent:'',listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}});return elements.get(id);};
  const document={getElementById:element,documentElement:{dataset:{}}};let reloads=0;
  const location={hash:'',reload(){reloads++;}};
  let source=decode(imports['order-qa/virtual/runtime.mjs']);const ast=parse(source,{ecmaVersion:2024,sourceType:'module'});
  const edits=ast.body.filter(node=>node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration').map(node=>({start:node.start,end:node.type==='ImportDeclaration'?node.end:node.declaration.start}));
  for(const edit of edits.sort((a,b)=>b.start-a.start))source=source.slice(0,edit.start)+source.slice(edit.end);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const runtime=await new AsyncFunction('createBrowserStorage','createAddressSearchService','allocationFixture','syntheticDns','syntheticAddressResult','document','location','crypto','window',source+'\nreturn {createQaStorage,createQaAddressService,qaFetch};')(createBrowserStorage,createAddressSearchService,allocationFixture,syntheticDns,syntheticAddressResult,document,location,webcrypto,{});
  assert.equal(document.documentElement.dataset.qaLabStorage,'ISOLATED_MEMORY');assert.equal(document.documentElement.dataset.qaLabFixture,'none');
  const adapter=runtime.createQaStorage();let loaded=await adapter.load();assert.equal(loaded.status,'EMPTY');assert.deepEqual(loaded.data.lines,[]);
  const fixture=allocationFixture();let committed=await adapter.commit(fixture,{expectedRevision:loaded.revision,expectedToken:loaded.versionToken,transactionId:'test-first'});assert.equal(committed.ok,true);
  const revision=committed.revision,token=committed.versionToken;await element('qa-lab-fail-next').listeners.click();
  const failed=await adapter.commit({...fixture,open:'q2'},{expectedRevision:revision,expectedToken:token,transactionId:'test-failure'});assert.equal(failed.ok,false);
  assert.deepEqual((await adapter.load()).data,committed.data,'a failed write must preserve the original payload');
  await element('qa-lab-conflict').listeners.click();
  const conflicted=await adapter.commit({...fixture,open:'q2'},{expectedRevision:revision,expectedToken:token,transactionId:'test-stale'});assert.equal(conflicted.ok,false);assert.equal(conflicted.status,'CONFLICT');
  assert.match(element('qa-lab-status').textContent,/revision/);
  await assert.rejects(()=>runtime.qaFetch('https://cloudflare-dns.com/dns-query?name=example.com&type=MX'),/QA_OFFLINE/);
  element('qa-lab-dns').value='example-route';
  const dns=await(await runtime.qaFetch('https://cloudflare-dns.com/dns-query?name=example.com&type=MX')).json();assert.equal(dns.Answer[0].data,'10 mx.example.com.');
  await assert.rejects(()=>runtime.qaFetch('https://unapproved.example/path'),/QA_OFFLINE/);
  const address=runtime.createQaAddressService();
  assert.equal((await address.search('합성 주소')).status,'UNAVAILABLE','default LAB never silently supplies provider-shaped success');
  element('qa-lab-address').value='synthetic';await element('qa-lab-address').listeners.change();
  const selected=await address.search('합성 주소');assert.equal(selected.status,'OK');assert.equal(selected.items[0].postal,'08843');assert.match(selected.items[0].road,/실제 주소 아님/);
  const cached=await address.search('합성 주소');assert.deepEqual(cached,selected);assert.equal(address.inspect().cacheHits,1,'LAB uses the actual adapter cache');
  for(const query of ['엽기떡볶이 언주역','서울시청','관악구청']){
   const found=await address.search(query);assert.equal(found.version,3);assert.equal(found.items.length,2);
   assert.ok(found.items.every(item=>item.kind==='PLACE'&&!isVerifiedAddress(item)&&item.postal===undefined));
   assert.match(found.items[0].name,/합성 QA/);assert.match(found.items[0].name,/실제 장소 아님/);assert.equal(found.items[0].road,found.items[1].road);
   assert.throws(()=>selectAddress({},found.items[0]),/ADDRESS_SELECTION_INVALID/,'place search alone never provides postal provenance');
   const resolved=await address.resolve(query,found.items[0]);assert.equal(resolved.status,'OK');assert.equal(resolved.placeId,found.items[0].placeId);assert.equal(isVerifiedAddress(resolved.item),true);assert.equal(resolved.item.postal,'08843');assert.equal('items' in resolved,false,'resolution returns only the selected place');
   const other=await address.resolve(query,found.items[1]);assert.notEqual(other.item.providerId,resolved.item.providerId);assert.equal(selectAddress({...resolved.item,detail:'매장 A'},other.item).detail,'');
   assert.equal((await address.resolve(query,{...found.items[0],placeId:'999'})).reason,'PLACE_CHANGED');
  }
  element('qa-lab-address').value='empty';await element('qa-lab-address').listeners.change();assert.equal((await address.search('합성 주소')).status,'EMPTY','mode change clears previous synthetic cache');
  assert.equal((await address.search('서울시청')).status,'EMPTY','place results also clear when the explicit fixture mode changes');
  element('qa-lab-address').value='unavailable';await element('qa-lab-address').listeners.change();assert.equal((await address.search('합성 주소')).status,'UNAVAILABLE');address.close();
  await element('qa-lab-restart').listeners.click();assert.equal(location.hash,'');assert.equal(reloads,1);
  const seedWindow={name:'frame-before',__orderQaEnvelope:{state:allocationFixture(),caseId:'200',seedGeneration:2}};
  const seeded=await new AsyncFunction('createBrowserStorage','createAddressSearchService','allocationFixture','syntheticDns','syntheticAddressResult','document','location','crypto','window',source+'\nreturn {createQaStorage};')(createBrowserStorage,createAddressSearchService,allocationFixture,syntheticDns,syntheticAddressResult,document,location,webcrypto,seedWindow);
  assert.deepEqual((await seeded.createQaStorage().load()).data,projectStoredPayload(seedWindow.__orderQaEnvelope.state),'explicit iframe envelope seeds the real storage even when Chrome retains a different window.name');
 });

 await t.test('comparison keeps two exact graphs, explicit identical fixtures and isolated memory',async()=>{
  const compared=await buildQaComparison({root:directory,baselineRoot:directory,now,write:false});
  assert.equal(compared.identity.baseline.commitSha,compared.identity.current.commitSha);
  assert.equal(compared.identity.baseline.sourceState,'EXACT_GIT_COMMIT');
  assert.equal(compared.identity.storage,'TWO_ISOLATED_MEMORY_STORES');
  assert.equal(compared.identity.network,'NO_EXTERNAL_NETWORK');
  assert.match(compared.html,/id="frame-before"/);assert.match(compared.html,/id="frame-after"/);
  assert.match(compared.html,/order-qa-envelope:/);assert.match(compared.html,/connect-src 'none'/);
  for(const match of compared.html.matchAll(/<script>([\s\S]*?)<\/script>/g))parse(match[1],{ecmaVersion:2024,sourceType:'script'});
  assert.doesNotMatch(compared.html,/<script[^>]+src=|<link[^>]+href=/i);
  await assert.rejects(()=>buildQaComparison({root:directory,baselineRoot:directory,now,outputPath:resolve(directory,'dist/compare.html')}),/QA_OUTPUT_MUST_NOT_BE_DIST/);
 });

 await t.test('dirty source cannot masquerade as a fixed commit, and LAB output cannot enter dist',async()=>{
  await writeFile(resolve(directory,'web/main.mjs'),(await readFile(resolve(directory,'web/main.mjs'),'utf8'))+'\n// deliberate uncommitted review change\n');
  await assert.rejects(()=>buildQaLab({root:directory,now,write:false}),/QA_UNCOMMITTED_SOURCE/);
  const dirty=await buildQaLab({root:directory,now,write:false,allowDirty:true});
  assert.equal(dirty.identity.sourceState,'DIRTY_WORKTREE');assert.deepEqual(dirty.identity.dirtySourceFiles,['web/main.mjs']);
  await assert.rejects(()=>buildQaLab({root:directory,now,outputPath:resolve(directory,'dist/lab.html')}),/QA_OUTPUT_MUST_NOT_BE_DIST/);
 });

 await t.test('unexpected imports fail closed and product allowlist contains no LAB or fixture',async()=>{
  await writeFile(resolve(directory,'web/main.mjs'),"import 'https://example.com/unreviewed.js';\n");
  await assert.rejects(()=>collectQaModules(directory),/QA_EXTERNAL_IMPORT/);
  const config=JSON.parse(await readFile(resolve(root,'config/pages-build.json'),'utf8'));
  for(const item of config.frontendFiles)assert.doesNotMatch(item.source+' '+item.output,/qa-lab|fixtures|test\//i);
  assert.equal(allocationFixture().lines[0].price,'','synthetic fixture does not supply a real price');
 });
});
