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
  if (reason === 'owner_suspended') return 'אי אפשר לפרסם מחדש תוכן של חשבון מושעה. יש לבחור גם החזרה לפעילות ולבדוק שוב את ההחלטה.';
  if (reason === 'thread_not_active') return 'אי אפשר לשחזר תגובה כל עוד השרשור הראשי אינו פעיל.';
  if (reason === 'account_enforcement_conflict' || reason === 'operation_in_progress') return 'מצב האכיפה של החשבון השתנה או שפעולה אחרת עדיין מתבצעת. המצב העדכני נטען ויש לבדוק אותו מחדש.';
  if (reason === 'decision_retry_conflict') return 'פרטי הניסיון החוזר השתנו. המצב העדכני נטען ויש לבחור את ההחלטה מחדש.';
  if (reason === 'not_suspended' || reason === 'invalid_account_state') return 'החשבון כבר אינו מושעה. המצב העדכני נטען ואין צורך להחזיר אותו שוב לפעילות.';
  if (reason === 'already_suspended') return 'החשבון כבר מושעה. יש לרענן את המשתמש לפני ביצוע פעולה נוספת.';
  if (reason === 'case_revision_conflict') return 'מנהל אחר עדכן את התיק. המצב העדכני נטען ויש לבדוק אותו מחדש לפני החלטה.';
  if (reason === 'admin_account_protected') return 'אי אפשר להפעיל אכיפה על מנהל פעיל. יש להסיר קודם את הרשאת המנהל באזור המתקדם.';
  if (reason === 'target_owner_missing') return 'לתיק הזה אין חשבון משתמש שאפשר להפעיל עליו אכיפה.';
  if (reason === 'candidate_revision_conflict') return 'ההמלצה עודכנה מאז שנטענה. הגרסה העדכנית נטענה ויש לבדוק אותה שוב לפני אישור.';
  if (reason === 'candidate_not_ready') return 'ההמלצה עדיין לא מוכנה לפרסום. יש להשלים את השדות החסרים.';
  if (reason === 'candidate_publishing') return 'ההמלצה כבר בתהליך פרסום. יש לרענן בעוד רגע.';
  if (reason === 'candidate_locked') return 'ההמלצה כבר פורסמה או נדחתה ולא ניתן לשנות אותה.';
  if (reason === 'candidate_not_found') return 'ההמלצה המוצעת כבר אינה זמינה. יש לרענן את התור.';
  if (reason === 'candidate_photo_invalid') return 'אפשר לבחור רק תמונות מהפוסט המקורי שעובדו בהצלחה.';
  if (reason === 'candidate_place_outside_destination') return 'המקום שנבחר אינו נמצא ביעד של ההמלצה.';
  if (reason === 'ingestion_disabled') return 'איסוף המלצות המערכת כבוי כרגע.';
  if (reason === 'ingestion_publisher_missing') return 'חשבון "המלצות מערכת" עדיין לא הוגדר בשרת.';
  if (reason === 'ingestion_budget_exhausted') return 'תקציב האיסוף המאושר נוצל. אין אפשרות להפעיל ריצה נוספת.';
  if (reason === 'ingestion_stage_limit') return 'הפעולה חורגת מהמגבלות של שלב ההרצה הנוכחי.';
  if (reason === 'ingestion_stage_unverified') return 'יש לפרסם המלצת מערכת אחת ולבדוק אותה באפליקציה לפני הרחבת האיסוף.';
  if (reason === 'ingestion_stage_checklist_incomplete') return 'יש לאשר את כל סעיפי הבדיקה לפני הרחבת האיסוף.';
  if (reason === 'ingestion_stage_invalid') return 'שלב ההרצה המבוקש אינו תקין.';
  if (reason === 'ingestion_run_active') return 'ריצת איסוף כבר פעילה. יש להמתין לסיומה.';
  if (reason === 'ingestion_group_not_ready') return 'יש לאמת את הקבוצה ואת היעד שלה לפני הפעלה.';
  if (reason === 'ingestion_group_missing' || reason === 'ingestion_group_invalid') return 'קבוצת הפייסבוק אינה תקינה או אינה קיימת.';
  if (reason === 'ingestion_destination_missing') return 'יש לבחור יעד פעיל של PlanLi.';
  if (reason === 'ingestion_places_quota' || reason === 'ingestion_media_quota') return 'המכסה היומית של האיסוף נוצלה. אפשר לנסות שוב מחר.';
  if (reason === 'apify_not_configured') return 'ספק האיסוף עדיין לא הוגדר בשרת.';
  if (reason === 'ingestion_input_invalid') return 'אחד השדות אינו תקין. יש לבדוק את הערכים ולנסות שוב.';
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
