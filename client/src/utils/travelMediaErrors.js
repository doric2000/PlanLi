export function mediaAuthenticationErrorMessage(error) {
  const reason = error?.details?.reason || error?.reason;
  if (['recent_sign_in_required', 'totp_required'].includes(reason)) {
    return 'נדרש אימות מנהל מחדש. התחברו מחדש עם קוד האימות, ואז לחצו על ניסיון נוסף. השינויים והתמונות נשמרו.';
  }
  if (reason === 'OPERATION_AUTH_EXPIRED') {
    return 'נדרשת התחברות מחדש. לאחר ההתחברות לחצו על ניסיון נוסף. השינויים והתמונות נשמרו.';
  }
  return null;
}

export function travelMediaErrorMessage(error) {
  const authenticationMessage = mediaAuthenticationErrorMessage(error);
  if (authenticationMessage) return authenticationMessage;
  switch (error?.details?.publishStage) {
    case 'uploading':
      return 'החיבור נקטע בזמן העלאת התמונות. הפרסום והתמונות נשמרו, ואפשר לנסות שוב.';
    case 'processing':
      return 'הכנת התמונות נמשכה זמן רב מדי. הפרסום והתמונות נשמרו, ואפשר לנסות שוב.';
    case 'saving':
      return 'התמונות הועלו, אבל שמירת הפרסום נכשלה. הפרסום נשמר ואפשר לנסות שוב.';
    default:
      return null;
  }
}
