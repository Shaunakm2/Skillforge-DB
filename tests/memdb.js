/* In-memory sf_doc with the same optimistic-concurrency contract as the database (used by unit tests). */
module.exports = function memdb() {
  const rows = new Map(), k = (c, key) => c + '\u0000' + key;
  const clone = v => JSON.parse(JSON.stringify(v));
  return {
    rows,
    async get(c, key) { const r = rows.get(k(c, key)); return r ? { data: clone(r.data), version: r.version } : null; },
    async getMany(c, keys) { const m = new Map(); for (const key of keys) { const r = rows.get(k(c, key)); if (r) m.set(key, { data: clone(r.data), version: r.version }); } return m; },
    async put(c, key, data, version) { const r = rows.get(k(c, key));
      if (version == null) { if (r) return false; rows.set(k(c, key), { data: clone(data), version: 1 }); return true; }
      if (!r || r.version !== version) return false; rows.set(k(c, key), { data: clone(data), version: version + 1 }); return true; },
    async del(c, key) { rows.delete(k(c, key)); },
    seed(c, key, data) { rows.set(k(c, key), { data: clone(data), version: 1 }); },
    peek(c, key) { const r = rows.get(k(c, key)); return r && r.data; },
  };
};
