export const ADMIN_SECTIONS = Object.freeze([
  { id: 'overview', label: 'עבודה להיום', icon: 'speedometer-outline' },
  { id: 'queue', label: 'תור בדיקה', icon: 'file-tray-full-outline' },
  { id: 'search', label: 'חיפוש תוכן', icon: 'search-outline' },
  { id: 'destinations', label: 'מקומות', icon: 'location-outline' },
  { id: 'users', label: 'משתמשים', icon: 'people-outline' },
  { id: 'audit', label: 'יומן פעילות', icon: 'time-outline' },
]);

export const QUEUE_VIEWS = Object.freeze([
  { id: 'needs_action', label: 'דורש טיפול' },
  { id: 'urgent', label: 'דחוף' },
  { id: 'overdue', label: 'באיחור' },
  { id: 'mine', label: 'מוקצה לי' },
  { id: 'unassigned', label: 'לא מוקצה' },
  { id: 'held', label: 'מוחזק' },
  { id: 'history', label: 'היסטוריה' },
]);

export const TARGET_LABELS = Object.freeze({
  recommendation: 'המלצה',
  route: 'מסלול',
  trip: 'טיול',
  comment: 'תגובה',
  profile: 'פרופיל',
  destination: 'מקום',
});

export const STATUS_LABELS = Object.freeze({
  open: 'דורש טיפול',
  auto_held: 'הוחזק אוטומטית',
  resolving: 'בטיפול מנהל',
  resolved_dismissed: 'נסגר ללא הפרה',
  resolved_held: 'הוסתר זמנית',
  resolved_restored: 'הוחזר לפרסום',
  resolved_deleted: 'נמחק',
  resolved_actioned: 'נסגר לאחר אכיפה',
  active: 'פעיל',
  moderation_hold: 'מוחזק לבדיקה',
  suspended: 'מושעה',
  deleted: 'נמחק',
});

export const CATEGORY_LABELS = Object.freeze({
  inaccurate_or_unsafe_travel_info: 'מידע שגוי או מסוכן',
  spam_scam_commercial: 'ספאם, הונאה או פרסום',
  harassment_hate_threat: 'הטרדה, שנאה או איום',
  nudity_sexual: 'עירום או תוכן מיני',
  child_safety: 'בטיחות ילדים',
  violence_dangerous_illegal: 'אלימות, סכנה או פעילות לא חוקית',
  privacy_personal_data: 'פרטיות או מידע אישי',
  copyright_image_rights: 'זכויות יוצרים או תמונה',
  impersonation: 'התחזות',
  other: 'אחר',
});

export const AUDIT_LABELS = Object.freeze({
  moderation_case_claim: 'התיק הוקצה',
  moderation_case_unclaim: 'ההקצאה הוסרה',
  moderation_case_set_priority: 'עדיפות התיק שונתה',
  moderation_case_add_note: 'נוספה הערה פנימית',
  moderation_case_resolved: 'התקבלה החלטת מודרציה',
  user_warned: 'נשלחה אזהרה למשתמש',
  user_suspended: 'המשתמש הושעה',
  user_unsuspended: 'המשתמש הוחזר לפעילות',
  user_suspension_expired: 'השעיית המשתמש הסתיימה',
  content_hold: 'התוכן הוסתר זמנית',
  content_restore: 'התוכן הוחזר לפרסום',
  content_delete: 'התוכן נמחק',
  content_dismiss: 'הדיווח נסגר ללא הפרה',
});

export function formatRelativeAge(value, now = Date.now()) {
  const milliseconds = typeof value === 'number'
    ? value
    : Date.parse(value || '');
  if (!Number.isFinite(milliseconds)) return 'זמן לא ידוע';
  const minutes = Math.max(0, Math.floor((now - milliseconds) / 60000));
  if (minutes < 60) return `לפני ${Math.max(1, minutes)} דק׳`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  return `לפני ${days} ימים`;
}

export function formatSla(dueAtMs, now = Date.now()) {
  const due = Number(dueAtMs);
  if (!Number.isFinite(due)) return 'ללא יעד זמן';
  const hours = Math.ceil(Math.abs(due - now) / 3600000);
  return due < now ? `באיחור ${hours} שעות` : `נותרו ${hours} שעות`;
}
