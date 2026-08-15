export function safeAdminError(error) {
  const reason = error?.details?.reason || error?.customData?.details?.reason;
  if (reason === 'recent_sign_in_required') return 'מטעמי אבטחה יש להתנתק ולהתחבר מחדש לפני פעולה רגישה.';
  if (reason === 'last_admin') return 'אי אפשר להסיר את מנהל המערכת האחרון.';
  if (reason === 'self_admin_action') return 'אי אפשר לבצע פעולה זו על החשבון שלך.';
  if (reason === 'destination_blocked') return 'אי אפשר לאשר את העיר לפני תיקון שגיאות הזיהוי החוסמות.';
  if (reason === 'candidate_expired') return 'הצעת התמונה פגה. יש לבקש הצעות חדשות.';
  if (reason === 'missing_coordinates') return 'אי אפשר לאתר שדה תעופה בלי נקודות ציון תקינות לעיר.';
  if (reason === 'invalid_airport') return 'שדה התעופה שנבחר אינו מועמד מאומת וקרוב לעיר.';
  if (reason === 'invalid_media') return 'קובץ התמונה אינו תקין או אינו שייך לחשבון המנהל.';
  return 'הפעולה לא הושלמה. אפשר לרענן ולנסות שוב.';
}
