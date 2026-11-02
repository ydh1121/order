import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parse} from 'acorn';
import {validMonthlyQuantity,monthlyPlanSnapshot} from '../../web/quantity-contract.mjs';
import {inspectStoredOrderQuantity} from '../../web/q4-planning.mjs';
import {inspectMonthlyAllocations,inspectOnceAllocations} from '../../web/allocation-ui.mjs';
import {addressStatus} from '../../web/address-contract.mjs';

// Production owners are evaluated with controlled DOM/DNS/storage doubles.
// These checks do not claim browser layout, real DNS, OS or user acceptance.
const app=await readFile(new URL('../../web/app.mjs',import.meta.url),'utf8');
const common=await readFile(new URL('../../web/common-ui.mjs',import.meta.url),'utf8');
const html=await readFile(new URL('../../web/index.html',import.meta.url),'utf8');
function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const v of Object.values(node))for(const child of Array.isArray(v)?v:[v]){const found=find(child,predicate);if(found)return found;}return null;}
function extract(source,predicate){const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),node=find(ast,predicate);assert.ok(node);return source.slice(node.start,node.end);}
const fn=name=>extract(app,n=>n.type==='FunctionDeclaration'&&n.id.name===name);
const variable=(source,name)=>extract(source,n=>n.type==='VariableDeclaration'&&n.declarations.some(d=>d.id.name===name));
const assignment=name=>extract(common,n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'&&n.expression.left.property.name===name);
function fakeNode(children=[]){const attrs=new Map(),classes=new Set();return {attrs,children,offsetWidth:1,previousElementSibling:null,
 querySelectorAll:()=>children,closest:()=>null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),
 classList:{add:k=>classes.add(k),remove:k=>classes.delete(k)},addEventListener(){}};}

test('F01 initial and active selection remain neutral; explicit missing groups retain accessible field-owned errors',()=>{
 const groups=new Map(['housing','size','pack'].map(key=>{const node=fakeNode([fakeNode(),fakeNode()]);node.previousElementSibling=fakeNode();return ['picks-'+key,node];}));
 const editing={housing:'',size:'',pack:''};
 const paint=vm.runInNewContext(fn('legacyErrorState')+';legacyErrorState',{editing,$:id=>groups.get(id),document:{querySelectorAll:()=>[...groups.values()]},matchMedia:()=>({matches:true})});
 paint('err-q1','');
 for(const group of groups.values()){assert.equal(group.attrs.has('aria-invalid'),false);assert.equal(group.previousElementSibling.attrs.size,0);}
 paint('err-q1','난각번호·계란 크기·포장을 모두 선택해 주세요.');
 for(const group of groups.values()){assert.equal(group.attrs.get('aria-invalid'),'true');assert.equal(group.previousElementSibling.attrs.get('data-order-invalid'),'true');for(const button of group.children){assert.equal(button.attrs.get('aria-invalid'),'true');assert.equal(button.attrs.get('aria-describedby'),'err-q1');}}
 for(const key of ['housing','size','pack']){editing[key]='selected';paint('err-q1','난각번호·계란 크기·포장을 모두 선택해 주세요.');const group=groups.get('picks-'+key);assert.equal(group.attrs.has('aria-invalid'),false);assert.equal(group.previousElementSibling.attrs.has('data-order-invalid'),false);for(const button of group.children)assert.equal(button.attrs.has('aria-invalid'),false);}
 paint('err-q1','');for(const group of groups.values())assert.equal(group.attrs.size,0);
});

test('F05 shared comparison keeps labeled current→after semantics, escaping, and unique targets at 1/9/10/20 sites',()=>{
 const context={window:{},OrderIcons:{svg:()=>'<svg></svg>'}};
 vm.runInNewContext(assignment('OrderCopyDialog'),context);
 for(const count of [1,9,10,20]){
  const patches=Array.from({length:count},(_,i)=>({id:'S'+i,name:'한글 사업장 '+i,changes:[{label:'이메일',before:i%2?'a'.repeat(64)+'@example.com':'',after:'new@example.com<&>'}]}));
  const rendered=context.window.OrderCopyDialog.renderReview(patches,{prefix:'contacts'});
  assert.equal((rendered.match(/class="ui-copy-review-site"/g)||[]).length,count);
  assert.equal((rendered.match(/>현재<\/dt>/g)||[]).length,count);
  assert.equal((rendered.match(/>변경 후<\/dt>/g)||[]).length,count);
  assert.equal((rendered.match(/class="ui-copy-review-direction" aria-hidden="true"/g)||[]).length,count);
  assert.ok(rendered.includes('new@example.com&lt;&amp;&gt;'));
  assert.ok(rendered.includes('>미입력</dd>'));
  const ids=[...rendered.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const match of rendered.matchAll(/aria-labelledby="([^"]+)"/g))for(const ref of match[1].split(' '))assert.ok(ids.includes(ref),'Every accessible label exists: '+ref);
  assert.ok(rendered.indexOf('data-copy-value="before"')<rendered.indexOf('ui-copy-review-direction'));
  assert.ok(rendered.indexOf('ui-copy-review-direction')<rendered.indexOf('data-copy-value="after"'));
 }
});

function draftHarness({missingContact=false,unknownEmail=false,address=null}={}){
 const state={lines:[{id:'L',housing:'1',size:'대란',pack:'30',qty:'200',qtyUnit:'each',price:'10000'}],locations:[{id:'A',name:'사업장 A',road:'',contactPhone:'01023456789',email:'test@example.com',storePhone:''}],allocations:[{id:'AL',lineId:'L',locationId:'A',mode:'FLEX',modeExplicit:true,qty:'2',monthlyDemandQty:'200',monthlyDemandUnit:'each',advanced:{contactChannels:['phone'],flexOrderProcess:'store'}}]};
 if(missingContact)state.locations[0].contactPhone='';
 if(address)Object.assign(state.locations[0],address);
 const nodes=new Map();let writes=0;
 const context=vm.createContext({S:structuredClone(state),validMonthlyQuantity,monthlyPlanSnapshot,inspectStoredOrderQuantity,inspectMonthlyAllocations,inspectOnceAllocations,addressStatus,structuredClone,JSON,
  window:{OrderDatePolicy:{validate:()=>({valid:true})}},
  OrderPhone:{parse:value=>({valid:/^0\d{9,10}$/.test(value||'')})},OrderEmail:{parse:value=>({valid:/^[^@]+@[^@]+\.[^@]+$/.test(value||'')})},
  OrderEmailDomain:{status:()=>({state:unknownEmail?'UNKNOWN':'VALID'}),isHard:()=>false,isSuccess:proof=>proof.state==='VALID'},
  $:id=>{if(!nodes.has(id))nodes.set(id,{open:true,textContent:'',classList:{contains:()=>false}});return nodes.get(id);},
  q4ValidAmount:value=>/^\d+$/.test(String(value))&&Number(value)>0,valid:value=>Number(value)>0,
  OrderRepeatContract:{inspect:()=>({valid:true}),fromAllocation:a=>a},
  storageText:()=>'',itemIdentity:()=>'',unit:()=> '판',showQ1Modal(){},q4OnceConfirmDialog:{open:true,classList:{contains:()=>false}},
  persist:async(candidate,options)=>{if(!options.canCommit())return {ok:false,status:'CANCELLED'};writes++;context.S=structuredClone(candidate);return {ok:true,status:'COMMITTED'};}
 });
 vm.runInContext(`${assignment('OrderSiteContract')}\nconst OrderSiteContract=window.OrderSiteContract;\n${variable(common,'CODE1_ORDER_VALIDATION')}\n${['q4ReviewIssue','quantityBoundIssue','q4ReviewAllocationIssues','monthlyIssues','q4ReviewVerdict'].map(fn).join('\n')}\nconst lineById=id=>S.lines.find(l=>l.id===id);const locationById=id=>S.locations.find(l=>l.id===id);const siteValid=site=>OrderSiteContract.valid(site);\n${variable(app,'allocationValid')}\nconst q4ReviewClone=value=>structuredClone(value);let q4ReviewContext={lineId:'L',ids:['AL'],openingAllocations:structuredClone(S.allocations),signature:JSON.stringify([S.lines[0],S.allocations,S.locations])};let q4ReviewPending=null,q4ReviewCommitCount=0;const save=persist;\n${fn('q4ReviewCommit')}\nglobalThis.subject={commit:q4ReviewCommit,verdict:()=>q4ReviewVerdict(S),isAllocationComplete:()=>allocationValid(S.allocations[0]),patches:()=>structuredClone(S.allocations),changeSite(){S.locations[0].name='changed';},removeSite(){S.locations=[];},source:()=>structuredClone(S)};`,context);
 return {subject:context.subject,get writes(){return writes;}};
}

test('F06 production Q4 commit saves addressless stable-ID delivery draft while Q3/final/row completion remain blocked',async()=>{
 const h=draftHarness(),before=h.subject.source();
 assert.equal(h.subject.verdict().valid,false);
 assert.ok(h.subject.verdict().fieldErrors.some(issue=>issue.stage==='q3'&&issue.code==='ADDRESS_REQUIRED'));
 assert.equal(h.subject.isAllocationComplete(),false);
 const patches=h.subject.patches();patches[0].qty='3';
 assert.equal((await h.subject.commit(patches)).ok,true);assert.equal(h.writes,1);
 assert.equal(h.subject.source().allocations[0].qty,'3');assert.equal(h.subject.source().locations[0].road,'');
 assert.deepEqual(h.subject.source().locations,before.locations);
 assert.equal(h.subject.verdict().valid,false);assert.equal(h.subject.isAllocationComplete(),false);
});

test('F06 missing contacts and UNKNOWN proof remain strict final blockers while delivery draft edits are independent',async()=>{
 for(const kind of ['missing-contact','unknown-email']){
  const h=draftHarness({missingContact:kind==='missing-contact',unknownEmail:kind==='unknown-email',address:{road:'합성시 가상로 10',postal:'08843',providerId:'1'.repeat(25),addressProvider:'JUSO'}});
  // The final validator is not modified or replaced by the draft commit path.
  const initial=h.subject.verdict();assert.ok(initial.fieldErrors.some(issue=>issue.stage==='q3'&&(kind==='missing-contact'?issue.field.endsWith('contactPhone'):issue.code==='DOMAIN_UNCONFIRMED')));
  assert.equal((await h.subject.commit(h.subject.patches())).ok,true);assert.equal(h.subject.verdict().resultStatus,'BLOCK_REQUIRED');
 }
});

test('A11 production Q3/final gate distinguishes restored text from provider selection and keeps optional detail empty',()=>{
 const unverified=draftHarness({address:{road:'합성시 가상로 10',postal:'08843',providerId:'1'.repeat(25)}});
 assert.equal(unverified.subject.verdict().valid,false);
 assert.ok(unverified.subject.verdict().fieldErrors.some(issue=>issue.code==='ADDRESS_SELECTION_REQUIRED'));
 const verified=draftHarness({address:{road:'합성시 가상로 10',postal:'08843',providerId:'1'.repeat(25),addressProvider:'JUSO',detail:'',dropoff:''}});
 assert.equal(verified.subject.verdict().valid,true);
 assert.equal(verified.subject.isAllocationComplete(),true);
});

test('F06 assignment checkbox and next use stable identity, allowing addressless drafts without writes',()=>{
 const box={checked:false,disabled:true,removeAttribute(){},focus(){}},copy={textContent:''},action={dataset:{},setAttribute(){}};
 const row={dataset:{},querySelector:selector=>selector==='input'?box:selector==='.q4-check-copy'?copy:action};
 const options={dataset:{shape:'A'},querySelector:()=>row};
 const nodes={'q4-assignment-options':options,'q4-assignment-clear':{},'q4-assignment-next':{},'q4-assignment-dialog':{}};
 const site={id:'A',name:'주소 없는 초안',road:'',contactPhone:'',email:''};let opened=null,closed=0;
 const context=vm.createContext({S:{locations:[site],allocations:[]},CSS:{escape:value=>value},OrderIcons:{svg:()=>''},
  OrderSiteContract:{basicIssues:()=>[{key:'address'},{key:'contactPhone'}]},siteName:site=>site.name,
  $:id=>nodes[id],locationById:id=>id==='A'?site:null,blankAllocation:(lineId,locationId)=>({id:'AL',lineId,locationId,qty:''}),
  OrderModalShell:{close:(_dialog,options)=>{closed++;options.after();}},
  beginQ4Context:(...args)=>{opened=args;}
 });
 vm.runInContext(`let q4AssignmentDraft={lineId:'L',selected:['A'],originalIds:[],exposed:false,transitioning:false,controller:{abort(){}}};${fn('paintQ4Assignment')}
${extract(app,n=>n.type==='ExpressionStatement'&&n.expression.type==='AssignmentExpression'&&n.expression.left.type==='MemberExpression'&&n.expression.left.property.name==='onclick'&&n.expression.left.object.type==='CallExpression'&&n.expression.left.object.arguments[0]?.value==='q4-assignment-next')}
paintQ4Assignment();`,context);
 assert.equal(box.disabled,false);assert.equal(box.checked,true);assert.equal(row.dataset.error,'false');
 nodes['q4-assignment-next'].onclick();
 assert.equal(closed,1);assert.equal(opened[0],'L');assert.equal(opened[1][0].locationId,'A');assert.equal(opened[4],true);
 assert.equal(context.S.allocations.length,0,'Selection/next never confirms the staged allocation');
 assert.equal(context.S.locations[0].road,'','No synthetic address is inserted');
});

test('F06 delivery commit rejects invalid local quantity, reassigned identity, cancelled consumer and changed/deleted Q3 source',async()=>{
 for(const scenario of ['quantity','identity','cancel','changed','deleted']){
  const h=draftHarness(),patches=h.subject.patches();
  if(scenario==='quantity')patches[0].qty='';
  if(scenario==='identity')patches[0].locationId='B';
  if(scenario==='changed')h.subject.changeSite();
  if(scenario==='deleted')h.subject.removeSite();
  const result=await h.subject.commit(patches,null,()=>scenario!=='cancel');
  assert.equal(result.ok,false,scenario);assert.equal(h.writes,0,scenario);
 }
});

test('F08 customer title and address field retain labels without work-order or implementation prose',()=>{
 assert.match(html,/<title>order\.ooo<\/title>/);
 assert.doesNotMatch(html,/<title>[^<]*MSG/);
 assert.doesNotMatch(html,/소재지 검색은 아직 연결되지 않았습니다|q3-address-note/);
 assert.match(html,/<label for="q3-address-slot"[^>]*>사업장 소재지 <span class="ui-required"/);
 assert.match(html,/<button id="q3-address-slot"[^>]*aria-haspopup="dialog"[^>]*aria-controls="address-editor-dialog"[^>]*aria-label="소재지 검색"/);
 assert.equal(addressStatus({}).issue.message,'사업장 소재지를 입력해 주세요.');
});
