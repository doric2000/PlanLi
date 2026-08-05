export const PROFILE_BIO_MAX_LENGTH = 160;

export function normalizeProfileBio(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .split('\n')
    .slice(0, 2)
    .map((line) => line.trim())
    .join('\n')
    .trim();
}

export function profileBioLength(value) {
  return Array.from(normalizeProfileBio(value)).length;
}

export function validateProfileBio(value) {
  const raw = typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    : '';
  const lineBreaks = (raw.match(/\n/g) || []).length;
  if (lineBreaks > 1) return 'אפשר להשתמש בשתי שורות לכל היותר.';
  const normalized = normalizeProfileBio(value);
  if (profileBioLength(normalized) > PROFILE_BIO_MAX_LENGTH) {
    return `המשפט יכול להכיל עד ${PROFILE_BIO_MAX_LENGTH} תווים.`;
  }
  return '';
}
