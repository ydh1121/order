import test from 'node:test';
import assert from 'node:assert/strict';
import {REGION_REFERENCE,REGION_REFERENCE_VERSION,listRegionRoots,listRegionLeaves,filterRegionOptions,regionSelection,projectRegionSelection,inspectRegionSelection} from '../../web/region-reference.mjs';

// Independent examples and cardinalities from the acquired official source,
// not a second catalog. Archive provenance and public source bytes are retained
// with MSG0583 evidence; no address/provider call is made by this module.
test('0583 pinned official legal-region snapshot has reproducible narrow coverage',()=>{
 assert.equal(REGION_REFERENCE_VERSION,'kr-legal-region-code-20261001-observed-20261112');
 assert.equal(REGION_REFERENCE.sourceContentSha256,'962fd4cdfb6ccf2887b745eb97db55f71112b9f9a32c1f8fbd7692fb069b1df0');
 assert.equal(REGION_REFERENCE.sourceZipSha256,'44a3fe4cacf88ce98e35fb883807d2725b589f427ff4d73ee40b914d1286bacd');
 assert.equal(REGION_REFERENCE.activeSourceRows,20560);assert.equal(listRegionRoots().length,16);
 assert.equal(listRegionRoots().reduce((n,r)=>n+listRegionLeaves(r.code).length,0),255);
 assert.equal(REGION_REFERENCE.excludedNonterminalCities,13);
 for(const root of listRegionRoots()){assert.match(root.code,/^\d{10}$/);assert.ok(Object.isFrozen(root));for(const leaf of listRegionLeaves(root.code))assert.match(leaf.code,/^\d{10}$/);}
 assert.ok(Object.isFrozen(REGION_REFERENCE));assert.ok(Object.isFrozen(listRegionRoots()));
});
test('0583 district, county and compound city-district labels keep official codes',()=>{
 const expected=[['1100000000','1114000000','서울특별시','중구'],['2600000000','2611000000','부산광역시','중구'],['4100000000','4111700000','경기도','수원시 영통구'],['5000000000','5013000000','제주특별자치도','서귀포시'],['2800000000','2871000000','인천광역시','강화군'],['2800000000','2812500000','인천광역시','제물포구'],['2800000000','2827500000','인천광역시','서해구']];
 for(const [rootCode,leafCode,rootLabel,leafLabel]of expected)assert.deepEqual(regionSelection(rootCode,leafCode),{referenceVersion:REGION_REFERENCE_VERSION,rootCode,leafCode,rootLabel,leafLabel});
 assert.equal(regionSelection('4100000000','4111000000'),null,'nonterminal Suwon city is not an invented final district');
 assert.equal(regionSelection('1100000000','2611000000'),null,'same label cannot cross province');
});
test('0583 Sejong directly selects its existing code without a fabricated district',()=>{
 assert.deepEqual(listRegionLeaves('3611000000'),[]);
 const selected=regionSelection('3611000000','3611000000');assert.deepEqual(selected,{referenceVersion:REGION_REFERENCE_VERSION,rootCode:'3611000000',leafCode:'3611000000',rootLabel:'세종특별자치시',leafLabel:''});
 assert.equal(inspectRegionSelection(selected).status,'SELECTED');assert.equal(regionSelection('3600000000','3611000000'),null);assert.equal(regionSelection('3611000000',''),null);
 assert.equal(regionSelection('unknown','unknown'),null,'an unknown root with no leaves is not direct completion');
});
test('0583 keyword and initial-consonant filters preserve real options and query semantics',()=>{
 const roots=listRegionRoots(),seoul=listRegionLeaves('1100000000');
 assert.deepEqual(filterRegionOptions(roots,'ㅅㅇ').map(x=>x.label),['서울특별시']);
 for(const query of ['ㄱㄴ','ᄀᄂ','강남'])assert.deepEqual(filterRegionOptions(seoul,query).map(x=>x.label),['강남구']);
 assert.deepEqual(filterRegionOptions(listRegionLeaves('4100000000'),'수원 영통').map(x=>x.label),['수원시 영통구']);
 assert.deepEqual(filterRegionOptions(listRegionLeaves('5000000000'),'ㅅㄱㅍ').map(x=>x.label),['서귀포시']);
 assert.deepEqual(filterRegionOptions(seoul,'없는구'),[]);assert.deepEqual(filterRegionOptions(seoul,' 강나 '),[],'a complete but unmatched Korean word is not broadened to initials');
 assert.equal(filterRegionOptions(seoul,'').length,25);assert.equal(filterRegionOptions(seoul,'강남')[0],seoul.find(x=>x.code==='1168000000'));
});
test('0583 filtering and selected data are immutable and cannot mint arbitrary regions',()=>{
 const before=JSON.stringify(listRegionRoots());assert.throws(()=>listRegionRoots().push({code:'new',label:'fake'}));
 const option=filterRegionOptions(listRegionLeaves('1100000000'),'강남')[0];assert.throws(()=>option.label='fake');assert.equal(JSON.stringify(listRegionRoots()),before);
 const selected=regionSelection('1100000000','1168000000');assert.ok(Object.isFrozen(selected));assert.throws(()=>selected.leafCode='0000000000');
 assert.equal(regionSelection('1100000000','1168010100'),null,'dong codes are outside this catalog');
});
test('0583 historical catalog selection is readable but not silently current',()=>{
 const old={...regionSelection('1100000000','1168000000'),referenceVersion:'old-legal-source',leafLabel:'old-label'},copy=projectRegionSelection(old);
 assert.deepEqual(copy,old);assert.notEqual(copy,old);assert.deepEqual(inspectRegionSelection(old),{valid:false,status:'STALE_REFERENCE',selection:old,reason:'REGION_REFERENCE_REVIEW_REQUIRED'});
 assert.equal(inspectRegionSelection(null).status,'UNSELECTED');assert.equal(inspectRegionSelection({...old,referenceVersion:REGION_REFERENCE_VERSION}).status,'INVALID');assert.equal(old.leafLabel,'old-label');
});
test('0583 strict region shape rejects coercion, wrong parent and forged authority',()=>{
 const base=regionSelection('1100000000','1168000000');
 for(const patch of [{rootCode:1100000000},{leafCode:'11680'},{verified:true},{rootLabel:''},{rootLabel:'서울\n특별시'}])assert.throws(()=>projectRegionSelection({...base,...patch}));
 assert.equal(inspectRegionSelection({...base,rootCode:'2600000000'}).valid,false);
 assert.equal(inspectRegionSelection({...base,leafLabel:'서초구'}).reason,'REGION_SELECTION_MISMATCH');assert.equal('addressVerified' in base,false);
});
