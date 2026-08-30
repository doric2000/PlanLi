export function appCheckTokenExpiry(token, now = Date.now()) {
  try {
    const payload = String(token || '').split('.')[1];
    if (!payload) return now + (5 * 60 * 1000);
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = typeof atob === 'function'
      ? atob(padded)
      : globalThis.Buffer?.from(padded, 'base64').toString('utf8');
    const expiry = Number(JSON.parse(json || '{}').exp) * 1000;
    return Number.isFinite(expiry) && expiry > now ? expiry : now + (5 * 60 * 1000);
  } catch {
    return now + (5 * 60 * 1000);
  }
}
