import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadIanaSnapshot, parseIanaBytes, verifyIanaSnapshot, ianaFreshness } from '../../src/engine/reference/iana.mjs';
import { downloadIana, updateIana } from '../../scripts/engine/update-iana.mjs';

const source = new URL('../../src/engine/reference/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('iana-manifest.json', source), 'utf8'));
const raw = await readFile(new URL(manifest.rawFile, source));
const now = new Date('2026-10-31T18:00:00.000Z');
const response = bytes => new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });

test('E05 exact official bytes match independently pinned hash, count, header and samples', async () => {
  const data = await loadIanaSnapshot();
  assert.equal(data.version, '2026103100');
  assert.equal(data.sourceSha256, '2bce1ee4d4e7f54ffe678f8852bccb499dc68c67c5018411d5ac346d3bdbda23');
  assert.equal(data.sourceBytes, 9519);
  assert.equal(data.tlds.length, 1436);
  for (const tld of ['ooo', 'app', 'xyz', 'dev', 'zip', 'coffee', 'market', 'photo', 'fitness', 'kr', 'xn--3e0b707e', 'com', 'net', 'co', 'asia']) assert.ok(data.tlds.includes(tld), tld);
  assert.ok(!data.tlds.includes('co.kr'), 'multi-label registration suffix is not a root TLD');
});

test('E05 damaged, empty, truncated, non-ASCII and manifest mismatch never load as current', () => {
  assert.throws(() => parseIanaBytes(Buffer.from('')), /SIZE/);
  assert.throws(() => parseIanaBytes(raw.subarray(0, raw.length - 1)), /TRUNCATED/);
  assert.throws(() => parseIanaBytes(Buffer.concat([raw, Buffer.from('é')])), /ENCODING/);
  assert.throws(() => parseIanaBytes(Buffer.from(raw.toString().replace('ZW\n', ''))), /INCOMPLETE/);
  assert.throws(() => verifyIanaSnapshot(raw, { ...manifest, sourceSha256: 'f'.repeat(64) }), /MISMATCH/);
});

test('E05 freshness ages source even if recently redownloaded; absent clock is unknown', () => {
  assert.equal(ianaFreshness(manifest, now.valueOf()).state, 'FRESH');
  assert.equal(ianaFreshness({ ...manifest, collectedAt: '2026-11-10T00:00:00Z' }, Date.parse('2026-11-10T00:00:00Z')).state, 'STALE');
  assert.equal(ianaFreshness(manifest, undefined).state, 'UNKNOWN');
  assert.equal(ianaFreshness(manifest, Date.parse('2026-10-01')).state, 'UNKNOWN');
});

test('E05 downloader enforces size, content-length and wall-clock ceiling', async () => {
  assert.deepEqual(await downloadIana({ fetcher: async () => response(raw) }), raw);
  await assert.rejects(downloadIana({ fetcher: async () => new Response(raw, { headers: { 'content-length': '65537' } }) }), /LENGTH/);
  await assert.rejects(downloadIana({ fetcher: async () => new Response(raw, { headers: { 'content-length': '9520' } }) }), /TRUNCATED/);
  await assert.rejects(downloadIana({ fetcher: () => new Promise(() => {}), timeoutMs: 5 }), /TIMEOUT/);
});

test('E05 refresh writes verified immutable bytes then pointer; failed refresh preserves pointer', async () => {
  const path = await mkdtemp(join(tmpdir(), 'order-iana-test-'));
  const directory = pathToFileURL(path + '/');
  try {
    const result = await updateIana({ directory, fetcher: async () => response(raw), now });
    assert.equal(result.sourceSha256, manifest.sourceSha256);
    const before = await readFile(new URL('iana-manifest.json', directory));
    await assert.rejects(updateIana({ directory, fetcher: async () => response(raw.subarray(0, 40)), now }), /SIZE/);
    await assert.rejects(updateIana({ directory, fetcher: async () => response(raw), now: new Date('2026-12-01') }), /STALE/);
    assert.deepEqual(await readFile(new URL('iana-manifest.json', directory)), before);
    assert.equal((await loadIanaSnapshot(directory)).tlds.length, 1436);
  } finally { await rm(path, { recursive: true, force: true }); }
});
