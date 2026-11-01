// Explicitly synthetic data. This module is embedded only by the local QA LAB
// builder and is never an entry in the production Pages allowlist.
export function allocationFixture(){
 const holiday={days:[],none:true,irregular:false,conflict:'협의 후 조정',weekend:'협의 후 조정',holiday:'협의 후 조정',subholiday:'협의 후 조정',request:''};
 const repeat={period:'매주',frequency:'1회',date:'',dateMode:'custom',weeklyCheck:false,weekdays:{},weekOpen:0,semantics:'per-week-v1',legacyReviewRequired:false};
 const site=id=>({id,name:'합성 QA 사업장 '+id.slice(-1).toUpperCase(),road:'합성 QA 주소 — 실제 주소 아님',detail:'합성 상세 — 실제 주소 아님',postal:'00000',contactPhone:'010-0000-0000',email:'qa@example.com',storePhone:'',status:'QA_SYNTHETIC',providerId:'QA_SYNTHETIC_NOT_PROVIDER',addressState:'PRESENT_REQUIRES_PROVIDER_POLICY',basicInfoDraft:false,mailboxVerified:false});
 const allocation=(id,locationId,monthlyDemandQty,source)=>({id,lineId:'qa-line',locationId,mode:'FLEX',modeExplicit:true,qty:'10',monthlyDemandQty,monthlyDemandUnit:'each',monthlyDemandSource:source,variableQty:false,qtyMin:'',qtyMax:'',qualityTest:false,
  advanced:{contactChannels:['phone'],fixedOrderProcess:'seller',flexOrderProcess:'store',storeOffDays:[],storeOffNone:true,storeOffPolicy:'ask',weekend:'ask',holiday:'ask',substituteHoliday:'ask'},
  q4Review:{version:'0460',pack:'30',profile:'FLEX',activeHoliday:holiday,activeRepeat:repeat,common:{contact:{phone:true,sms:false,kakao:false,email:false},process:'shop',quality:false,holiday,repeat}}});
 return {lines:[{id:'qa-line',housing:'4',size:'특란',pack:'30',qty:'200',qtyUnit:'each',price:''}],current:'qa-line',open:'q4',allocationRevision:0,
  locations:[site('qa-site-a'),site('qa-site-b')],allocations:[allocation('qa-allocation-a','qa-site-a','50','manual'),allocation('qa-allocation-b','qa-site-b','','derived')]};
}

export function syntheticDns(name,type){
 const types={A:1,AAAA:28,MX:15};
 if(!types[type]||!['example.com','mx.example.com'].includes(name))throw Error('QA_DNS_UNDECLARED_DOMAIN');
 const Answer=name==='example.com'&&type==='MX'?[{name:name+'.',type:15,TTL:60,data:'10 mx.example.com.'}]:name==='mx.example.com'&&type==='A'?[{name:name+'.',type:1,TTL:60,data:'192.0.2.1'}]:[];
 return {Status:0,Question:[{name:name+'.',type:types[type]}],Answer,Authority:Answer.length?[]:[{name:'example.com.',type:6,TTL:60,data:'ns.example.com. hostmaster.example.com. 1 60 60 60 60'}]};
}
