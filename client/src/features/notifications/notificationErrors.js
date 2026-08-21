const codeOf = (error) => String(error?.code || '').replace(/^functions\//u, '');
const reasonOf = (error) => String(
  error?.details?.reason || error?.customData?.details?.reason || ''
).toLowerCase();

export function safeNotificationError(error, fallback = 'לא הצלחנו לעדכן את ההתראות. נסו שוב.') {
  const code = codeOf(error);
  const reason = reasonOf(error);
  if (code === 'unauthenticated') return 'יש להתחבר מחדש כדי לצפות בהתראות.';
  if (code === 'permission-denied' || reason.includes('admin_required')) {
    return 'אין לחשבון הזה הרשאה לפעולה המבוקשת.';
  }
  if (code === 'not-found' || reason.includes('missing')) return 'ההתראה כבר לא זמינה.';
  if (code === 'failed-precondition' || reason.includes('stale')) {
    return 'ההתראה השתנתה. רעננו את הרשימה ונסו שוב.';
  }
  if (code === 'resource-exhausted') return 'בוצעו יותר מדי פעולות. נסו שוב בעוד כמה דקות.';
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'החיבור אינו זמין כרגע. בדקו את הרשת ונסו שוב.';
  }
  return fallback;
}
