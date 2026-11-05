import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {checkStructure} from '../../scripts/engine/check-structure-0549.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const source=async file=>readFile(new URL(`../../${file}`,import.meta.url),'utf8');
const counterexample=async(file,transform)=>checkStructure(root,{overrides:new Map([[file,transform(await source(file))]])});

test('STRUCTURE-01 required consumers use exported owners and the explicit entry bridge',async()=>{
 const result=await checkStructure(root);
 assert.deepEqual(result.errors,[]);
 assert.ok(result.requiredCallers.every(row=>row.exported&&row.callers.length));
 assert.ok(result.windowBridges.find(row=>row.name==='OrderModalShell')?.callers.some(row=>row.file==='web/q4-review.mjs'));
});
test('STRUCTURE-02 missing actual main caller fails despite retained imports',async()=>{
 const result=await counterexample('web/main.mjs',text=>text.replace('.connectQ4(','.unwiredQ4('));
 assert.ok(result.errors.some(row=>row.code==='MAIN_BRIDGE_WIRING'));
});
test('STRUCTURE-03 a new product import cycle is rejected',async()=>{
 const result=await counterexample('web/numeric-input.mjs',text=>`import './app.mjs';\n${text}`);
 assert.ok(result.errors.some(row=>row.code==='DEPENDENCY_CYCLE'&&row.cycle.includes('web/app.mjs')));
});
test('STRUCTURE-04 engine-to-UI inversion is rejected for dynamic imports too',async()=>{
 const result=await counterexample('src/engine/calculation/exact.mjs',text=>`${text}\nimport('../../../web/main.mjs');`);
 assert.ok(result.errors.some(row=>row.code==='ENGINE_UI_INVERSION'));
});
test('STRUCTURE-05 a new window dependency cannot have an invented provider',async()=>{
 const result=await counterexample('web/app.mjs',text=>`${text}\nwindow.OrderMissingOwner.read();`);
 assert.ok(result.errors.some(row=>row.code==='GLOBAL_PROVIDER_COUNT'&&row.name==='OrderMissingOwner'));
});
test('STRUCTURE-06 leaving an import while dropping the shared date caller fails',async()=>{
 const result=await counterexample('web/q4-date.mjs',text=>text.replace(/\binspectDateParts\(/g,'disconnectedDatePolicy('));
 assert.ok(result.errors.some(row=>row.code==='MISSING_REQUIRED_CALLER'&&row.id==='DATE-ONCE-POLICY'&&row.imported&&!row.called));
});

test('STRUCTURE-07 a missing injected save caller fails even with a provider present',async()=>{
 const result=await counterexample('web/q4-review.mjs',text=>text.replace(/\bbridge\.commit\(/g,'bridge.disconnectedCommit('));
 assert.ok(result.errors.some(row=>row.code==='INJECTED_BRIDGE_METHOD'&&row.method==='commit'&&row.provided&&!row.called));
});

test('STRUCTURE-08 a restored implicit cross-window editor call is rejected',async()=>{
 const result=await counterexample('web/q4-review.mjs',text=>text.replace(/\bbridge\.commit\(/g,'window.OrderRegularQ4Bridge.commit('));
 assert.ok(result.errors.some(row=>row.code==='LEGACY_CROSS_WINDOW_CALLER'&&row.name==='OrderRegularQ4Bridge'&&row.method==='commit'));
});
