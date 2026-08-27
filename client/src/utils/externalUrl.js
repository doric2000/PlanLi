const BIDI_FORMATTING_CHARACTERS = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function normalizeExternalUrl(value) {
  if (typeof value !== 'string') return '';
  return value.replace(BIDI_FORMATTING_CHARACTERS, '').trim();
}

export function isValidExternalUrl(value) {
  const normalized = normalizeExternalUrl(value);
  if (!normalized) return true;
  try {
    const parsed = new URL(normalized);
    return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}
