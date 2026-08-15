export const REPORT_CATEGORIES = Object.freeze([
  { id: 'inaccurate_or_unsafe_travel_info', label: 'מידע נסיעה שגוי או מסוכן', detailsRequired: true },
  { id: 'spam_scam_commercial', label: 'ספאם, הונאה או פרסום מסחרי' },
  { id: 'harassment_hate_threat', label: 'הטרדה, שנאה או איום' },
  { id: 'nudity_sexual', label: 'עירום או תוכן מיני' },
  { id: 'child_safety', label: 'פגיעה או סיכון של ילדים' },
  { id: 'violence_dangerous_illegal', label: 'אלימות, סכנה או פעילות לא חוקית' },
  { id: 'privacy_personal_data', label: 'חשיפת מידע אישי או פגיעה בפרטיות' },
  { id: 'copyright_image_rights', label: 'זכויות יוצרים או שימוש לא מורשה בתמונה', detailsRequired: true },
  { id: 'impersonation', label: 'התחזות' },
  { id: 'other', label: 'סיבה אחרת', detailsRequired: true },
]);
