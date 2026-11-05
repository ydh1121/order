// Only this route is deployed as a Pages Function. No browser code imports it.
const PROVIDER_URLS = Object.freeze({address:'https://dapi.kakao.com/v2/local/search/address.json',place:'https://dapi.kakao.com/v2/local/search/keyword.json'});
const COUNT = 10;
const MAX_PAGE = 20;
const QUERY_LIMIT = 80;
const REQUEST_BYTES = 1024;
const RESPONSE_BYTES = 65536;
const HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedString = (value,max,required=false) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value) && (!required || value.trim().length > 0);
const normalizedText = value => value.normalize('NFC').trim().replace(/ +/g,' ');
async function candidateId(value) {
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));
 return 'KAKAO:v1:'+ [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
const fail = (reason,status=503) => new Response(JSON.stringify({version:2,status:status===400?'INVALID_REQUEST':'UNAVAILABLE',reason,items:[]}),{status,headers:HEADERS});

async function boundedText(body,max) {
 if(Number(body.headers?.get('content-length')) > max) throw new Error('BODY_LIMIT');
 if(!body.body) return '';
 const reader=body.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try {
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw new Error('BODY_LIMIT');text+=decoder.decode(value,{stream:true});}
  return text+decoder.decode();
 } finally {await reader.cancel().catch(()=>{});}
}
// Kakao's address endpoint has no building ID. This namespaced digest is our
// stable candidate identity, not a Kakao place ID or a government building ID.
async function normalizedItem(item) {
 if(!plain(item)||!['REGION','ROAD','REGION_ADDR','ROAD_ADDR'].includes(item.address_type))throw new Error('BAD_RESPONSE');
 if(item.road_address===null||['REGION','ROAD'].includes(item.address_type))return null;
 const road=item.road_address;
 if(!plain(road)||!boundedString(road.address_name,512,true)||typeof road.zone_no!=='string'||!/^\d{5}$/.test(road.zone_no))throw new Error('BAD_RESPONSE');
 if(item.address!=null&&!plain(item.address))throw new Error('BAD_RESPONSE');
 const jibun=item.address?.address_name??'',si=road.region_1depth_name??'',sgg=road.region_2depth_name??'';
 if(!boundedString(jibun,512)||!boundedString(si,100)||!boundedString(sgg,100))throw new Error('BAD_RESPONSE');
 const name=normalizedText(road.address_name),postal=road.zone_no;
 return {road:name,postal,jibun:normalizedText(jibun),region:[si.trim(),sgg.trim()].filter(Boolean).join(' '),providerId:await candidateId([name,postal]),addressProvider:'KAKAO'};
}
function providerPage(payload,page) {
 const meta=payload?.meta,rows=payload?.documents;
 if(!plain(meta)||!Number.isSafeInteger(meta.total_count)||meta.total_count<0||meta.total_count>10000000||!Number.isSafeInteger(meta.pageable_count)||meta.pageable_count<0||meta.pageable_count>meta.total_count||typeof meta.is_end!=='boolean'||!Array.isArray(rows)||rows.length>COUNT||rows.length>meta.pageable_count)throw new Error('BAD_RESPONSE');
 if((meta.total_count===0&&(rows.length||!meta.is_end))||(meta.pageable_count>(page-1)*COUNT&&rows.length===0)||(!meta.is_end&&page*COUNT>=meta.pageable_count))throw new Error('BAD_RESPONSE');
 return {rows,total:meta.total_count,pageable:meta.pageable_count,hasMore:page<MAX_PAGE&&!meta.is_end};
}
async function normalizeProvider(payload,page) {
 const {rows,...paging}=providerPage(payload,page);
 // Regions/roads without a deliverable road number+postal are not selectable.
 // They are distinct from a malformed response and do not gain provenance.
 const normalized=(await Promise.all(rows.map(normalizedItem))).filter(Boolean);
 const items=[...new Map(normalized.map(row=>[row.providerId,row])).values()];
 return {items,hadRows:rows.length>0,...paging};
}
function normalizePlaces(payload,page) {
 const {rows,...paging}=providerPage(payload,page);
 const items=rows.map(item=>{
  if(!plain(item)||typeof item.id!=='string'||!/^\d{1,32}$/.test(item.id)||!boundedString(item.place_name,256,true)||!boundedString(item.road_address_name,512)||!boundedString(item.address_name,512))throw new Error('BAD_RESPONSE');
  const road=normalizedText(item.road_address_name),jibun=normalizedText(item.address_name);
  if(!road&&!jibun)return null;
  return {kind:'PLACE',placeId:item.id,name:normalizedText(item.place_name),road,jibun,page,addressProvider:'KAKAO'};
 }).filter(Boolean);
 return {items:[...new Map(items.map(item=>[item.placeId,item])).values()],hadRows:rows.length>0,...paging};
}

// Dependencies are injectable for deterministic tests; production uses native fetch.
export function createAddressSearchHandler({fetcher=globalThis.fetch,timeoutMs=5000}={}) {
 return async function handle({request,env={}}) {
  const url=new URL(request.url);
  if(url.pathname!=='/api/address/search'&&url.pathname!=='/api/address/search/')return fail('NOT_FOUND',404);
  if(request.method!=='POST')return new Response(JSON.stringify({version:2,status:'UNAVAILABLE',reason:'METHOD_NOT_ALLOWED',items:[]}),{status:405,headers:{...HEADERS,allow:'POST'}});
  if(url.search||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail('INVALID_REQUEST',400);
  const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
  if((origin&&origin!==url.origin)||(site&&site!=='same-origin'&&site!=='none'))return fail('ORIGIN_REJECTED',403);
  let input;
  try {input=JSON.parse(await boundedText(request,REQUEST_BYTES));}catch{return fail('INVALID_REQUEST',400);}
  if(!plain(input)||Object.keys(input).some(key=>!['query','page',...(input.action==='resolve'?['action','placeId']:[])].includes(key))||typeof input.query!=='string'||!boundedString(input.query,QUERY_LIMIT)||input.query.trim().length<2||(input.action==='resolve'&&(typeof input.placeId!=='string'||!/^\d{1,32}$/.test(input.placeId))))return fail('INVALID_REQUEST',400);
  const query=input.query.trim().replace(/ +/g,' '),page=input.page??1;
  if([...query].reduce((n,c)=>n+(c.charCodeAt(0)>127?2:1),0)>80)return fail('INVALID_REQUEST',400);
  if(!Number.isInteger(page)||page<1||page>MAX_PAGE)return fail('INVALID_REQUEST',400);
  const key=env.KAKAO_REST_API_KEY;
  if(typeof key!=='string'||!key.trim()||key.length>2048||/[\s\u0000-\u001f\u007f]/u.test(key))return fail('NOT_CONFIGURED');
  if(request.signal.aborted)return fail('CANCELLED',499);
  const controller=new AbortController();let timer,abortListener;
  const stopped=new Promise((_,reject)=>{
   timer=setTimeout(()=>{controller.abort();reject(new Error('TIMEOUT'));},timeoutMs);
   abortListener=()=>{controller.abort();reject(new Error('CANCELLED'));};request.signal.addEventListener('abort',abortListener,{once:true});
  });
  async function upstream(kind,query,page) {
   // The upstream endpoint is fixed; the REST key is only an Authorization
   // header. Never log this URL/header or forward raw upstream error text.
   if(controller.signal.aborted)throw new Error('CANCELLED');
   const endpoint=new URL(PROVIDER_URLS[kind]);
   endpoint.search=new URLSearchParams({query,page:String(page),size:String(COUNT),...(kind==='address'?{analyze_type:'similar'}:{})}).toString();
   let response;
   // Workers rejects redirect:'error' during Request construction. Manual mode
   // returns 3xx to the !ok guard below without following or forwarding the key.
   try {response=await fetcher(endpoint.href,{method:'GET',headers:{authorization:'KakaoAK '+key,accept:'application/json'},redirect:'manual',signal:controller.signal});}
   catch {throw new Error('NETWORK');}
   if(!response.ok)throw new Error(response.status===401||response.status===403?'PROVIDER_AUTH':response.status===429?'PROVIDER_QUOTA':'PROVIDER_HTTP');
   if(!/\bapplication\/(?:[\w.+-]*\+)?json\b/i.test(response.headers.get('content-type')||''))throw new Error('BAD_RESPONSE');
   let payload;try {payload=JSON.parse(await boundedText(response,RESPONSE_BYTES));}catch{throw new Error('BAD_RESPONSE');}
   return kind==='address'?normalizeProvider(payload,page):normalizePlaces(payload,page);
  }
  const operation=(async()=>{
   if(input.action==='resolve') {
    // Re-read the selected provider page. The client cannot supply an arbitrary
    // address/name/URL or promote a made-up place ID into saved provenance.
    const places=await upstream('place',query,page),place=places.items.find(item=>item.placeId===input.placeId);
    if(!place)throw new Error('PLACE_CHANGED');
    const addresses=await upstream('address',place.road||place.jibun,1);
    const matches=addresses.items.filter(item=>place.road?item.road===place.road:item.jibun===place.jibun);
    if(matches.length!==1)throw new Error('POSTAL_UNAVAILABLE');
    // Separate place identity survives in the existing opaque storage field.
    // The namespaced digest cannot merge different stores at the same building.
    return {version:3,status:'OK',reason:'RESOLVED',placeId:place.placeId,item:{...matches[0],providerId:await candidateId(['PLACE',place.placeId,matches[0].road,matches[0].postal])}};
   }
   const addresses=await upstream('address',query,page),places=await upstream('place',query,page);
   const items=[...places.items,...addresses.items.map(item=>({kind:'ADDRESS',...item}))];
   const paging=source=>({total:source.total,pageable:source.pageable,hasMore:source.hasMore});
   return {version:3,status:items.length?'OK':'EMPTY',reason:items.length?'RESULTS':addresses.hadRows||places.hadRows?'NO_SELECTABLE_ADDRESSES':'NO_RESULTS',items,page,total:addresses.total+places.total,hasMore:addresses.hasMore||places.hasMore,sources:{address:paging(addresses),place:paging(places)}};
  })();
  try {return new Response(JSON.stringify(await Promise.race([operation,stopped])),{headers:HEADERS});}
  catch(error) {const reason=['TIMEOUT','CANCELLED','NETWORK','PROVIDER_HTTP','PROVIDER_AUTH','PROVIDER_QUOTA','BAD_RESPONSE','PLACE_CHANGED','POSTAL_UNAVAILABLE'].includes(error.message)?error.message:'UNAVAILABLE';return fail(reason,reason==='TIMEOUT'?504:reason==='CANCELLED'?499:502);}
  finally {clearTimeout(timer);request.signal.removeEventListener('abort',abortListener);controller.abort();}
 };
}
export const onRequest=createAddressSearchHandler();
