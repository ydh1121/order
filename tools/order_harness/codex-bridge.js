/** Inject host/Drive tools from code mode. No credentials, imports, retries, or daemon. */
export async function runAndCheckpoint({ actionId, hooks }) {
  const names = ['loadIntent', 'saveIntent', 'run', 'prepareExport', 'verifyTargets',
    'findUploaded', 'upload', 'readback', 'verifyDurable'];
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(actionId)) throw new Error('BAD_ACTION_ID');
  for (const name of names) if (typeof hooks[name] !== 'function') throw new Error(`MISSING_HOOK:${name}`);
  let intent = await hooks.loadIntent(actionId);
  if (intent && intent.actionId !== actionId) throw new Error('INTENT_ID_MISMATCH');
  if (intent?.phase === 'VERIFIED') return { ...intent.result, reusedHistoricalCheckpoint: true };
  const save = async (phase, extra = {}) => {
    intent = { ...intent, schema: 'order.harness.bridge/v1', actionId, ...extra, phase };
    await hooks.saveIntent(actionId, intent);
  };
  if (!intent) {
    const command = await hooks.run(actionId);
    if (!['SUCCEEDED', 'FAILED', 'START_FAILED', 'RECONCILED'].includes(command?.status)
        || !Number.isInteger(command?.exit_code)) throw new Error('COMMAND_RESULT_UNKNOWN');
    await save('COMMAND_RECORDED', { command });
  }
  if (!intent.envelope) {
    const envelope = await hooks.prepareExport(actionId, intent.command);
    if (!/^[a-f0-9]{64}$/.test(envelope?.sha256) || !(envelope.bytes > 0)
        || envelope.target_folder_id !== '12c3k0H1C-PUaLqcMakRBlxComO8zvEB2'
        || envelope.target_current_id !== '1p6b303fVYmHH7ekyyVaJE7zK-iaDq8D7') {
      throw new Error('INVALID_EXPORT_ENVELOPE');
    }
    const persisted = envelope.required_action_receipt;
    if (!intent.command.receipt_sha256 || persisted?.sha256 !== intent.command.receipt_sha256
        || persisted?.action_id !== actionId || persisted?.exit_code !== intent.command.exit_code) {
      throw new Error('TERMINAL_RECEIPT_PERSISTENCE_NOT_VERIFIED');
    }
    const uploadName = `ORDER_ASTRA_${actionId}_${envelope.sha256.slice(0, 16)}.zip`;
    await save('EXPORT_READY', { envelope, uploadName });
  }
  const targets = await hooks.verifyTargets(intent.envelope);
  if (targets?.verified !== true) throw new Error('DURABLE_TARGET_NOT_VERIFIED');
  if (!intent.uploaded) {
    // Read actual remote state before deciding whether an earlier write completed.
    const found = await hooks.findUploaded(intent);
    if (found?.ambiguous) throw new Error('AMBIGUOUS_REMOTE_UPLOAD');
    if (found?.id) {
      await save('UPLOADED', { uploaded: found });
    } else if (['UPLOAD_INTENT', 'UPLOAD_UNKNOWN'].includes(intent.phase)) {
      throw new Error('UNKNOWN_UPLOAD_REQUIRES_REVIEW_NO_REUPLOAD');
    } else {
      await save('UPLOAD_INTENT');
      try {
        const uploaded = await hooks.upload(intent);
        if (!uploaded?.id) throw new Error('UPLOAD_RETURNED_NO_FILE_ID');
        await save('UPLOADED', { uploaded });
      } catch (error) {
        // An exception may occur after the remote write. Never infer that no file exists.
        await save('UPLOAD_UNKNOWN', { errorCode: 'REMOTE_WRITE_OUTCOME_UNCONFIRMED' });
        throw new Error('UPLOAD_UNKNOWN_RECONCILE_ACTUAL_REMOTE_STATE', { cause: error });
      }
    }
  }
  const downloaded = await hooks.readback(intent);
  const verified = await hooks.verifyDurable(intent, downloaded);
  if (verified?.status !== 'DURABLE_READBACK_VERIFIED'
      || verified.sha256 !== intent.envelope.sha256
      || verified.bytes !== intent.envelope.bytes
      || verified.file_id !== intent.uploaded.id) throw new Error('DURABLE_READBACK_NOT_VERIFIED');
  const result = { status: intent.command.exit_code === 0 ? 'COMMAND_AND_DURABLE_VERIFIED' : 'COMMAND_FAILED_DURABLE_VERIFIED',
    actionId, commandStatus: intent.command.status, commandExitCode: intent.command.exit_code,
    durable: verified, automaticSessionHook: false, automaticRetry: false };
  await save('VERIFIED', { result });
  return result;
}
