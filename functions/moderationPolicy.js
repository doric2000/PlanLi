const REPORT_CATEGORIES = Object.freeze([
  'inaccurate_or_unsafe_travel_info',
  'spam_scam_commercial',
  'harassment_hate_threat',
  'nudity_sexual',
  'child_safety',
  'violence_dangerous_illegal',
  'privacy_personal_data',
  'copyright_image_rights',
  'impersonation',
  'other',
]);

const POLICY_REASONS = Object.freeze([
  { id: 'no_violation', label: 'לא נמצאה הפרה', userMessage: 'בדקנו את הדיווח ולא נמצאה הפרה של כללי הקהילה.' },
  { id: 'inaccurate_or_unsafe_travel_info', label: 'מידע נסיעה שגוי או מסוכן', userMessage: 'הפעולה בוצעה משום שהמידע שפורסם נמצא שגוי או עלול לסכן מטיילים.' },
  { id: 'spam_scam_commercial', label: 'ספאם, הונאה או פרסום מסחרי', userMessage: 'הפעולה בוצעה משום שהתוכן זוהה כספאם, הונאה או פרסום מסחרי אסור.' },
  { id: 'harassment_hate_threat', label: 'הטרדה, שנאה או איום', userMessage: 'הפעולה בוצעה בעקבות תוכן פוגעני, מטריד או מאיים.' },
  { id: 'nudity_sexual', label: 'עירום או תוכן מיני', userMessage: 'הפעולה בוצעה בעקבות תוכן מיני שאינו מתאים לקהילה.' },
  { id: 'child_safety', label: 'בטיחות ילדים', userMessage: 'הפעולה בוצעה כדי להגן על בטיחות ילדים.' },
  { id: 'violence_dangerous_illegal', label: 'אלימות, סכנה או פעילות לא חוקית', userMessage: 'הפעולה בוצעה בעקבות תוכן אלים, מסוכן או בלתי חוקי.' },
  { id: 'privacy_personal_data', label: 'פרטיות ומידע אישי', userMessage: 'הפעולה בוצעה כדי להגן על פרטיות ומידע אישי.' },
  { id: 'copyright_image_rights', label: 'זכויות יוצרים או תמונה', userMessage: 'הפעולה בוצעה בעקבות חשש להפרת זכויות יוצרים או זכויות בתמונה.' },
  { id: 'impersonation', label: 'התחזות', userMessage: 'הפעולה בוצעה בעקבות התחזות או הצגה מטעה של זהות.' },
  { id: 'other', label: 'הפרה אחרת', userMessage: 'הפעולה בוצעה בעקבות הפרה אחרת של כללי הקהילה.' },
]);

const CONTENT_ACTIONS = Object.freeze(['none', 'dismiss', 'hold', 'restore', 'delete']);
const ACCOUNT_ACTIONS = Object.freeze(['none', 'warn', 'suspend', 'reinstate']);
const SUSPENSION_HOURS = Object.freeze([24, 24 * 7, 24 * 30]);
const BULK_OPERATIONS = Object.freeze(['claim', 'unclaim', 'set_priority', 'dismiss']);

function publicModerationPolicy() {
  return {
    reportCategories: [...REPORT_CATEGORIES],
    reasons: POLICY_REASONS.map((reason) => ({ ...reason })),
    contentActions: [...CONTENT_ACTIONS],
    accountActions: [...ACCOUNT_ACTIONS],
    suspensionHours: [...SUSPENSION_HOURS],
    bulkOperations: [...BULK_OPERATIONS],
  };
}

function policyReason(reasonId) {
  return POLICY_REASONS.find((reason) => reason.id === reasonId) || null;
}

module.exports = {
  ACCOUNT_ACTIONS,
  BULK_OPERATIONS,
  CONTENT_ACTIONS,
  POLICY_REASONS,
  REPORT_CATEGORIES,
  SUSPENSION_HOURS,
  policyReason,
  publicModerationPolicy,
};
