import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {archivedReferenceClock} from '../fixtures/archived-baseline-build.mjs';
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
