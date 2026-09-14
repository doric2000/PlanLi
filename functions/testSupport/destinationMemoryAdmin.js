// Synthetic Firestore subset: staged atomic writes, nested merges and chained queries.
function createDestinationMemoryAdmin(seed = {}) {
  let sequence = 0;
  const documents = new Map(Object.entries(seed));
  const merge = (a, b) => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map(k => [k, b[k] === undefined ? a[k] : b[k]?.constructor === Object && a[k]?.constructor === Object
      ? merge(a[k], b[k]) : b[k]]));
  const snapshot = ref => ({ id: ref.id, ref, exists: documents.has(ref.path), data: () => {
    const value = documents.get(ref.path);
    return value?.expiresAt instanceof Date ? { ...value, expiresAt: { toDate: () => value.expiresAt } } : value;
  } });
  const write = (ref, data, options) => documents.set(ref.path,
    options?.merge ? merge(documents.get(ref.path) || {}, data) : data);
  const doc = path => ({ path, id: path.split('/').at(-1), get: async () => snapshot(doc(path)),
    set: async (data, options) => write(doc(path), data, options),
    create: async data => { if (documents.has(path)) throw new Error('Already exists'); write(doc(path), data); },
    delete: async () => documents.delete(path),
  });
  const query = (path, filters = [], maximum = Infinity, group = false) => ({
    where: (field, op, expected) => query(path, [...filters, [field, op, expected]], maximum, group),
    limit: n => query(path, filters, n, group), doc: id => doc(`${path}/${id || `synthetic-${++sequence}`}`),
    get: async () => {
      const docs = [...documents].filter(([key, value]) =>
        (group ? key.split('/').at(-2) === path : key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/')) &&
        filters.every(([field, op, expected]) => {
          const actual = field.split('.').reduce((v, k) => v?.[k], value);
          if (op === '==') return actual === expected;
          if (op === 'array-contains') return actual?.includes(expected);
          throw new Error(`Unsupported synthetic query ${op}`);
        })).slice(0, maximum).map(([key]) => snapshot(doc(key)));
      return { docs, empty: !docs.length, size: docs.length };
    },
  });
  const db = { doc, collection: path => query(path), collectionGroup: path => query(path, [], Infinity, true),
    runTransaction: async callback => {
      const writes = [];
      const result = await callback({ get: async ref => {
        if (writes.length) throw new Error('Read after write');
        return ref.get();
      }, create: (ref, data) => writes.push(() => {
        if (documents.has(ref.path)) throw new Error('Already exists'); write(ref, data);
      }), set: (ref, data, options) => writes.push(() => write(ref, data, options)),
      update: (ref, data) => writes.push(() => {
        const nested = {};
        for (const [key, value] of Object.entries(data)) {
          const parts = key.split('.'); let target = nested;
          for (const part of parts.slice(0, -1)) target = target[part] ||= {};
          target[parts.at(-1)] = value;
        }
        write(ref, nested, { merge: true });
      }) });
      writes.forEach(fn => fn()); return result;
    },
  };
  return { documents, firestore: Object.assign(() => db, { FieldValue: { serverTimestamp: () => new Date() } }) };
}
module.exports = { createDestinationMemoryAdmin };
