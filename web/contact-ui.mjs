import {createOrderPhoneAdapter} from '../src/engine/adapters/phone-browser.mjs';
import {ENGINE_VERSION,CONTRACT_VERSION} from '../src/engine/contracts/result.mjs';
import {validateEmailSyntax} from '../src/engine/validation/email.mjs';
import {browserDomainToASCII} from '../src/engine/adapters/dns-browser.mjs';
import {createBrowserIanaProvider,browserIanaFreshness} from '../src/engine/adapters/iana-browser.mjs';
import {createBrowserEmailService} from '../src/engine/adapters/email-browser.mjs';

window.OrderPhone=createOrderPhoneAdapter();
window.OrderEmail=Object.freeze((()=>{
 const LOCAL=/^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~.]*$/;
 const DOMAIN=/^[\p{L}\p{Nd}\p{M}.\-]*$/u;
 const domainCharacters=domain=>DOMAIN.test(domain)&&![...domain].some(c=>/\p{Nd}/u.test(c)&&c.normalize('NFKC')!==c);
 // Editing restrictions preserve the accepted UX input behavior; final semantics
 // come solely from the shared parser. Reference/DNS uncertainty is not syntax.
 function editAllowed(value){const raw=String(value??''),at=raw.indexOf('@');if(/[\s\u0000-\u001f\u007f]/u.test(raw)||at!==raw.lastIndexOf('@'))return false;
  const local=at<0?raw:raw.slice(0,at),domain=at<0?'':raw.slice(at+1);return LOCAL.test(local)&&domainCharacters(domain);
 }
 function parse(value){
  const raw=String(value??''),contract=validateEmailSyntax({raw},{domainToASCII:browserDomainToASCII,tldData:null,nowMs:Date.now()});
  const valid=!!contract.normalized&&['VALID','UNKNOWN'].includes(contract.status),reason=contract.reasonCodes[0];
  return {valid,raw,localPart:contract.normalized?.local??raw.split('@')[0]??'',displayDomain:raw.split('@')[1]??'',domain:contract.normalized?.domain??'',
   tld:contract.normalized?.domain.split('.').at(-1),mailboxVerified:false,requiresSMTPUTF8:reason==='SMTPUTF8_UNSUPPORTED',
   supportedProfile:'ASCII_DOT_ATOM_LOCAL_IDNA_DOMAIN',reason:valid?null:reason,unsupported:contract.status==='UNSUPPORTED',contract};
 }
 const known=['naver.com','gmail.com','daum.net','hanmail.net','kakao.com','nate.com','outlook.com','icloud.com'];
 function suggestions(value){const raw=String(value),at=raw.lastIndexOf('@');if(at<1||raw.indexOf('@')!==at||!editAllowed(raw))return [];const local=raw.slice(0,at),term=raw.slice(at+1).toLowerCase();return known.filter(d=>d.startsWith(term)&&d!==term).slice(0,6).map(d=>local+'@'+d);}
 return {parse,editAllowed,suggestions,profile:'ASCII_DOT_ATOM_LOCAL_IDNA_DOMAIN',SMTPUTF8:'NOT_SUPPORTED'};
})());

window.OrderEmailDomain=Object.freeze((()=>{
 const policyVersion='ORDER_EMAIL_DOMAIN_ASTRA_MSG0504_1.0.0',listeners=new Set(),proofs=new Map(),pending=new Map();
 const success=new Set(['MX_ROUTE_FOUND','IMPLICIT_ROUTE_CANDIDATE']),hard=new Set(['INVALID_TLD','DOMAIN_NOT_FOUND','MAIL_DISABLED','NO_MAIL_ROUTE']);
 let generation=0,requestSequence=0,currentSnapshot=null;
 const snapshotMetadata={version:null,sourceSha256:null,collectedAt:null,status:'UNAVAILABLE'};
 const metadata={policyVersion,resolver:'https://cloudflare-dns.com/dns-query',snapshot:snapshotMetadata,mailboxVerified:false,engine:ENGINE_VERSION,contract:CONTRACT_VERSION};
 const publish=domain=>{for(const listener of listeners)listener(domain);};
 const result=(state,reason,extra={})=>({state,reason,checkedAt:new Date().toISOString(),ttl:0,expiresAt:0,source:metadata.resolver,policyVersion,mailboxVerified:false,...extra});
 const reference=createBrowserIanaProvider({origin:location.origin,allowLocalOrigin:true});
 const referenceProvider={async get(options){currentSnapshot=await reference.get(options);Object.assign(snapshotMetadata,{version:currentSnapshot?.version??null,sourceSha256:currentSnapshot?.sourceSha256??null,collectedAt:currentSnapshot?.collectedAt??null,status:browserIanaFreshness(currentSnapshot,Date.now()).state});return currentSnapshot;}};
 const service=createBrowserEmailService({referenceProvider});
 const referenceExpiry=()=>currentSnapshot?Math.min(Date.parse(currentSnapshot.collectedAt),Date.parse(currentSnapshot.sourceUpdatedAt))+currentSnapshot.maxAgeMs:0;
 function project(packet,domain){
  const engine=packet.result,code=engine.reasonCodes[0];let state='UNKNOWN';
  if(engine.status==='VALID')state=code==='DNS_IMPLICIT_MX_ADDRESS'?'IMPLICIT_ROUTE_CANDIDATE':'MX_ROUTE_FOUND';
  else if(engine.status==='UNSUPPORTED')state='UNSUPPORTED_LOCAL';
  else if(engine.status==='INVALID')state=({TLD_NOT_DELEGATED:'INVALID_TLD',DNS_NXDOMAIN:'DOMAIN_NOT_FOUND',DNS_NULL_MX:'MAIL_DISABLED',DNS_ALL_ROUTES_ABSENT:'NO_MAIL_ROUTE'})[code]??'INVALID_SYNTAX';
  const dnsExpiry=packet.dns?.evidence.validUntil;
  const expiresAt=code==='TLD_NOT_DELEGATED'?referenceExpiry():Number.isFinite(dnsExpiry)?Math.min(dnsExpiry,referenceExpiry()):0;
  // Existing synchronous parent/save consumers need a reusable current proof.
  // Keep current-query-only DNS evidence, but never invent a cache TTL for it.
  const currentOnly=(success.has(state)||hard.has(state))&&!(expiresAt>Date.now());
  return result(currentOnly?'UNKNOWN':state,currentOnly?'DNS_CURRENT_OBSERVATION_ONLY':code,{normalizedDomain:domain,expiresAt,ttl:expiresAt?Math.max(0,(expiresAt-Date.now())/1000):0,
   reusable:expiresAt>Date.now(),engineResult:engine,syntaxContract:packet.syntax,domainContract:packet.dns});
 }
 function peek(domain){
  const cached=proofs.get(domain),checking=pending.get(domain)?.size>0;
  if(cached&&browserIanaFreshness(currentSnapshot,Date.now()).state!=='FRESH')return result('UNKNOWN','REFERENCE_REFRESH_REQUIRED',{normalizedDomain:domain,engineResult:cached.engineResult});
  if(cached&&cached.expiresAt>Date.now())return cached;
  if(checking)return result('CHECKING','checking',{normalizedDomain:domain});
  if(cached&&cached.state==='UNKNOWN')return cached;
  if(cached)proofs.delete(domain);
  return result('UNCHECKED','not_checked',{normalizedDomain:domain});
 }
 async function validate(domain,{signal,force=false}={}){
  domain=String(domain??'');const parsed=window.OrderEmail.parse('validation@'+domain);
  if(!parsed.valid||parsed.domain!==domain)return result('INVALID_SYNTAX','invalid_domain');
  if(signal?.aborted)return result('UNKNOWN','cancelled',{normalizedDomain:domain});
  const old=peek(domain);if(!force&&old.expiresAt>Date.now())return old;
  if(force&&!pending.get(domain)?.size)service.invalidateDomain(domain);
  const fieldId='domain-check-'+(++requestSequence),epoch=generation,consumers=pending.get(domain)??new Set();consumers.add(fieldId);pending.set(domain,consumers);
  const abort=()=>service.cancel(fieldId);signal?.addEventListener('abort',abort,{once:true});
  try{
   const packet=await service.validate(fieldId,'validation@'+domain);
   if(signal?.aborted||epoch!==generation||!packet.apply)return result('UNKNOWN','cancelled',{normalizedDomain:domain});
   const proof=project(packet,domain);
   if(proofs.size>=128&&!proofs.has(domain))proofs.delete(proofs.keys().next().value);
   proofs.set(domain,proof);consumers.delete(fieldId);if(!consumers.size&&pending.get(domain)===consumers)pending.delete(domain);
   publish(domain);return proof;
  }catch{return result('UNKNOWN','validation_unavailable',{normalizedDomain:domain});}
  finally{signal?.removeEventListener('abort',abort);service.cancel(fieldId);consumers.delete(fieldId);if(!consumers.size&&pending.get(domain)===consumers)pending.delete(domain);}
 }
 function status(email){const parsed=window.OrderEmail.parse(email);return !parsed.valid?result(parsed.unsupported?'UNSUPPORTED_LOCAL':'INVALID_SYNTAX',parsed.reason):peek(parsed.domain);}
 function clearCache(){generation++;service.clear();proofs.clear();pending.clear();}
 // Read-only diagnostics contain counts and reference status only. Never expose
 // email/local-part/domain values, consumer IDs, or retained proof payloads.
 async function inspect(){const ref=await reference.inspect(),states={};for(const proof of proofs.values())states[proof.state]=(states[proof.state]||0)+1;
  return {reference:{...ref,lastError:typeof ref.lastError==='string'&&/^[A-Z0-9_:]+$/.test(ref.lastError)?ref.lastError:ref.lastError?'REFERENCE_FAILURE':null},service:service.inspect(),proofStates:states,pendingDomains:pending.size,pendingConsumers:[...pending.values()].reduce((n,items)=>n+items.size,0),startedRequests:requestSequence};
 }
 return {metadata,validate,status,peek,inspect,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},isSuccess:r=>success.has(r?.state),isHard:r=>hard.has(r?.state),clearCache};
})());

window.OrderEmailUI=Object.freeze((()=>{
 const owners=new WeakMap();
 function mount(input){if(owners.has(input))return owners.get(input);input.type='text';input.inputMode='email';input.autocomplete='email';input.setAttribute('spellcheck','false');input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
 const wrap=document.createElement('div');wrap.className='ui-email-field';input.replaceWith(wrap);wrap.append(input);const list=document.createElement('div');list.id=input.id+'-suggestions';list.className='ui-email-suggestions';list.setAttribute('role','listbox');list.hidden=true;wrap.append(list);input.setAttribute('aria-controls',list.id);
 const status=document.createElement('span');status.className='ui-feedback-sr';status.setAttribute('role','status');status.setAttribute('aria-live','polite');wrap.append(status);
 let index=-1,sequence=0,timer=null,controller=null,composing=false,compositionMark=null,active=true,inflight=null,lastGood=input.value;
 let mark={start:0,end:0,direction:'none'},history=[input.value],historyAt=0;
 const capture=()=>{if(!composing)mark={start:input.selectionStart||0,end:input.selectionEnd||0,direction:input.selectionDirection||'none'};return {...mark};};
 const restore=(m=mark)=>{input.value=lastGood;input.setSelectionRange(Math.min(m.start,lastGood.length),Math.min(m.end,lastGood.length),m.direction||'none');mark={...m};};
 function remember(){if(history[historyAt]===lastGood)return;history=history.slice(0,historyAt+1);history.push(lastGood);if(history.length>100)history.shift();historyAt=history.length-1;}
 function close(){list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');index=-1;}
 function suggest(){const choices=OrderEmail.suggestions(input.value);list.replaceChildren(...choices.map((value,i)=>{const b=document.createElement('button');b.type='button';b.id=list.id+'-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected','false');b.textContent=value;b.dataset.emailSuggestion=value;return b;}));list.hidden=!choices.length;input.setAttribute('aria-expanded',String(choices.length>0));index=-1;}
 function paintStatus(){const parsed=OrderEmail.parse(input.value),state=input.dataset.domainState;input.setAttribute('aria-busy',String(state==='CHECKING'));status.textContent=!parsed.valid?'':state==='CHECKING'?'입력 내용을 확인하고 있습니다.':OrderEmailDomain.isSuccess({state})?'입력 내용을 확인했습니다.':OrderEmailDomain.isHard({state})?'이메일 주소를 확인해 주세요.':'현재 확인할 수 없습니다.';}
 function emit(){paintStatus();input.dispatchEvent(new CustomEvent('order-email-state',{bubbles:true,detail:{value:input.value,state:input.dataset.domainState,proof:OrderEmailDomain.status(input.value)}}));}
 function cancelRequest(){clearTimeout(timer);timer=null;controller?.abort();controller=null;sequence++;inflight=null;}
 async function check(force=false){clearTimeout(timer);timer=null;const value=input.value,parsed=OrderEmail.parse(value);if(!active)return {state:'UNKNOWN',reason:'editor_closed'};if(inflight?.value===value)return inflight.promise;
  cancelRequest();const my=sequence;if(!parsed.valid){input.dataset.domainState=parsed.unsupported?'UNSUPPORTED_LOCAL':'INVALID_SYNTAX';emit();return {state:input.dataset.domainState,reason:parsed.reason};}
  const old=OrderEmailDomain.status(value);if(!force&&old.state!=='UNCHECKED'&&old.state!=='UNKNOWN'&&old.state!=='CHECKING'){input.dataset.domainState=old.state;emit();return old;}
  controller=new AbortController();input.dataset.domainState='CHECKING';emit();const task=OrderEmailDomain.validate(parsed.domain,{signal:controller.signal,force:force||old.state==='UNKNOWN'}).then(r=>{if(my!==sequence||!active||input.value!==value)return {...r,discarded:true};input.dataset.domainState=r.state;emit();return r;}).finally(()=>{if(inflight?.promise===task)inflight=null;});inflight={value,promise:task};return task;
 }
 function changed({record=true}={}){cancelRequest();lastGood=input.value;if(record)remember();capture();input.dataset.domainState=OrderEmail.parse(input.value).valid?OrderEmailDomain.status(input.value).state:'UNCHECKED';suggest();emit();if(active&&!composing&&OrderEmail.parse(input.value).valid&&input.dataset.domainState==='UNCHECKED')timer=setTimeout(()=>check(),650);}
 function acceptedValue(value,m=mark){if(!OrderEmail.editAllowed(value)){restore(m);return false;}if(value!==lastGood){input.value=value;changed();}else capture();return true;}
 function insert(text){const m=capture(),next=input.value.slice(0,m.start)+String(text)+input.value.slice(m.end);if(!OrderEmail.editAllowed(next)){restore(m);return false;}input.setRangeText(String(text),m.start,m.end,'end');changed();return true;}
 input.addEventListener('beforeinput',e=>{const m=composing?compositionMark:capture();if(e.inputType?.startsWith('insert')&&e.data!==null){const next=lastGood.slice(0,m.start)+e.data+lastGood.slice(m.end);if(!OrderEmail.editAllowed(next)&&e.cancelable){e.preventDefault();restore(m);}}});
 for(const name of ['paste','drop'])input.addEventListener(name,e=>{e.preventDefault();insert((name==='paste'?e.clipboardData:e.dataTransfer)?.getData('text/plain')??'');});
 input.addEventListener('dragover',e=>e.preventDefault());
 input.addEventListener('input',()=>{if(composing){if(!OrderEmail.editAllowed(input.value))restore(compositionMark);return;}acceptedValue(input.value);});
 input.addEventListener('compositionstart',()=>{compositionMark=capture();composing=true;cancelRequest();});
 input.addEventListener('compositionend',()=>{composing=false;acceptedValue(input.value,compositionMark||mark);compositionMark=null;});
 input.addEventListener('blur',()=>{if(composing){composing=false;acceptedValue(input.value,compositionMark||mark);compositionMark=null;}setTimeout(close,120);if(active&&OrderEmail.parse(input.value).valid)check();});
 for(const name of ['select','focus','keyup','pointerup'])input.addEventListener(name,capture);
 list.addEventListener('pointerdown',e=>e.preventDefault());list.addEventListener('click',e=>{const b=e.target.closest('[data-email-suggestion]');if(!b)return;input.value=b.dataset.emailSuggestion;changed();close();input.focus({preventScroll:true});check();});
 input.addEventListener('keydown',e=>{if(e.isComposing)return;capture();if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();const next=historyAt+(e.key.toLowerCase()==='y'||e.shiftKey?1:-1);if(next>=0&&next<history.length){historyAt=next;input.value=history[next];changed({record:false});input.setSelectionRange(input.value.length,input.value.length);capture();}return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){if(list.hidden)suggest();const options=[...list.children];if(options.length){e.preventDefault();index=(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;options.forEach((o,i)=>o.setAttribute('aria-selected',String(i===index)));input.setAttribute('aria-activedescendant',options[index].id);options[index].scrollIntoView({block:'nearest'});}}else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(!list.hidden&&index>=0)list.children[index].click();else check();}else if(e.key==='Escape'&&!list.hidden){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Tab')close();});
 OrderEmailDomain.subscribe(domain=>{if(!active||!input.closest('dialog')?.open||OrderEmail.parse(input.value).domain!==domain)return;input.dataset.domainState=OrderEmailDomain.status(input.value).state;emit();});
 const api={check,close,cancel(){active=false;cancelRequest();close();},reset(value){this.cancel();active=true;composing=false;compositionMark=null;input.value=String(value??'');lastGood=input.value;history=[lastGood];historyAt=0;capture();input.dataset.domainState=OrderEmailDomain.status(value).state;paintStatus();if(OrderEmail.parse(value).valid&&!OrderEmailDomain.isSuccess(OrderEmailDomain.status(value)))timer=setTimeout(()=>check(),0);},get pending(){return !!inflight;}};owners.set(input,api);return api;
 }
 return {mount,instance:input=>owners.get(input)};
})());
