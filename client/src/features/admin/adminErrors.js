export function safeAdminError(error) {
  const reason = error?.details?.reason || error?.customData?.details?.reason;
  if (reason === 'recent_sign_in_required') return 'מטעמי אבטחה יש להתנתק ולהתחבר מחדש לפני פעולה רגישה.';
  if (reason === 'last_admin') return 'אי אפשר להסיר את מנהל המערכת האחרון.';
  if (reason === 'self_admin_action') return 'אי אפשר לבצע פעולה זו על החשבון שלך.';
  return 'הפעולה לא הושלמה. אפשר לרענן ולנסות שוב.';
}
