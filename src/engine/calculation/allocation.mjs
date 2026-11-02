import {engineResult} from '../contracts/result.mjs';
import {exact,fromRatio,add,subtract,multiply,divide,compare,toJSON,round} from './exact.mjs';

export const ALLOCATION_RULE_VERSION='monthly-allocation-2.1.0';
const zero=()=>exact(0);
const id=value=>typeof value==='string'&&value.length>0&&value.length<=200;
const copy=value=>structuredClone(value);
const out=(status,reasons,normalized=null,extra={})=>engineResult({status,reasonCodes:reasons,normalized,field:'monthlyAllocation',ruleVersion:ALLOCATION_RULE_VERSION,dataVersion:extra.dataVersion??null,evidence:{storageCommitPerformed:false,...extra.evidence},...extra});
const fail=code=>{throw new TypeError(code);};
const uniq=values=>new Set(values).size===values.length;
const pair=(lineId,locationId)=>JSON.stringify([lineId,locationId]);
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
function stateShape(state){
  if(!state||!Number.isSafeInteger(state.revision)||state.revision<0||!Array.isArray(state.lines)||!Array.isArray(state.locations)||!Array.isArray(state.allocations))fail('ALLOCATION_STATE_INVALID');
  if(!state.lines.every(l=>id(l?.lineId))||!uniq(state.lines.map(l=>l.lineId))||!state.locations.every(l=>id(l?.locationId))||!uniq(state.locations.map(l=>l.locationId)))fail('ALLOCATION_IDS_INVALID');
  if(state.allocations.some(a=>!a||!id(a.lineId)||!id(a.locationId))||!uniq(state.allocations.map(a=>pair(a.lineId,a.locationId))))fail('ALLOCATION_PAIRS_INVALID');
  if(state.receipts!=null&&(!Array.isArray(state.receipts)||state.receipts.some(r=>!id(r?.transactionId))||!uniq(state.receipts.map(r=>r.transactionId))))fail('ALLOCATION_RECEIPTS_INVALID');
  if(state.allocations.some(a=>!state.lines.some(l=>l.lineId===a.lineId&&Array.isArray(l.locationIds)&&l.locationIds.includes(a.locationId))))fail('ORPHAN_ALLOCATION');
}
function shape(state,lineId){
  stateShape(state);
  const line=state.lines.find(l=>l.lineId===lineId);
  if(!line)fail('LINE_NOT_FOUND');
  if(!id(line.specVersion)||!Array.isArray(line.locationIds)||!line.locationIds.every(id)||!uniq(line.locationIds)||line.locationIds.some(key=>!state.locations.some(l=>l.locationId===key)))fail('LINE_LINKS_INVALID');
  if(line.minimums!=null&&(!Array.isArray(line.minimums)||line.minimums.some(m=>!m||!line.locationIds.includes(m.locationId))||!uniq(line.minimums.map(m=>m.locationId))))fail('LINE_MINIMUMS_INVALID');
  if(line.monthlyPlanning!==undefined&&(!line.monthlyPlanning||line.monthlyPlanning.version!=='2.0.0'||!['tray','pack'].includes(line.monthlyPlanning.unit)||Object.keys(line.monthlyPlanning).some(key=>!['version','unit'].includes(key))))fail('MONTHLY_PACKAGE_CONTRACT_UNSUPPORTED');
  const units=line.unitTable;
  if(!units||!id(units.version)||!id(units.baseUnit)||!units.factors||typeof units.factors!=='object')fail('UNIT_TABLE_REQUIRED');
  if(compare(unitFactor(units,units.baseUnit),exact(1))!==0)fail('BASE_UNIT_FACTOR_NOT_ONE');
  return line;
}
function unitFactor(table,unit){
  if(!id(unit)||!Object.hasOwn(table.factors,unit))fail('UNIT_CONVERSION_UNAVAILABLE');
  const factor=fromRatio(table.factors[unit]);if(factor.n<=0n)fail('UNIT_FACTOR_INVALID');return factor;
}
function parseQuantity(quantity,line,{minimum=false}={}){
  if(!quantity||typeof quantity.raw!=='string'||!id(quantity.unit))return {status:'INVALID',reason:'QUANTITY_CONTRACT_INVALID'};
  let factor;try{factor=unitFactor(line.unitTable,quantity.unit);}catch(error){return {status:'INVALID',reason:error.message};}
  if(quantity.composing===true||quantity.phase==='editing'&&/^[0-9]+\.$/.test(quantity.raw))return {status:'INCOMPLETE',reason:'QUANTITY_EDITING'};
  if(quantity.raw==='')return {status:'EMPTY',reason:'QUANTITY_EMPTY'};
  try{
    let value;
    if(quantity.representation==='rational'){
      if(quantity.conversionReviewed!==true||!/^\d+\/[1-9]\d*$/.test(quantity.raw))fail('RATIONAL_INPUT_REQUIRES_EXPLICIT_CONVERSION');
      const [numerator,denominator]=quantity.raw.split('/');value=fromRatio({numerator,denominator});
    }else{
      if(!/^\d+(?:\.\d+)?$/.test(quantity.raw))fail('QUANTITY_SYNTAX_INVALID');
      value=exact(quantity.raw);
      if(value.d!==1n&&line.quantityPolicy?.allowFractionalMonthly!==true)return {status:'POLICY_UNRESOLVED',reason:'FRACTIONAL_MONTHLY_POLICY_REQUIRED'};
    }
    if(value.n<0n||(!minimum&&value.n===0n))fail('QUANTITY_NOT_POSITIVE');
    return {status:'VALID',value,base:multiply(value,factor),factor};
  }catch(error){return {status:'INVALID',reason:error.message};}
}
function displayQuantity(base,unit,line){
  const value=divide(base,unitFactor(line.unitTable,unit));
  if(value.d===1n)return {raw:value.n.toString(),unit};
  return {raw:value.n.toString()+'/'+value.d.toString(),unit,representation:'rational',conversionReviewed:true};
}
function baseFingerprint(state,line){
  return canonical({revision:state.revision,line,locations:state.locations.filter(l=>line.locationIds.includes(l.locationId)).sort((a,b)=>a.locationId<b.locationId?-1:1),allocations:state.allocations.filter(a=>a.lineId===line.lineId).sort((a,b)=>a.locationId<b.locationId?-1:1)});
}
function draftShape(draft,line){
  const scope=draft?.scope??[];
  const entries=draft?.entries??[];
  if(!Array.isArray(scope)||!scope.every(key=>line.locationIds.includes(key))||!uniq(scope)||!Array.isArray(entries)||entries.some(e=>!e||!scope.includes(e.locationId)||!['manual','derived'].includes(e.source))||!uniq(entries.map(e=>e.locationId)))fail('ALLOCATION_DRAFT_INVALID');
  return {scope,entries};
}

const demandOrigins=['known','residual','single-total','package-plan','unknown'];
const packagePolicy=line=>line.monthlyPlanning?.version==='2.0.0'&&['tray','pack'].includes(line.monthlyPlanning?.unit);
const recurringCount=(state,line,entries=[])=>line.locationIds.filter(locationId=>(entries.find(row=>row.locationId===locationId)??state.allocations.find(row=>row.lineId===line.lineId&&row.locationId===locationId))?.mode!=='ONCE').length;
function contextualPackageRecord(record,line,count){
  if(record?.demandOrigin!=='single-total'||record.mode==='ONCE'||count<2||record.demandSource!=='derived'||parseQuantity(record.demand,line).status!=='VALID')return record;
  const manual=record.source==='manual',quantity=manual?copy(record.quantity):{raw:'',unit:line.monthlyPlanning.unit};
  return {...record,quantity,demand:null,demandOrigin:manual&&quantity.raw!==''?'package-plan':'unknown',demandSource:'manual'};
}
function packageQuantity(base,unit,line){return {raw:round(divide(base,unitFactor(line.unitTable,unit)),{scale:0,mode:'CEIL'}).decimal,unit};}
function parsePackage(quantity,line){
  if(quantity?.unit!==line.monthlyPlanning.unit)return {status:'INVALID',reason:'PACKAGE_UNIT_REQUIRED'};
  if(quantity?.composing===true)return {status:'INCOMPLETE',reason:'QUANTITY_EDITING'};
  if(quantity?.raw==='')return {status:'EMPTY',reason:'QUANTITY_EMPTY'};
  if(typeof quantity?.raw!=='string'||!/^\d+$/.test(quantity.raw))return {status:'INVALID',reason:'INTEGER_PACKAGE_REQUIRED'};
  return parseQuantity(quantity,line);
}
/** M (demand), known D and integer P are separate. P×size is a plan share, not observed demand. */
function evaluatePackageAllocation(state,line,{scope,entries}){
  const unit=line.monthlyPlanning.unit,factor=unitFactor(line.unitTable,unit),total=parseQuantity(line.total,line),recurring=recurringCount(state,line,entries);
  if(factor.d!==1n)fail('INTEGER_PACKAGE_SIZE_REQUIRED');
  const all=line.locationIds.map(locationId=>{
    const saved=state.allocations.find(a=>a.lineId===line.lineId&&a.locationId===locationId),active=contextualPackageRecord(entries.find(a=>a.locationId===locationId)??saved,line,recurring);
    const quantity=active?.quantity??{raw:'',unit},source=active?.source??'manual',origin=active?.demandOrigin??(active?.demand?'known':'unknown'),mode=active?.mode??'FLEX';
    if(!['manual','derived'].includes(source)||!demandOrigins.includes(origin)||!['FLEX','FIXED','ONCE'].includes(mode)||active?.demandSource!==undefined&&!['manual','derived'].includes(active.demandSource))fail('ALLOCATION_SOURCE_INVALID');
    const parsed=parsePackage(quantity,line),demand=active?.demand?parseQuantity(active.demand,line):null;
    if(demand&&(!['known','residual','single-total'].includes(origin)||active.demand?.unit!==line.unitTable.baseUnit))fail('DEMAND_PROVENANCE_INVALID');
    if(!demand&&['known','residual','single-total'].includes(origin))fail('DEMAND_REQUIRED');
    if(origin==='single-total'&&active.demandSource!=='derived')fail('DEMAND_PROVENANCE_INVALID');
    const editable=scope.includes(locationId),free=editable&&origin!=='known'&&(source==='derived'||parsed.status==='EMPTY');
    const share=!free?(demand?.status==='VALID'?demand.base:parsed.status==='VALID'?parsed.base:null):null;
    return {locationId,saved,active,quantity,source,origin,mode,parsed,demand,editable,free,share};
  });
  const records=all.filter(row=>row.mode!=='ONCE'),excludedLocationIds=all.filter(row=>row.mode==='ONCE').map(row=>row.locationId);
  // One recurring site owns the complete source M. Its inferred demand is not
  // changed to P×size when a user edits only the package plan.
  if(records.length===1&&total.status==='VALID'){
    const row=records[0];
    if(row.origin!=='known'&&row.parsed.status==='VALID'&&(!row.demand||row.demand.status==='VALID')&&(row.source==='manual'||!row.editable)){
      const demand=displayQuantity(total.base,line.unitTable.baseUnit,line);
      row.inferredDemand=!row.demand||row.demand.status!=='VALID'||compare(row.demand.base,total.base)!==0||row.origin!=='single-total';
      row.singleDemand=demand;row.demand=parseQuantity(demand,line);row.origin='single-total';row.share=total.base;row.free=false;
    }
  }
  const notApplicable={lineId:line.lineId,notApplicable:true,totalBase:total.status==='VALID'?toJSON(total.base):null,baseUnit:line.unitTable.baseUnit,packageUnit:unit,proposals:[],sites:[],excludedLocationIds,projectedComplete:true,storedComplete:true,canConfirm:true,monthlyHardCapApplied:false};
  if(!records.length)return out('VALID',[],notApplicable,{dataVersion:line.unitTable.version,evidence:{monthlyOnly:true,storageCommitPerformed:false}});
  const invalid=records.filter(r=>!['VALID','EMPTY'].includes(r.parsed.status)||(r.demand&&r.demand.status!=='VALID'));
  if(total.status!=='VALID'||invalid.length){
    const reasons=[...(total.status==='VALID'?[]:[total.reason]),...invalid.map(r=>r.demand&&r.demand.status!=='VALID'?r.demand.reason:r.parsed.reason)];
    return out(reasons.includes('QUANTITY_EDITING')?'INCOMPLETE':total.status==='EMPTY'&&!invalid.length?'EMPTY':'INVALID',[...new Set(reasons)],{lineId:line.lineId,baseUnit:line.unitTable.baseUnit,packageUnit:unit,totalBase:null,totalPlanPacks:null,planSumPacks:null,packSlackBase:null,fixedSum:null,residualBeforeSuggestions:null,rawResidualBase:null,projectedResidual:null,excess:null,proposals:[],excludedLocationIds,sites:records.map(r=>({locationId:r.locationId,status:r.parsed.status,raw:r.quantity.raw,unit,source:r.source,demandBase:null,currentMaximum:null,currentMaximumPacks:null,additionalCapacity:null,additionalCapacityPacks:null})),projectedComplete:false,storedComplete:false,canConfirm:false},{dataVersion:line.unitTable.version});
  }
  const fixed=records.filter(row=>row.share),fixedSum=fixed.reduce((sum,row)=>add(sum,row.share),zero()),residual=subtract(total.base,fixedSum),unfilled=records.filter(row=>!row.share),proposals=[];
  for(const row of records.filter(row=>row.inferredDemand&&row.editable))proposals.push({locationId:row.locationId,quantity:copy(row.quantity),source:row.source,demand:copy(row.singleDemand),demandOrigin:'single-total',demandSource:'derived',baseQuantity:toJSON(row.demand.base),reason:'SINGLE_SITE_DEMAND_REUSE'});
  // Known demand can independently require ceil(D/p), even when the global ceil(M/p) is smaller.
  for(const row of records.filter(row=>row.origin==='known'&&row.editable&&(row.source==='derived'||row.parsed.status==='EMPTY'))){
    proposals.push({locationId:row.locationId,quantity:packageQuantity(row.demand.base,unit,line),source:'derived',demand:copy(row.active.demand),demandOrigin:'known',demandSource:row.active?.demandSource??'manual',baseQuantity:toJSON(row.demand.base),reason:'KNOWN_SITE_DEMAND_PACK_CEIL'});
  }
  if(unfilled.length===1&&unfilled[0].editable&&residual.n>0n){
    const row=unfilled[0];proposals.push({locationId:row.locationId,quantity:packageQuantity(residual,unit,line),source:'derived',demand:displayQuantity(residual,line.unitTable.baseUnit,line),demandOrigin:records.length===1?'single-total':'residual',demandSource:'derived',baseQuantity:toJSON(residual),allocatesResidual:true,reason:records.length===1?'SINGLE_SITE_TOTAL_REUSE':'SINGLE_REMAINING_LOCATION'});
  }
  const residualProposal=proposals.filter(p=>p.allocatesResidual===true),rawProjectedResidual=subtract(residual,residualProposal.reduce((sum,p)=>add(sum,fromRatio(p.baseQuantity)),zero()));
  const sites=records.map(row=>{
    const proposal=proposals.find(p=>p.locationId===row.locationId),effective=proposal?parsePackage(proposal.quantity,line):row.parsed;
    const demand=proposal?.demand?parseQuantity(proposal.demand,line):row.demand;
    const share=proposal?fromRatio(proposal.baseQuantity):row.share;
    const maximum=subtract(total.base,fixed.filter(other=>other.locationId!==row.locationId).reduce((sum,r)=>add(sum,r.share),zero()));
    const maximumPacks=maximum.n>=0n?packageQuantity(maximum,unit,line).raw:null,currentPacks=effective.status==='VALID'?effective.value:null;
    return {locationId:row.locationId,status:row.parsed.status,raw:row.quantity.raw,unit,source:row.source,demandOrigin:proposal?.demandOrigin??row.origin,demandSource:proposal?.demandSource??(row.singleDemand?'derived':row.active?.demandSource??null),editable:row.editable,baseQuantity:effective.status==='VALID'?toJSON(effective.base):null,demandBase:demand?.status==='VALID'?toJSON(demand.base):null,allocationShareBase:share?toJSON(share):null,planPacks:currentPacks?toJSON(currentPacks):null,packSlackBase:demand?.status==='VALID'&&effective.status==='VALID'?toJSON(subtract(effective.base,demand.base)):null,currentMaximum:toJSON(maximum),currentMaximumPacks:maximumPacks===null?null:toJSON(exact(maximumPacks)),additionalCapacity:share?toJSON(subtract(maximum,share)):toJSON(maximum),additionalCapacityPacks:maximumPacks===null?null:toJSON(subtract(exact(maximumPacks),currentPacks??zero())),proposal:proposal??null};
  });
  const completeRows=sites.every(row=>row.planPacks&&row.allocationShareBase),shortPackages=sites.filter(row=>row.packSlackBase&&fromRatio(row.packSlackBase).n<0n);
  // An unobserved package-plan share is capacity, not an exact demand claim.
  // Once every site is filled, ceil(remaining demand / size) may carry less
  // than one package of slack. Retyping a derived plan does not turn that
  // same capacity into excess demand. Known D is never reduced or invented.
  const knownDemand=sites.reduce((sum,row)=>row.demandBase?add(sum,fromRatio(row.demandBase)):sum,zero());
  const packageOnly=sites.some(row=>row.planPacks&&!row.demandBase);
  const roundingSlack=completeRows&&packageOnly&&compare(knownDemand,total.base)<=0&&rawProjectedResidual.n<0n&&compare(subtract(zero(),rawProjectedResidual),factor)<0;
  const projectedResidual=roundingSlack?zero():rawProjectedResidual;
  const demandExceeded=projectedResidual.n<0n;
  const projectedComplete=completeRows&&projectedResidual.n===0n&&!shortPackages.length;
  const planSum=sites.reduce((sum,row)=>row.planPacks?add(sum,fromRatio(row.planPacks)):sum,zero()),capacity=multiply(planSum,factor);
  const requiredPacks=packageQuantity(total.base,unit,line),allKnown=sites.every(row=>row.demandBase),knownSum=sites.reduce((sum,row)=>row.demandBase?add(sum,fromRatio(row.demandBase)):sum,zero());
  const reasons=demandExceeded?['MONTHLY_ALLOCATION_EXCEEDED']:shortPackages.length?['SITE_PACKAGE_PLAN_SHORT']:!completeRows?['MONTHLY_ALLOCATION_INCOMPLETE']:projectedResidual.n>0n?['MONTHLY_ALLOCATION_SHORT']:proposals.length?['DERIVED_PROPOSAL_AWAITING_CONFIRMATION']:[];
  let storedComplete=false;
  if(!entries.length)storedComplete=projectedComplete&&!proposals.length;
  else {const saved=evaluatePackageAllocation(state,line,{scope:[],entries:[]});storedComplete=!!saved.normalized?.projectedComplete;}
  return out(demandExceeded||shortPackages.length?'INVALID':reasons.length?'INCOMPLETE':'VALID',reasons,{lineId:line.lineId,specVersion:line.specVersion,totalRaw:copy(line.total),totalBase:toJSON(total.base),baseUnit:line.unitTable.baseUnit,packageUnit:unit,packageSize:toJSON(factor),totalPlanPacks:toJSON(exact(requiredPacks.raw)),planSumPacks:toJSON(planSum),displayTotalPacks:toJSON(projectedComplete?planSum:exact(requiredPacks.raw)),packSlackBase:completeRows?toJSON(subtract(capacity,total.base)):null,knownDemandSum:toJSON(knownSum),allSiteDemandKnown:allKnown,fixedSum:toJSON(fixedSum),residualBeforeSuggestions:toJSON(roundingSlack?zero():residual),rawResidualBase:toJSON(residual),projectedResidual:toJSON(projectedResidual),planRoundingSlackBase:toJSON(roundingSlack?subtract(zero(),rawProjectedResidual):zero()),excess:toJSON(demandExceeded?subtract(zero(),projectedResidual):zero()),excessBase:toJSON(demandExceeded?subtract(zero(),projectedResidual):zero()),proposals,sites,excludedLocationIds,projectedComplete,storedComplete,canConfirm:projectedComplete,monthlyHardCapApplied:false},{dataVersion:line.unitTable.version,evidence:{storageCommitPerformed:false,scope,monthlyOnly:true,deliveryQuantityModified:false,demandAndPlanSeparate:true}});
}

/** Read-only proposal. Saved entries outside the explicit edit scope are fixed. */
export function evaluateAllocation({state,lineId,draft}={}){
  try{
    const line=shape(state,lineId),{scope,entries}=draftShape(draft,line);
    if(!line.locationIds.length)return out('UNAVAILABLE',['NO_LINKED_LOCATIONS']);
    if(packagePolicy(line))return evaluatePackageAllocation(state,line,{scope,entries});
    if(state.locations.some(l=>line.locationIds.includes(l.locationId)&&l.required===false))return out('POLICY_UNRESOLVED',['OPTIONAL_LOCATION_POLICY_REQUIRED']);
    const total=parseQuantity(line.total,line);
    const records=line.locationIds.map(locationId=>{
      const saved=state.allocations.find(a=>a.lineId===lineId&&a.locationId===locationId);
      const entry=entries.find(a=>a.locationId===locationId);
      const active=entry??saved;
      const editable=scope.includes(locationId);
      const source=active?.source??'manual';
      if(!['manual','derived'].includes(source))fail('ALLOCATION_SOURCE_INVALID');
      const quantity=active?.quantity??{raw:'',unit:line.total.unit};
      const parsed=parseQuantity(quantity,line);
      const free=editable&&(source==='derived'||parsed.status==='EMPTY');
      const locationMinimum=state.locations.find(l=>l.locationId===locationId)?.minimum;
      if(locationMinimum&&state.lines.filter(l=>l.locationIds.includes(locationId)).length>1&&!line.minimums?.some(m=>m.locationId===locationId))fail('MINIMUM_REQUIRES_LINE_SCOPE');
      const minimum=line.minimums?.find(m=>m.locationId===locationId)?.quantity??locationMinimum;
      const min=minimum?parseQuantity(minimum,line,{minimum:true}):null;
      return {locationId,saved,active,source,quantity,parsed,editable,free,min,mode:active?.mode??'FLEX'};
    });
    if(records.some(r=>r.mode==='ONCE'))return out('POLICY_UNRESOLVED',[records.every(r=>r.mode==='ONCE')?'USE_ONCE_QUANTITY_EVALUATOR':'MIXED_MODE_MONTHLY_POLICY_REQUIRED']);
    if(records.some(r=>!['FLEX','FIXED'].includes(r.mode)))return out('INVALID',['ALLOCATION_MODE_INVALID']);
    const invalid=records.filter(r=>!['VALID','EMPTY'].includes(r.parsed.status)||(r.min&&r.min.status!=='VALID'));
    const blocked=total.status!=='VALID'||invalid.length>0;
    if(blocked){
      const reasons=[...(total.status==='VALID'?[]:[total.reason]),...invalid.map(r=>r.min&&r.min.status!=='VALID'?r.min.reason:r.parsed.reason)];
      const status=reasons.some(r=>/POLICY/.test(r))?'POLICY_UNRESOLVED':total.status==='INCOMPLETE'||invalid.some(r=>r.parsed.status==='INCOMPLETE')?'INCOMPLETE':total.status==='EMPTY'&&!invalid.length?'EMPTY':'INVALID';
      return out(status,[...new Set(reasons)],{lineId,baseUnit:line.unitTable.baseUnit,fixedSum:null,residualBeforeSuggestions:null,projectedResidual:null,proposals:[],sites:records.map(r=>({locationId:r.locationId,raw:r.quantity.raw,unit:r.quantity.unit,status:r.parsed.status,currentMaximum:null,additionalCapacity:null})),projectedComplete:false,storedComplete:false,canConfirm:false},{dataVersion:line.unitTable.version});
    }
    const fixed=records.filter(r=>!r.free&&r.parsed.status==='VALID');
    const fixedSum=fixed.reduce((sum,r)=>add(sum,r.parsed.base),zero());
    const residual=subtract(total.base,fixedSum);
    const unfilled=records.filter(r=>r.free||r.parsed.status==='EMPTY');
    const proposals=[];
    if(unfilled.length===1&&unfilled[0].editable&&residual.n>0n&&(!unfilled[0].min||compare(residual,unfilled[0].min.base)>=0)){
      const row=unfilled[0];
      proposals.push({locationId:row.locationId,source:'derived',quantity:displayQuantity(residual,row.quantity.unit,line),baseQuantity:toJSON(residual),reason:records.length===1?'SINGLE_SITE_TOTAL_REUSE':'SINGLE_REMAINING_LOCATION'});
    }
    const proposedSum=proposals.reduce((sum,p)=>add(sum,fromRatio(p.baseQuantity)),zero());
    const projectedResidual=subtract(residual,proposedSum);
    const sites=records.map(row=>{
      const otherFixed=fixed.filter(r=>r.locationId!==row.locationId).reduce((sum,r)=>add(sum,r.parsed.base),zero());
      const reservedMinimum=records.filter(r=>r.locationId!==row.locationId&&!fixed.includes(r)&&r.min).reduce((sum,r)=>add(sum,r.min.base),zero());
      const maximum=subtract(subtract(total.base,otherFixed),reservedMinimum);
      const proposal=proposals.find(p=>p.locationId===row.locationId);
      const current=proposal?fromRatio(proposal.baseQuantity):row.parsed.status==='VALID'?row.parsed.base:null;
      return {locationId:row.locationId,source:row.source,raw:row.quantity.raw,unit:row.quantity.unit,editable:row.editable,status:row.parsed.status,baseQuantity:row.parsed.status==='VALID'?toJSON(row.parsed.base):null,currentMaximum:toJSON(maximum),additionalCapacity:current?toJSON(subtract(maximum,current)):toJSON(maximum),reservedMinimum:toJSON(reservedMinimum),proposal:proposal??null};
    });
    const minFailures=records.filter(r=>!r.free&&r.parsed.status==='VALID'&&r.min&&compare(r.parsed.base,r.min.base)<0);
    const projectedComplete=unfilled.length===proposals.length&&projectedResidual.n===0n&&!minFailures.length;
    const storedRows=records.map(r=>r.saved?parseQuantity(r.saved.quantity,line):{status:'EMPTY'});
    const storedComplete=storedRows.every((r,i)=>r.status==='VALID'&&(!records[i].min||compare(r.base,records[i].min.base)>=0))&&compare(storedRows.reduce((sum,r)=>add(sum,r.base),zero()),total.base)===0;
    const reasonCodes=residual.n<0n?['MONTHLY_ALLOCATION_EXCEEDED']:minFailures.length?['LOCATION_MINIMUM_UNSATISFIED']:proposals.length?['DERIVED_PROPOSAL_AWAITING_CONFIRMATION']:unfilled.length?['MONTHLY_ALLOCATION_INCOMPLETE']:projectedResidual.n>0n?['MONTHLY_ALLOCATION_SHORT']:[];
    const status=residual.n<0n||minFailures.length?'INVALID':reasonCodes.length?'INCOMPLETE':'VALID';
    return out(status,reasonCodes,{lineId,specVersion:line.specVersion,totalRaw:copy(line.total),baseUnit:line.unitTable.baseUnit,totalBase:toJSON(total.base),fixedSum:toJSON(fixedSum),residualBeforeSuggestions:toJSON(residual),proposals,projectedResidual:toJSON(projectedResidual),excess:toJSON(residual.n<0n?subtract(zero(),residual):zero()),sites,projectedComplete,storedComplete,canConfirm:projectedComplete},{dataVersion:line.unitTable.version,evidence:{storageCommitPerformed:false,scope,monthlyOnly:true,deliveryQuantityModified:false}});
  }catch(error){return out('INVALID',[error.message]);}
}

export function beginAllocationEdit(state,{lineId,scope,transactionId,exposure={}}={}){
  try{
    const line=shape(state,lineId);if(!id(transactionId))fail('TRANSACTION_ID_REQUIRED');
    const checked=draftShape({scope:scope??line.locationIds,entries:[]},line);
    const entries=checked.scope.map(locationId=>{
      const stored=state.allocations.find(a=>a.lineId===lineId&&a.locationId===locationId),saved=packagePolicy(line)?contextualPackageRecord(stored,line,recurringCount(state,line)):stored;
      return {locationId,quantity:copy(saved?.quantity??{raw:'',unit:packagePolicy(line)?line.monthlyPlanning.unit:line.total.unit}),source:saved?.source??'manual',mode:saved?.mode??'FLEX',...(packagePolicy(line)?{demand:copy(saved?.demand??null),demandOrigin:saved?.demandOrigin??(saved?.demand?'known':'unknown'),demandSource:saved?.demandSource??'manual'}:{})};
    });
    const session={transactionId,lineId,baseRevision:state.revision,baseFingerprint:baseFingerprint(state,line),revision:0,scope:checked.scope,entries,exposureBefore:copy(exposure),exposure:copy(exposure),closed:false};
    session.integrityToken=sessionToken(session);
    return out('VALID',[],null,{session});
  }catch(error){return out('INVALID',[error.message]);}
}
function sessionValid(session){
  if(!session||!id(session.transactionId)||!id(session.lineId)||!Number.isSafeInteger(session.revision)||session.revision<0||!Number.isSafeInteger(session.baseRevision)||typeof session.baseFingerprint!=='string'||session.closed)fail('ALLOCATION_SESSION_INVALID');
  if(session.integrityToken!==sessionToken(session))fail('DRAFT_CONTENT_STALE');
}
export function editAllocation(state,session,operation){
  try{
    sessionValid(session);const line=shape(state,session.lineId);draftShape(session,line);
    const next=copy(session);
    const entry=locationId=>{if(!next.scope.includes(locationId))fail('EDIT_OUTSIDE_SCOPE');return next.entries.find(e=>e.locationId===locationId);};
    if(operation?.type==='set'){
      const current=entry(operation.locationId);if(!current)fail('DRAFT_ENTRY_REQUIRED');
      if(current.quantity.unit!==operation.quantity?.unit)fail('UNIT_CHANGE_REQUIRES_CONVERSION');
      current.quantity=copy(operation.quantity);current.source='manual';
      if(packagePolicy(line)&&current.demandOrigin!=='known'){current.demand=null;current.demandOrigin=operation.quantity.raw===''?'unknown':'package-plan';current.demandSource='manual';}
    }else if(operation?.type==='clear'){
      const current=entry(operation.locationId);if(!current)fail('DRAFT_ENTRY_REQUIRED');
      current.quantity={raw:'',unit:current.quantity.unit};current.source='manual';
      if(packagePolicy(line)&&current.demandOrigin!=='known'){current.demand=null;current.demandOrigin='unknown';current.demandSource='manual';}
    }else if(operation?.type==='clone'){
      const source=entry(operation.from);if(!source||!Array.isArray(operation.targets)||!operation.targets.length||!uniq(operation.targets))fail('CLONE_TARGETS_INVALID');
      for(const locationId of operation.targets){const target=entry(locationId);if(!target)fail('CLONE_TARGETS_INVALID');target.quantity=copy(source.quantity);target.source='manual';if(packagePolicy(line)&&target.demandOrigin!=='known'){target.demand=null;target.demandOrigin='package-plan';target.demandSource='manual';}}
    }else if(operation?.type==='setMode'){
      const current=entry(operation.locationId);if(!current||!['FLEX','FIXED','ONCE'].includes(operation.mode))fail('ALLOCATION_MODE_INVALID');current.mode=operation.mode;
    }else if(operation?.type==='convertUnit'){
      const current=entry(operation.locationId);if(!current||operation.reviewed!==true)fail('UNIT_CONVERSION_REVIEW_REQUIRED');
      if(packagePolicy(line)&&operation.unit!==line.monthlyPlanning.unit)fail('PACKAGE_UNIT_REQUIRED');
      const parsed=parseQuantity(current.quantity,line);if(parsed.status!=='VALID')fail('UNIT_CONVERSION_SOURCE_INVALID');
      const original=copy(current.quantity);current.quantity={...displayQuantity(parsed.base,operation.unit,line),conversionFrom:original};
    }else if(operation?.type==='refreshDerived'){
      const evaluation=evaluateAllocation({state,lineId:session.lineId,draft:next});
      if(!evaluation.normalized)fail('ALLOCATION_NOT_EVALUABLE');
      for(const current of next.entries){
        const proposal=evaluation.normalized.proposals.find(p=>p.locationId===current.locationId);
        if(current.mode==='ONCE')continue;
        if(proposal){current.quantity=copy(proposal.quantity);current.source=proposal.source??'derived';if(packagePolicy(line)){current.demand=copy(proposal.demand);current.demandOrigin=proposal.demandOrigin;current.demandSource=proposal.demandSource;}}
        else if(current.source==='derived'&&(!packagePolicy(line)||current.demandOrigin!=='known')){current.quantity={raw:'',unit:current.quantity.unit};if(packagePolicy(line)){current.demand=null;current.demandOrigin='unknown';}}
      }
    }else if(operation?.type==='exposure')next.exposure=copy(operation.value);
    else fail('ALLOCATION_OPERATION_UNSUPPORTED');
    if(packagePolicy(line)){const count=recurringCount(state,line,next.entries);next.entries=next.entries.map(row=>contextualPackageRecord(row,line,count));}
    if(!Number.isSafeInteger(next.revision+1))fail('DRAFT_REVISION_RANGE');next.revision++;
    next.integrityToken=sessionToken(next);
    return out('VALID',[],null,{session:next,evaluation:evaluateAllocation({state,lineId:session.lineId,draft:next})});
  }catch(error){return out('INVALID',[error.message],null,{session:copy(session)});}
}
function sessionToken(session){return canonical({transactionId:session.transactionId,lineId:session.lineId,baseRevision:session.baseRevision,baseFingerprint:session.baseFingerprint,revision:session.revision,scope:session.scope,entries:session.entries,exposureBefore:session.exposureBefore,exposure:session.exposure});}
export function confirmAllocation(state,session,{expectedDraftRevision,acceptProposals=false}={}){
  const unchanged=(status,reasons,extra={})=>out(status,reasons,null,{state:copy(state),committed:false,writes:0,...extra});
  try{
    sessionValid(session);const token=sessionToken(session);
    const receipt=state.receipts?.find(r=>r.transactionId===session.transactionId);
    if(receipt)return receipt.token===token?unchanged('VALID',['ALLOCATION_ALREADY_COMMITTED'],{idempotent:true}):unchanged('INVALID',['TRANSACTION_ID_REUSED']);
    const line=shape(state,session.lineId);draftShape(session,line);
    if(expectedDraftRevision!==session.revision)return unchanged('INVALID',['DRAFT_REVISION_STALE']);
    if(state.revision!==session.baseRevision||baseFingerprint(state,line)!==session.baseFingerprint)return unchanged('INVALID',['ALLOCATION_SNAPSHOT_STALE']);
    const evaluation=evaluateAllocation({state,lineId:session.lineId,draft:session});
    if(!evaluation.normalized?.canConfirm)return unchanged(evaluation.status,['ALLOCATION_NOT_CONFIRMABLE'],{evaluation});
    if(evaluation.normalized.proposals.length&&!acceptProposals)return unchanged('INCOMPLETE',['PROPOSAL_CONFIRMATION_REQUIRED'],{evaluation});
    const next=copy(state);
    for(const locationId of session.scope){
      const entry=session.entries.find(e=>e.locationId===locationId);const proposal=evaluation.normalized.proposals.find(p=>p.locationId===locationId);
      if(!entry)fail('DRAFT_ENTRY_REQUIRED');
      const index=next.allocations.findIndex(a=>a.lineId===session.lineId&&a.locationId===locationId);
      const saved=index<0?{}:next.allocations[index];
      const updated={...saved,lineId:session.lineId,locationId,quantity:copy(proposal?.quantity??entry.quantity),source:proposal?.source??entry.source,mode:entry.mode??saved.mode??'FLEX'};
      if(packagePolicy(line)){updated.demand=copy(proposal?.demand??entry.demand??null);updated.demandOrigin=proposal?.demandOrigin??entry.demandOrigin;updated.demandSource=proposal?.demandSource??entry.demandSource;}
      if(index<0)next.allocations.push(updated);else next.allocations[index]=updated;
    }
    if(!Number.isSafeInteger(next.revision+1))fail('REVISION_RANGE');next.revision++;
    next.receipts=[...(next.receipts??[]),{transactionId:session.transactionId,token,committedRevision:next.revision}];
    return out('VALID',[],null,{state:next,committed:true,writes:1,idempotent:false,evaluation,evidence:{storageCommitPerformed:false,pureStateCommit:true}});
  }catch(error){return unchanged('INVALID',[error.message]);}
}
export function cancelAllocation(state,session){
  try{sessionValid(session);return out('VALID',[],null,{state:copy(state),session:{...copy(session),closed:true},exposure:copy(session.exposureBefore),committed:false,writes:0});}
  catch(error){return out('INVALID',[error.message],null,{state:copy(state),committed:false,writes:0});}
}

/** ONCE quantities have a confirmation threshold, never the monthly hard cap. */
export function evaluateOnceAllocation({state,lineId,entries,confirmedFingerprint=null}={}){
  try{
    const line=shape(state,lineId),total=parseQuantity(line.total,line);
    if(total.status!=='VALID')return out(total.status,[total.reason]);
    if(!Array.isArray(entries)||entries.length!==line.locationIds.length||!uniq(entries.map(e=>e.locationId))||entries.some(e=>!line.locationIds.includes(e.locationId)))fail('ONCE_TARGETS_INVALID');
    const values=entries.map(e=>parseQuantity(e.quantity,line));
    if(values.some(v=>v.status!=='VALID'))return out(values.some(v=>v.status==='INVALID')?'INVALID':values.some(v=>v.status==='POLICY_UNRESOLVED')?'POLICY_UNRESOLVED':'INCOMPLETE',[...new Set(values.filter(v=>v.status!=='VALID').map(v=>v.reason))]);
    const sum=values.reduce((n,v)=>add(n,v.base),zero());
    const fingerprint=canonical({lineId,specVersion:line.specVersion,total:line.total,unitTable:line.unitTable,entries:[...entries].sort((a,b)=>a.locationId<b.locationId?-1:1)});
    const required=compare(sum,total.base)>=0;
    return out(required&&confirmedFingerprint!==fingerprint?'INCOMPLETE':'VALID',required&&confirmedFingerprint!==fingerprint?['ONCE_AT_LEAST_MONTH_CONFIRMATION_REQUIRED']:[],{lineId,sum:toJSON(sum),monthlyTotal:toJSON(total.base),confirmationRequired:required,confirmationSatisfied:!required||confirmedFingerprint===fingerprint,fingerprint,monthlyHardCapApplied:false},{dataVersion:line.unitTable.version});
  }catch(error){return out('INVALID',[error.message]);}
}

/** Explicit structural operation; returns a new state and never persists it. */
export function changeAllocationTopology(state,operation){
  try{
    const next=copy(state);
    stateShape(next);
    for(const current of next.lines)shape(next,current.lineId);
    const line=()=>{const value=next.lines.find(l=>l.lineId===operation.lineId);if(!value)fail('LINE_NOT_FOUND');return value;};
    if(operation?.type==='link'){
      const target=line();if(!next.locations.some(l=>l.locationId===operation.locationId))fail('LOCATION_NOT_FOUND');if(target.locationIds.includes(operation.locationId))fail('LOCATION_ALREADY_LINKED');target.locationIds.push(operation.locationId);
    }else if(operation?.type==='unlink'){
      const target=line();if(!target.locationIds.includes(operation.locationId))fail('LOCATION_NOT_LINKED');target.locationIds=target.locationIds.filter(key=>key!==operation.locationId);next.allocations=next.allocations.filter(a=>!(a.lineId===operation.lineId&&a.locationId===operation.locationId));
    }else if(operation?.type==='deleteLocation'){
      if(!next.locations.some(l=>l.locationId===operation.locationId))fail('LOCATION_NOT_FOUND');next.locations=next.locations.filter(l=>l.locationId!==operation.locationId);for(const l of next.lines)l.locationIds=l.locationIds.filter(key=>key!==operation.locationId);next.allocations=next.allocations.filter(a=>a.locationId!==operation.locationId);
    }else if(operation?.type==='deleteLine'){
      line();next.lines=next.lines.filter(l=>l.lineId!==operation.lineId);next.allocations=next.allocations.filter(a=>a.lineId!==operation.lineId);
    }else if(operation?.type==='reorder'){
      const target=line();if(!Array.isArray(operation.locationIds)||!uniq(operation.locationIds)||operation.locationIds.length!==target.locationIds.length||operation.locationIds.some(key=>!target.locationIds.includes(key)))fail('REORDER_IDS_INVALID');target.locationIds=[...operation.locationIds];
    }else fail('TOPOLOGY_OPERATION_UNSUPPORTED');
    if(!Number.isSafeInteger(next.revision+1))fail('REVISION_RANGE');next.revision++;
    stateShape(next);
    for(const l of next.lines)shape(next,l.lineId);
    return out('VALID',[],null,{state:next,writes:0,evidence:{pureStateChange:true,storageCommitPerformed:false}});
  }catch(error){return out('INVALID',[error.message],null,{state:copy(state),writes:0});}
}
