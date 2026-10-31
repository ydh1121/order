import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadIanaSnapshot,ianaFreshness} from '../../src/engine/reference/iana.mjs';
import {updateIana} from './update-iana.mjs';

/** Build-side only: returns the exact validated envelope; browser never imports this. */
export async function buildBrowserReference({outputPath,refresh=false,now=Date.now(),fetcher=fetch,directory=new URL('../../src/engine/reference/',import.meta.url)}={}){
  if(refresh)await updateIana({directory,fetcher,now:new Date(now)});
  const snapshot=await loadIanaSnapshot(directory);
  if(ianaFreshness(snapshot,now).state!=='FRESH')throw Error('BROWSER_BUILD_IANA_STALE_REFRESH_REQUIRED');
  const {tlds,...manifest}=snapshot;
  const rawText=await readFile(new URL(snapshot.rawFile,directory),'utf8');
  const envelope={schemaVersion:1,manifest,rawText};
  if(outputPath){await mkdir(dirname(resolve(outputPath)),{recursive:true});await writeFile(outputPath,JSON.stringify(envelope)+'\n');}
  return envelope;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2),index=args.indexOf('--out');
  if(index<0||!args[index+1]){console.error('Usage: node scripts/engine/build-browser-reference.mjs --out <build/assets/iana-reference.json> [--refresh]');process.exitCode=2;}
  else{try{const result=await buildBrowserReference({outputPath:args[index+1],refresh:args.includes('--refresh')});console.log(JSON.stringify({version:result.manifest.version,sourceSha256:result.manifest.sourceSha256,outputPath:args[index+1]}));}catch(error){console.error(error.message);process.exitCode=1;}}
}
