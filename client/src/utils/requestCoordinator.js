export const REQUEST_FRESH_MS = 30 * 1000;
export const REQUEST_STALE_MS = 5 * 60 * 1000;
export const REQUEST_RETRY_MS = 15 * 1000;
export const REQUEST_CACHE_LIMIT = 50;

export function createRequestCoordinator({
  freshMs = REQUEST_FRESH_MS,
  staleMs = REQUEST_STALE_MS,
  retryMs = REQUEST_RETRY_MS,
  maxEntries = REQUEST_CACHE_LIMIT,
  now = () => Date.now(),
} = {}) {
  const entries = new Map();

  const touch = (key, entry) => {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) break;
      entries.delete(oldestKey);
    }
  };

  const request = (key, loader) => {
    if (!key || typeof loader !== 'function') {
      throw new TypeError('A request key and loader are required.');
    }

    const requestedAt = now();
    const existing = entries.get(key);
    if (existing?.promise) {
      return { requested: false, source: 'in-flight', promise: existing.promise };
    }
    if (existing?.hasValue && existing.freshUntil > requestedAt) {
      touch(key, existing);
      return {
        requested: false,
        source: 'fresh-cache',
        promise: Promise.resolve(existing.value),
      };
    }
    if (existing?.retryAfter > requestedAt) {
      touch(key, existing);
      if (existing.hasValue && existing.staleUntil > requestedAt) {
        return {
          requested: false,
          source: 'stale-cache',
          promise: Promise.resolve(existing.value),
        };
      }
      return {
        requested: false,
        source: 'backoff',
        promise: Promise.reject(existing.error),
      };
    }

    const entry = existing || { hasValue: false };
    let loaded;
    try {
      loaded = loader();
    } catch (error) {
      loaded = Promise.reject(error);
    }
    const promise = Promise.resolve(loaded)
      .then((value) => {
        const resolvedAt = now();
        const resolved = {
          hasValue: true,
          value,
          freshUntil: resolvedAt + freshMs,
          staleUntil: resolvedAt + staleMs,
          retryAfter: 0,
          error: null,
          promise: null,
        };
        if (entries.get(key) === entry) touch(key, resolved);
        return value;
      })
      .catch((error) => {
        const failedAt = now();
        const failed = {
          ...entry,
          error,
          retryAfter: failedAt + retryMs,
          promise: null,
        };
        if (entries.get(key) === entry) touch(key, failed);
        if (entry.hasValue && entry.staleUntil > failedAt) return entry.value;
        throw error;
      });

    entry.promise = promise;
    touch(key, entry);
    return { requested: true, source: 'network', promise };
  };

  const peek = (key, { allowStale = true } = {}) => {
    const entry = entries.get(key);
    if (!entry?.hasValue) return undefined;
    const readAt = now();
    if (entry.freshUntil > readAt || (allowStale && entry.staleUntil > readAt)) {
      touch(key, entry);
      return entry.value;
    }
    return undefined;
  };

  const invalidate = (keyOrPrefix) => {
    if (typeof keyOrPrefix === 'function') {
      Array.from(entries.keys()).forEach((key) => {
        if (keyOrPrefix(key)) entries.delete(key);
      });
      return;
    }
    const prefix = String(keyOrPrefix || '');
    Array.from(entries.keys()).forEach((key) => {
      if (!prefix || key === prefix || key.startsWith(prefix)) entries.delete(key);
    });
  };

  return { request, peek, invalidate, clear: () => entries.clear() };
}
