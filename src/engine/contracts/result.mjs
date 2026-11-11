export const ENGINE_VERSION = '0.3.0';
export const CONTRACT_VERSION = '1.2.0';
export const STATUSES = Object.freeze(['EMPTY','INCOMPLETE','VALID','INVALID','UNSUPPORTED','UNKNOWN','UNAVAILABLE','POLICY_UNRESOLVED','PARTIAL']);

/** JSON-safe versioned envelope. Validation never grants business authority. */
export function engineResult({status, reasonCodes = [], raw = null, normalized = null,
  field = null, ruleVersion = 'unspecified', dataVersion = null, evidence = {}, ...extra}) {
  if (!STATUSES.includes(status)) throw new TypeError(`Unsupported engine status: ${status}`);
  return structuredClone({ ...extra, status, reasonCodes: [...reasonCodes], raw, normalized, field,
    versions: {engine: ENGINE_VERSION, contract: CONTRACT_VERSION, rules: ruleVersion, data: dataVersion}, evidence });
}

/** Current UX compatibility: neutral UNKNOWN preserves drafts but blocks completion. */
export function completionGate(result, {required = true, explicitClear = false} = {}) {
  const fieldEligible = (result.status === 'VALID' && result.field !== 'email') || (!required && result.status === 'EMPTY' && explicitClear);
  return { policyVersion: 'ux-completion-1.0.0', draftAllowed: true,
    fieldEligible, finalCompletionAllowed: fieldEligible,
    presentation: ['UNKNOWN','UNSUPPORTED','UNAVAILABLE','POLICY_UNRESOLVED'].includes(result.status) ? 'NEUTRAL' :
      result.status === 'INVALID' ? 'ERROR' : 'DEFAULT',
    reasonCodes: fieldEligible ? [] : result.field === 'email' && result.status === 'VALID' ? ['EMAIL_DOMAIN_GATE_REQUIRED'] : ['FIELD_COMPLETION_BLOCKED'],
    grants: {registration: false, order: false, payment: false, ownership: false} };
}
