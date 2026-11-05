import test from 'node:test';
import assert from 'node:assert/strict';
import {createAddressSearchHandler} from '../../functions/api/address/search.js';
import {createAddressSearchService} from '../../web/address-service.mjs';
import {selectAddress} from '../../web/address-contract.mjs';

const origin='https://order-ooo.pages.dev';
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
const provider=(documents=[],is_end=true,total=documents.length)=>({meta:{total_count:total,pageable_count:total,is_end},documents});
const road='서울 강남구 합성검사로 10';
const address={address_type:'ROAD_ADDR',road_address:{address_name:road,zone_no:'01234',region_1depth_name:'서울',region_2depth_name:'강남구'},address:{address_name:'서울 강남구 합성동 1'}};
const place=(id='101',name='엽기떡볶이 언주역점')=>({id,place_name:name,road_address_name:road,address_name:'서울 강남구 합성동 1',place_url:'https://ignored.invalid',x:'127',y:'37'});
function pipeline({places=[place()],addresses=[address],keyword,postal}={}){
 const calls=[];
 const handle=createAddressSearchHandler({fetcher:async(url,options)=>{
  const u=new URL(url);calls.push({url:u,options});
  if(u.pathname.endsWith('/keyword.json'))return json(keyword?keyword(u):provider(places));
  if(u.pathname.endsWith('/address.json'))return json(postal?postal(u):provider(addresses));
  throw Error('unexpected provider endpoint');
 }});
 const service=createAddressSearchService({origin,cacheTtlMs:0,fetcher:(url,options)=>handle({request:new Request(url,options),env:{KAKAO_REST_API_KEY:'c55-synthetic'}})});
 return {service,calls,handle};
}

test('C55-01 independent examples use keyword and road search with no per-place postal enrichment',async()=>{
 for(const query of ['엽기떡볶이 언주역','서울시청','관악구청',road]){
  const h=pipeline({places:[place('101',query),place('102','같은 건물 다른 매장')]});
  try{
   const r=await h.service.search(query);
   assert.equal(r.status,'OK');assert.equal(r.version,3);
   assert.deepEqual(h.calls.map(c=>c.url.pathname).sort(),['/v2/local/search/address.json','/v2/local/search/keyword.json']);
   assert.deepEqual(r.items.filter(i=>i.kind==='PLACE').map(i=>i.placeId),['101','102']);
   assert.equal(r.items.filter(i=>i.kind==='ADDRESS').length,1);
   assert.ok(r.items.filter(i=>i.kind==='PLACE').every(i=>i.postal===undefined));
  }finally{h.service.close();}
 }
});

test('C55-02 only selected place resolves postal; same-building stores keep distinct identity and user details',async()=>{
 const h=pipeline({places:[place(),place('102','같은 건물 다른 매장')]});
 try{
  const result=await h.service.search('엽기떡볶이 언주역');
  const places=result.items.filter(i=>i.kind==='PLACE');
  assert.equal(places.length,2);
  const a=await h.service.resolve('엽기떡볶이 언주역',places[0]);
  assert.equal(a.status,'OK');assert.equal(a.item.postal,'01234');
  assert.equal(h.calls.length,4,'search 2 + selected verification 1 + selected postal 1');
  assert.equal(h.calls.at(-1).url.searchParams.get('query'),road);
  const b=await h.service.resolve('엽기떡볶이 언주역',places[1]);
  assert.notEqual(a.item.providerId,b.item.providerId);
  assert.equal(selectAddress({...a.item,detail:'가게 안쪽',dropoff:'별도 문'},b.item).detail,'');
  const again=await h.service.resolve('엽기떡볶이 언주역',places[0]);
  assert.equal(again.item.providerId,a.item.providerId);
  assert.equal(selectAddress({...a.item,detail:'가게 안쪽'},again.item).detail,'가게 안쪽');
 }finally{h.service.close();}
});

test('C55-02 mismatched selected id and ambiguous postal address never gain provenance',async()=>{
 const h=pipeline();try{
  const request=new Request(origin+'/api/address/search',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({action:'resolve',query:'엽기떡볶이',page:1,placeId:'999'})});
  const r=await h.handle({request,env:{KAKAO_REST_API_KEY:'c55-synthetic'}});
  assert.equal((await r.json()).reason,'PLACE_CHANGED');assert.equal(h.calls.length,1);
 }finally{h.service.close();}
 const bad=pipeline({addresses:[{...address,road_address:{...address.road_address,address_name:'다른 주소 20'},address:{address_name:'다른 동 20'}}]});try{
  const r=await bad.service.search('엽기떡볶이');
  const resolved=await bad.service.resolve('엽기떡볶이',r.items.find(i=>i.kind==='PLACE'));
  assert.equal(resolved.status,'UNAVAILABLE');assert.equal(resolved.reason,'POSTAL_UNAVAILABLE');
 }finally{bad.service.close();}
});

test('C55-02 same place moved within one postal zone clears prior building detail',async()=>{
 const old=pipeline(),newRoad='서울 강남구 합성검사로 20';
 const moved=pipeline({places:[{...place(),road_address_name:newRoad}],addresses:[{...address,road_address:{...address.road_address,address_name:newRoad}}]});
 try{
  const before=await old.service.search('엽기떡볶이'),after=await moved.service.search('엽기떡볶이');
  const a=await old.service.resolve('엽기떡볶이',before.items[0]),b=await moved.service.resolve('엽기떡볶이',after.items[0]);
  assert.equal(a.item.postal,b.item.postal);assert.notEqual(a.item.providerId,b.item.providerId);
  assert.equal(selectAddress({...a.item,detail:'이전 가게 2층',dropoff:'이전 후문'},b.item).detail,'');
 }finally{old.service.close();moved.service.close();}
});

test('C55-03 provider filtered empty page retains hasMore even without selectable items',async()=>{
 const h=pipeline({addresses:[],keyword:()=>provider([{...place(),road_address_name:'',address_name:''}],false,35)});
 try{const r=await h.service.search('건물 검색',{page:2});assert.equal(r.status,'EMPTY');assert.equal(r.hasMore,true);assert.equal(r.reason,'NO_SELECTABLE_ADDRESSES');}finally{h.service.close();}
});

test('C55 security: keyword redirect never forwards key; selected lookup accepts no URL, address or unknown fields',async()=>{
 const calls=[];
 const handler=createAddressSearchHandler({fetcher:async(url,options)=>{
  calls.push({url,options});return url.includes('/address.json')?json(provider([])):new Response('private c55-synthetic',{status:302,headers:{location:'https://attacker.invalid'}});
 }});
 const invoke=async body=>handler({request:new Request(origin+'/api/address/search',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify(body)}),env:{KAKAO_REST_API_KEY:'c55-synthetic'}});
 const r=await invoke({query:'서울시청',page:1});assert.equal(r.status,502);assert.equal((await r.json()).reason,'PROVIDER_HTTP');
 assert.equal(calls.length,2);assert.ok(calls.every(call=>new URL(call.url).origin==='https://dapi.kakao.com'&&call.options.redirect==='manual'));
 for(const body of [{action:'resolve',query:'검색장소',page:1,placeId:'101',url:'https://attacker.invalid'},{action:'resolve',query:'검색장소',placeId:'101',road:'조작 주소'}, {action:'resolve',query:'검색장소',placeId:101}, {action:'resolve',query:'검색장소',placeId:'1\n2'}, {action:'other',query:'검색장소'}])assert.equal((await invoke(body)).status,400);
 assert.equal(calls.length,2);
});

test('C55 strict v3 wire rejects injected fields, wrong selected identity, duplicate places and inconsistent source paging',async()=>{
 const h=pipeline();let valid;try{valid=await h.service.search('서울시청');}finally{h.service.close();}
 const corruptions=[
  {...valid,extra:'untrusted'}, {...valid,items:[{...valid.items[0],postal:'01234'}]},
  {...valid,items:[valid.items[0],valid.items[0]]}, {...valid,hasMore:true},
  {...valid,items:[{...valid.items[0],name:'bad\nname'}]}, {...valid,items:[{...valid.items[0],page:2}]},
  {...valid,sources:{...valid.sources,place:{total:1,pageable:1,hasMore:true}}},
  {...valid,sources:{...valid.sources,place:{total:0,pageable:0,hasMore:false}},total:1}
 ];
 for(const value of corruptions){const service=createAddressSearchService({origin,fetcher:async()=>json(value)});try{assert.equal((await service.search('서울시청')).reason,'BAD_RESPONSE');assert.equal(service.inspect().cached,0);}finally{service.close();}}
 const item={...valid.items.find(item=>item.kind==='ADDRESS')};delete item.kind;
 for(const result of [{version:3,status:'OK',reason:'RESOLVED',placeId:'999',item},{version:3,status:'OK',reason:'RESOLVED',placeId:'101',item:{...item,postal:'1234'}}]){
  const service=createAddressSearchService({origin,fetcher:async()=>json(result)});try{assert.equal((await service.resolve('서울시청',valid.items[0])).reason,'BAD_RESPONSE');assert.equal(service.inspect().cached,0);}finally{service.close();}
 }
});

test('C55 resolution consumers coalesce; all canceled consumers cannot cache a late postal result',async()=>{
 const candidate={kind:'PLACE',placeId:'101',name:'서울시청',road,jibun:'',page:1,addressProvider:'KAKAO'};
 let release,calls=0;
 const service=createAddressSearchService({origin,fetcher:async()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
 try{
  const a=new AbortController(),b=new AbortController();
  const first=service.resolve('서울시청',candidate,{signal:a.signal}),second=service.resolve('서울시청',candidate,{signal:b.signal});
  assert.equal(calls,1);a.abort();b.abort();assert.equal((await first).status,'ABORTED');assert.equal((await second).status,'ABORTED');
  release(json({version:3,status:'OK',reason:'RESOLVED',placeId:'101',item:{road,postal:'01234',jibun:'',region:'',addressProvider:'KAKAO',providerId:'KAKAO:v1:'+'a'.repeat(64)}}));
  await new Promise(resolve=>setImmediate(resolve));assert.equal(service.inspect().cached,0);
 }finally{service.close();}
});
