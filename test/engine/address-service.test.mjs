import test from 'node:test';
import assert from 'node:assert/strict';
import {createAddressSearchHandler} from '../../functions/api/address/search.js';
import {createAddressSearchService} from '../../web/address-service.mjs';

// Synthetic addresses are confined to tests; they are never public defaults.
const origin='https://order-ooo.pages.dev';
const item={road:'서울특별시 관악구 합성검사로 10',postal:'08843',jibun:'서울특별시 관악구 합성동 1',region:'서울특별시 관악구',providerId:'KAKAO:v1:ebc2983e578ace1dc9e54ef774e0246cecfdcb9250e20163b2e254abdb2c0256',addressProvider:'KAKAO'};
const row={address_type:'ROAD_ADDR',address_name:item.road,road_address:{address_name:item.road,zone_no:item.postal,region_1depth_name:'서울특별시',region_2depth_name:'관악구',region_3depth_name:'합성동',road_name:'합성검사로',main_building_no:'10',sub_building_no:'',underground_yn:'N',x:'126.0',y:'37.0'},address:{address_name:item.jibun}};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const answer=(items=[item],page=1,total=items.length)=>({version:2,status:items.length?'OK':'EMPTY',reason:items.length?'RESULTS':'NO_RESULTS',items,page,total,pageable:total,hasMore:page<20&&page*10<total});
const provider=(rows=[row],page=1,total=rows.length)=>({meta:{total_count:total,pageable_count:total,is_end:page*10>=total},documents:rows});
const request=(data={query:'합성검사로',page:1},init={})=>new Request(origin+'/api/address/search',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(data),...init});
const invoke=async(fetcher,data,env={KAKAO_REST_API_KEY:'synthetic-test-secret'},options={})=>{const response=await createAddressSearchHandler({fetcher,...options})({request:request(data),env});return {response,value:await response.json()};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('C54-02 Kakao fixed HTTPS GET uses header-only secret and preserves road/postal provenance',async()=>{
 const calls=[];
 const {response,value}=await invoke(async(url,options)=>{calls.push({url,options});return json(provider());});
 assert.equal(response.status,200);assert.deepEqual(value,answer());assert.equal(value.items[0].postal,'08843');
 assert.equal(calls.length,1);const upstream=new URL(calls[0].url);assert.equal(upstream.origin+upstream.pathname,'https://dapi.kakao.com/v2/local/search/address.json');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.redirect,'error');
 assert.deepEqual(Object.fromEntries(upstream.searchParams),{query:'합성검사로',page:'1',size:'10',analyze_type:'similar'});
 assert.equal(calls[0].options.headers.authorization,'KakaoAK synthetic-test-secret');assert.equal(calls[0].options.body,undefined);
 assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(JSON.stringify(value).includes('synthetic-test-secret'),false);assert.equal(calls[0].url.includes('synthetic-test-secret'),false);
 assert.equal('x' in value.items[0],false);assert.equal('y' in value.items[0],false);
});
test('A09 missing production secret is unavailable with zero provider calls, never empty or success',async()=>{
 let calls=0;for(const key of [undefined,'',null]){const {response,value}=await invoke(async()=>{calls++;},undefined,{KAKAO_REST_API_KEY:key});assert.equal(response.status,503);assert.equal(value.status,'UNAVAILABLE');assert.equal(value.reason,'NOT_CONFIGURED');assert.deepEqual(value.items,[]);}assert.equal(calls,0);
});
test('A09 request limits reject unknown proxy fields, short/control/oversize queries and invalid pages',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return json(provider());};
 for(const data of [{query:'한'}, {query:'가'.repeat(41)}, {query:'a'.repeat(81)}, {query:'검색\u0000'}, {query:'검색',page:0},{query:'검색',page:21},{query:'검색',page:'1'},{query:'검색',url:'https://attacker.invalid'},{query:'검색',countPerPage:999},null]){
  const {response,value}=await invoke(fetcher,data);assert.equal(response.status,400,JSON.stringify(data));assert.equal(value.status,'INVALID_REQUEST');
 }
 assert.equal(calls,0);
});
test('A09 origin, route, method, body type and bytes are bounded without a generic proxy',async()=>{
 let calls=0;const handle=createAddressSearchHandler({fetcher:async()=>{calls++;return json(provider());}}),env={KAKAO_REST_API_KEY:'synthetic'};
 for(const [req,status] of [
  [new Request(origin+'/api/address/search'),405],
  [request(undefined,{headers:{'content-type':'application/json',origin:'https://other.invalid'}}),403],
  [request(undefined,{headers:{'content-type':'application/json','sec-fetch-site':'cross-site'}}),403],
  [new Request(origin+'/api/address/elsewhere',{method:'POST'}),404],
  [request(undefined,{headers:{'content-type':'text/plain'}}),400],
  [request(undefined,{body:' '.repeat(1025)}),400],
  [new Request(origin+'/api/address/search?url=https://other.invalid',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),400],
 ])assert.equal((await handle({request:req,env})).status,status);
 assert.equal(calls,0);
});
test('A09 empty result is distinct from HTTP, provider, malformed and network failure; no raw provider echo',async()=>{
 const empty=await invoke(async()=>json(provider([])));assert.equal(empty.value.status,'EMPTY');assert.equal(empty.response.status,200);
 const cases=[
  [async()=>json({},503),'PROVIDER_HTTP'],
  [async()=>json({message:'synthetic-test-secret private raw query'},401),'PROVIDER_AUTH'],
  [async()=>json({message:'synthetic-test-secret private raw query'},403),'PROVIDER_AUTH'],
  [async()=>json({message:'synthetic-test-secret private raw query'},429),'PROVIDER_QUOTA'],
  [async()=>new Response('<html>error</html>',{headers:{'content-type':'text/html'}}),'BAD_RESPONSE'],
  [async()=>json({meta:{total_count:1}}),'BAD_RESPONSE'],
  [async()=>{throw new Error('synthetic-test-secret');},'NETWORK'],
 ];
 for(const [fetcher,reason] of cases){const {value,response}=await invoke(fetcher);assert.equal(value.status,'UNAVAILABLE');assert.equal(value.reason,reason);assert.equal(response.status,502);assert.equal(JSON.stringify(value).includes('synthetic-test-secret'),false);assert.equal(JSON.stringify(value).includes('private raw query'),false);}
});
test('C54-02 provider malformed road, postal, counts and response type remain unavailable',async()=>{
 const invalid=[provider([{...row,road_address:{...row.road_address,zone_no:8843}}]),provider([{...row,road_address:{...row.road_address,address_name:''}}]),provider([{...row,address:{address_name:'bad\nline'}}]),provider([{...row,address_type:'invented'}]),provider([],1,1),provider([row],1,0),provider(Array(11).fill(row)),{...provider(),meta:{total_count:1,pageable_count:2,is_end:true}}];
 for(const value of invalid){const r=await invoke(async()=>json(value));assert.equal(r.value.reason,'BAD_RESPONSE');assert.equal(r.value.status,'UNAVAILABLE');}
});
test('C54-02 valid nonbuilding candidates are not selectable and do not become provider verified',async()=>{
 const region={address_type:'REGION',road_address:null,address:{address_name:'합성시'}};
 const empty=await invoke(async()=>json(provider([region])));assert.equal(empty.value.status,'EMPTY');assert.equal(empty.value.reason,'NO_SELECTABLE_ADDRESSES');assert.equal(empty.value.total,1);assert.deepEqual(empty.value.items,[]);
 const mixed=await invoke(async()=>json(provider([region,row,row])));assert.equal(mixed.value.status,'OK');assert.deepEqual(mixed.value.items,[item]);assert.equal(mixed.value.total,3);
 const partial=await invoke(async()=>json(provider([region,row],1,25)));assert.equal(partial.value.hasMore,true);assert.equal(partial.value.pageable,25);
});
test('A09 provider response size is bounded even without content-length',async()=>{
 const {value}=await invoke(async()=>new Response(JSON.stringify({padding:'x'.repeat(65536)}),{headers:{'content-type':'application/json'}}));assert.equal(value.reason,'BAD_RESPONSE');
});
test('A09 server timeout and caller cancellation settle a fetcher that ignores AbortSignal',async()=>{
 const timed=await invoke(()=>new Promise(()=>{}),undefined,undefined,{timeoutMs:5});assert.equal(timed.response.status,504);assert.equal(timed.value.reason,'TIMEOUT');
 const controller=new AbortController(),handle=createAddressSearchHandler({fetcher:()=>new Promise(()=>{}),timeoutMs:1000});
 const pending=handle({request:request(undefined,{signal:controller.signal}),env:{KAKAO_REST_API_KEY:'synthetic'}});await tick();controller.abort();const r=await pending;assert.equal(r.status,499);assert.equal((await r.json()).reason,'CANCELLED');
});
test('A09 page 20 can return results but cannot request an unbounded next page',async()=>{
 const r=await invoke(async()=>json(provider([row],20,201)),{query:'검색검사',page:20});assert.equal(r.value.status,'OK');assert.equal(r.value.hasMore,false);
});

test('A10 browser transport sends POST to same-origin fixed path only, with no contact/detail/dropoff',async()=>{
 const calls=[],service=createAddressSearchService({origin,fetcher:async(url,options)=>{calls.push({url,options});return json(answer());}});
 assert.deepEqual(await service.search('  합성검사로  '),answer());assert.equal(calls.length,1);assert.equal(calls[0].url,origin+'/api/address/search');assert.equal(calls[0].options.mode,'same-origin');assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.redirect,'error');assert.deepEqual(JSON.parse(calls[0].options.body),{query:'합성검사로',page:1});
 assert.equal('query' in service.inspect(),false);service.close();
});
test('A10 initialization, invalid input, unsupported file origin and a cancelled consumer do not call API',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return json(answer());};
 const service=createAddressSearchService({origin,fetcher});assert.equal(calls,0);
 for(const query of ['', '한','가'.repeat(41),'x'.repeat(81),'ab\ncd'])assert.equal((await service.search(query)).status,'INVALID_REQUEST');
 const controller=new AbortController();controller.abort();assert.equal((await service.search('검색',{signal:controller.signal})).status,'ABORTED');
 assert.equal((await createAddressSearchService({origin:'null',fetcher}).search('검색')).reason,'UNSUPPORTED_ORIGIN');assert.equal(calls,0);service.close();
});
test('A10 simultaneous identical query/page coalesces and cancelling one consumer preserves the other',async()=>{
 let release,calls=0,signal;const service=createAddressSearchService({origin,fetcher:async(_url,options)=>{calls++;signal=options.signal;return new Promise(resolve=>{release=()=>resolve(json(answer()));});}});
 const a=new AbortController(),p=service.search('검색',{signal:a.signal}),q=service.search('검색');a.abort();assert.equal((await p).status,'ABORTED');assert.equal(signal.aborted,false);release();assert.deepEqual(await q,answer());assert.equal(calls,1);assert.equal(service.inspect().coalesced,1);service.close();
});
test('A10 cancellation of all consumers blocks late success/cache and permits a fresh same-query request',async()=>{
 const releases=[];let calls=0;const service=createAddressSearchService({origin,fetcher:async()=>{calls++;return new Promise(resolve=>releases.push(()=>resolve(json(answer()))));}});
 const p=service.search('검색');service.cancel();assert.equal((await p).status,'ABORTED');releases[0]();await tick();assert.equal(service.inspect().cached,0);
 const q=service.search('검색');assert.equal(calls,2);releases[1]();assert.equal((await q).status,'OK');service.close();
});
test('A10 successful and empty responses use short bounded memory TTL; failure never does',async()=>{
 let time=0,calls=0;const service=createAddressSearchService({origin,now:()=>time,fetcher:async()=>{calls++;return json(answer());}});
 const first=await service.search('검색');first.items[0].road='mutated caller';assert.equal((await service.search('검색')).items[0].road,item.road);assert.equal(calls,1);time=30000;await service.search('검색');assert.equal(calls,2);service.clearCache();await service.search('검색');assert.equal(calls,3);service.close();
 let failures=0;const broken=createAddressSearchService({origin,fetcher:async()=>{failures++;return json({version:1,status:'UNAVAILABLE',reason:'PROVIDER_ERROR',items:[]},502);}});await broken.search('검색');await broken.search('검색');assert.equal(failures,2);broken.close();
 const empty=createAddressSearchService({origin,fetcher:async()=>json(answer([]))});assert.equal((await empty.search('검색')).status,'EMPTY');await empty.search('검색');assert.equal(empty.inspect().requests,1);empty.close();
});
test('A10 browser HTTP, malformed, timeout and network failures remain unavailable, never empty',async()=>{
 for(const [fetcher,reason] of [
  [async()=>json({version:1,status:'UNAVAILABLE',reason:'NOT_CONFIGURED',items:[]},503),'NOT_CONFIGURED'],
  [async()=>new Response('<html/>'),'BAD_RESPONSE'],
  [async()=>json({...answer(),items:[{...item,postal:8843}]}),'BAD_RESPONSE'],
  [async()=>json({...answer(),page:2}),'BAD_RESPONSE'],
  [async()=>json({...answer(),hasMore:true}),'BAD_RESPONSE'],
  [async()=>{throw new Error('offline');},'NETWORK'],
  [()=>new Promise(()=>{}),'TIMEOUT'],
 ]){const service=createAddressSearchService({origin,fetcher,timeoutMs:5});const result=await service.search('검색');assert.equal(result.status,'UNAVAILABLE');assert.equal(result.reason,reason);assert.equal(service.inspect().cached,0);service.close();}
});
test('A10 closing service cancels pending and disallows work without reviving results from late responses',async()=>{
 let release;const service=createAddressSearchService({origin,fetcher:()=>new Promise(resolve=>{release=resolve;})});const pending=service.search('검색');service.close();assert.equal((await pending).status,'ABORTED');release(json(answer()));await tick();assert.equal((await service.search('검색')).status,'ABORTED');assert.equal(service.inspect().cached,0);assert.equal(service.inspect().pending,0);
});
test('A09/A10 full browser-to-function pipeline uses real modules with synthetic provider response only',async()=>{
 let providerCalls=0;const handle=createAddressSearchHandler({fetcher:async()=>{providerCalls++;return json(provider());}});
 const service=createAddressSearchService({origin,fetcher:(url,options)=>handle({request:new Request(url,options),env:{KAKAO_REST_API_KEY:'synthetic'}})});
 assert.deepEqual(await service.search('합성검사로'),answer());assert.equal(providerCalls,1);service.close();
});

test('C54-02 upstream body/error details are never echoed, including secret/private query',async()=>{
 for(const status of [400,401,403,429,500]){
  const {value}=await invoke(async()=>json({code:-401,msg:'synthetic-test-secret private raw query'},status));
  assert.equal(value.status,'UNAVAILABLE');assert.equal('providerCode' in value,false);
  assert.equal(JSON.stringify(value).includes('synthetic-test-secret'),false);assert.equal(JSON.stringify(value).includes('private raw query'),false);
 }
});
test('C54-02 old JUSO secret alone is not a Kakao configured environment',async()=>{
 let calls=0;const result=await invoke(async()=>{calls++;},undefined,{JUSO_SEARCH_KEY:'synthetic-legacy'});
 assert.equal(result.value.reason,'NOT_CONFIGURED');assert.equal(calls,0);
});
test('C54-02 no JUSO-shaped identity is accepted as Kakao and no partial paging metadata is cached',async()=>{
 for(const payload of [{...answer(),items:[{...item,providerId:'1'.repeat(25)}]},{...answer(),pageable:undefined},{...answer(),pageable:2,total:1},{...answer(),items:[{...item,addressProvider:'JUSO'}]}]){
  const service=createAddressSearchService({origin,fetcher:async()=>json(payload)});assert.equal((await service.search('검색')).reason,'BAD_RESPONSE');assert.equal(service.inspect().cached,0);service.close();
 }
});
