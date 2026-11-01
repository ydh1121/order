// Same-origin transport only. IME/debounce and DOM generations belong to the editor.
export const ADDRESS_SEARCH_PATH='/api/address/search';
const MAX_PAGE=20,MAX_ENTRIES=20,MAX_BYTES=65536;
const cleanQuery=value=>typeof value==='string'?value.trim().replace(/ +/g,' '):'';
const blank=(status,reason)=>({version:1,status,reason,items:[],page:1,total:0,hasMore:false});
const clone=value=>JSON.parse(JSON.stringify(value));
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function validItem(item){return plain(item)&&Object.keys(item).every(k=>['road','postal','jibun','region','providerId','addressProvider'].includes(k))&&typeof item.road==='string'&&item.road.trim().length>0&&item.road.length<=512&&typeof item.postal==='string'&&/^\d{5}$/.test(item.postal)&&typeof item.providerId==='string'&&/^\d{25}$/.test(item.providerId)&&item.addressProvider==='JUSO'&&['jibun','region'].every(k=>typeof item[k]==='string'&&item[k].length<=512)&&[item.road,item.jibun,item.region].every(v=>!/[\u0000-\u001f\u007f]/u.test(v));}
function checkedResult(value,page){
 if(!plain(value)||value.version!==1||!['OK','EMPTY'].includes(value.status)||value.page!==page||!Number.isSafeInteger(value.total)||value.total<0||value.total>10000000||typeof value.hasMore!=='boolean'||!Array.isArray(value.items)||value.items.length>10||value.items.length>value.total||!value.items.every(validItem)||new Set(value.items.map(i=>i.providerId)).size!==value.items.length)throw Error('BAD_RESPONSE');
 if((value.status==='OK')!==(value.items.length>0)||value.hasMore!==(page<MAX_PAGE&&page*10<value.total))throw Error('BAD_RESPONSE');
 return {version:1,status:value.status,reason:value.status==='OK'?'RESULTS':'NO_RESULTS',items:value.items.map(clone),page,total:value.total,hasMore:value.hasMore};
}
async function readJson(response){
 if(Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('BAD_RESPONSE');
 if(!/\bapplication\/(?:[\w.+-]*\+)?json\b/i.test(response.headers.get('content-type')||''))throw Error('BAD_RESPONSE');
 const reader=response.body?.getReader();if(!reader)throw Error('BAD_RESPONSE');
 const decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_BYTES)throw Error('BAD_RESPONSE');text+=decoder.decode(value,{stream:true});}return JSON.parse(text+decoder.decode());}
 finally {await reader.cancel().catch(()=>{});}
}
export function createAddressSearchService({fetcher=globalThis.fetch,origin=globalThis.location?.origin,now=()=>Date.now(),timeoutMs=7000,cacheTtlMs=30000}={}){
 let endpoint=null;try {const value=new URL(origin);if(['https:','http:'].includes(value.protocol))endpoint=new URL(ADDRESS_SEARCH_PATH,value.origin).href;}catch{}
 const pending=new Map(),cache=new Map();let closed=false;
 const counts={requests:0,coalesced:0,cacheHits:0,cancelledConsumers:0,timeouts:0};
 function start(key,query,page){
  const controller=new AbortController();const entry={controller,consumers:new Set(),done:false,promise:null,stop:null};let timer;
  const stopped=new Promise(resolve=>{entry.stop=()=>{controller.abort();resolve(blank('ABORTED','CANCELLED'));};timer=setTimeout(()=>{counts.timeouts++;controller.abort();resolve(blank('UNAVAILABLE','TIMEOUT'));},timeoutMs);});
  counts.requests++;
  const operation=(async()=>{
   try {
    const response=await fetcher(endpoint,{method:'POST',mode:'same-origin',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({query,page}),signal:controller.signal});
    let value;try {value=await readJson(response);}catch{throw Error('BAD_RESPONSE');}
    if(!response.ok){const known=['NOT_CONFIGURED','TIMEOUT','NETWORK','PROVIDER_HTTP','PROVIDER_ERROR','BAD_RESPONSE','ORIGIN_REJECTED','INVALID_REQUEST','CANCELLED'];return blank(response.status===400?'INVALID_REQUEST':'UNAVAILABLE',known.includes(value.reason)?value.reason:'HTTP_ERROR');}
    return checkedResult(value,page);
   }catch(error){return blank('UNAVAILABLE',error.message==='BAD_RESPONSE'?'BAD_RESPONSE':'NETWORK');}
  })();
  entry.promise=Promise.race([operation,stopped]).then(value=>{
   clearTimeout(timer);entry.done=true;
   if(pending.get(key)===entry)pending.delete(key);
   // Aborted/no-consumer work cannot populate a cache or revive a closed editor.
   if(!closed&&!controller.signal.aborted&&entry.consumers.size&&['OK','EMPTY'].includes(value.status)&&cacheTtlMs>0){
    cache.set(key,{expires:now()+Math.min(cacheTtlMs,30000),value:clone(value)});
    while(cache.size>MAX_ENTRIES)cache.delete(cache.keys().next().value);
   }
   controller.abort();return value;
  });
  pending.set(key,entry);return entry;
 }
 function search(raw,{page=1,signal}={}){
  if(closed||signal?.aborted)return Promise.resolve(blank('ABORTED','CANCELLED'));
  const query=cleanQuery(raw);
  if(typeof raw!=='string'||raw.length>80||query.length<2||[...query].reduce((n,c)=>n+(c.charCodeAt(0)>127?2:1),0)>80||/[\u0000-\u001f\u007f]/u.test(raw)||!Number.isInteger(page)||page<1||page>MAX_PAGE)return Promise.resolve(blank('INVALID_REQUEST','INVALID_REQUEST'));
  if(!endpoint)return Promise.resolve(blank('UNAVAILABLE','UNSUPPORTED_ORIGIN'));
  const key=JSON.stringify([query,page]),stored=cache.get(key);
  if(stored&&stored.expires>now()){counts.cacheHits++;return Promise.resolve(clone(stored.value));}
  cache.delete(key);let entry=pending.get(key);
  if(entry&&!entry.controller.signal.aborted)counts.coalesced++;else entry=start(key,query,page);
  return new Promise(resolve=>{
   let settled=false;const consumer={cancel:()=>finish(blank('ABORTED','CANCELLED'),true)};
   const finish=(value,cancelled=false)=>{
    if(settled)return;settled=true;entry.consumers.delete(consumer);signal?.removeEventListener('abort',consumer.cancel);
    if(cancelled){counts.cancelledConsumers++;if(!entry.done&&!entry.consumers.size){entry.stop();if(pending.get(key)===entry)pending.delete(key);}}
    resolve(clone(value));
   };
   entry.consumers.add(consumer);signal?.addEventListener('abort',consumer.cancel,{once:true});
   if(signal?.aborted)consumer.cancel();else entry.promise.then(value=>finish(value));
  });
 }
 function cancel(){for(const entry of pending.values())for(const consumer of [...entry.consumers])consumer.cancel();}
 function close(){cancel();closed=true;cache.clear();}
 return Object.freeze({search,cancel,close,clearCache:()=>cache.clear(),inspect:()=>({...counts,pending:pending.size,cached:cache.size,closed})});
}
