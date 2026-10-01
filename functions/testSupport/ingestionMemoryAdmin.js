// Synthetic Firestore subset for ingestion tests: transactions, merges, increments,
// equality/in/range filters, ordering, cursors, counts, and subcollections.
const SERVER_TIMESTAMP = Symbol('serverTimestamp');
const DELETE = Symbol('delete');

function createIngestionMemoryAdmin(seed = {}, { now = () => new Date('2026-10-01T10:00:00Z') } = {}) {
  const documents = new Map(Object.entries(seed));
  let sequence = 0;
  const plain = (value) => value?.constructor === Object;
  const resolve = (current, value) => {
    if (value === SERVER_TIMESTAMP) return now();
    if (value && value.__increment !== undefined) return Number(current || 0) + value.__increment;
    if (plain(value)) {
      return Object.fromEntries(Object.entries(value)
        .filter(([, entry]) => entry !== DELETE)
        .map(([key, entry]) => [key, resolve(undefined, entry)]));
    }
    if (Array.isArray(value)) return value.map((entry) => resolve(undefined, entry));
    return value;
  };
  const merge = (base, patch) => {
    const result = { ...(base || {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === DELETE) delete result[key];
      else if (plain(value) && plain(result[key])) result[key] = merge(result[key], value);
      else if (value && value.__increment !== undefined) result[key] = Number(result[key] || 0) + value.__increment;
      else result[key] = resolve(undefined, value);
    }
    return result;
  };
  const write = (path, data, options) => {
    documents.set(path, options?.merge ? merge(documents.get(path), data) : resolve(undefined, data));
  };
  const fieldOf = (data, field) => field.split('.').reduce((value, key) => value?.[key], data);
  const comparable = (value) => (value instanceof Date ? value.getTime() : value);
  const snapshot = (path) => {
    const exists = documents.has(path);
    return { id: path.split('/').at(-1), ref: doc(path), exists, data: () => (exists ? structuredClone(documents.get(path)) : undefined) };
  };
  function doc(path) {
    return {
      path,
      id: path.split('/').at(-1),
      get: async () => snapshot(path),
      set: async (data, options) => write(path, data, options),
      create: async (data) => {
        if (documents.has(path)) {
          const error = new Error('Document already exists');
          error.code = 6;
          throw error;
        }
        write(path, data);
      },
      update: async (data) => {
        if (!documents.has(path)) throw Object.assign(new Error('Not found'), { code: 5 });
        write(path, data, { merge: true });
      },
      delete: async () => { documents.delete(path); },
      collection: (name) => query(`${path}/${name}`),
    };
  }
  function query(path, filters = [], order = null, maximum = Infinity, cursor = null) {
    const api = {
      where: (field, op, expected) => query(path, [...filters, [field, op, expected]], order, maximum, cursor),
      orderBy: (field, direction = 'asc') => query(path, filters, [field, direction], maximum, cursor),
      limit: (n) => query(path, filters, order, n, cursor),
      startAfter: (snap) => query(path, filters, order, maximum, snap.id),
      doc: (id) => doc(`${path}/${id || `auto-${++sequence}`}`),
      count: () => ({ get: async () => ({ data: () => ({ count: (matching()).length }) }) }),
      get: async () => {
        let docs = matching();
        if (cursor) docs = docs.slice(docs.findIndex(([key]) => key.endsWith(`/${cursor}`)) + 1);
        const result = docs.slice(0, maximum).map(([key]) => snapshot(key));
        return { docs: result, empty: !result.length, size: result.length };
      },
    };
    function matching() {
      let docs = [...documents].filter(([key]) => key.startsWith(`${path}/`) && !key.slice(path.length + 1).includes('/'))
        .filter(([, value]) => filters.every(([field, op, expected]) => {
          const actual = comparable(fieldOf(value, field));
          const wanted = comparable(expected);
          if (op === '==') return actual === wanted;
          if (op === 'in') return expected.includes(actual);
          if (op === '<=') return actual != null && actual <= wanted;
          if (op === '<') return actual != null && actual < wanted;
          if (op === 'array-contains') return Array.isArray(actual) && actual.includes(expected);
          throw new Error(`Unsupported synthetic query ${op}`);
        }));
      if (order) {
        const [field, direction] = order;
        docs = docs.sort(([, left], [, right]) => {
          const a = comparable(fieldOf(left, field)) ?? 0;
          const b = comparable(fieldOf(right, field)) ?? 0;
          return direction === 'desc' ? (b > a ? 1 : b < a ? -1 : 0) : (a > b ? 1 : a < b ? -1 : 0);
        });
      }
      return docs;
    }
    return api;
  }
  const db = {
    doc,
    collection: (path) => query(path),
    runTransaction: async (callback) => {
      const writes = [];
      const result = await callback({
        get: async (target) => {
          if (writes.length) throw new Error('Read after write');
          return target.get();
        },
        create: (ref, data) => writes.push(() => ref.create(data)),
        set: (ref, data, options) => writes.push(() => ref.set(data, options)),
        update: (ref, data) => writes.push(() => ref.update(data)),
        delete: (ref) => writes.push(() => ref.delete()),
      });
      for (const apply of writes) {
        // eslint-disable-next-line no-await-in-loop
        await apply();
      }
      return result;
    },
  };
  const firestore = Object.assign(() => db, {
    FieldValue: {
      serverTimestamp: () => SERVER_TIMESTAMP,
      increment: (value) => ({ __increment: value }),
      delete: () => DELETE,
    },
  });
  return { documents, firestore };
}

module.exports = { createIngestionMemoryAdmin };
