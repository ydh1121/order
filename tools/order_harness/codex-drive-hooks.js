/** Actual Codex/Drive callback binding, exercised in MSG0549; inject tools and explicit local paths. */
export async function runCodexDriveCheckpoint({tools, config, emit = () => {}}) {
const {base, actionId} = config;
if (!base || !actionId || !config.state || !config.allowlist) throw new Error('MISSING_EXPLICIT_BRIDGE_CONFIG');
const repo = config.repo ?? base + '/order';
const area = config.area ?? base + '/context/0549/harness';
const state = config.state;
const intentPath = area + '/bridge-intents/' + actionId + '.json';
const exportPath = area + '/' + actionId + '.zip';
const envelopePath = area + '/' + actionId + '.envelope.json';
const receiptPath = area + '/' + actionId + '-durable-receipt.json';
const toolReceiptsPath = area + '/' + actionId + '-tool-receipts.json';
const {allowlist} = config;
const folderId = '12c3k0H1C-PUaLqcMakRBlxComO8zvEB2';
const currentId = '1p6b303fVYmHH7ekyyVaJE7zK-iaDq8D7';
const evidence = [];
const quote = value => "'" + String(value).replace(/'/g, "'\\''") + "'";
async function shell(argv, allowNonzero = false) {
  let result = await tools.exec_command({cmd: argv.map(quote).join(' '), workdir: repo,
    yield_time_ms: 10000, max_output_tokens: 4000});
  while (result.session_id && result.exit_code === undefined) {
    const next = await tools.write_stdin({session_id: result.session_id, chars: '', yield_time_ms: 1000, max_output_tokens: 4000});
    result = {...next, output: result.output + next.output};
  }
  if (result.exit_code !== 0 && !allowNonzero) throw new Error('LOCAL_COMMAND_FAILED:' + result.exit_code + ':' + result.output.slice(0, 500));
  return result.output;
}
async function readJson(path, nullable = false) {
  return JSON.parse(await shell(['python', '-c',
    'import pathlib,sys; p=pathlib.Path(sys.argv[1]); print(p.read_text() if p.exists() else "null")' +
      (nullable ? '' : '; assert p.exists()'), path]));
}
async function writeJson(path, value) {
  await shell(['python', '-c',
    'import os,pathlib,sys; p=pathlib.Path(sys.argv[1]); p.parent.mkdir(parents=True,exist_ok=True); t=p.with_suffix(p.suffix+".tmp"); t.write_text(sys.argv[2]+"\\n"); os.replace(t,p)',
    path, JSON.stringify(value, null, 2)]);
}
function data(result, action) {
  if (result.isError) throw new Error(action + '_TOOL_ERROR');
  return result.structuredContent;
}
async function toolReceipt(kind, value) {
  evidence.push({kind, value});
  await writeJson(toolReceiptsPath, {schema:'order.harness.codex-tools/v1',actionId,receipts:evidence});
}
const bridgeSource = await shell(['python','-c','import pathlib,sys; print(pathlib.Path(sys.argv[1]).read_text())',repo+'/tools/order_harness/codex-bridge.js']);
const runAndCheckpoint = new Function(bridgeSource.replace('export async function runAndCheckpoint', 'async function runAndCheckpoint') + '\nreturn runAndCheckpoint;')();
const hooks = {
  loadIntent: () => readJson(intentPath, true),
  saveIntent: async (_id, intent) => writeJson(intentPath, intent),
  run: async id => {
    const result = JSON.parse(await shell(['python',repo+'/tools/order_harness/host.py','--state-dir',state,
      'run','--action-id',id,'--scope',config.scope ?? 'harness_integration','--next',
      config.next ?? 'Review the durable command receipt and continue the authorized work unit.',
      '--',...(config.command ?? ['git','rev-parse','HEAD'])], true));
    await toolReceipt('host_command',result);
    return result;
  },
  prepareExport: async (id, command) => {
    const result = JSON.parse(await shell(['python',repo+'/tools/order_harness/host.py','--state-dir',state,
      'prepare-durable','--allowlist',allowlist,'--output',exportPath,'--require-action',id,'--receipt-sha256',command.receipt_sha256]));
    await toolReceipt('prepare_export',result);
    return readJson(envelopePath);
  },
  verifyTargets: async () => {
    const results = await Promise.allSettled([
      tools.mcp__codex_apps__google_drive_get_file_metadata({fileId:folderId,fields:'id,name,mimeType,parents'}),
      tools.mcp__codex_apps__google_drive_get_file_metadata({fileId:currentId,fields:'id,name,mimeType,parents,size,modifiedTime'})
    ]);
    if (results.some(row => row.status !== 'fulfilled')) throw new Error('TARGET_METADATA_READ_FAILED');
    const folder = data(results[0].value,'folder_metadata');
    const current = data(results[1].value,'current_metadata');
    if (folder.id !== folderId || folder.mime_type !== 'application/vnd.google-apps.folder' ||
        current.id !== currentId || current.mime_type !== 'text/markdown' ||
        !current.parent_ids?.includes(folderId)) throw new Error('TARGET_METADATA_MISMATCH');
    await toolReceipt('verified_target_metadata',{folder,current});
    return {verified:true};
  },
  findUploaded: async intent => {
    const raw = await tools.mcp__codex_apps__google_drive_search({
      special_filter_query_str: "'" + folderId + "' in parents and name = '" + intent.uploadName + "' and trashed = false",
      topn:10,best_effort_fetch:false});
    const found = data(raw,'upload_lookup').results ?? [];
    await toolReceipt('content_hash_name_lookup',{name:intent.uploadName,results:found});
    if (found.length > 1) return {ambiguous:true};
    if (found.length === 0) return null;
    const item = found[0];
    const id = item.id ?? item.file_id;
    if (!id) throw new Error('REMOTE_LOOKUP_ID_UNAVAILABLE');
    return {id,reconciled_by_lookup:true};
  },
  upload: async intent => {
    const uploaded = data(await tools.mcp__codex_apps__google_drive_upload_file({
      file_uri:intent.envelope.path,file_name:intent.uploadName,mime_type:'application/zip',parent_folder_id:folderId
    }),'upload');
    await toolReceipt('upload_result',uploaded);
    return {id:uploaded.id};
  },
  readback: async intent => {
    const metadata = data(await tools.mcp__codex_apps__google_drive_get_file_metadata({
      fileId:intent.uploaded.id,fields:'id,name,mimeType,parents,size,modifiedTime,version'
    }),'readback_metadata');
    if (metadata.mime_type !== 'application/zip' || !metadata.parent_ids?.includes(folderId)) throw new Error('READBACK_METADATA_MISMATCH');
    const metadataPath = area+'/'+actionId+'-remote-metadata.json';
    await writeJson(metadataPath,metadata);
    await toolReceipt('readback_metadata',metadata);
    const fetched = data(await tools.mcp__codex_apps__google_drive_fetch({
      url:'https://drive.google.com/file/d/'+intent.uploaded.id+'/view',download_raw_file:true,include_base64:false
    }),'raw_readback');
    const url = fetched.file_uri?.download_url;
    if (!url || !/^https:\/\/sdmntpr[^/]*\.oaiusercontent\.com\//.test(url)) throw new Error('RAW_DOWNLOAD_URL_UNEXPECTED');
    const downloaded = area+'/'+actionId+'-readback.zip';
    await shell(['curl','--fail','--silent','--show-error','--max-time','30',url,'-o',downloaded]);
    // Never persist temporary signed URLs or provider tokens.
    await toolReceipt('raw_readback_materialized',{file_id:intent.uploaded.id,path:downloaded,bytes:fetched.file_size_bytes});
    return {downloaded,metadata:metadataPath};
  },
  verifyDurable: async (_intent, readback) => {
    const result = JSON.parse(await shell(['python',repo+'/tools/order_harness/host.py','verify-durable',
      '--envelope',envelopePath,'--downloaded',readback.downloaded,'--remote-metadata',readback.metadata,
      '--receipt',receiptPath]));
    await toolReceipt('host_verify_durable',result);
    return result;
  }
};
const result = await runAndCheckpoint({actionId,hooks});
await writeJson(area+'/'+actionId+'-result.json',result);
emit(result);
return result;

}
