// Entirely synthetic documentation domains and RFC 5737 / RFC 3849 addresses.
export const DNS_FIXTURE_VERSION = 'dns-synthetic-1.0.0';
export const FIXED_TIME = Date.parse('2026-11-01T00:00:00Z');
export const tldFixture = {version: 'SYNTHETIC_TLDS_1', sourceSha256: '0'.repeat(64),
  collectedAt: '2026-11-01T00:00:00Z', sourceUpdatedAt: '2026-11-01T00:00:00Z',
  maxAgeMs: 86400000, tlds: ['com', 'ooo', 'museum', 'xn--p1ai']};
export const observation = (status, records = []) => ({status, records, observedAt: FIXED_TIME, ttl: 60});
export const mxList = count => Array.from({length: count}, (_, i) => ({priority: i + 1, exchange: `mx${i + 1}.example.com`}));
export function fixtureResolver(entries, calls = []) {
  return async (name, type) => {
    calls.push(`${name}/${type}`);
    const value = entries[`${name}/${type}`];
    return structuredClone(value ?? observation('NODATA'));
  };
}
