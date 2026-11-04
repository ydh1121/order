import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createCadence,startDateRange,inspectStartDate,syncMonthlyPreferredDate,holidayPolicyFromSelection} from '../../web/cadence-contract.mjs';
import {createMonthlyAllocationDraft} from '../../web/allocation-ui.mjs';
import {orderQuantityInput} from '../../web/q4-planning.mjs';
import {editQuantityCadence,selectCadence,cadenceForPeriod} from '../../web/approved-schedule.mjs';
import {nearestMonthly} from '../../web/order-date.mjs';
import {bindNumericInputs} from '../../web/numeric-input.mjs';
const source=readFileSync(new URL('../../web/q4-review.mjs',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function harness({count=1,mode='FIXED',period='2주',asOf='2026-12-04',preferredDate='',review}={}){
 const cadence=createCadence(period);if(period==='매월')cadence.dayRule=31;cadence.preferredDate=preferredDate;cadence.nominalAnchor=preferredDate;
 const repeat={period,date:period==='매월'?'31일':'',cadence},h={days:[],none:true,irregular:false,conflict:'협의 후 조정',weekend:'휴무 다음날 희망',holiday:'휴무 다음날 희망',subholiday:'휴무 다음날 희망',request:''};
 const state={count,mode,asOfLocalDate:asOf,...structuredClone(repeat),siteRepeat:Array.from({length:count},()=>structuredClone(repeat)),siteModes:Array(count).fill(mode),siteContacts:Array.from({length:count},()=>({phone:true})),contact:{phone:true},siteHolidays:Array.from({length:count},()=>structuredClone(h)),holidayDays:[],holidayNone:true,holidayIrregular:false,holiday:h,request:'',process:'contact',siteProcess:Array(count).fill('contact'),values:Array.from({length:count},()=>({base:'30',monthly:'200'})),qtySources:Array(count).fill('user'),deliveryPlans:Array(count).fill(null),preferredDates:{},preferredTouched:new Set(),startDateReviews:{},startDateResults:{},dateTouched:new Set(),datesByAllocation:{},attempted:false,quantityAdjusted:Array(count).fill(false),quantityTouched:new Set(),approvedDateParts:{}};
 const regularContext={line:{id:'L'},allocations:Array.from({length:count},(_,i)=>({id:'A'+i,locationId:'S'+i,cadence:structuredClone(cadence),q4Review:review?{startDateReview:review}:{}}))};
 const scope={state,regularContext,editQuantityCadence,selectCadence,cadenceForPeriod,nearestMonthly,approvedDateBindings:new Map(),approvedDateActive:()=>false,approvedDateId:i=>'date'+i,renderRepeatOnly:()=>{},quantityEditedFields:new WeakSet(),Date:class extends Date{constructor(value){super(value??asOf+'T12:00:00+09:00');}},createCadence,startDateRange,inspectStartDate,syncMonthlyPreferredDate,holidayPolicyFromSelection,orderQuantityInput,structuredClone,clone:structuredClone,numericComposing:new Set(),Set,Map,document:{querySelector:()=>null},q4Numeric:{replace:()=>{}},syncMonthlyFields:()=>{},render:()=>{},refreshStatus:()=>{},refreshResultsOnly:()=>{},syncRegularQuantityErrors:()=>{},datePolicy:{blank:()=>({year:'',month:'',day:''}),validate:()=>({valid:true})},OrderRepeatContract:{days:['월','화','수','목','금','토','일'],monthValue:value=>({valid:value==='말일'||/^(?:[1-9]|[12]\d|3[01])일$/.test(value)}),snapshot:r=>plain(Object.fromEntries(['period','frequency','date','cadence','weeklyCheck','weekdays','weekdayOrder','monthlyMemory','quantityEditVersion','semantics','legacyReviewRequired'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]))),resetPeriod:(r,period)=>{r.period=period;r.cadence=createCadence(period);}}};
 scope.approvedDateValue=i=>nearestMonthly(scope.activeRepeat(i).date==='말일'?'last':Number(String(scope.activeRepeat(i).date||'').replace(/일$/,'')),new scope.Date())||'';scope.repeatDraft=i=>i===null?state:state.siteRepeat[i];scope.isIndividual=()=>state.count>1&&state.mode==='MIXED';scope.siteMode=i=>scope.isIndividual()?state.siteModes[i]:state.mode;scope.activeRepeat=i=>scope.isIndividual()?state.siteRepeat[i]:state;scope.dateKey=i=>JSON.stringify(['L','A'+i]);scope.preferredKey=i=>scope.isIndividual()?'site:'+scope.dateKey(i):'common:L';scope.preferredDateActive=i=>scope.siteMode(i)==='FIXED';scope.monthlyRow=i=>({quantity:{raw:state.values[i].monthly}});scope.monthlyLocation=i=>'S'+i;
 vm.createContext(scope);vm.runInContext(source.slice(source.indexOf('function preferredParts('),source.indexOf('function localDateISO('))+source.slice(source.indexOf('function dateOwnerIndex('),source.indexOf('function monthDayCount(')).replace('syncDateFields(i);','')+source.slice(source.indexOf('function materializeCommonSettings('),source.indexOf('function completeQuantityInputs(')),scope);
 return scope;
}
test('C28 date adapter keeps raw partial drafts, then uses corrected engine cadence and review provenance',()=>{
 const q=harness(),before=plain(q.regularContext);q.storePreferredDate(0,{year:'2',month:'',day:''},{completed:false});assert.equal(q.state.cadence.preferredDate,'');assert.equal(q.state.startDateResults['common:L'].code,'EDITING');
 q.storePreferredDate(0,{year:2026,month:12,day:5});assert.equal(q.state.cadence.preferredDate,'2026-12-10');assert.equal(q.state.startDateResults['common:L'].code,'RANGE');assert.equal(q.state.cadence.nominalAnchor,'2026-12-10');assert.equal(q.state.startDateReviews['common:L'].lifecycle,'NEW');assert.ok(q.state.startDateReviews['common:L'].holidayVersion);assert.deepEqual(plain(q.regularContext),before);
 q.completePreferredDates();assert.equal(q.state.startDateResults['common:L'].code,'RANGE','save does not erase correction explanation');
});
test('C28 blank optional day preserves separately completed year/month until the whole requested date is checked',()=>{
 const q=harness();q.datePolicy.blank=()=>({year:2026,month:12,day:''});
 // The real product starts a blank optional day with the current year/month.
 // Each separate field blur is a completed field, not a complete date.
 q.storePreferredDate(0,{...q.dateData(0),year:'2027'},{kind:'month',completed:false});q.storePreferredDate(0,q.dateData(0),{kind:'month'});
 assert.deepEqual(plain(q.dateData(0)),{year:'2027',month:12,day:''});assert.equal(q.state.cadence.preferredDate,'');
 q.storePreferredDate(0,{...q.dateData(0),month:'1'},{kind:'month',completed:false});q.storePreferredDate(0,q.dateData(0),{kind:'month'});
 assert.deepEqual(plain(q.dateData(0)),{year:'2027',month:'1',day:''});assert.equal(q.state.cadence.preferredDate,'');
 q.storePreferredDate(0,{...q.dateData(0),day:'31'},{kind:'date',completed:false});q.storePreferredDate(0,q.dateData(0),{kind:'date'});
 assert.equal(q.state.cadence.preferredDate,'2027-01-29');assert.equal(q.state.startDateResults['common:L'].code,'RANGE');
 assert.deepEqual(plain(q.dateData(0)),{year:2027,month:1,day:29});
 q.storePreferredDate(0,{...q.dateData(0),day:''},{kind:'date'});assert.equal(q.state.cadence.preferredDate,'');assert.equal(q.state.cadence.nominalAnchor,'');assert.deepEqual(plain(q.dateData(0)),{year:2027,month:1,day:''});
});
test('C28 out-of-range raw monthly date cannot rewrite dayRule; a valid explicit calendar selection can',()=>{
 const q=harness({period:'매월'});q.storePreferredDate(0,{year:2030,month:1,day:20});assert.equal(q.state.cadence.dayRule,31);assert.equal(q.state.cadence.preferredDate,'2026-12-31');
 q.storePreferredDate(0,{year:2026,month:12,day:22});assert.equal(q.state.cadence.dayRule,22);assert.equal(q.state.cadence.preferredDate,'2026-12-22');
});
test('C28 explicit STARTED and untouched LEGACY past anchors survive; NEW is revalidated',()=>{
 for(const lifecycle of ['STARTED','LEGACY']){const q=harness({asOf:'2026-12-04',preferredDate:'2026-01-05',review:{version:'1.0.0',lifecycle,asOfLocalDate:'2026-01-01'}});assert.equal(q.dateInspection(0).valid,true);q.completePreferredDates();assert.equal(q.state.cadence.preferredDate,'2026-01-05');assert.equal(q.state.startDateResults['common:L'].preserved,true);}
 const fresh=harness({preferredDate:'2026-12-08',review:{version:'1.0.0',lifecycle:'NEW',asOfLocalDate:'2026-12-01'}});fresh.completePreferredDates();assert.equal(fresh.state.cadence.preferredDate,'2026-12-22','saved14-day anchor12/08 advances one original interval after the new minimum12/10');assert.equal(fresh.state.cadence.nominalAnchor,'2026-12-08','rechecking the actual first delivery preserves the original recurrence anchor');
});
test('C28 date drafts retain independent site owners across common view and optional blank does not activate',()=>{
 const q=harness({count:2,mode:'MIXED'});q.state.siteModes=['FIXED','FIXED'];q.storePreferredDate(1,{year:3000,month:1,day:2},{completed:false});q.state.mode='FIXED';assert.deepEqual(plain(q.dateData(1)),{year:'',month:'',day:''});q.state.mode='MIXED';assert.equal(q.dateData(1).year,3000);
 const monthly=harness({period:'매월'});monthly.syncPreferredRule();assert.equal(monthly.state.cadence.version,'3.0.0');assert.equal(monthly.state.cadence.preferredDate,'2026-12-31','MSG0540 derives monthly date from required rule');
});
test('C28 shared FIXED direct overshoot materializes peers then changes only edited site atomically',()=>{
 const q=harness({count:2});q.applyQuantityInput(0,'base','201',{phase:'input',direct:true});assert.equal(q.state.mode,'MIXED');assert.equal(q.state.values[0].base,'200');assert.equal(q.state.siteRepeat[0].period,'매월');assert.equal(q.state.siteRepeat[0].cadence.dayRule,'');assert.equal(q.state.siteRepeat[1].period,'2주');assert.equal(q.state.values[1].base,'30');assert.equal(q.state.siteProcess[1],'contact');
});
test('C28 FLEX typing delays lower clamp and upper/undo do not silently rewrite independent fields',()=>{
 const q=harness({mode:'FLEX'});q.state.values[0].monthly='600';q.applyQuantityInput(0,'base','2',{phase:'input',direct:true});assert.equal(q.state.values[0].base,'2');q.applyQuantityInput(0,'base','29',{phase:'input',direct:true});assert.equal(q.state.values[0].base,'29');q.applyQuantityInput(0,'base','1',{phase:'complete',direct:true});assert.equal(q.state.values[0].base,'20');
 q.applyQuantityInput(0,'base','700',{phase:'input',direct:true});assert.equal(q.state.values[0].base,'600');q.applyQuantityInput(0,'base','700',{phase:'input',direct:false});assert.equal(q.state.values[0].base,'700','undo preserves former raw state for validation');
});
test('C28 monthly actual first date shifted across month retains nominal 31 on confirm and reopening',()=>{
 const q=harness({period:'매월',asOf:'2027-01-01'});q.storePreferredDate(0,{year:2027,month:1,day:31},{kind:'month'});assert.equal(q.state.cadence.preferredDate,'2027-02-01');assert.equal(q.state.cadence.nominalAnchor,'2027-01-31');assert.equal(q.state.cadence.dayRule,31);
 q.completePreferredDates();assert.equal(q.state.cadence.preferredDate,'2027-02-01');assert.equal(q.state.cadence.nominalAnchor,'2027-01-31');assert.equal(q.state.cadence.dayRule,31);
 assert.equal(q.dateInspection(0).valid,true);
});

test('C28 corrected range message remains visible during a later incomplete edit until valid completion',()=>{
 const q=harness();q.storePreferredDate(0,{year:2026,month:12,day:5});const note=q.datePresentation(0).note;assert.ok(note.includes('입력 가능한 범위'));q.storePreferredDate(0,{year:'2',month:12,day:10},{completed:false});assert.equal(q.datePresentation(0).note,note);assert.equal(q.datePresentation(0).error,false);q.storePreferredDate(0,{year:2026,month:12,day:22});assert.equal(q.datePresentation(0).note,'');
});

test('C28 monthly undo restores prior raw value without capping against a later manual peer edit',()=>{
 const q=harness({count:2,mode:'FLEX'}),context={revision:1,line:{id:'L',qty:'600',qtyUnit:'tray',pack:'30'},locations:[{id:'S0'},{id:'S1'}],allocations:[200,400].map((n,i)=>({id:'A'+i,lineId:'L',locationId:'S'+i,mode:'FLEX',monthlyDemandQty:'',monthlyDemandBasis:'package-plan',monthlyPlanQty:String(n),monthlyPlanUnit:'tray',monthlyPlanSource:'manual'}))};q.monthlyEditor=createMonthlyAllocationDraft(context);q.monthlyRow=i=>q.monthlyEditor.rows[i];
 q.applyQuantityInput(0,'monthly','199',{direct:true});q.applyQuantityInput(1,'monthly','401',{direct:true});q.applyQuantityInput(0,'monthly','200',{direct:false});assert.deepEqual(q.monthlyEditor.rows.map(row=>row.quantity.raw),['200','401']);assert.equal(q.monthlyEditor.evaluate().normalized.canConfirm,false);
});

// Real shared numeric owner + real Q4 consumer, with only the DOM replacement
// boundary simulated. This is not evidence for native browser/OS acceptance.
function attachQuantityInput(q){
 class Event{constructor(type,init={}){Object.assign(this,{type,bubbles:true,cancelable:true},init);}preventDefault(){this.defaultPrevented=true;}stopImmediatePropagation(){this.stopped=true;}}
 const listeners=new Map(),accepted=[];let current;
 const doc=q.document;doc.defaultView={Event};q.quantityEditedFields=new WeakSet();
 const field=value=>({value,dataset:{qty:'0:base'},disabled:false,readOnly:false,ownerDocument:doc,selectionStart:value.length,selectionEnd:value.length,selectionDirection:'none',matches:()=>true,closest:()=>null,getAttribute:()=>null,setSelectionRange(start,end,direction='none'){Object.assign(this,{selectionStart:start,selectionEnd:end,selectionDirection:direction});},focus(){doc.activeElement=this;this.dispatchEvent(new Event('focusin'));},dispatchEvent(event){event.target=this;for(const capture of [true,false])for(const listener of listeners.get(event.type)||[]){if(listener.capture!==capture)continue;listener.fn(event);if(event.stopped)return !event.defaultPrevented;}return !event.defaultPrevented;}});
 current=field(q.state.values[0].base);const root={querySelectorAll:()=>[current],addEventListener(type,fn,options={}){listeners.set(type,[...(listeners.get(type)||[]),{fn,capture:!!options.capture}]);},removeEventListener(){}};
 const numeric=bindNumericInputs(root,{selector:'[data-qty]',options:{grouped:true,allowEmpty:true,allowZero:true,maxDigits:12}});q.q4Numeric=numeric;q.document.querySelector=()=>current;q.render=()=>{current=field(q.state.values[0].base);numeric.refresh();};
 q.$=()=>root;q.refreshQuantitySupport=()=>{};
 vm.runInContext(source.slice(source.indexOf("$('q4-regular-dialog').addEventListener('input',e=>{const el=e.target,packet=e.orderNumeric;"),source.indexOf("$('q4-regular-dialog').addEventListener('numericstatechange',")),q);
 vm.runInContext(source.slice(source.indexOf("$('q4-regular-dialog').addEventListener('compositionstart',"),source.indexOf("$('q4-regular-dialog').addEventListener('focusout',")),q);
 root.addEventListener('input',event=>accepted.push(event.orderNumeric));current.focus();
 return {get input(){return current;},accepted,numeric,compose(text){const input=current;input.dispatchEvent(new Event('compositionstart'));input.value=text;input.setSelectionRange(text.length,text.length);input.dispatchEvent(new Event('input',{inputType:'insertCompositionText',data:text,isComposing:true}));input.dispatchEvent(new Event('compositionend',{data:text}));current.dispatchEvent(new Event('input',{inputType:'insertCompositionText',data:text}));},replace(text){const input=current;input.setSelectionRange(0,input.value.length);const before=new Event('beforeinput',{inputType:'insertText',data:text});input.dispatchEvent(before);if(before.defaultPrevented)return;input.value=text;input.setSelectionRange(0,text.length,'backward');input.dispatchEvent(new Event('input',{inputType:'insertText',data:text}));},undo(){current.dispatchEvent(new Event('keydown',{key:'z',ctrlKey:true}));},redo(){current.dispatchEvent(new Event('keydown',{key:'y',ctrlKey:true}));}};
}
test('C28 real numeric history survives FIXED rerender and undoes/redoes target quantity+cadence together',()=>{
 const q=harness({count:2,preferredDate:'2026-12-10'}),context=plain(q.regularContext);q.state.values[0].min='12';q.state.values[0].max='40';q.state.preferredDates['common:L']={year:2026,month:12,day:10};q.state.preferredTouched.add('common:L');
 const h=attachQuantityInput(q),first=h.input;h.replace('201');assert.notEqual(h.input,first);assert.equal(q.state.values[0].base,'200');assert.equal(q.state.siteRepeat[0].period,'매월');assert.equal(q.state.siteRepeat[0].cadence.preferredDate,'');assert.equal(q.state.siteRepeat[1].period,'2주');assert.equal(q.state.siteRepeat[1].cadence.preferredDate,'2026-12-10');assert.equal(q.document.activeElement,h.input);assert.deepEqual([h.input.selectionStart,h.input.selectionEnd,h.input.selectionDirection],[0,3,'backward']);
 h.undo();assert.equal(q.state.values[0].base,'30');assert.equal(q.state.siteRepeat[0].period,'2주');assert.equal(q.state.siteRepeat[0].cadence.preferredDate,'2026-12-10');assert.deepEqual(plain(q.state.preferredDates[q.preferredKey(0)]),{year:2026,month:12,day:10});assert.equal(q.document.activeElement,h.input);
 h.redo();assert.equal(q.state.values[0].base,'200');assert.equal(q.state.siteRepeat[0].period,'매월');assert.equal(q.state.siteRepeat[0].cadence.preferredDate,'');assert.equal(q.state.preferredDates[q.preferredKey(0)],undefined);assert.equal(q.state.values[0].min,'12');assert.equal(q.state.values[0].max,'40');assert.equal(q.state.values[1].base,'30');assert.equal(q.state.siteRepeat[1].period,'2주');assert.equal(h.accepted.length,3,'edit, Undo and Redo each publish once; render/transfer publish nothing');assert.deepEqual(plain(q.regularContext),context,'the durable source is not touched by private history');
});
test('C28 same numeric value after clamp still owns an undoable cadence transaction',()=>{
 const q=harness();q.state.values[0].base='200';const h=attachQuantityInput(q);h.replace('201');assert.equal(q.state.period,'매월');h.undo();assert.equal(q.state.values[0].base,'200');assert.equal(q.state.period,'2주');h.redo();assert.equal(q.state.values[0].base,'200');assert.equal(q.state.period,'매월');assert.equal(h.accepted.length,3);
});
test('C28 quantity Undo does not overwrite a later independent monthly date choice',()=>{
 const q=harness(),h=attachQuantityInput(q);h.replace('201');q.state.date='25일';q.state.cadence.dayRule=25;h.undo();assert.equal(q.state.values[0].base,'30');assert.equal(q.state.period,'매월');assert.equal(q.state.date,'25일');assert.equal(q.state.cadence.dayRule,25);h.redo();assert.equal(q.state.values[0].base,'200');assert.equal(q.state.date,'25일');assert.equal(q.state.cadence.dayRule,25);
});

test('C28 accepted IME digit commit reaches Q4 once before composition bubble and survives cadence remount',()=>{
 const q=harness(),h=attachQuantityInput(q);h.compose('201');assert.equal(q.state.values[0].base,'200');assert.equal(q.state.period,'매월');assert.equal(h.accepted.length,1);assert.equal(q.numericComposing.size,0);h.undo();assert.equal(q.state.values[0].base,'30');assert.equal(q.state.period,'2주');
});
function calendarHarness({from,invalid=[],min='2026-12-10',max='2027-01-29'}={}){
 const q=harness(),rendered=[],focused=[],parse=iso=>Object.fromEntries(['year','month','day'].map((key,i)=>[key,Number(iso.split('-')[i])])),key=d=>d.year*10000+d.month*100+d.day;Object.assign(q.state,{calendarOpen:true,calendarSite:0,calendarView:{year:from.year,month:from.month}});q.datePolicy={...q.datePolicy,key,today:()=>parse(min),days:(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate()};q.dateBounds=()=>({minYear:parse(min).year,maxYear:parse(max).year,minMonth:parse(min).month,maxMonth:parse(max).month,range:{min,max}});q.dateInspection=(i,date)=>({valid:key(date)>=key(parse(min))&&key(date)<=key(parse(max))&&![0,6].includes(new Date(Date.UTC(date.year,date.month-1,date.day)).getUTCDay())&&!invalid.includes(key(date))});q.renderCalendar=day=>rendered.push({...q.state.calendarView,day});q.positionCalendar=()=>{};const panel={querySelector:selector=>({focus:()=>focused.push(selector)})};q.calendarElement=()=>panel;
 vm.runInContext(source.slice(source.indexOf('function calendarKeydown('),source.indexOf('// MSG0456:')),q);
 return {q,rendered,focused,press(k){const target={dataset:{calendarDay:String(from.day)},closest(){return this;}};let prevented=false;const handled=q.calendarKeydown({key:k,target,preventDefault(){prevented=true;}});return {handled,prevented};}};
}
test('C28 calendar arrow crosses a disabled weekend and holiday without losing focus or selecting a date',()=>{
 const h=calendarHarness({from:{year:2026,month:12,day:24},invalid:[20261225]});const before=plain(h.q.state.preferredDates);assert.deepEqual(h.press('ArrowRight'),{handled:true,prevented:true});assert.deepEqual(plain(h.rendered),[{year:2026,month:12,day:28}]);assert.ok(h.focused[0].includes('"28"'));assert.deepEqual(plain(h.q.state.preferredDates),before);
});
test('C28 calendar navigation at the allowed endpoint safely retains the current view/focus',()=>{
 const h=calendarHarness({from:{year:2027,month:1,day:28},invalid:[20270129]});h.press('ArrowRight');assert.deepEqual(h.rendered,[]);assert.deepEqual(h.focused,[]);assert.deepEqual(plain(h.q.state.calendarView),{year:2027,month:1});
});

test('C54 explicit monthly selection Undo/Redo preserves quantity and monthly restoration memory atomically',()=>{
 const q=harness();Object.assign(q.state,{period:'협의',frequency:'협의',cadence:cadenceForPeriod('협의')});q.state.values[0]={monthly:'1000',base:'100'};
 q.q4ValidationEpoch=0;q.closeQ4Dropdown=()=>{};q.monthEditing=new Set();
 const h=attachQuantityInput(q);
 vm.runInContext(source.slice(source.indexOf('function selectedOption('),source.indexOf('function disposeProductModal(')),q);
 q.selectedOption('period','매월');assert.equal(q.state.values[0].base,'1000');assert.equal(h.input.value,'1,000');assert.equal(q.state.period,'매월');assert.equal(q.state.monthlyMemory.quantity,'100');
 h.undo();assert.equal(q.state.values[0].base,'100');assert.equal(q.state.period,'협의');assert.equal(q.state.monthlyMemory,undefined);
 h.redo();assert.equal(q.state.values[0].base,'1000');assert.equal(q.state.period,'매월');assert.equal(q.state.monthlyMemory.quantity,'100');
 h.replace('500');assert.equal(q.state.values[0].base,'500');assert.equal(q.state.period,'2주');assert.equal(q.state.monthlyMemory,undefined);
 h.undo();assert.equal(q.state.values[0].base,'1000');assert.equal(q.state.period,'매월');assert.equal(q.state.monthlyMemory.quantity,'100');
});

test('C54 monthly edit preserves Q even when below it and only accepted numeric edits replace explicit negotiation',()=>{
 const q=harness();Object.assign(q.state,{period:'매월',frequency:'1회',cadence:cadenceForPeriod('매월')});q.state.values[0]={monthly:'600',base:'600'};
 q.monthlyEditor={set:(id,value)=>q.state.values[0].monthly=value};q.applyQuantityInput(0,'monthly','599');assert.equal(q.state.values[0].base,'600');assert.equal(q.state.period,'협의');
 q.state.period='협의';q.state.values[0]={monthly:'600',base:'40'};q.applyQuantityInput(0,'min','30');assert.equal(q.state.period,'협의');q.applyQuantityInput(0,'base','40');assert.equal(q.state.period,'협의','boundary no-change is not an accepted edit');q.applyQuantityInput(0,'base','44');assert.equal(q.state.period,'매주');assert.equal(q.state.frequency,'약 3회');
});

test('C54 copy reclassifies changed FIXED target quantities once and mode-only copy preserves dormant legacy cadence',()=>{
 const q=harness({count:2,mode:'MIXED'});q.state.siteModes=['FIXED','FIXED'];q.state.values=[{monthly:'600',base:'40'},{monthly:'600',base:'300'}];q.state.copySource=0;q.state.copyTargets=[1];q.state.copyFields={base:true};
 Object.assign(q,{copyEligibility:()=>({valid:true}),copyIncompatibleReason:()=>'',validateCopyAttempt:()=>assert.fail('unexpected invalid copy'),closeCopy:()=>{},travel:()=>{}});
 vm.runInContext(source.slice(source.indexOf('function applyCopy('),source.indexOf('function animateCopyCardHeight(')),q);
 q.applyCopy();assert.equal(q.state.values[1].base,'40');assert.equal(q.state.siteRepeat[1].period,'매주');assert.equal(q.state.siteRepeat[1].frequency,'약 3회','December31day actual basis');assert.equal(q.state.siteRepeat[1].cadence.version,'3.0.0');assert.equal(q.state.values[0].base,'40');
 q.state.values[1].monthly='20';q.applyCopy();assert.equal(q.state.values[1].base,'40','copy never silently shrinks manual typical quantity');assert.equal(q.state.siteRepeat[1].period,'협의');
 const legacy={period:'3주',frequency:'2회',semantics:'per-week-v1',weekdays:{'1:월':true}};q.state.siteRepeat[1]=structuredClone(legacy);q.state.copyFields={mode:true};q.applyCopy();assert.deepEqual(plain(q.state.siteRepeat[1]),legacy);
});
