import { engineResult } from '../contracts/result.mjs';
import { validateEmailDomain } from './email-dns.mjs';

export const EMAIL_RULE_VERSION = 'email-ascii-idn-1.0.0';
const asciiDomain = value => /^[\x00-\x7f]*$/.test(value) && !value.split('.').some(l => /^xn--/i.test(l)) ? value : null;
const atom = /^[A-Za-z0-9!#$%&'*+\-/=?^_`{|}~]+$/;

/** Restricted input profile; unsupported SMTP forms are not declared invalid. */
export function validateEmailSyntax({raw, phase = 'complete'} = {}, {
  domainToASCII = asciiDomain, tldData = null, nowMs,
} = {}) {
  let normalized = null;
  const result = (status, code, evidence = {}) => engineResult({status,
    reasonCodes: [code], raw: raw ?? null, normalized, field: 'email',
    ruleVersion: EMAIL_RULE_VERSION, dataVersion: tldData?.version ?? null,
    evidence: {profile: 'ASCII_DOT_ATOM_IDN_DOMAIN', ownershipVerified: false, ...evidence}});
  if (typeof raw !== 'string' || !['complete', 'editing'].includes(phase)) return result('INVALID', 'INPUT_CONTRACT');
  if (raw === '') return result('EMPTY', 'EMAIL_EMPTY');
  if (raw.length > 4096) return result('INVALID', 'EMAIL_INPUT_LIMIT');
  if (/[\r\n\x00-\x1f\x7f]/.test(raw)) return result('INVALID', 'EMAIL_CONTROL_CHARACTER');
  // No trimming: retain the user's exact local-part and never silently repair addresses.
  if (raw.startsWith('"')) return result('UNSUPPORTED', 'QUOTED_LOCAL_UNSUPPORTED');
  const pieces = raw.split('@');
  if (pieces.length !== 2 || !pieces[0] || !pieces[1]) {
    return result(phase === 'editing' && pieces.length <= 2 ? 'INCOMPLETE' : 'INVALID', 'EMAIL_SEPARATOR');
  }
  const [local, inputDomain] = pieces;
  if (/[^\x00-\x7f]/.test(local)) return result('UNSUPPORTED', 'SMTPUTF8_UNSUPPORTED');
  if (inputDomain.startsWith('[')) return result('UNSUPPORTED', 'ADDRESS_LITERAL_UNSUPPORTED');
  if (local.length > 64) return result('INVALID', 'LOCAL_TOO_LONG');
  if (!local.split('.').every(part => atom.test(part))) return result('INVALID', 'LOCAL_SYNTAX');
  if (/\s|[\/:?#@\\%]/.test(inputDomain)) return result('INVALID', 'DOMAIN_SYNTAX');
  if (inputDomain.endsWith('.')) return result(phase === 'editing' ? 'INCOMPLETE' : 'INVALID', 'DOMAIN_TRAILING_DOT');
  let domain;
  try { domain = domainToASCII(inputDomain); } catch { return result('INVALID', 'IDNA_INVALID'); }
  if (domain == null) return result('UNKNOWN', 'IDNA_ADAPTER_REQUIRED');
  if (typeof domain !== 'string' || !domain) return result('INVALID', 'IDNA_INVALID');
  domain = domain.toLowerCase();
  const labels = domain.split('.');
  if (domain.length > 253 || labels.some(label => label.length > 63)) return result('INVALID', 'DOMAIN_TOO_LONG');
  if (labels.length < 2) return result(phase === 'editing' ? 'INCOMPLETE' : 'INVALID', 'PUBLIC_DOMAIN_REQUIRED');
  if (!labels.every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return result('INVALID', 'DOMAIN_SYNTAX');
  if (local.length + 1 + domain.length > 254) return result('INVALID', 'MAILBOX_TOO_LONG');
  normalized = {address: `${local}@${domain}`, local, domain};
  const evidence = {tld: labels.at(-1), sourceSha256: tldData?.sourceSha256 ?? null};
  if (!tldData || !Array.isArray(tldData.tlds) || !tldData.tlds.length || !tldData.tlds.every(tld => typeof tld === 'string') ||
      typeof tldData.version !== 'string' || !/^[a-f0-9]{64}$/i.test(tldData.sourceSha256 ?? '')) {
    return result('UNKNOWN', 'TLD_DATA_UNAVAILABLE', evidence);
  }
  const collected = Date.parse(tldData.collectedAt);
  const updated = Date.parse(tldData.sourceUpdatedAt ?? tldData.collectedAt);
  if (!Number.isFinite(nowMs) || !Number.isFinite(collected) || !Number.isFinite(updated) ||
      !Number.isFinite(tldData.maxAgeMs) || tldData.maxAgeMs <= 0 || collected > nowMs || updated > nowMs ||
      nowMs - Math.min(collected, updated) > tldData.maxAgeMs) {
    return result('UNKNOWN', 'TLD_DATA_STALE_OR_TIME_UNKNOWN', evidence);
  }
  if (!tldData.tlds.some(tld => tld.toLowerCase() === labels.at(-1))) return result('INVALID', 'TLD_NOT_DELEGATED', evidence);
  return result('VALID', 'SYNTAX_AND_TLD_VALID', {...evidence, dnsVerified: false});
}

/** Compatibility gate only; VALID syntax alone never permits final completion. */
export function emailCompletionGate(syntax, dns) {
  const complete = syntax?.status === 'VALID' && dns?.status === 'VALID' &&
    syntax.normalized?.domain === dns.normalized?.domain;
  return {policyVersion: 'email-final-gate-1.0.0', preserveDraft: true,
    finalCompletionAllowed: complete, tone: syntax?.status === 'UNKNOWN' || dns?.status === 'UNKNOWN' ? 'neutral' : 'default',
    ownershipVerified: false, orderApproved: false};
}

/** Complete headless path. Syntax/data uncertainty does not trigger DNS calls. */
export async function validateEmail(input, {syntax: syntaxDependencies, dns: dnsDependencies} = {}) {
  const syntax = validateEmailSyntax(input, syntaxDependencies);
  if (syntax.status !== 'VALID') return syntax;
  const dns = await validateEmailDomain(syntax.normalized.domain, dnsDependencies);
  return engineResult({status:dns.status,reasonCodes:dns.reasonCodes,raw:syntax.raw,normalized:syntax.normalized,
    field:'email',ruleVersion:`${EMAIL_RULE_VERSION}+${dns.versions.rules}`,dataVersion:syntax.versions.data,
    evidence:{syntax:syntax.evidence,dns:dns.evidence,ownershipVerified:false,mailboxVerified:false}});
}
