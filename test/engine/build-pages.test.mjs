import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {browserClosure,buildPages,reviewedFunctions} from '../../scripts/build-pages.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const commitSha='1'.repeat(40);
const manifest=JSON.parse(await readFile(new URL('../../src/engine/reference/iana-manifest.json',import.meta.url),'utf8'));
const freshNow=Date.parse(manifest.collectedAt)+1;
const configTemplate={schemaVersion:1,status:'AWAITING_UX_HANDOFF',repository:'ydh1121/order',project:'order-ooo',canonicalUrl:'https://order-ooo.pages.dev/',productionBranch:'main',productionAutomaticDeployment:true,previewBranchDeployment:'none',uxHandoff:null,frontendFiles:[],engineEntry:'src/browser/engine.mjs',outputDirectory:'dist'};
async function fixture(t,{entry="export {answer} from '../engine/answer.mjs';\n",config={}}={}){
 const root=await mkdtemp(join(tmpdir(),'order-build-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const put=async(path,content)=>{await mkdir(resolve(root,path,'..'),{recursive:true});await writeFile(join(root,path),content);};
 const writeConfig=async updates=>put('config/pages-build.json',JSON.stringify({...configTemplate,...config,...updates}));
 await put('src/browser/engine.mjs',entry);await put('src/engine/answer.mjs','export const answer=42;\n');await writeConfig();
 return {root,put,writeConfig};
}
async function fileTree(root,prefix=''){
 const result={};for(const entry of (await readdir(join(root,prefix),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const path=prefix?prefix+'/'+entry.name:entry.name;if(entry.isDirectory())Object.assign(result,await fileTree(root,path));else result[path]=(await readFile(join(root,path))).toString('base64');
 }return result;
}

test('engine-only builds exact reviewed closure plus reference/identity; unrelated private fixtures are excluded',async t=>{
 const f=await fixture(t);await f.put('test/fixtures/private-price.json','DO_NOT_PUBLISH');await f.put('context/private.md','DO_NOT_PUBLISH');await f.put('src/engine/unreachable.mjs','export const unrelated=true;');
 const id=await buildPages({root:f.root,engineOnly:true,now:freshNow,commitSha});
 assert.equal(id.scope,'ENGINE_MODULES_ONLY');assert.equal(id.commitSha,commitSha);
 const tree=await fileTree(join(f.root,'.build-engine'));
 assert.deepEqual(Object.keys(tree).sort(),['_headers','assets/iana-reference.json','build-identity.json','src/browser/engine.mjs','src/engine/answer.mjs'].sort());
 assert.equal('index.html' in tree,false,'engine-only is not a substitute public website');
 const ref=JSON.parse(Buffer.from(tree['assets/iana-reference.json'],'base64').toString());
 assert.equal(sha(Buffer.from(ref.rawText)),manifest.sourceSha256);assert.equal(ref.manifest.version,manifest.version);
 for(const file of id.files)assert.equal(sha(Buffer.from(tree[file.path],'base64')),file.sha256);
});

test('same source/ref/commit yields byte-identical output across repeated fresh build times',async t=>{
 const f=await fixture(t);await buildPages({root:f.root,engineOnly:true,now:freshNow,commitSha});const first=await fileTree(join(f.root,'.build-engine'));
 await buildPages({root:f.root,engineOnly:true,now:freshNow+1000,commitSha});assert.deepEqual(await fileTree(join(f.root,'.build-engine')),first);
});

test('production absent UX handoff fails explicitly and emits no placeholder or dist',async t=>{
 const f=await fixture(t);await assert.rejects(buildPages({root:f.root,now:freshNow,commitSha}),/UX_HANDOFF_REQUIRED/);
 await assert.rejects(readdir(join(f.root,'dist')),error=>error.code==='ENOENT');
});

test('production integrated allowlist requires file hash and excludes unlisted files',async t=>{
 const f=await fixture(t);const index='<!doctype html><title>Synthetic build test</title>';await f.put('web/index.html',index);await f.put('web/private.html','unlisted');
 await f.writeConfig({status:'INTEGRATED',uxHandoff:{sha256:sha(index)},frontendFiles:[{source:'web/index.html',output:'index.html',sha256:sha(index)}]});
 const id=await buildPages({root:f.root,now:freshNow,commitSha});assert.equal(id.scope,'INTEGRATED_PRODUCT');
 assert.equal(await readFile(join(f.root,'dist/index.html'),'utf8'),index);assert.equal('private.html' in await fileTree(join(f.root,'dist')),false);
 await f.put('web/index.html','changed without manifest approval');await assert.rejects(buildPages({root:f.root,now:freshNow,commitSha}),/BUILD_FRONTEND_HASH_MISMATCH/);
 assert.equal(await readFile(join(f.root,'dist/index.html'),'utf8'),index,'failed build retains previous output');
});

test('address Function is identified without publishing its source and only the address route invokes Functions',async t=>{
 const f=await fixture(t),index='<!doctype html><title>Scoped function test</title>',handler='export const onRequest=()=>new Response("not a fixture address");\n';
 await f.put('web/index.html',index);await f.put('functions/api/address/search.js',handler);
 const functions=[{source:'functions/api/address/search.js',route:'/api/address/search',sha256:sha(handler)}];
 await f.writeConfig({status:'INTEGRATED',uxHandoff:{sha256:sha(index)},frontendFiles:[{source:'web/index.html',output:'index.html',sha256:sha(index)}],functions});
 const id=await buildPages({root:f.root,now:freshNow,commitSha}),tree=await fileTree(join(f.root,'dist'));
 assert.deepEqual(JSON.parse(await readFile(join(f.root,'dist/_routes.json'),'utf8')),{version:1,include:['/api/address/search'],exclude:[]});
 assert.deepEqual(id.serverFunctions,[{source:'functions/api/address/search.js',route:'/api/address/search',bytes:Buffer.byteLength(handler),sha256:sha(handler)}]);
 assert.equal(Object.keys(tree).some(path=>path.startsWith('functions/')||path.includes('search.js')),false);
 assert.equal(JSON.stringify(id).includes(handler),false);
 const before=tree;await f.put('functions/api/other.js','export const onRequest=()=>new Response("unapproved");');
 await assert.rejects(buildPages({root:f.root,now:freshNow,commitSha}),/BUILD_FUNCTION_SCOPE_INVALID/);
 assert.deepEqual(await fileTree(join(f.root,'dist')),before,'out-of-scope handler must not replace last reviewed output');
});

test('Function routing, source hash and dependencies fail closed when scope changes',async t=>{
 const f=await fixture(t),path='functions/api/address/search.js',source='export const onRequest=()=>new Response("ok");';await f.put(path,source);
 for(const functions of [[],[{source:path,route:'/*',sha256:sha(source)}],[{source:path,route:'/api/address/search',sha256:'0'.repeat(64)}]])await assert.rejects(reviewedFunctions(f.root,{functions}),/BUILD_FUNCTION_SCOPE_INVALID|BUILD_FUNCTION_HASH_MISMATCH/);
 const imports="import '../unreviewed.js'; export const onRequest=()=>new Response('ok');";await f.put(path,imports);
 await assert.rejects(reviewedFunctions(f.root,{functions:[{source:path,route:'/api/address/search',sha256:sha(imports)}]}),/BUILD_FUNCTION_IMPORT_NOT_REVIEWED/);
});

test('frontend consumers must import an emitted browser module and contain no QA injection hook',async t=>{
 const f=await fixture(t);const index='<script type="module" src="/main.mjs"></script>';
 await f.put('web/index.html',index);
 async function source(value){await f.put('web/main.mjs',value);await f.writeConfig({status:'INTEGRATED',uxHandoff:{sha256:sha(index)},frontendFiles:[{source:'web/index.html',output:'index.html',sha256:sha(index)},{source:'web/main.mjs',output:'main.mjs',sha256:sha(value)}]});}
 await source("import '../src/engine/missing.mjs';");
 await assert.rejects(buildPages({root:f.root,now:freshNow,commitSha}),/BUILD_FRONTEND_IMPORT_NOT_EMITTED/);
 await source('window.__orderLowfiQA = {};');
 await assert.rejects(buildPages({root:f.root,now:freshNow,commitSha}),/BUILD_FRONTEND_FORBIDDEN/);
 await source("import '../src/engine/answer.mjs'; const process='seller'; export {process};");
 const built=await buildPages({root:f.root,now:freshNow,commitSha});assert.equal(built.scope,'INTEGRATED_PRODUCT');
});

test('production handoff requires a real SHA256 identifier rather than a truthy placeholder',async t=>{
 const f=await fixture(t);const html='<!doctype html><title>fixture</title>';await f.put('web/index.html',html);
 await f.writeConfig({status:'INTEGRATED',uxHandoff:{sha256:'not-a-hash'},frontendFiles:[{source:'web/index.html',output:'index.html',sha256:sha(html)}]});
 await assert.rejects(buildPages({root:f.root,now:freshNow,commitSha}),/UX_HANDOFF|HANDOFF|SHA256/);
});

test('canonical config and output destination cannot redirect publication or delete arbitrary directories',async t=>{
 const f=await fixture(t);await f.put('keep/sentinel.txt','must survive');
 await assert.rejects(buildPages({root:f.root,engineOnly:true,outputDirectory:'keep',now:freshNow,commitSha}),/BUILD_OUTPUT_MUST_BE_FIXED_DIRECTORY/);
 assert.equal(await readFile(join(f.root,'keep/sentinel.txt'),'utf8'),'must survive');
 await f.writeConfig({project:'another-project'});await assert.rejects(buildPages({root:f.root,engineOnly:true,now:freshNow,commitSha}),/BUILD_CANONICAL_CONFIG_MISMATCH/);
});

test('frontend traversal/private paths and source symlinks cannot enter dist',async t=>{
 const f=await fixture(t);const html='fixture';await f.put('web/source.html',html);await symlink('source.html',join(f.root,'web/link.html'));
 for(const item of [
  {source:'web/source.html',output:'../escape.html'},
  {source:'web/../source.html',output:'index.html'},
  {source:'web/source.html',output:'private/index.html'},
  {source:'web/link.html',output:'linked.html'},
 ]){
  await f.writeConfig({status:'INTEGRATED',uxHandoff:{sha256:sha(html)},frontendFiles:[{source:'web/source.html',output:'index.html',sha256:sha(html)},{...item,sha256:sha(html)}]});
  await assert.rejects(buildPages({root:f.root,now:freshNow,commitSha}),/BUILD_FRONTEND_ALLOWLIST_INVALID|BUILD_SYMLINK_FORBIDDEN|BUILD_OUTPUT_COLLISION/);
 }
});

test('module closure rejects Node globals, dynamic imports, external imports and path escape',async t=>{
 for(const entry of ["import fs from 'node:fs';","export const b=Buffer.from('x');","export const p=process.env;","export const p=import('./later.mjs');","import 'https://example.invalid/script.mjs';","import '../../test/private.mjs';"]){
  const f=await fixture(t,{entry});await assert.rejects(browserClosure(f.root,'src/browser/engine.mjs'),/BUILD_NODE_OR_DYNAMIC_IMPORT|BUILD_EXTERNAL_IMPORT|BUILD_MODULE_PATH_FORBIDDEN/);
 }
});

test('valid ESM comments between import/from and specifier cannot bypass dependency discovery',async t=>{
 const f=await fixture(t,{entry:"import/* lexical comment */'../engine/answer.mjs'; export {answer} from/* lexical comment */'../engine/answer.mjs';"});
 const files=await browserClosure(f.root,'src/browser/engine.mjs');assert.equal(files.has('src/engine/answer.mjs'),true);
 await f.put('src/browser/engine.mjs',"import/* lexical comment */'https://example.invalid/runtime.mjs';");
 await assert.rejects(browserClosure(f.root,'src/browser/engine.mjs'),/BUILD_EXTERNAL_IMPORT/);
});

test('Node-like words inside comments and ordinary strings do not reject browser-safe source',async t=>{
 const f=await fixture(t,{entry:"// Documentation: process Buffer require node: import('not-real')\nexport const label=\"process Buffer node: literal only\";"});
 const files=await browserClosure(f.root,'src/browser/engine.mjs');assert.equal(files.size,1);
});

test('module closure forbids both final-file and intermediate-directory symlinks',async t=>{
 const f=await fixture(t);await f.put('src/engine/real/inner.mjs','export const value=1;');await symlink('real',join(f.root,'src/engine/alias'));
 await f.put('src/browser/engine.mjs',"export {value} from '../engine/alias/inner.mjs';");
 await assert.rejects(browserClosure(f.root,'src/browser/engine.mjs'),/BUILD_SYMLINK_FORBIDDEN/);
 await symlink('answer.mjs',join(f.root,'src/engine/link.mjs'));await f.put('src/browser/engine.mjs',"export {answer} from '../engine/link.mjs';");
 await assert.rejects(browserClosure(f.root,'src/browser/engine.mjs'),/BUILD_SYMLINK_FORBIDDEN/);
});

test('stale IANA reference fails before replacing last successful engine output',async t=>{
 const f=await fixture(t);await buildPages({root:f.root,engineOnly:true,now:freshNow,commitSha});const before=await fileTree(join(f.root,'.build-engine'));
 await assert.rejects(buildPages({root:f.root,engineOnly:true,now:Date.parse(manifest.collectedAt)+manifest.maxAgeMs+1,commitSha}),/BROWSER_BUILD_IANA_STALE_REFRESH_REQUIRED/);
 assert.deepEqual(await fileTree(join(f.root,'.build-engine')),before);
});

test('actual browser entry compiles a closed graph with no Node-only reference/DNS adapters',async()=>{
 const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),files=await browserClosure(root,'src/browser/engine.mjs');
 assert.equal(files.has('src/engine/adapters/phone-browser.mjs'),true);
 assert.equal(files.has('src/engine/adapters/email-browser.mjs'),true);
 assert.equal([...files.keys()].some(p=>/dns-node|reference\/iana\.mjs/.test(p)),false);
 const linked=await import(pathToFileURL(join(root,'src/browser/engine.mjs')).href);
 for(const name of ['createOrderPhoneAdapter','createBrowserEmailService','evaluateAllocation','calculateQuote'])assert.equal(typeof linked[name],'function',name+' must link successfully');
});
