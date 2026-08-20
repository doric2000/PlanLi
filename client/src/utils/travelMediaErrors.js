export function travelMediaErrorMessage(error) {
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
