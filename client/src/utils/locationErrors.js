function normalizedCode(error) {
  return String(error?.code || error?.details?.code || '')
    .toLowerCase()
    .replace(/^functions\//, '');
}

export function locationErrorKind(error) {
  const code = normalizedCode(error);
  const message = String(error?.message || '').toLowerCase();
  if (code === 'resource-exhausted' || message.includes('quota') || message.includes('limit reached')) return 'quota';
  if (code === 'deadline-exceeded' || code === 'not-found' || message.includes('expired')) return 'expired';
  if (code === 'failed-precondition' && message.includes('ambiguous')) return 'ambiguous';
  if (code === 'unavailable' || code === 'internal' || message.includes('network')) return 'network';
  return 'unknown';
}

export function locationErrorMessage(error) {
  switch (locationErrorKind(error)) {
    case 'quota': return 'מגבלת החיפוש הזמנית הושגה. נסו שוב בעוד זמן קצר.';
    case 'expired': return 'החיפוש פג תוקף. חפשו ובחרו את המקום מחדש.';
    case 'ambiguous': return 'לא ניתן לזהות יעד יחיד בבטחה. בחרו מקום מדויק יותר.';
    case 'network': return 'לא הצלחנו להתחבר לשירות המקומות. בדקו את החיבור ונסו שוב.';
    default: return 'לא הצלחנו לטעון את המקום. נסו שוב או בחרו תוצאה אחרת.';
  }
}
