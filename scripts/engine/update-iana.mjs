// Explicit maintenance command; never runs as a side effect of validation or CI.
import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { IANA_SOURCE_URL, IANA_MAX_BYTES, IANA_MAX_AGE_MS, parseIanaBytes } from '../../src/engine/reference/iana.mjs';

export async function downloadIana({ fetcher = fetch, timeoutMs = 10000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('IANA_TIMEOUT_CONFIG');
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => { controller.abort(); reject(new Error('IANA_DOWNLOAD_TIMEOUT')); }, timeoutMs);
  });
  const request = (async () => {
    const response = await fetcher(IANA_SOURCE_URL, { signal: controller.signal, redirect: 'error', cache: 'no-store', headers: { 'accept-encoding': 'identity' } });
    if (!response.ok || !response.body) throw new Error(`IANA_HTTP:${response.status}`);
    const lengthHeader = response.headers.get('content-length');
    const expectedLength = lengthHeader == null ? null : Number(lengthHeader);
    if (expectedLength !== null && (!Number.isSafeInteger(expectedLength) || expectedLength < 0 || expectedLength > IANA_MAX_BYTES)) {
      throw new Error('IANA_CONTENT_LENGTH_INVALID');
    }
    const chunks = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > IANA_MAX_BYTES) throw new Error('IANA_DOWNLOAD_TOO_LARGE');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (expectedLength !== null && expectedLength !== length) throw new Error('IANA_DOWNLOAD_TRUNCATED');
    return Buffer.concat(chunks);
  })();
  try { return await Promise.race([request, deadline]); }
  finally { clearTimeout(timeout); controller.abort(); }
}

export async function updateIana({ directory = new URL('../../src/engine/reference/', import.meta.url), fetcher = fetch, now = new Date(), timeoutMs = 10000 } = {}) {
  const nowMs = now.valueOf();
  if (!Number.isFinite(nowMs)) throw new Error('IANA_CLOCK_INVALID');
  const bytes = await downloadIana({ fetcher, timeoutMs });
  const parsed = parseIanaBytes(bytes);
  if (Date.parse(parsed.sourceUpdatedAt) > nowMs || nowMs - Date.parse(parsed.sourceUpdatedAt) > IANA_MAX_AGE_MS) throw new Error('IANA_SOURCE_DATE_INVALID_OR_STALE');
  const manifestUrl = new URL('iana-manifest.json', directory);
  let prior;
  try { prior = JSON.parse(await readFile(manifestUrl, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (prior && (parsed.version < prior.version || parsed.tldCount < prior.tldCount * 0.95)) throw new Error('IANA_REGRESSION_REQUIRES_REVIEW');
  const rawFile = `iana-tlds-${parsed.version}-${parsed.sourceSha256.slice(0, 12)}.txt`;
  const { tlds, ...metadata } = parsed;
  const manifest = {
    schemaVersion: 1, sourceUrl: IANA_SOURCE_URL, ...metadata,
    collectedAt: now.toISOString(), rawFile, maxAgeMs: IANA_MAX_AGE_MS,
    status: 'FETCHED_EXACT_BYTES', refreshCommand: 'node scripts/engine/update-iana.mjs',
  };
  await mkdir(directory, { recursive: true });
  // Raw content is immutable and content addressed. Commit pointer only after bytes exist.
  const rawUrl = new URL(rawFile, directory);
  try { await writeFile(rawUrl, bytes, { flag: 'wx' }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await readFile(rawUrl)).equals(bytes)) throw new Error('IANA_EXISTING_RAW_MISMATCH');
  }
  const tempUrl = new URL(`iana-manifest.${randomUUID()}.tmp`, directory);
  try {
    await writeFile(tempUrl, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    await rename(tempUrl, manifestUrl);
  } finally { await rm(tempUrl, { force: true }); }
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await updateIana(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
