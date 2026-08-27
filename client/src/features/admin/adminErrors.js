export function safeAdminError(error, { operationMayContinue = false } = {}) {
  const reason = error?.details?.reason || error?.customData?.details?.reason;
  const code = String(error?.code || error?.name || '').toLowerCase();
  if (reason === 'admin_required') return 'הרשאת המנהל לא אושרה בשרת. יש לוודא שהחשבון רשום כמנהל פעיל ולהתחבר מחדש.';
  if (reason === 'recent_sign_in_required') return 'מטעמי אבטחה יש להתנתק ולהתחבר מחדש לפני פעולה רגישה.';
  if (reason === 'last_admin') return 'אי אפשר להסיר את מנהל המערכת האחרון.';
  if (reason === 'self_admin_action') return 'אי אפשר לבצע פעולה זו על החשבון שלך.';
  if (reason === 'destination_blocked') return 'אי אפשר לאשר את העיר לפני תיקון שגיאות הזיהוי החוסמות.';
  if (reason === 'candidate_expired') return 'הצעת התמונה פגה. יש לבקש הצעות חדשות.';
  if (reason === 'missing_coordinates') return 'אי אפשר לאתר שדה תעופה בלי נקודות ציון תקינות לעיר.';
  if (reason === 'invalid_airport') return 'שדה התעופה שנבחר אינו מועמד מאומת וקרוב לעיר.';
  if (reason === 'invalid_media') return 'קובץ התמונה אינו תקין או אינו שייך לחשבון המנהל.';
  if (reason === 'user_missing') return 'לא נמצא משתמש התואם לחיפוש.';
  if (reason === 'invalid_input') return 'קלט לא תקין, ודא שסיפקת לפחות 3 תווים בתיעוד הפעולה.';
  if (reason === 'content_not_held') return 'התוכן כבר מפורסם ולכן אין צורך להחזיר אותו לפרסום.';
  if (reason === 'content_not_active') return 'מצב התוכן השתנה והוא כבר אינו מפורסם. יש לרענן ולבחור פעולה מתאימה.';
  if (reason === 'content_missing') return 'התוכן כבר אינו זמין. יש לרענן את רשימת הדיווחים.';
  if (reason === 'case_revision_conflict') return 'מנהל אחר עדכן את התיק. המצב העדכני נטען ויש לבדוק אותו מחדש לפני החלטה.';
  if (reason === 'admin_account_protected') return 'אי אפשר להפעיל אכיפה על מנהל פעיל. יש להסיר קודם את הרשאת המנהל באזור המתקדם.';
  if (reason === 'target_owner_missing') return 'לתיק הזה אין חשבון משתמש שאפשר להפעיל עליו אכיפה.';
  if (reason === 'place_destination_mismatch') return 'המקום המאומת אינו שייך לעיר של התוכן. יש לבחור מועמד אחר.';
  if (code.includes('permission-denied')) {
    return 'הרשאת המנהל לא אושרה בשרת. יש לוודא שהחשבון רשום כמנהל פעיל ולהתחבר מחדש.';
  }
  if (code.includes('not-found') || code.includes('unimplemented')) {
    return 'שירותי קונסולת הניהול טרם עודכנו לגרסה הנדרשת. יש להשלים את פריסת השרת ולנסות שוב.';
  }
  if (operationMayContinue && (code.includes('deadline-exceeded') || code.includes('timeout') || code.includes('unavailable'))) {
    return 'הפעולה אורכת זמן רב. ייתכן שהיא עדיין מתבצעת בשרת; אין להפעיל אותה שוב לפני רענון ובדיקת המצב.';
  }
  return 'הפעולה לא הושלמה. אפשר לרענן ולנסות שוב.';
}
