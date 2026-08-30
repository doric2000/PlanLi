const UNSAFE_URL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/u;
const MALFORMED_PERCENT_ENCODING = /%(?![0-9A-Fa-f]{2})/u;

function hasEncodedUnsafeCharacters(value) {
  let decoded = value;
  for (let attempt = 0; attempt <= value.length; attempt += 1) {
    let next;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return true;
    }
    if (next === decoded) return false;
    if (UNSAFE_URL_CHARACTERS.test(next) || next.includes('\\')) return true;
    decoded = next;
  }
  return false;
}

function safeExactHttpsUrl(value, allowedHosts) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  const hosts = new Set((Array.isArray(allowedHosts) ? allowedHosts : [allowedHosts])
    .map((host) => String(host || '').trim().toLowerCase())
    .filter(Boolean));
  if (!candidate || candidate.length > 2048 || value !== candidate || !hosts.size ||
      UNSAFE_URL_CHARACTERS.test(value) || candidate.includes('\\')) return null;
  if (MALFORMED_PERCENT_ENCODING.test(candidate)) return null;
  if (hasEncodedUnsafeCharacters(candidate)) return null;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    const authority = candidate.match(/^https:\/\/([^/?#]*)/iu)?.[1] || '';
    if (!authority || authority.toLowerCase() !== parsed.hostname.toLowerCase()) return null;
    if (!hosts.has(parsed.hostname.toLowerCase())) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

module.exports = { safeExactHttpsUrl };
