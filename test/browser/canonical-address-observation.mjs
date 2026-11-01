/** Read-only observation of the authorized canonical product endpoint. A provider
 * failure is evidence, not a synthetic PASS or proof that a secret is missing.
 * No candidate selection/parent save/user OS acceptance is asserted here. */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const evidence=resolve(process.env.ORDER_REWORK_EVIDENCE_DIR||join(root,'browser-evidence/rework'));
const origin='https://order-ooo.pages.dev';
const report={schemaVersion:1,classification:'ACTUAL_NODE_HTTPS_CANONICAL_SAME_ORIGIN_ADDRESS_ENDPOINT',observedAt:new Date().toISOString(),origin,status:'RUNNING',queryClass:'PUBLIC_CIVIC_ROAD_ADDRESS',request:{method:'POST',path:'/api/address/search',query:'세종대로 110',page:1},secretValueRead:false,providerSettingsVerified:false,candidateSelection:false,parentSave:false,restore:false,notCovered:['BROWSER_CORS','USER_OS','PROVIDER_DASHBOARD_SECRET','PREVIEW_NONE','USER_ACCEPTANCE']};
try{
 const identity=await fetch(origin+'/build-identity.json',{signal:AbortSignal.timeout(15000),headers:{'cache-control':'no-cache'}});const body=await identity.json();report.identity={httpStatus:identity.status,commitSha:body.commitSha??null,canonicalUrl:body.canonicalUrl??null};
 const response=await fetch(origin+'/api/address/search',{method:'POST',headers:{'content-type':'application/json','origin':origin},body:JSON.stringify({query:report.request.query,page:1}),signal:AbortSignal.timeout(15000)});report.httpStatus=response.status;let payload;try{payload=await response.json();}catch{report.status='OBSERVED_FAILURE';report.failure='NON_JSON_RESPONSE';}
 if(payload){const safe=value=>typeof value==='string'&&/^[A-Z0-9_-]{1,80}$/.test(value)?value:null;report.result={version:payload.version??null,status:safe(payload.status),reason:safe(payload.reason),providerCode:safe(payload.providerCode),candidateCount:Array.isArray(payload.items)?payload.items.length:null};report.status=response.ok&&payload.status==='OK'&&Array.isArray(payload.items)&&payload.items.length?'OBSERVED_CANDIDATES_NOT_END_TO_END_ACCEPTED':payload.status==='EMPTY'?'OBSERVED_EMPTY_RESULT':'OBSERVED_FAILURE';}
}catch(error){report.status='OBSERVATION_UNAVAILABLE';report.failure=error?.name==='TimeoutError'?'TIMEOUT':error?.name==='AbortError'?'ABORTED':'HTTPS_REQUEST_FAILED';}
await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'canonical-address-observation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
