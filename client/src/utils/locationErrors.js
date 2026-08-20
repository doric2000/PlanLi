function normalizedCode(error) {
  return String(error?.code || error?.details?.code || '')
    .toLowerCase()
    .replace(/^functions\//, '');
}

export function locationErrorKind(error) {
  const code = normalizedCode(error);
  const reason = String(error?.details?.reason || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (reason === 'selection_expired' || code === 'not-found' || message.includes('expired')) return 'expired';
  if (reason === 'provider_timeout' || code === 'deadline-exceeded') return 'timeout';
  if (reason === 'ambiguous_destination' || message.includes('ambiguous')) return 'ambiguous';
  if (code === 'resource-exhausted' || message.includes('quota') || message.includes('limit reached')) return 'quota';
  if (code === 'unavailable' || code === 'internal' || message.includes('network')) return 'network';
  return 'unknown';
}

export function locationIncidentId(error) {
  const incidentId = String(error?.details?.incidentId || '').trim();
  return /^loc_[A-Za-z0-9_-]{8,48}$/.test(incidentId) ? incidentId.slice(-8) : '';
}

export function locationErrorMessage(error) {
  let message;
  switch (locationErrorKind(error)) {
    case 'quota': message = 'מגבלת החיפוש הזמנית הושגה. נסו שוב בעוד זמן קצר.'; break;
    case 'timeout': message = 'טעינת המקום נמשכה זמן רב מדי. נסו שוב.'; break;
    case 'expired': message = 'החיפוש פג תוקף. חפשו ובחרו את המקום מחדש.'; break;
    case 'ambiguous': message = 'לא ניתן לזהות יעד יחיד בבטחה. בחרו מקום מדויק יותר.'; break;
    case 'network': message = 'לא הצלחנו להתחבר לשירות המקומות. בדקו את החיבור ונסו שוב.'; break;
    default: message = 'לא הצלחנו לטעון את המקום. נסו שוב או בחרו תוצאה אחרת.';
  }
  const incidentId = locationIncidentId(error);
  return incidentId ? `${message} קוד תמיכה: ${incidentId}` : message;
}
