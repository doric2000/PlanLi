export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 60;
export const DISPLAY_NAME_MAX_WORDS = 6;

export function normalizeDisplayName(value) {
  return String(value || '').replace(/\s+/gu, ' ').trim();
}

export function sanitizeDisplayNameInput(value) {
  const withoutLeadingWhitespace = String(value || '').replace(/^\s+/u, '');
  const collapsed = withoutLeadingWhitespace.replace(/\s+/gu, ' ');
  return Array.from(collapsed).slice(0, DISPLAY_NAME_MAX_LENGTH).join('');
}

export function validateDisplayName(value) {
  const normalized = normalizeDisplayName(value);
  const length = Array.from(normalized).length;
  if (length < DISPLAY_NAME_MIN_LENGTH) {
    return 'יש להזין שם באורך של לפחות שני תווים.';
  }
  if (length > DISPLAY_NAME_MAX_LENGTH) {
    return 'השם יכול להכיל עד 60 תווים.';
  }
  if (normalized.split(' ').length > DISPLAY_NAME_MAX_WORDS) {
    return 'השם יכול להכיל עד שש מילים.';
  }
  return '';
}
