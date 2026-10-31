// Reference-data adapter. Pure validators receive the returned snapshot as input.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const IANA_SOURCE_URL = 'https://data.iana.org/TLD/tlds-alpha-by-domain.txt';
export const IANA_MAX_BYTES = 65536;
export const IANA_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function parseIanaBytes(bytes) {
  const body = Buffer.from(bytes);
  if (body.length < 1000 || body.length > IANA_MAX_BYTES || body.some(b => b > 127)) {
    throw new Error('IANA_SOURCE_SIZE_OR_ENCODING');
  }
  const text = body.toString('ascii');
  if (!text.endsWith('\n')) throw new Error('IANA_SOURCE_TRUNCATED');
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sourceHeader = lines.shift();
  lines.pop();
  const header = /^# Version (\d{10}), Last Updated (.+ UTC)$/.exec(sourceHeader);
  if (!header || !Number.isFinite(Date.parse(header[2]))) throw new Error('IANA_SOURCE_HEADER');
  if (lines.length < 1000 || lines.length > 3000 ||
      lines.some(line => !/^[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?$/.test(line)) ||
      new Set(lines).size !== lines.length ||
      lines.some((line, index) => index > 0 && lines[index - 1] >= line)) {
    throw new Error('IANA_SOURCE_RECORDS');
  }
  // Download-integrity sanity checks, never a domain or email allowlist.
  for (const sentinel of ['COM', 'NET', 'ORG', 'KR', 'OOO', 'XN--3E0B707E', 'ZW']) {
    if (!lines.includes(sentinel)) throw new Error('IANA_SOURCE_INCOMPLETE');
  }
  return {
    version: header[1], sourceHeader,
    sourceUpdatedAt: new Date(header[2]).toISOString(),
    sourceSha256: createHash('sha256').update(body).digest('hex'),
    sourceBytes: body.length, tldCount: lines.length,
    tlds: lines.map(tld => tld.toLowerCase()),
  };
}

export function verifyIanaSnapshot(bytes, manifest) {
  const parsed = parseIanaBytes(bytes);
  for (const key of ['version', 'sourceHeader', 'sourceUpdatedAt', 'sourceSha256', 'sourceBytes', 'tldCount']) {
    if (manifest?.[key] !== parsed[key]) throw new Error(`IANA_MANIFEST_MISMATCH:${key}`);
  }
  if (manifest.schemaVersion !== 1 || manifest.sourceUrl !== IANA_SOURCE_URL ||
      !Number.isFinite(Date.parse(manifest.collectedAt)) ||
      !Number.isSafeInteger(manifest.maxAgeMs) || manifest.maxAgeMs <= 0 ||
      Date.parse(manifest.sourceUpdatedAt) > Date.parse(manifest.collectedAt)) {
    throw new Error('IANA_MANIFEST_INVALID');
  }
  return Object.freeze({ ...manifest, tlds: Object.freeze(parsed.tlds) });
}

export async function loadIanaSnapshot(directory = new URL('./', import.meta.url)) {
  const manifest = JSON.parse(await readFile(new URL('iana-manifest.json', directory), 'utf8'));
  if (!/^iana-tlds-\d{10}-[a-f0-9]{12}\.txt$/.test(manifest.rawFile)) {
    throw new Error('IANA_RAW_FILE_INVALID');
  }
  return verifyIanaSnapshot(await readFile(new URL(manifest.rawFile, directory)), manifest);
}

// Reference freshness depends on source age as well as the last download.
export function ianaFreshness(snapshot, nowMs) {
  if (!Number.isSafeInteger(nowMs)) return { state: 'UNKNOWN', reason: 'CLOCK_UNAVAILABLE' };
  const collected = Date.parse(snapshot?.collectedAt);
  const updated = Date.parse(snapshot?.sourceUpdatedAt);
  const ageLimit = snapshot?.maxAgeMs;
  if (!Number.isFinite(collected) || !Number.isFinite(updated) ||
      !Number.isSafeInteger(ageLimit) || ageLimit <= 0 || collected > nowMs || updated > collected) {
    return { state: 'UNKNOWN', reason: 'REFERENCE_METADATA_INVALID' };
  }
  const ageMs = Math.max(nowMs - collected, nowMs - updated);
  return { state: ageMs <= ageLimit ? 'FRESH' : 'STALE', ageMs, maxAgeMs: ageLimit };
}
