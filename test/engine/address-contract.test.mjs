import test from 'node:test';
import assert from 'node:assert/strict';
import {addressFields,addressStatus,isVerifiedAddress,selectAddress,sameAddressBase,addressLines} from '../../web/address-contract.mjs';

// Synthetic provider-shaped data. These tests do not contact or validate JUSO.
const selected=()=>({road:'합성시 가상로 10',postal:'08843',jibun:'합성시 가상동 1',region:'합성시',providerId:'1111111111111111111111111',addressProvider:'JUSO'});
test('empty and historical address text remain incomplete without provider selection',()=>{
 assert.equal(addressStatus({}).state,'EMPTY');
 for(const site of [{road:'검색한 글자'},{...selected(),addressProvider:undefined},{...selected(),providerId:'old-id'}, {...selected(),postal:8843}]){
  assert.equal(addressStatus(site).state,'UNVERIFIED');assert.equal(isVerifiedAddress(site),false);assert.equal(addressStatus(site).issue.key,'address');
 }
 assert.equal(addressStatus(selected()).valid,true);assert.equal(addressStatus(selected()).state,'PROVIDER_SELECTED');
});
test('provider identity and postal are exact strings; optional address detail and placement are not gates',()=>{
 assert.equal(isVerifiedAddress({...selected(),detail:'',dropoff:''}),true);
 for(const change of [{providerId:'1'.repeat(24)},{providerId:'1'.repeat(26)},{providerId:'x'.repeat(25)},{postal:'0884'},{postal:'088433'},{road:'  '},{road:'x'.repeat(4097)},{region:'x'.repeat(1025)},{road:'합성\u0000주소'}])assert.equal(isVerifiedAddress({...selected(),...change}),false,JSON.stringify(change));
});
test('same building reselection preserves optional fields, different building clears only its child draft',()=>{
 const current={...selected(),detail:'2층',dropoff:'문 앞',contactPhone:'010-2345-6789',email:'QA@example.com',id:'site-a'};
 const original=structuredClone(current),same=selectAddress(current,selected());assert.equal(same.detail,'2층');assert.equal(same.dropoff,'문 앞');
 const different=selectAddress(current,{...selected(),providerId:'2'.repeat(25),road:'합성시 가상로 20',detail:'provider cannot own detail',dropoff:'provider cannot own dropoff'});
 assert.equal(different.detail,'');assert.equal(different.dropoff,'');assert.deepEqual(current,original);
 for(const key of ['contactPhone','email','id'])assert.equal(key in different,false);
 assert.throws(()=>selectAddress(current,{road:'검색어'}),/ADDRESS_SELECTION_INVALID/);
});
test('legacy same road/postal can retain user detail only after actual candidate selection',()=>{
 for(const providerId of ['', 'legacy-other-provider-id', '9'.repeat(25)]){
  const before={road:selected().road,postal:'08843',providerId,detail:'2층',dropoff:'문 앞'};
  assert.equal(addressStatus(before).valid,false);assert.equal(sameAddressBase(before,selected()),true);
  const after=selectAddress(before,selected());assert.equal(after.detail,'2층');assert.equal(after.dropoff,'문 앞');assert.equal(after.addressProvider,'JUSO');
  assert.equal(addressStatus(before).valid,false);
  const changed=selectAddress(before,{...selected(),road:'합성시 다른길 20'});assert.equal(changed.detail,'');assert.equal(changed.dropoff,'');
 }
});
test('formatted lines retain postal leading zero, separate placement and omit optional empty lines',()=>{
 assert.deepEqual(addressLines({...selected(),detail:'2층',dropoff:'대문 앞'}),['합성시 가상로 10 2층','08843','대문 앞']);
 assert.deepEqual(addressLines(selected()),['합성시 가상로 10','08843']);assert.deepEqual(addressLines({}),[]);
 assert.deepEqual(addressFields({id:'site-a',name:'A',email:'q@example.com',road:'주소'}),{road:'주소',postal:'',detail:'',jibun:'',region:'',providerId:'',dropoff:'',addressProvider:''});
});

test('C54-02 Kakao namespaced candidate identity is distinct from legacy JUSO and retains same-base optional fields',()=>{
 const a={...selected(),providerId:'KAKAO:v1:'+'a'.repeat(64),addressProvider:'KAKAO'};
 assert.equal(isVerifiedAddress(a),true);assert.equal(isVerifiedAddress({...a,providerId:'1'.repeat(25)}),false);assert.equal(isVerifiedAddress({...selected(),providerId:a.providerId}),false);
 for(const providerId of ['KAKAO:v1:'+'A'.repeat(64),'KAKAO:v2:'+'a'.repeat(64),'KAKAO:v1:'+'a'.repeat(63)])assert.equal(isVerifiedAddress({...a,providerId}),false);
 const current={...selected(),detail:'2층',dropoff:'문 앞'};
 assert.equal(sameAddressBase(current,a),true);assert.equal(selectAddress(current,a).dropoff,'문 앞');
 assert.equal(selectAddress(current,{...a,road:'다른 건물',providerId:'KAKAO:v1:'+'b'.repeat(64)}).detail,'');
 assert.equal(addressStatus({...a,addressProvider:''}).valid,false);
});
