import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createContext,runInContext} from 'node:vm';
import {archivedReferenceClock,installArchivedBrowserClock} from '../fixtures/archived-baseline-build.mjs';
import {buildBrowserReference} from '../../scripts/engine/build-browser-reference.mjs';

const root=fileURLToPath(new URL('../..',import.meta.url));
test('historical build clock is explicit while the normal build still rejects stale IANA',async()=>{
  const pinned=await archivedReferenceClock(root);
  const referenceDir=new URL('../../src/engine/reference/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('iana-manifest.json',referenceDir)));
  assert.equal(pinned.now,Date.parse(manifest.collectedAt)+1);
  assert.equal(pinned.basis,'ARCHIVED_IANA_COLLECTED_AT_PLUS_1MS');
  assert.equal(pinned.sourceSha256,manifest.sourceSha256);
  const valid=await buildBrowserReference({directory:referenceDir,now:pinned.now});
  assert.equal(valid.manifest.sourceSha256,pinned.sourceSha256);
  await assert.rejects(()=>buildBrowserReference({directory:referenceDir,now:Date.parse(manifest.collectedAt)+manifest.maxAgeMs+1}),/BROWSER_BUILD_IANA_STALE_REFRESH_REQUIRED/);
});
test('historical clock refuses a manifest whose raw source no longer matches',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'order-archive-clock-'));
  try{
    const target=join(temp,'src/engine/reference');await mkdir(target,{recursive:true});
    const original=new URL('../../src/engine/reference/iana-manifest.json',import.meta.url);
    const manifest=JSON.parse(await readFile(original));
    await writeFile(join(target,'iana-manifest.json'),JSON.stringify(manifest));
    await writeFile(join(target,manifest.rawFile),'CHANGED HISTORICAL REFERENCE');
    await assert.rejects(()=>archivedReferenceClock(temp),/ARCHIVED_REFERENCE_BYTES_MISMATCH/);
  }finally{await rm(temp,{recursive:true,force:true});}
});

test('archived browser clock advances elapsed time and preserves native Date semantics',async()=>{
  const hostDate=Date,clock=await archivedReferenceClock(root),sandbox=createContext({});
  runInContext('var NativeDate=Date; var realNow=1900000000000; NativeDate.now=()=>realNow;',sandbox);
  let installations=0;
  const context={addInitScript:async(fn,arg)=>{
    installations++;
    sandbox.clockArgument=arg;
    runInContext('('+fn.toString()+')(clockArgument)',sandbox);
  }};
  const receipt=await installArchivedBrowserClock(context,clock);
  assert.equal(installations,1);
  assert.equal(receipt.appliesTo,'ARCHIVED_CONTEXT_ONLY');
  assert.equal(receipt.sourceSha256,clock.sourceSha256);
  assert.equal(runInContext('Date.now()',sandbox),clock.now);
  assert.equal(runInContext('new Date().getTime()',sandbox),clock.now);
  assert.equal(runInContext('Date.parse===NativeDate.parse&&Date.UTC===NativeDate.UTC&&Date.prototype===NativeDate.prototype',sandbox),true);
  assert.equal(runInContext('new Date(123).getTime()',sandbox),123);
  assert.equal(runInContext("new Date('2020-02-03T04:05:06.000Z').toISOString()",sandbox),'2020-02-03T04:05:06.000Z');
  assert.equal(runInContext('Number.isNaN(new Date(NaN).getTime())',sandbox),true);
  assert.equal(runInContext('new Date() instanceof Date&&new Date() instanceof NativeDate',sandbox),true);
  assert.equal(runInContext('class DerivedDate extends Date{}; new DerivedDate() instanceof DerivedDate',sandbox),true);
  runInContext('realNow+=2500',sandbox);
  assert.equal(runInContext('Date.now()',sandbox),clock.now+2500);
  assert.equal(runInContext('new Date().getTime()',sandbox),clock.now+2500);
  assert.equal(runInContext('Date(123)===new NativeDate(Date.now()).toString()',sandbox),true);
  // The wrapper is confined to the injected context, including on rejection.
  assert.equal(globalThis.Date,hostDate);
  await assert.rejects(()=>installArchivedBrowserClock(context,{now:clock.now}),/ARCHIVED_BROWSER_CLOCK_REQUIRED/);
  assert.equal(installations,1);
});
