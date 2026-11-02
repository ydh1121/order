import {allocationFixture} from './qa-lab.mjs';

// Explicit QA-only inputs and independent expected values from MSG0528.
// This file is never copied to product dist or used as an operational policy.
export const quantityCases0528 = [
 {id:'N01',title:'600판 / 30일 / 1판 확정',input:{monthly:'600',quantity:'1',days:30},expected:{quantity:'20',frequency:'매일 납품'}},
 {id:'N02',title:'610판 / 30일 / 1판 확정',input:{monthly:'610',quantity:'1',days:30},expected:{quantity:'21',frequency:'월 약29회'}},
 {id:'N03',title:'610판 / 31일 / 20판',input:{monthly:'610',quantity:'20',days:31},expected:{quantity:'20',frequency:'월 약31회'}},
 {id:'N04',title:'610판 / 29판 / 28~30판',input:{monthly:'610',quantity:'29',min:'28',max:'30',days:30},expected:{quantity:'29',frequency:'월 약21회'}},
 {id:'N05',title:'600판 / 30판 비가변',input:{monthly:'600',quantity:'30',days:30},expected:{quantity:'30',frequency:'월 20회'}},
 {id:'N06',title:'600판 / 20판 / 넓은 12~40판',input:{monthly:'600',quantity:'20',min:'12',max:'40',days:30},expected:{quantity:'20',frequency:'월 약30회',possibleRatios:['15','50']}},
 {id:'N07',title:'FLEX 200판 / 직접 201판',input:{monthly:'200',quantity:'201',mode:'FLEX',days:30},expected:{quantity:'200',periodChanged:false}},
 {id:'N08',title:'FIXED 200판 / 직접 201판',input:{monthly:'200',quantity:'201',mode:'FIXED',days:30},expected:{quantity:'200',period:'매월',dayRule:''}},
 {id:'N09',title:'총600 / A수동200 / B빈칸',input:{total:'600',a:'200',b:'',bSource:'derived'},expected:{b:'400'}},
 {id:'N10',title:'A201 / B자동400 재배분',input:{total:'600',a:'201',b:'400',bSource:'derived'},expected:{a:'201',b:'399'}},
 {id:'N11',title:'A201 시도 / B수동400 보존',input:{total:'600',a:'201',b:'400',bSource:'manual'},expected:{a:'200',b:'400'}},
 {id:'N12',title:'알려진 2,500개씩 / 30구',input:{knownDemand:['2500','2500'],pack:30},expected:{plans:['84','84'],raw:'5000'}},
 {id:'N13',title:'최소20 / 2→29 순차 타이핑',input:{monthly:'600',quantity:'29',days:30},expected:{intermediate:'2',quantity:'29'}},
 {id:'N14',title:'1,200 표시 / 원숫자 저장',input:{monthly:'1200',quantity:'1200',days:30},expected:{display:'1,200',model:'1200'}},
 {id:'N15',title:'Q2 총량 감소 / 수동값 보존',input:{totalBefore:'600',totalAfter:'500',plans:['200','400']},expected:{plans:['200','400'],conflict:true}},
 {id:'N16',title:'월량 빈칸 / IME / 부분입력',input:{monthly:'',quantity:''},expected:{display:'—',noFakeZero:true}},
];

export const dateCases0528 = [
 {id:'D01',title:'12/4 신청의 기본 범위',input:{asOf:'2026-12-04'},expected:{min:'2026-12-10',max:'2027-01-29'}},
 {id:'D02',title:'범위 이전 직접 입력',input:{asOf:'2026-12-04',date:'2026-12-04'},expected:{date:'2026-12-10',message:'RANGE'}},
 {id:'D03',title:'다음달 마지막 일요일',input:{asOf:'2026-12-04',date:'2027-01-31'},expected:{date:'2027-01-29',message:'RANGE'}},
 {id:'D04',title:'12/23 신청 / 추가 제한 없음',input:{asOf:'2026-12-23'},expected:{min:'2026-12-30',max:'2027-01-29'}},
 {id:'D05',title:'연말 신규 시작 제한 fixture',classification:'OPERATIONAL_FIXTURE',input:{asOf:'2026-12-23',newStartUnavailable:['2026-12-30','2026-12-31']},expected:{min:'2027-01-04'}},
 {id:'D06',title:'12/31 신청',input:{asOf:'2026-12-31'},expected:{min:'2027-01-07',max:'2027-01-29'}},
 {id:'D07',title:'1/29 신청',input:{asOf:'2027-01-29'},expected:{min:'2027-02-04',max:'2027-02-26'}},
 {id:'D08',title:'설 연휴 전날 신청',input:{asOf:'2027-02-05'},expected:{min:'2027-02-15'}},
 {id:'D09',title:'설 연휴 직전 정상 후보',input:{asOf:'2027-02-01'},expected:{min:'2027-02-05'}},
 {id:'D10',title:'노동절 대체휴일 반영',input:{asOf:'2027-04-29'},expected:{min:'2027-05-07'}},
 {id:'D11',title:'제헌절 대체휴일 반영',input:{asOf:'2027-07-14'},expected:{min:'2027-07-21'}},
 {id:'D12',title:'현충일 임의 대체휴일 금지',input:{asOf:'2027-06-03'},expected:{min:'2027-06-09'}},
 {id:'D13',title:'추석 준비 영업일',input:{asOf:'2027-09-10'},expected:{min:'2027-09-21'}},
 {id:'D14',title:'성탄절 대체휴일 반영',input:{asOf:'2027-12-23'},expected:{min:'2027-12-30'}},
 {id:'D15',title:'범위 안 공휴일 입력',input:{asOf:'2026-12-04',date:'2026-12-25'},expected:{message:['CLOSED','NO_DATE'],forbidden:'2026-12-25'}},
 {id:'D16',title:'매월31일의 첫 후보',input:{asOf:'2026-12-04',dayRule:31},expected:{first:'2026-12-31',dayRule:31}},
 {id:'D17',title:'31일 NEXT / nominal 보존',input:{asOf:'2027-01-04',dayRule:31,holidayPolicy:'NEXT'},expected:{first:'2027-02-01',dayRule:31}},
 {id:'D18',title:'31일 PREV / nominal 보존',input:{asOf:'2027-01-04',dayRule:31,holidayPolicy:'PREV'},expected:{first:'2027-01-29',dayRule:31}},
 {id:'D19',title:'31일 이동 불가 / 후보 없음',classification:'POLICY_FIXTURE',input:{asOf:'2027-01-04',dayRule:31,holidayPolicy:'NONE'},expected:{message:'NO_DATE',dayRule:31}},
 {id:'D20',title:'평년/윤년 2월29일',classification:'ARITHMETIC_FIXTURE',input:{dates:['2027-02-29','2028-02-29']},expected:{normalized:['2027-02-28','2028-02-29'],year2028BusinessStatus:'UNVERIFIED_WITHOUT_DATA'}},
 {id:'D21',title:'임시공휴일 버전 갱신',classification:'POLICY_FIXTURE',input:{temporaryHoliday:'2026-12-10'},expected:{recalculate:'UNSTARTED_ONLY',committedUnchanged:true}},
 {id:'D22',title:'확정 선거일과 사전투표 구분',classification:'POLICY_FIXTURE',input:{electionDay:'2026-12-08'},expected:{exclude:'CONFIRMED_ELECTION_ONLY'}},
 {id:'D23',title:'특정 노선 신규 시작 제한',classification:'POLICY_FIXTURE',input:{route:'qa-route-a',newStartUnavailable:['2026-12-10']},expected:{otherRouteUnchanged:true}},
 {id:'D24',title:'자료 누락·만료와 유효 캐시',classification:'FAULT_FIXTURE',input:{missingYear:2027},expected:{noCache:'UNAVAILABLE',validCache:'USABLE',checkpointAllowed:true}},
 {id:'D25',title:'서울 자정 후 미시작 재검사',classification:'CLOCK_FIXTURE',input:{openedAt:'2026-12-04T14:59:00Z',appliedAt:'2026-12-04T15:01:00Z'},expected:{asOf:'2026-12-05',committedReadWrites:0}},
 {id:'D26',title:'이미 시작한 주문 열기',input:{asOf:'2026-12-04',pastDate:'2026-11-03',started:true},expected:{date:'2026-11-03',writes:0}},
 {id:'D27',title:'연도2·202_·빈 월',input:{partial:['2','202_','']},expected:{typingClamp:false,finalMessage:'INVALID'}},
 {id:'D28',title:'범위 전체 차단',classification:'POLICY_FIXTURE',input:{blockAll:true},expected:{message:'NO_DATE',checkpointAllowed:true}},
 {id:'D29',title:'14/21일 nominal anchor 유지',classification:'POLICY_FIXTURE',input:{intervalDays:[14,21]},expected:{nextFrom:'ORIGINAL_ANCHOR_NOT_SHIFTED_ACTUAL'}},
 {id:'D30',title:'범위 밖 raw day와 rule31',input:{asOf:'2026-12-04',dayRule:31,date:'2026-12-04'},expected:{dayRule:31,message:['RANGE','NO_DATE']}},
];

export function quantityFixture0528(id='N01') {
 const c=quantityCases0528.find(x=>x.id===id);if(!c)throw Error('QA_0528_QUANTITY_CASE_UNKNOWN');
 const f=allocationFixture();f.open='q4';f.lines[0].price='10000';
 f.locations.forEach((site,i)=>{site.id='qa-site-'+i;site.name='합성 사업장 '+(i+1);site.contactPhone='010-2345-6789';});f.allocations.forEach((a,i)=>{a.id='qa-allocation-'+i;a.locationId='qa-site-'+i;});
 const multi=['N09','N10','N11','N12','N15'].includes(id);if(!multi){f.locations=f.locations.slice(0,1);f.allocations=f.allocations.slice(0,1);}
 const monthly=c.input.monthly??c.input.total??c.input.totalBefore??'600';f.lines[0].qty=monthly;f.lines[0].qtyUnit='tray';
 f.allocations.forEach((a,i)=>{a.mode=i?'FIXED':c.input.mode||'FLEX';a.qty=c.input.quantity||'30';a.monthlyPlanQty=multi?i?c.input.b??c.input.plans?.[i]??'':c.input.a??c.input.plans?.[i]??'200':monthly;a.monthlyPlanSource=multi&&i?(c.input.bSource||'manual'):'manual';a.monthlyDemandQty='';a.monthlyDemandSource='manual';a.monthlyDemandBasis='package-plan';a.q4Review.profile=multi?'MIXED':a.mode;a.variableQty=!!c.input.min;a.qtyMin=c.input.min||'';a.qtyMax=c.input.max||'';a.q4Review.activeHoliday={days:[],none:true,irregular:false,request:'',conflict:'휴무 다음날 희망',weekend:'휴무 다음날 희망',holiday:'휴무 다음날 희망',subholiday:'휴무 다음날 희망'};if(a.mode==='FIXED')a.cadence={version:'2.0.0',kind:'INTERVAL_DAYS',intervalDays:14,preferredDate:''};});
 if(id==='N12'){f.lines[0].qty='5000';f.lines[0].qtyUnit='each';f.allocations.forEach(a=>Object.assign(a,{monthlyDemandQty:'2500',monthlyDemandBasis:'known',monthlyDemandSource:'manual',monthlyPlanQty:'84',monthlyPlanSource:'derived'}));}
 if(id==='N16'){f.lines[0].qty='';f.allocations=[];}
 return f;
}

export function contactFixture0528(count=20){
 const f=allocationFixture(),template=f.locations[0];f.open='q3';f.allocations=[];
 f.locations=Array.from({length:count},(_,i)=>({...structuredClone(template),id:'qa-site-'+i,name:i===count-1?'합성 마지막 사업장 20':'합성 사업장 '+(i+1),contactPhone:i?'010-2345-6789':'010-3456-7890',storePhone:i?'070-2345-6789':'02-345-6789',email:i?'second@example.com':'qa@example.com'}));
 return f;
}

export function dateFixture0528(id='D01'){
 const c=dateCases0528.find(x=>x.id===id);if(!c)throw Error('QA_0528_DATE_CASE_UNKNOWN');
 const f=quantityFixture0528('N05'),a=f.allocations[0];f.open='q4';a.mode='FIXED';a.q4Review.profile='FIXED';a.cadence={version:'2.0.0',kind:c.input.dayRule?'MONTHLY':'INTERVAL_DAYS',...(c.input.dayRule?{dayRule:c.input.dayRule}:{intervalDays:14}),preferredDate:c.input.started?c.input.pastDate:''};
 return f;
}
