import {readFile,writeFile,mkdir,rm,lstat,realpath,rename,readdir} from 'node:fs/promises';
import {resolve,dirname,relative,sep,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {parse} from 'acorn';
import {buildBrowserReference} from './engine/build-browser-reference.mjs';

const repositoryRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const safeRelative=value=>typeof value==='string'&&value&&!value.includes('\\')&&!value.split('/').some(p=>!p||p==='.'||p==='..')&&!value.startsWith('/');
const addressFunction='functions/api/address/search.js';
const addressRoute='/api/address/search';
async function readInside(root,path){
  if(!safeRelative(path))throw Error('BUILD_PATH_INVALID');
  const full=resolve(root,path),real=await realpath(full);
  let cursor=root;for(const part of path.split('/')){cursor=resolve(cursor,part);if((await lstat(cursor)).isSymbolicLink())throw Error('BUILD_SYMLINK_FORBIDDEN');}
  if(!real.startsWith(await realpath(root)+sep))throw Error('BUILD_SYMLINK_FORBIDDEN');
  return readFile(full);
}

/** Functions are compiled by Pages from the repository, never copied as public assets. */
export async function reviewedFunctions(root,config){
  const declared=config.functions??[];
  if(!Array.isArray(declared)||declared.length>1||declared.some(item=>item.source!==addressFunction||item.route!==addressRoute||!/^[a-f0-9]{64}$/.test(item.sha256??'')))throw Error('BUILD_FUNCTION_SCOPE_INVALID');
  const found=[];
  async function scan(path){
    let entries;try{entries=await readdir(resolve(root,path),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries){const child=path+'/'+entry.name;if(entry.isSymbolicLink())throw Error('BUILD_SYMLINK_FORBIDDEN');if(entry.isDirectory())await scan(child);else found.push(child);}
  }
  await scan('functions');
  if(found.length!==declared.length||found.some(path=>!declared.some(item=>item.source===path)))throw Error('BUILD_FUNCTION_SCOPE_INVALID');
  const result=[];
  for(const item of declared){
    const bytes=await readInside(root,item.source);if(digest(bytes)!==item.sha256)throw Error('BUILD_FUNCTION_HASH_MISMATCH:'+item.source);
    const ast=parse(bytes.toString('utf8'),{ecmaVersion:2024,sourceType:'module'});
    // The small handler has no imported dependency or dynamic code path. This
    // prevents an unreviewed server bundle from escaping the explicit scope.
    const walk=node=>{if(!node||typeof node!=='object')return;if(node.type==='ImportExpression'||(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source))throw Error('BUILD_FUNCTION_IMPORT_NOT_REVIEWED');for(const value of Object.values(node))if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);};walk(ast);
    result.push({source:item.source,route:item.route,bytes:bytes.length,sha256:digest(bytes)});
  }
  return result;
}

/** Explicit ESM closure; imports outside the reviewed source roots fail the build. */
export async function browserClosure(root,entry){
  const files=new Map(),pending=[entry];
  while(pending.length){
    const path=pending.pop();if(files.has(path))continue;
    if(!/^src\/(?:browser|engine)\/[a-zA-Z0-9_./-]+\.mjs$/.test(path)||!safeRelative(path))throw Error('BUILD_MODULE_PATH_FORBIDDEN:'+path);
    const bytes=await readInside(root,path),source=bytes.toString('utf8');
    const ast=parse(source,{ecmaVersion:2024,sourceType:'module'}),specifiers=[];
    const visit=node=>{if(!node||typeof node!=='object')return;
      if(node.type==='ImportExpression'||node.type==='Identifier'&&['process','Buffer','require'].includes(node.name))throw Error('BUILD_NODE_OR_DYNAMIC_IMPORT:'+path);
      if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source)specifiers.push(node.source.value);
      for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
    };visit(ast);
    for(const specifier of specifiers){
      if(!specifier.startsWith('./')&&!specifier.startsWith('../'))throw Error('BUILD_EXTERNAL_IMPORT:'+specifier);
      const child=relative(root,resolve(root,dirname(path),specifier)).split(sep).join('/');
      pending.push(child);
    }
    files.set(path,bytes);
  }
  return files;
}

export async function buildPages({root=repositoryRoot,engineOnly=false,outputDirectory,now=Date.now(),commitSha}={}){
  const config=JSON.parse(await readInside(root,'config/pages-build.json'));
  if(config.repository!=='ydh1121/order'||config.project!=='order-ooo'||config.canonicalUrl!=='https://order-ooo.pages.dev/'||config.productionBranch!=='main'||config.previewBranchDeployment!=='none'||config.productionAutomaticDeployment!==true)throw Error('BUILD_CANONICAL_CONFIG_MISMATCH');
  if(!engineOnly&&(config.status!=='INTEGRATED'||!/^[a-f0-9]{64}$/.test(config.uxHandoff?.sha256??'')||!config.frontendFiles?.some(f=>f.output==='index.html')))throw Error('UX_HANDOFF_REQUIRED: production build has no integrated frontend; no substitute page emitted');
  const output=resolve(root,outputDirectory??(engineOnly?'.build-engine':config.outputDirectory));
  // Output is deliberately fixed; never delete a caller-supplied directory.
  if(output!==resolve(root,engineOnly?'.build-engine':'dist'))throw Error('BUILD_OUTPUT_MUST_BE_FIXED_DIRECTORY');
  const modules=await browserClosure(root,config.engineEntry),files=new Map(modules);
  const serverFunctions=engineOnly?[]:await reviewedFunctions(root,config);
  if(!engineOnly){
    for(const item of config.frontendFiles){
      if(!safeRelative(item.source)||!item.source.startsWith('web/')||!safeRelative(item.output)||/\b(?:qa|fixture|evidence|private|secret|test)\b/i.test(item.output)||!['.html','.css','.mjs','.js','.svg','.png','.webp','.woff2'].includes(extname(item.output)))throw Error('BUILD_FRONTEND_ALLOWLIST_INVALID');
      if(files.has(item.output))throw Error('BUILD_OUTPUT_COLLISION');
      const bytes=await readInside(root,item.source);
      if(digest(bytes)!==item.sha256)throw Error('BUILD_FRONTEND_HASH_MISMATCH:'+item.source);
      files.set(item.output,bytes);
    }
    // Validate every frontend module against the emitted inventory after URL
    // resolution. A moved consumer cannot silently retain a legacy/test import.
    for(const [path,bytes] of files){
      if(!config.frontendFiles.some(item=>item.output===path)||!['.mjs','.js'].includes(extname(path)))continue;
      const ast=parse(bytes.toString('utf8'),{ecmaVersion:2024,sourceType:'module'});
      const visit=node=>{if(!node||typeof node!=='object')return;
        if(node.type==='ImportExpression'||node.type==='Identifier'&&['Buffer','require','__orderLowfiQA','__ORDER_LOWFI_TEST_ONLY__'].includes(node.name)||node.type==='MemberExpression'&&node.object?.name==='process')throw Error('BUILD_FRONTEND_FORBIDDEN_IMPORT_OR_TEST_HOOK:'+path);
        if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source){
          const spec=node.source.value;if(!/^(?:\.\.?\/|\/)/.test(spec))throw Error('BUILD_FRONTEND_EXTERNAL_IMPORT:'+spec);
          const target=new URL(spec,'https://order-ooo.pages.dev/'+path).pathname.slice(1);
          if(!files.has(target))throw Error('BUILD_FRONTEND_IMPORT_NOT_EMITTED:'+target);
        }
        for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
      };visit(ast);
    }
  }
  const reference=await buildBrowserReference({now});
  files.set('assets/iana-reference.json',Buffer.from(JSON.stringify(reference)+'\n'));
  if(serverFunctions.length)files.set('_routes.json',Buffer.from(JSON.stringify({version:1,include:[addressRoute],exclude:[]},null,2)+'\n'));
  const sha=commitSha??process.env.CF_PAGES_COMMIT_SHA??execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('BUILD_COMMIT_SHA_INVALID');
  const fileList=[...files].map(([path,bytes])=>({path,bytes:bytes.length,gzipBytes:gzipSync(bytes).length,sha256:digest(bytes)})).sort((a,b)=>a.path.localeCompare(b.path));
  const identity={schemaVersion:1,repository:config.repository,project:config.project,commitSha:sha,canonicalUrl:config.canonicalUrl,scope:engineOnly?'ENGINE_MODULES_ONLY':'INTEGRATED_PRODUCT',uxHandoff:config.uxHandoff,...(!engineOnly&&config.approvedIntegration?{approvedIntegration:config.approvedIntegration}:{}),reference:{version:reference.manifest.version,sha256:reference.manifest.sourceSha256,collectedAt:reference.manifest.collectedAt},files:fileList,...(serverFunctions.length?{serverFunctions}: {})};
  files.set('build-identity.json',Buffer.from(JSON.stringify(identity,null,2)+'\n'));
  files.set('_headers',Buffer.from('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/iana-reference.json\n  Cache-Control: no-store\n/build-identity.json\n  Cache-Control: no-store\n'));
  const staging=output+'.pending';await rm(staging,{recursive:true,force:true});await mkdir(staging,{recursive:true});
  try{for(const [path,bytes]of files){const target=resolve(staging,path);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}await rm(output,{recursive:true,force:true});await rename(staging,output);}catch(error){await rm(staging,{recursive:true,force:true});throw error;}
  return identity;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{const result=await buildPages({engineOnly:process.argv.includes('--engine-only')});console.log(JSON.stringify({scope:result.scope,commitSha:result.commitSha,moduleAndReferenceFiles:result.files.length,rawBytes:result.files.reduce((n,f)=>n+f.bytes,0),gzipBytes:result.files.reduce((n,f)=>n+f.gzipBytes,0)},null,2));}catch(error){console.error(error.message);process.exitCode=1;}
}
