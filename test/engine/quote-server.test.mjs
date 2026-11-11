import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuoteServerProvider} from '../../src/engine/adapters/quote-server.mjs';
import {catalog,priceBook,rules,oneSite,asOf} from '../fixtures/engine/calculation-data.mjs';
const request=()=>({requestId:'public-request',inputRevision:1,input:structuredClone(oneSite)});
const source=()=>structuredClone({catalog,priceBook,rules});
const options=()=>({authorizeSites:async()=>true,loadApprovedSource:async()=>source(),verifyApproval:async()=>true,clock:()=>Date.parse(asOf)});
test('server dependency absence fails closed without guessing an approved source',async()=>{
  const dto=await createQuoteServerProvider().query(request());assert.equal(dto.status,'UNAVAILABLE');assert.deepEqual(dto.reasonCodes,['APPROVED_SOURCE_NOT_CONNECTED']);assert.deepEqual(dto.quotes,[]);
});
test('site authorization covers all sites and blocks source reads before unauthorized access',async()=>{
  let loaded=0,seen;const provider=createQuoteServerProvider({...options(),authorizeSites:async({siteIds})=>{seen=siteIds;return false;},loadApprovedSource:async()=>{loaded++;return source();}});
  const query=request();query.input.lines.push({...query.input.lines[0],id:'other',siteId:'not-owned'});
  const dto=await provider.query(query);assert.deepEqual(seen,['fixture-site-a','not-owned']);assert.equal(loaded,0);assert.deepEqual(dto.reasonCodes,['SITE_NOT_AUTHORIZED']);
});
test('approved-looking metadata is insufficient when trusted approval owner denies',async()=>{
  const dto=await createQuoteServerProvider({...options(),verifyApproval:async()=>false}).query(request());assert.equal(dto.status,'UNAVAILABLE');assert.deepEqual(dto.reasonCodes,['SOURCE_APPROVAL_REQUIRED']);
});
test('caller cannot inject pricebook rules current time provider route approval or comparison context',async()=>{
  let received;const opts=options();opts.loadApprovedSource=async args=>{received=args;return source();};
  const query=request();Object.assign(query.input,{asOf:'2099-01-01T00:00:00.000Z',priceBook:{key:'PRIVATE'},rules:{shipping:'PRIVATE'},providerUrl:'https://untrusted.invalid',comparisonContext:{source:{id:'PRIVATE'}},approved:true});
  const dto=await createQuoteServerProvider(opts).query(query);assert.equal(dto.status,'OK');assert.equal(dto.quotes[0].total.decimal,'20.50');assert.equal(dto.quotes[0].comparison,null);
  for(const field of ['asOf','priceBook','rules','providerUrl','comparisonContext','approved'])assert.equal(Object.hasOwn(received.input,field),false);
  for(const secret of ['PRIVATE','fixture-egg-price','approvalId','approvedBy','replay','priceBook','catalog'])assert.equal(JSON.stringify(dto).includes(secret),false);
});
test('server calculator still enforces per-offer site restriction despite outer site authorization',async()=>{
  const value=source();value.priceBook.offers[0].siteIds=['someone-else'];
  const dto=await createQuoteServerProvider({...options(),loadApprovedSource:async()=>value}).query(request());assert.equal(dto.status,'UNAVAILABLE');assert.deepEqual(dto.reasonCodes,['PRICE_UNAVAILABLE']);
});
test('provider exceptions produce a minimal failure without secret details or successful empty claims',async()=>{
  const dto=await createQuoteServerProvider({...options(),loadApprovedSource:async()=>{throw new Error('PRIVATE_PROVIDER_KEY=secret');}}).query(request());
  assert.equal(dto.status,'FAILED');assert.deepEqual(dto.reasonCodes,['SOURCE_UNAVAILABLE']);assert.equal(JSON.stringify(dto).includes('PRIVATE'),false);
});
test('aborted requests cannot proceed from authorization to source lookup',async()=>{
  let loaded=0;const controller=new AbortController();controller.abort();const query={...request(),signal:controller.signal};
  const dto=await createQuoteServerProvider({...options(),loadApprovedSource:async()=>{loaded++;return source();}}).query(query);assert.equal(loaded,0);assert.equal(dto.status,'UNAVAILABLE');
});
test('declared period cadence and delivery conditions survive server projection and cannot fall back over a mismatch',async()=>{
  for(const [field,constraint] of [['periodId','periodIds'],['cadenceId','cadenceIds'],['deliveryTermsId','deliveryTermsIds']]){
    const value=source();value.priceBook.offers[0][constraint]=['approved-condition'];
    value.comparisonContext={proposed:{[field]:'approved-condition'}};
    const query=request();query.input.lines[0][field]='different-condition';
    const dto=await createQuoteServerProvider({...options(),loadApprovedSource:async()=>value}).query(query);
    assert.equal(dto.status,'UNAVAILABLE',field);assert.deepEqual(dto.reasonCodes,['PRICE_UNAVAILABLE']);
  }
});
