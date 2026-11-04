import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {webcrypto} from 'node:crypto';
import {createBrowserStorage,emptyStoredPayload} from '../../web/storage.mjs';

class Store{constructor(raw=null){this.raw=raw;this.writes=0;}getItem(){return this.raw;}setItem(key,value){this.raw=value;this.writes++;}}
const serial=()=>{let tail=Promise.resolve();return {request(name,options,callback){const next=tail.then(()=>callback({name}));tail=next.catch(()=>{});return next;}};};
const fixture=()=>({...emptyStoredPayload(),lines:[{id:'sku',housing:'4',size:'특란',pack:'30',qty:'600',price:'10000'}]});
const options=read=>({expectedRevision:read.revision,expectedToken:read.versionToken,transactionId:'confirm'});
const setup=(local=new Store(),locks=serial(),sessionStorage={getItem(){throw Error('must not consult session');}})=>({local,locks,api:createBrowserStorage({localStorage:local,sessionStorage,locks,crypto:webcrypto,now:()=>1})});

test('C54-08 read-only inspection never migrates absent legacy state or exposes saved payload',async()=>{
 const env=setup(),absent=await env.api.inspectCurrent();assert.deepEqual(absent,{ok:true,status:'EMPTY',revision:0,versionToken:'ABSENT'});assert.equal(env.local.writes,0);assert.equal(env.local.raw,null);
 const source=JSON.stringify({schemaVersion:6,generation:'old',revision:3,state:'data',data:fixture(),receipts:[],migration:null,updatedAt:0});env.local.raw=source;
 const seen=await env.api.inspectCurrent();assert.equal(seen.ok,true);assert.equal(seen.revision,3);assert.match(seen.versionToken,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(seen).sort(),['ok','revision','status','versionToken']);assert.equal(env.local.raw,source);assert.equal(env.local.writes,0);
});
test('C54-08 inspection detects foreign commit/reset under the shared lock and never rewrites the record',async()=>{
 const env=setup(new Store(),serial(),new Store()),first=await env.api.load(),written=await env.api.commit(fixture(),options(first));assert.equal(written.ok,true);const before=await env.api.inspectCurrent();
 const tab=setup(env.local,env.locks,new Store()).api,other=await tab.load();const changed=fixture();changed.lines[0].qty='601';const saved=await tab.commit(changed,{...options(other),transactionId:'foreign'});const current=await env.api.inspectCurrent();assert.equal(current.revision,saved.revision);assert.notEqual(current.versionToken,before.versionToken);assert.equal(env.local.writes,2);
 const reset=await tab.reset({...options(saved),transactionId:'reset'}),seen=await env.api.inspectCurrent();assert.deepEqual(seen,{ok:true,status:'RESET',revision:reset.revision,versionToken:reset.versionToken});assert.equal(env.local.writes,3);
});
test('C54-08 corrupt/unavailable inspection fails closed with metadata only and no fallback',async()=>{
 for(const raw of ['{broken',JSON.stringify({schemaVersion:999,revision:4})]){const env=setup(new Store(raw));const seen=await env.api.inspectCurrent();assert.equal(seen.ok,false);assert.ok(['CORRUPT','UNSUPPORTED'].includes(seen.status));assert.equal('data' in seen,false);assert.equal('generation' in seen,false);assert.equal(env.local.raw,raw);assert.equal(env.local.writes,0);}
 const env=setup(new Store(),null),seen=await env.api.inspectCurrent();assert.equal(seen.status,'UNAVAILABLE');assert.equal('data' in seen,false);assert.equal(env.local.writes,0);
});

function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const value of Object.values(node))for(const child of Array.isArray(value)?value:[value]){const match=find(child,predicate);if(match)return match;}return null;}
const source=await readFile(new URL('../../web/app.mjs',import.meta.url),'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),node=find(ast,n=>n.type==='FunctionDeclaration'&&n.id.name==='q4ReviewIsCurrent');
function bridge(inspect){const context=vm.createContext({q4ReviewContext:{id:'parent'},storageRevision:4,storageToken:'token',storageEpoch:2,storageReady:true,storagePending:0,storageFailure:null,storage:{inspectCurrent:inspect}});vm.runInContext(source.slice(node.start,node.end),context);return context;}
test('C54-08 bridge accepts only the unchanged parent and exact durable revision/token',async()=>{
 for(const patch of [{},{revision:5},{versionToken:'changed'},{ok:false}]){const ctx=bridge(async()=>({ok:true,revision:4,versionToken:'token',...patch}));assert.equal(await ctx.q4ReviewIsCurrent(),Object.keys(patch).length===0);}
 for(const mutate of [c=>c.q4ReviewContext=null,c=>c.storagePending=1,c=>c.storageFailure={status:'CONFLICT'},c=>c.storageReady=false]){let calls=0;const ctx=bridge(async()=>{calls++;return {ok:true,revision:4,versionToken:'token'};});mutate(ctx);assert.equal(await ctx.q4ReviewIsCurrent(),false);assert.equal(calls,0);}
});
test('C54-08 asynchronous inspection cannot validate a replaced/cancelled parent generation',async()=>{
 for(const mutate of [c=>c.q4ReviewContext={id:'replacement'},c=>c.storageEpoch++,c=>c.storageRevision++,c=>c.storageToken='other',c=>c.storagePending=1,c=>c.storageFailure={status:'CONFLICT'}]){let release;const waiting=new Promise(resolve=>release=resolve),ctx=bridge(()=>waiting),pending=ctx.q4ReviewIsCurrent();mutate(ctx);release({ok:true,revision:4,versionToken:'token'});assert.equal(await pending,false);}
 assert.equal(await bridge(async()=>{throw Error('unavailable');}).q4ReviewIsCurrent(),false);
});
