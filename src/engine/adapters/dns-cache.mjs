/** TTL cache with a generation lease: late results cannot overwrite newer ones. */
export function createDnsCacheResolver(resolver, {now, maxEntries = 256} = {}) {
  if (typeof resolver !== 'function' || typeof now !== 'function' || !Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000) throw new TypeError('DNS_CACHE_CONTRACT');
  const values = new Map(), generations = new Map();
  let serial = 0;
  async function resolve(name, type, options) {
    const key = `${name}\0${type}`;
    const cached = values.get(key);
    if (cached && cached.observedAt <= now() && cached.observedAt + cached.ttl * 1000 > now()) return structuredClone(cached);
    values.delete(key);
    const generation = ++serial;
    generations.set(key, generation);
    let response;
    try { response = await resolver(name, type, options); }
    catch (error) { if (generations.get(key) === generation) generations.delete(key); throw error; }
    if (generations.get(key) === generation) {
      generations.delete(key);
      if (response && ['NOERROR', 'NODATA', 'NXDOMAIN'].includes(response.status) &&
          Number.isFinite(response.ttl) && response.ttl > 0 && Number.isFinite(response.observedAt) &&
          response.observedAt <= now() && response.observedAt + response.ttl * 1000 > now()) {
        if (values.size >= maxEntries) values.delete(values.keys().next().value);
        values.set(key, structuredClone(response));
      }
    }
    return response;
  }
  resolve.invalidate = (name, type) => { const key = `${name}\0${type}`; values.delete(key); generations.delete(key); };
  resolve.clear = () => { values.clear(); generations.clear(); };
  return resolve;
}
