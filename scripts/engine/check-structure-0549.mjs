import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';
import {createHash} from 'node:crypto';

const defaultRoot=fileURLToPath(new URL('../../',import.meta.url));
const productRoots=['web','src','functions'];
const customGlobal=/^(?:Order[A-Z]|__order)/;
const requiredCalls=[
 {id:'MAIN-APP',file:'web/main.mjs',owner:'web/app.mjs',export:'createOrderApp'},
 {id:'MAIN-Q4',file:'web/main.mjs',owner:'web/q4-review.mjs',export:'createQ4Review'},
 {id:'NUMBER-BODY',file:'web/app.mjs',owner:'web/numeric-input.mjs',export:'bindNumericInputs'},
 {id:'NUMBER-EDITOR',file:'web/q4-review.mjs',owner:'web/numeric-input.mjs',export:'bindNumericInputs'},
 {id:'ADDRESS-EDITOR',file:'web/app.mjs',owner:'web/address-ui.mjs',export:'createAddressEditor'},
 {id:'DATE-EDITOR-MARKUP',file:'web/q4-review.mjs',owner:'web/date-field.mjs',export:'dateFieldMarkup'},
 {id:'DATE-EDITOR-BIND',file:'web/q4-review.mjs',owner:'web/date-field.mjs',export:'bindDateField'},
 {id:'DATE-MODE',file:'web/q4-review.mjs',owner:'web/q4-date.mjs',export:'dateModeOptions'},
 {id:'DATE-ONCE-EDITOR',file:'web/q4-review.mjs',owner:'web/q4-date.mjs',export:'inspectOneTimeDate'},
 {id:'ADDRESS-SERVICE',file:'web/address-ui.mjs',owner:'web/address-service.mjs',export:'createAddressSearchService'},
 {id:'ADDRESS-SELECT',file:'web/address-ui.mjs',owner:'web/address-contract.mjs',export:'selectAddress'},
 {id:'ADDRESS-PLACE-UI',file:'web/address-ui.mjs',owner:'web/address-contract.mjs',export:'isPlaceCandidate'},
 {id:'ADDRESS-PLACE-SERVICE',file:'web/address-service.mjs',owner:'web/address-contract.mjs',export:'isPlaceCandidate'},
 {id:'Q4-COMMON-VERDICT',file:'web/common-ui.mjs',owner:'web/q4-validation.mjs',export:'inspectQ4Allocation'},
 {id:'Q4-COMMON-GROUPS',file:'web/common-ui.mjs',owner:'web/q4-validation.mjs',export:'inspectQ4Groups'},
 {id:'Q4-VISITS',file:'web/q4-review.mjs',owner:'web/q4-planning.mjs',export:'repeatVisitPlan'},
 {id:'Q4-QUANTITY',file:'web/q4-review.mjs',owner:'web/q4-planning.mjs',export:'nominalQuantity'},
 {id:'Q4-REFERENCE-MONTH',file:'web/q4-review.mjs',owner:'web/q4-planning.mjs',export:'sumNominalByReference'},
 {id:'Q4-SHARED-VERDICT',file:'web/app.mjs',owner:'web/q4-validation.mjs',export:'inspectQ4Allocation'},
 {id:'DATE-ONCE-VERDICT',file:'web/q4-validation.mjs',owner:'web/q4-date.mjs',export:'inspectOneTimeDate'},
 {id:'DATE-ONCE-COMPATIBILITY',file:'web/common-ui.mjs',owner:'web/q4-date.mjs',export:'inspectOneTimeDate',publishedAs:{global:'OrderDatePolicy',method:'validate'}},
 {id:'DATE-ONCE-POLICY',file:'web/q4-date.mjs',owner:'web/order-date.mjs',export:'inspectDateParts'}
];
function walk(node,visit,ancestors=[]){
 if(!node||typeof node!=='object')return;
 if(typeof node.type==='string')visit(node,ancestors);
 for(const [key,value]of Object.entries(node)){
  if(key==='loc')continue;
  for(const child of Array.isArray(value)?value:[value])if(child&&typeof child==='object')walk(child,visit,[...ancestors,node]);
 }
}
function unwrap(node){return node?.type==='ChainExpression'?node.expression:node;}
function memberParts(node){
 node=unwrap(node);
 if(node?.type==='Identifier')return [node.name];
 if(node?.type!=='MemberExpression')return null;
 const base=memberParts(node.object),key=node.computed?node.property.type==='Literal'?node.property.value:null:node.property.name;
 return base&&typeof key==='string'?[...base,key]:null;
}
function location(file,node){return {file,line:node.loc.start.line};}
function enclosingFunction(ancestors){
 for(let i=ancestors.length-1;i>=0;i--){const n=ancestors[i];
  if(n.type==='FunctionDeclaration')return n.id?.name||'<anonymous>';
  if(n.type==='FunctionExpression'||n.type==='ArrowFunctionExpression'){
   const parent=ancestors[i-1];
   return n.id?.name||parent?.type==='VariableDeclarator'&&parent.id.name||parent?.type==='Property'&&(parent.key.name||parent.key.value)||'<callback>';
  }
 }
 return '<module>';
}
async function listFiles(root,relative){
 let entries;try{entries=await readdir(path.join(root,relative),{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
 const results=await Promise.all(entries.map(entry=>entry.isDirectory()?listFiles(root,path.posix.join(relative,entry.name)):/\.(?:mjs|js)$/.test(entry.name)?[path.posix.join(relative,entry.name)]:[]));
 return results.flat();
}
const resolveImport=(file,specifier)=>specifier.startsWith('.')?path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier)):null;
function cyclesOf(graph){
 const seen=new Set(),active=new Set(),stack=[],cycles=[];
 function visit(file){if(active.has(file)){cycles.push([...stack.slice(stack.indexOf(file)),file]);return;}if(seen.has(file))return;
  seen.add(file);active.add(file);stack.push(file);for(const next of graph.get(file)||[])visit(next);stack.pop();active.delete(file);
 }
 for(const file of [...graph.keys()].sort())visit(file);
 return cycles;
}

/** Static source evidence, not browser execution. Overrides let counterexamples stay in memory. */
export async function checkStructure(root=defaultRoot,{overrides=new Map()}={}){
 const files=[...new Set([...(await Promise.all(productRoots.map(dir=>listFiles(root,dir)))).flat(),...overrides.keys()])].sort();
 const sources=new Map(),asts=new Map(),imports=[],calls=[],exports=new Map(),providers=new Map(),references=[];
 const errors=[],globalAliases=new Map(),providerMethods=new Map();
 const error=(code,detail)=>errors.push({code,...detail});
 for(const file of files){
  const source=overrides.has(file)?overrides.get(file):await readFile(path.join(root,file),'utf8');sources.set(file,source);
  let ast;try{ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});asts.set(file,ast);}catch(e){error('PARSE',{file,message:e.message});continue;}
  const localNames=new Set();
  walk(ast,node=>{if(node.type==='ImportDeclaration')for(const row of node.specifiers)localNames.add(row.local.name);if(node.type==='VariableDeclarator'&&node.id.type==='Identifier')localNames.add(node.id.name);if(node.type==='FunctionDeclaration'&&node.id)localNames.add(node.id.name);});
  walk(ast,node=>{
   if(node.type==='VariableDeclarator'&&node.id.type==='Identifier'){
    const parts=memberParts(node.init);
    if(parts?.length===2&&['window','globalThis'].includes(parts[0])&&customGlobal.test(parts[1]))globalAliases.set(`${file}:${node.id.name}`,parts[1]);
   }
  });
  walk(ast,(node,ancestors)=>{
   if(node.type==='ImportDeclaration'||node.type==='ExportNamedDeclaration'&&node.source||node.type==='ExportAllDeclaration'){
    imports.push({...location(file,node),owner:resolveImport(file,node.source.value),specifier:node.source.value,kind:node.type,bindings:(node.specifiers||[]).map(row=>({imported:row.imported?.name||row.imported?.value||row.type==='ImportDefaultSpecifier'&&'default'||'*',local:row.local?.name}))});
   }
   if(node.type==='ImportExpression'){
    const literal=node.source.type==='Literal'&&typeof node.source.value==='string';
    if(!literal)error('DYNAMIC_IMPORT_UNRESOLVED',location(file,node));
    else imports.push({...location(file,node),owner:resolveImport(file,node.source.value),specifier:node.source.value,kind:'ImportExpression',bindings:[]});
   }
   if(node.type==='ExportNamedDeclaration'){
    const names=exports.get(file)||new Set();
    if(node.declaration?.id)names.add(node.declaration.id.name);
    for(const row of node.declaration?.declarations||[])walk(row.id,binding=>{if(binding.type==='Identifier')names.add(binding.name);});
    for(const row of node.specifiers||[])names.add(row.exported.name||row.exported.value);exports.set(file,names);
   }
   if(node.type==='CallExpression')calls.push({...location(file,node),callee:memberParts(node.callee),within:enclosingFunction(ancestors),node});
   if(node.type==='AssignmentExpression'){
    const parts=memberParts(node.left);
    if(parts?.length===2&&['window','globalThis'].includes(parts[0])&&customGlobal.test(parts[1])){
     const name=parts[1],rows=providers.get(name)||[];
     const object=node.right.type==='ObjectExpression'?node.right:node.right.type==='CallExpression'&&node.right.arguments[0]?.type==='ObjectExpression'?node.right.arguments[0]:null;
     if(object)providerMethods.set(name,object.properties.map(prop=>prop.key?.name||prop.key?.value).filter(Boolean));rows.push({...location(file,node),within:enclosingFunction(ancestors)});providers.set(name,rows);
    }
   }
   if(node.type!=='MemberExpression')return;
   const parent=ancestors.at(-1);if(parent?.type==='MemberExpression'&&parent.object===node)return;
   const parts=memberParts(node);if(!parts)return;
   let name,method;
   if(['window','globalThis'].includes(parts[0])&&customGlobal.test(parts[1])){name=parts[1];method=parts.slice(2).join('.');}
   else if(globalAliases.has(`${file}:${parts[0]}`)){name=globalAliases.get(`${file}:${parts[0]}`);method=parts.slice(1).join('.');}
   else if(customGlobal.test(parts[0])&&!localNames.has(parts[0])){name=parts[0];method=parts.slice(1).join('.');}
   if(!name||parent?.type==='AssignmentExpression'&&parent.left===node&&!method)return;
   references.push({name,method,...location(file,node),within:enclosingFunction(ancestors)});
  });
 }
 const graph=new Map(files.map(file=>[file,new Set()]));
 for(const edge of imports){
  if(!edge.owner)continue;
  if(!graph.has(edge.owner)){error('MISSING_MODULE',{file:edge.file,line:edge.line,owner:edge.owner});continue;}
  graph.get(edge.file).add(edge.owner);
  if(edge.file.startsWith('src/engine/')&&edge.owner.startsWith('web/'))error('ENGINE_UI_INVERSION',edge);
 }
 for(const cycle of cyclesOf(graph))error('DEPENDENCY_CYCLE',{cycle});
 const requiredCallers=requiredCalls.map(rule=>{
  const edge=imports.find(row=>row.file===rule.file&&row.owner===rule.owner),binding=edge?.bindings.find(row=>row.imported===rule.export);
  const found=binding?calls.filter(row=>row.file===rule.file&&row.callee?.length===1&&row.callee[0]===binding.local):[];
  if(binding&&rule.publishedAs){
   // Compatibility aliases are tracked through the actual returned property of
   // the window owner, then matched to a consumer of that public method.
   walk(asts.get(rule.file),node=>{
    if(node.type!=='AssignmentExpression'||memberParts(node.left)?.join('.')!==`window.${rule.publishedAs.global}`)return;
    let alias,returned;
    walk(node.right,child=>{if(child.type==='VariableDeclarator'&&child.init?.name===binding.local)alias=child.id.name;});
    walk(node.right,child=>{if(child.type==='ReturnStatement'&&child.argument?.type==='ObjectExpression')returned=child.argument.properties.find(prop=>(prop.key.name||prop.key.value)===rule.publishedAs.method&&prop.value.name===alias)||returned;});
    if(alias&&returned&&references.some(row=>row.name===rule.publishedAs.global&&row.method===rule.publishedAs.method))found.push({...location(rule.file,returned),within:`${rule.publishedAs.global}.${rule.publishedAs.method} compatibility alias`});
   });
  }
  const exported=exports.get(rule.owner)?.has(rule.export)||false;
  if(!binding||!found.length||!exported)error('MISSING_REQUIRED_CALLER',{...rule,imported:!!binding,exported,called:!!found.length});
  return {...rule,callers:found.map(({file,line,within})=>({file,line,within})),exported};
 });
 // A module import alone cannot wire the editor. The entry point must pass the
 // actual app bridge to the editor, attach that returned editor, then boot.
 const mainAst=asts.get('web/main.mjs'),mainCalls=calls.filter(row=>row.file==='web/main.mjs');
 let appName,reviewName,bridgePassed=false;
 if(mainAst)walk(mainAst,node=>{
  if(node.type!=='VariableDeclarator'||node.id.type!=='Identifier'||node.init?.type!=='CallExpression')return;
  const appImport=imports.find(row=>row.file==='web/main.mjs'&&row.owner==='web/app.mjs')?.bindings.find(row=>row.imported==='createOrderApp');
  const reviewImport=imports.find(row=>row.file==='web/main.mjs'&&row.owner==='web/q4-review.mjs')?.bindings.find(row=>row.imported==='createQ4Review');
  if(node.init.callee.name===appImport?.local)appName=node.id.name;
  if(node.init.callee.name===reviewImport?.local){reviewName=node.id.name;bridgePassed=node.init.arguments[0]?.type==='ObjectExpression'&&node.init.arguments[0].properties.some(prop=>(prop.key.name||prop.key.value)==='bridge'&&memberParts(prop.value)?.join('.')===`${appName}.regularBridge`);}
 });
 const connected=mainCalls.find(row=>row.callee?.join('.')===`${appName}.connectQ4`&&row.node.arguments[0]?.name===reviewName);
 const booted=mainCalls.find(row=>row.callee?.join('.')===`${appName}.boot`);
 if(!appName||!reviewName||!bridgePassed||!connected||!booted||connected.node.start>booted.node.start)error('MAIN_BRIDGE_WIRING',{file:'web/main.mjs',appName,reviewName,bridgePassed,connected:!!connected,booted:!!booted});
 const injectedBridgeCalls=calls.filter(row=>row.file==='web/q4-review.mjs'&&row.callee?.[0]==='bridge').map(({file,line,within,callee})=>({file,line,within,method:callee.slice(1).join('.')}));
 const bridgeMethods=providerMethods.get('OrderRegularQ4Bridge')||[];
 for(const method of ['inspect','isCurrent','allocationContext','commit','closed'])if(!bridgeMethods.includes(method)||!injectedBridgeCalls.some(row=>row.method===method))error('INJECTED_BRIDGE_METHOD',{method,provided:bridgeMethods.includes(method),called:injectedBridgeCalls.some(row=>row.method===method)});
 for(const reference of references){
  if(reference.method&&((reference.file==='web/app.mjs'&&reference.name==='OrderQ4Review')||(reference.file==='web/q4-review.mjs'&&reference.name==='OrderRegularQ4Bridge')))error('LEGACY_CROSS_WINDOW_CALLER',reference);
 }
 const windowBridges=[...new Set([...providers.keys(),...references.map(row=>row.name)])].sort().map(name=>({name,providers:providers.get(name)||[],methods:providerMethods.get(name)||[],callers:references.filter(row=>row.name===name).map(({name,...row})=>row)}));
 for(const bridge of windowBridges)if(bridge.callers.length&&bridge.providers.length!==1)error('GLOBAL_PROVIDER_COUNT',{name:bridge.name,providers:bridge.providers});
 return {ok:errors.length===0,errors,files:files.length,sourceSha256:Object.fromEntries([...sources].map(([file,source])=>[file,createHash('sha256').update(source).digest('hex')])),imports,requiredCallers,mainBridge:{app:appName,review:reviewName,bridgePassed,connected:!!connected,booted:!!booted,injectedBridgeCalls},windowBridges};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await checkStructure();
 console.log(JSON.stringify(process.argv.includes('--json')?report:{ok:report.ok,files:report.files,imports:report.imports.length,requiredCallers:report.requiredCallers.length,windowBridges:report.windowBridges.length,errors:report.errors},null,2));
 process.exitCode=report.ok?0:1;
}
