// Test/QA-builder helper only. A historical archive is built at its own
// committed reference time; the production/current builder retains real time.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function archivedReferenceClock(root) {
  const manifestPath='src/engine/reference/iana-manifest.json';
  const bytes=await readFile(join(root,manifestPath)),manifest=JSON.parse(bytes);
  const collected=Date.parse(manifest.collectedAt);
  if(!Number.isFinite(collected)||new Date(collected).toISOString()!==manifest.collectedAt||!/^[a-zA-Z0-9_.-]+$/.test(manifest.rawFile||''))throw new Error('ARCHIVED_REFERENCE_CLOCK_INVALID');
  const raw=await readFile(join(root,'src/engine/reference',manifest.rawFile));
  if(hash(raw)!==manifest.sourceSha256||raw.length!==manifest.sourceBytes)throw new Error('ARCHIVED_REFERENCE_BYTES_MISMATCH');
  return {classification:'HISTORICAL_BUILD_CLOCK_NOT_CURRENT_FRESHNESS',now:collected+1,asOf:new Date(collected+1).toISOString(),basis:'ARCHIVED_IANA_COLLECTED_AT_PLUS_1MS',manifestPath,manifestSha256:hash(bytes),sourceSha256:hash(raw),sourceBytes:raw.length,version:manifest.version,collectedAt:manifest.collectedAt};
}

export async function buildArchivedBaseline({root,commitSha}) {
  if(!/^[a-f0-9]{40}$/.test(commitSha||''))throw new Error('ARCHIVED_COMMIT_REQUIRED');
  const clock=await archivedReferenceClock(root);
  const builder=await readFile(join(root,'scripts/build-pages.mjs'));
  const program="import {buildPages} from './scripts/build-pages.mjs'; const result=await buildPages({now:Number(process.argv[1]),commitSha:process.argv[2]}); process.stdout.write(JSON.stringify({commitSha:result.commitSha,scope:result.scope}));";
  const stdout=execFileSync(process.execPath,['--input-type=module','-e',program,String(clock.now),commitSha],{cwd:root,env:{...process.env,CF_PAGES_COMMIT_SHA:commitSha},encoding:'utf8'});
  return {...clock,commitSha,builderSha256:hash(builder),build:JSON.parse(stdout)};
}

// Install only in an archived product's browser context. The old reference and
// old source run at their recorded build time; timeout/TTL behavior still ages.
export async function installArchivedBrowserClock(context,clock) {
  if(clock?.classification!=='HISTORICAL_BUILD_CLOCK_NOT_CURRENT_FRESHNESS'||!Number.isSafeInteger(clock.now))throw new Error('ARCHIVED_BROWSER_CLOCK_REQUIRED');
  await context.addInitScript(({asOf})=>{
    const NativeDate=globalThis.Date,started=NativeDate.now();
    const now=()=>asOf+(NativeDate.now()-started);
    function ArchivedDate(...args) {
      if(new.target)return Reflect.construct(NativeDate,args.length?args:[now()],new.target);
      return new NativeDate(now()).toString();
    }
    Object.setPrototypeOf(ArchivedDate,NativeDate);
    ArchivedDate.prototype=NativeDate.prototype;
    ArchivedDate.now=now;
    globalThis.Date=ArchivedDate;
  },{asOf:clock.now});
  return {...clock,classification:'HISTORICAL_BROWSER_RUNTIME_CLOCK_NOT_CURRENT_FRESHNESS',behavior:'ARCHIVED_BUILD_TIME_PLUS_REAL_ELAPSED',appliesTo:'ARCHIVED_CONTEXT_ONLY'};
}
