// Only this route is deployed as a Pages Function. No browser code imports it.
const PROVIDER_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';
const COUNT = 10;
const MAX_PAGE = 20;
const QUERY_LIMIT = 80;
const REQUEST_BYTES = 1024;
const RESPONSE_BYTES = 65536;
const HEADERS = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boundedString = (value,max,required=false) => typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value) && (!required || value.trim().length > 0);
const fail = (reason,status=503,providerCode=null) => new Response(JSON.stringify({version:1,status:status===400?'INVALID_REQUEST':'UNAVAILABLE',reason,items:[],...(typeof providerCode==='string'&&/^E[0-9]{4}$/.test(providerCode)?{providerCode}:{})}),{status,headers:HEADERS});

async function boundedText(body,max) {
 if(Number(body.headers?.get('content-length')) > max) throw new Error('BODY_LIMIT');
 if(!body.body) return '';
 const reader=body.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try {
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max)throw new Error('BODY_LIMIT');text+=decoder.decode(value,{stream:true});}
  return text+decoder.decode();
 } finally {await reader.cancel().catch(()=>{});}
}
function normalizedItem(item) {
 if(!plain(item)) throw new Error('BAD_RESPONSE');
 const road=item.roadAddrPart1||item.roadAddr;
 if(!boundedString(road,512,true)||!boundedString(item.zipNo,5,true)||!/^\d{5}$/.test(item.zipNo)||!boundedString(item.bdMgtSn,25,true)||!/^\d{25}$/.test(item.bdMgtSn))throw new Error('BAD_RESPONSE');
 const jibun=item.jibunAddr??'',si=item.siNm??'',sgg=item.sggNm??'';
 if(!boundedString(jibun,512)||!boundedString(si,100)||!boundedString(sgg,100))throw new Error('BAD_RESPONSE');
 return {road:road.trim(),postal:item.zipNo,jibun:jibun.trim(),region:[si.trim(),sgg.trim()].filter(Boolean).join(' '),providerId:item.bdMgtSn,addressProvider:'JUSO'};
}
function normalizeProvider(payload,page) {
 const result=payload?.results,common=result?.common;
 if(!plain(result)||!plain(common)||typeof common.errorCode!=='string')throw new Error('BAD_RESPONSE');
 // Do not echo provider messages: they may contain submitted data or key values.
 if(common.errorCode!=='0'){const error=new Error('PROVIDER_ERROR');if(/^E[0-9]{4}$/.test(common.errorCode))error.providerCode=common.errorCode;throw error;}
 const total=Number(common.totalCount),actualPage=Number(common.currentPage),perPage=Number(common.countPerPage);
 if(!/^(0|[1-9]\d*)$/.test(String(common.totalCount))||!Number.isSafeInteger(total)||total>10000000||actualPage!==page||perPage!==COUNT)throw new Error('BAD_RESPONSE');
 const rows=result.juso==null&&total===0?[]:result.juso;
 if(!Array.isArray(rows)||rows.length>COUNT||rows.length>total||(total===0&&rows.length)||(total>(page-1)*COUNT&&rows.length===0))throw new Error('BAD_RESPONSE');
 const items=rows.map(normalizedItem),unique=new Set(items.map(row=>row.providerId));
 if(unique.size!==items.length)throw new Error('BAD_RESPONSE');
 return {version:1,status:items.length?'OK':'EMPTY',reason:items.length?'RESULTS':'NO_RESULTS',items,page,total,hasMore:page<MAX_PAGE&&page*COUNT<total};
}

// Dependencies are injectable for deterministic tests; production uses native fetch.
export function createAddressSearchHandler({fetcher=globalThis.fetch,timeoutMs=5000}={}) {
 return async function handle({request,env={}}) {
  const url=new URL(request.url);
  if(url.pathname!=='/api/address/search'&&url.pathname!=='/api/address/search/')return fail('NOT_FOUND',404);
  if(request.method!=='POST')return new Response(JSON.stringify({version:1,status:'UNAVAILABLE',reason:'METHOD_NOT_ALLOWED',items:[]}),{status:405,headers:{...HEADERS,allow:'POST'}});
  if(url.search||!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail('INVALID_REQUEST',400);
  const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
  if((origin&&origin!==url.origin)||(site&&site!=='same-origin'&&site!=='none'))return fail('ORIGIN_REJECTED',403);
  let input;
  try {input=JSON.parse(await boundedText(request,REQUEST_BYTES));}catch{return fail('INVALID_REQUEST',400);}
  if(!plain(input)||Object.keys(input).some(key=>!['query','page'].includes(key))||typeof input.query!=='string'||!boundedString(input.query,QUERY_LIMIT)||input.query.trim().length<2)return fail('INVALID_REQUEST',400);
  const query=input.query.trim().replace(/ +/g,' '),page=input.page??1;
  if([...query].reduce((n,c)=>n+(c.charCodeAt(0)>127?2:1),0)>80)return fail('INVALID_REQUEST',400);
  if(!Number.isInteger(page)||page<1||page>MAX_PAGE)return fail('INVALID_REQUEST',400);
  const key=env.JUSO_SEARCH_KEY;
  if(typeof key!=='string'||!key.trim()||key.length>2048)return fail('NOT_CONFIGURED');
  if(request.signal.aborted)return fail('CANCELLED',499);
  const controller=new AbortController();let timer,abortListener;
  const stopped=new Promise((_,reject)=>{
   timer=setTimeout(()=>{controller.abort();reject(new Error('TIMEOUT'));},timeoutMs);
   abortListener=()=>{controller.abort();reject(new Error('CANCELLED'));};request.signal.addEventListener('abort',abortListener,{once:true});
  });
  const operation=(async()=>{
   // Key and search terms travel in the TLS POST body, never in the provider URL.
   const body=new URLSearchParams({confmKey:key,currentPage:String(page),countPerPage:String(COUNT),keyword:query,resultType:'json',hstryYn:'N'});
   let response;
   try {response=await fetcher(PROVIDER_URL,{method:'POST',body,headers:{'content-type':'application/x-www-form-urlencoded; charset=UTF-8',accept:'application/json'},redirect:'error',signal:controller.signal});}
   catch {throw new Error('NETWORK');}
   if(!response.ok)throw new Error('PROVIDER_HTTP');
   if(!/\bapplication\/(?:[\w.+-]*\+)?json\b/i.test(response.headers.get('content-type')||''))throw new Error('BAD_RESPONSE');
   let payload;try {payload=JSON.parse(await boundedText(response,RESPONSE_BYTES));}catch{throw new Error('BAD_RESPONSE');}
   return normalizeProvider(payload,page);
  })();
  try {return new Response(JSON.stringify(await Promise.race([operation,stopped])),{headers:HEADERS});}
  catch(error) {const reason=['TIMEOUT','CANCELLED','NETWORK','PROVIDER_HTTP','PROVIDER_ERROR','BAD_RESPONSE'].includes(error.message)?error.message:'UNAVAILABLE';return fail(reason,reason==='TIMEOUT'?504:reason==='CANCELLED'?499:502,error.providerCode);}
  finally {clearTimeout(timer);request.signal.removeEventListener('abort',abortListener);controller.abort();}
 };
}
export const onRequest=createAddressSearchHandler();
