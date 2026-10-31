import { Resolver } from 'node:dns/promises';
import {domainToASCII as nodeDomainToASCII, domainToUnicode} from 'node:url';

/** Guard malformed A-labels that some Node/ICU builds leave unchanged. */
export function domainToASCII(value) {
  const ascii = nodeDomainToASCII(value).toLowerCase();
  if (!ascii) return '';
  for (const label of ascii.split('.')) {
    if (!label.startsWith('xn--')) continue;
    const unicode = domainToUnicode(label);
    if (!unicode || unicode === label || nodeDomainToASCII(unicode).toLowerCase() !== label) return '';
  }
  return ascii;
}

/** Each query owns its Resolver; abort cannot cancel an unrelated consumer. */
export function createNodeDnsResolver({now = Date.now} = {}) {
  return async (name, type, {signal} = {}) => {
    const resolver = new Resolver({timeout: 1500, tries: 1});
    const abort = () => resolver.cancel();
    signal?.addEventListener('abort', abort, {once: true});
    try {
      if (signal?.aborted) return {status: 'ABORTED', observedAt: now()};
      if (type === 'MX') {
        const records = (await resolver.resolveMx(name)).map(r => ({...r, exchange: r.exchange === '' ? '.' : r.exchange}));
        // Node's MX API does not expose TTL. Do not invent one or cache this RRset.
        return {status: records.length ? 'NOERROR' : 'NODATA', records, observedAt: now(), ttl: null};
      }
      const records = await (type === 'A' ? resolver.resolve4(name, {ttl: true}) : resolver.resolve6(name, {ttl: true}));
      return {status: records.length ? 'NOERROR' : 'NODATA', records: records.map(r => r.address),
        observedAt: now(), ttl: records.length ? Math.min(...records.map(r => r.ttl)) : null};
    } catch (error) {
      return {status: error.code === 'ENOTFOUND' ? 'NXDOMAIN' : error.code === 'ENODATA' ? 'NODATA' : error.code === 'ECANCELLED' ? 'ABORTED' : error.code === 'ETIMEOUT' ? 'TIMEOUT' : 'TEMPFAIL', observedAt: now(), resolverCode: error.code ?? 'UNKNOWN'};
    } finally { signal?.removeEventListener('abort', abort); }
  };
}
