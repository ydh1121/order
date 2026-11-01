import { engineResult } from '../contracts/result.mjs';

export const DNS_RULE_VERSION = 'mail-route-1.1.0';
const hostname = s => typeof s === 'string' && s.length <= 253 && s.split('.').every(l => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(l));
const normalizeHost = s => typeof s === 'string' ? s.toLowerCase().replace(/\.$/, '') : s;
const isV4 = s => typeof s === 'string' && s.split('.').length === 4 && s.split('.').every(p => /^(0|[1-9][0-9]{0,2})$/.test(p) && Number(p) <= 255);
function isV6(s) {
  if (typeof s !== 'string' || !/^[0-9a-f:.]+$/i.test(s) || s.includes(':::')) return false;
  if (s.includes('.')) { const i = s.lastIndexOf(':'); if (!isV4(s.slice(i + 1))) return false; s = s.slice(0, i) + ':0:0'; }
  if ((s.match(/::/g) ?? []).length > 1) return false;
  const compressed = s.includes('::');
  const groups = s.split(':').filter(Boolean);
  return groups.every(g => /^[a-f0-9]{1,4}$/i.test(g)) &&
    (compressed ? groups.length < 8 : groups.length === 8 && !s.startsWith(':') && !s.endsWith(':'));
}
const absent = status => status === 'NODATA' || status === 'NXDOMAIN';

/** DNS observations, clock, and resolver are explicit dependencies. No SMTP probe. */
export async function validateEmailDomain(domain, {resolver, now, maxQueries = 32,
  timeoutMs = 1500, totalTimeoutMs = 10000, signal, maxMxRecords = 128} = {}) {
  const observations = []; let queries = 0;
  const result = (status, code, extra = {}, dependencies = []) => {
    const current = typeof now === 'function' ? now() : null;
    const evaluatedAt = Number.isFinite(current) ? current : null;
    const observedAt = dependencies.length ? Math.min(...dependencies.map(r => r.observedAt)) : null;
    let validUntil = null;
    if (dependencies.length && ['VALID', 'INVALID'].includes(status)) {
      if (evaluatedAt == null || dependencies.some(r => r.observedAt > evaluatedAt || r.completedAt > evaluatedAt)) {
        status = 'UNKNOWN'; code = 'DNS_CLOCK_INVALID';
      } else if (dependencies.some(r => r.ttl > 0 && r.observedAt + r.ttl * 1000 <= evaluatedAt)) {
        status = 'UNKNOWN'; code = 'DNS_DEPENDENCY_EXPIRED';
      } else if (dependencies.every(r => Number.isFinite(r.ttl) && r.ttl > 0)) {
        validUntil = Math.min(...dependencies.map(r => r.observedAt + r.ttl * 1000));
      }
    }
    return engineResult({status, reasonCodes: [code], raw: domain,
      normalized: {domain}, field: 'email.domain', ruleVersion: DNS_RULE_VERSION,
      dataVersion: 'dns-observation-1', evidence: {queries, maxQueries, timeoutMs, totalTimeoutMs,
        observations, observedAt, evaluatedAt, validUntil,
        revalidationRequired: validUntil == null,
        decisionScope: validUntil == null ? 'CURRENT_VALIDATION_ONLY' : 'TTL_BOUND_OBSERVATION',
        ownershipVerified: false, mailboxVerified: false, ...extra}});
  };
  if (!hostname(domain) || !domain.includes('.') || domain !== domain.toLowerCase() || typeof resolver !== 'function' || typeof now !== 'function' ||
      !Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > 256 ||
      !Number.isInteger(maxMxRecords) || maxMxRecords < 1 || maxMxRecords > 1024 ||
      !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000 ||
      !Number.isFinite(totalTimeoutMs) || totalTimeoutMs < 1 || totalTimeoutMs > 60000 || !Number.isFinite(now())) {
    return result('INVALID', 'DNS_INPUT_CONTRACT');
  }
  const deadline = new AbortController();
  const abort = () => deadline.abort(signal?.reason);
  signal?.addEventListener('abort', abort, {once: true});
  if (signal?.aborted) abort();
  const totalTimer = setTimeout(() => deadline.abort('TOTAL_TIMEOUT'), totalTimeoutMs);
  async function query(name, type) {
    if (deadline.signal.aborted) return {status: 'ABORTED'};
    if (queries >= maxQueries) return {status: 'BUDGET_EXHAUSTED'};
    queries++;
    const startedAt = now();
    if (!Number.isFinite(startedAt)) return {status: 'CLOCK_INVALID'};
    const controller = new AbortController();
    let timer, onAbort;
    const bounded = new Promise(resolve => {
      onAbort = () => { controller.abort(); resolve({status: 'ABORTED'}); };
      deadline.signal.addEventListener('abort', onAbort, {once: true});
      timer = setTimeout(() => { controller.abort(); resolve({status: 'TIMEOUT'}); }, timeoutMs);
    });
    let response;
    try { response = await Promise.race([Promise.resolve().then(() => resolver(name, type, {signal: controller.signal})).catch(() => ({status: 'TEMPFAIL'})), bounded]); }
    finally { clearTimeout(timer); deadline.signal.removeEventListener('abort', onAbort); }
    try { response = structuredClone(response); } catch { response = {status: 'MALFORMED'}; }
    if (!response || !['NOERROR', 'NODATA', 'NXDOMAIN', 'TEMPFAIL', 'TIMEOUT', 'ABORTED'].includes(response.status)) response = {status: 'MALFORMED'};
    const completedAt = now();
    if (!Number.isFinite(completedAt) || completedAt < startedAt) response = {status: 'CLOCK_INVALID'};
    if (absent(response.status) && response.records != null && (!Array.isArray(response.records) || response.records.length)) response = {status: 'MALFORMED'};
    if (['NOERROR', 'NODATA', 'NXDOMAIN'].includes(response.status) && !Number.isFinite(response.observedAt)) response = {status: 'MALFORMED'};
    if (response.observedAt != null && (!Number.isFinite(response.observedAt) || response.observedAt > completedAt ||
        (response.ttl == null && response.observedAt < startedAt) ||
        (response.ttl != null && (!Number.isFinite(response.ttl) || response.ttl < 0 ||
          (response.ttl === 0 ? response.observedAt < startedAt : response.observedAt + response.ttl * 1000 <= completedAt))))) response = {status: 'STALE_RESPONSE'};
    observations.push({...response, name, type, startedAt, completedAt});
    return response;
  }
  try {
    const mx = await query(domain, 'MX');
    if (mx.status === 'NXDOMAIN') return result('INVALID', 'DNS_NXDOMAIN', {}, [observations[0]]);
    if (!['NOERROR', 'NODATA'].includes(mx.status)) return result('UNKNOWN', `DNS_${mx.status}`);
    if (mx.status === 'NOERROR' && !Array.isArray(mx.records)) return result('UNKNOWN', 'DNS_MALFORMED_MX');
    const records = mx.records ?? [];
    if (mx.status === 'NODATA' && records.length) return result('UNKNOWN', 'DNS_MALFORMED_MX');
    if (records.length > maxMxRecords) return result('UNKNOWN', 'DNS_MX_RECORD_BUDGET', {unexaminedMx: records.length - maxMxRecords});
    if (records.some(r => !r || !Number.isInteger(r.priority) || r.priority < 0 || r.priority > 65535 || typeof r.exchange !== 'string')) return result('UNKNOWN', 'DNS_MALFORMED_MX');
    const nulls = records.filter(r => r.exchange === '.');
    if (nulls.length) {
      if (records.length === 1 && nulls[0].priority === 0) return result('INVALID', 'DNS_NULL_MX', {}, [observations[0]]);
      return result('UNKNOWN', 'DNS_NULL_MX_CONFLICT');
    }
    const implicitHost=mx.canonicalName??domain;
    const targets = records.length ? [...new Set([...records].sort((a,b) => a.priority - b.priority || (a.exchange < b.exchange ? -1 : a.exchange > b.exchange ? 1 : 0)).map(r => normalizeHost(r.exchange)))] : [implicitHost];
    if (!targets.every(hostname)) return result('UNKNOWN', 'DNS_MALFORMED_MX_HOST');
    let uncertain = false;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      for (const type of ['A', 'AAAA']) {
        const rr = await query(target, type);
        if (rr.status === 'BUDGET_EXHAUSTED' || rr.status === 'ABORTED') return result('UNKNOWN', `DNS_${rr.status}`, {unexaminedTargets: targets.length - i});
        if (rr.status === 'NOERROR') {
          if (!Array.isArray(rr.records)) { uncertain = true; continue; }
          const accepts = type === 'A' ? isV4 : isV6;
          if (rr.records.some(accepts)) return result('VALID', records.length ? 'DNS_MX_ADDRESS' : 'DNS_IMPLICIT_MX_ADDRESS', {route: {host: target, addressType: type}}, [observations[0], observations.at(-1)]);
          if (rr.records.length) uncertain = true;
        } else if (!absent(rr.status)) uncertain = true;
        if (rr.status === 'NXDOMAIN') break;
      }
    }
    return result(uncertain ? 'UNKNOWN' : 'INVALID', uncertain ? 'DNS_ROUTE_UNCERTAIN' : 'DNS_ALL_ROUTES_ABSENT', {}, observations);
  } finally {
    clearTimeout(totalTimer);
    signal?.removeEventListener('abort', abort);
  }
}
