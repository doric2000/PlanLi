import { safeAdminError } from '../src/features/admin/adminErrors';

describe('admin errors', () => {
  it('never exposes raw callable messages', () => {
    expect(safeAdminError({ message: 'INTERNAL token and stack trace' })).toBe('הפעולה לא הושלמה. אפשר לרענן ולנסות שוב.');
    expect(safeAdminError({ details: { reason: 'recent_sign_in_required' }, message: 'raw' })).toContain('להתחבר מחדש');
    expect(safeAdminError({ details: { reason: 'destination_blocked' }, message: 'raw' })).toContain('שגיאות הזיהוי');
    expect(safeAdminError({ code: 'functions/deadline-exceeded', message: 'raw' }, { operationMayContinue: true })).toContain('עדיין מתבצעת בשרת');
    expect(safeAdminError({ code: 'functions/not-found', message: 'raw' })).toContain('טרם עודכנו');
    expect(safeAdminError({ code: 'functions/permission-denied', message: 'raw' })).toContain('לא אושרה בשרת');
    expect(safeAdminError({ code: 'functions/not-found', details: { reason: 'content_missing' }, message: 'raw' })).toContain('כבר אינו זמין');
    expect(safeAdminError({ code: 'functions/permission-denied', details: { reason: 'self_admin_action' }, message: 'raw' })).toContain('על החשבון שלך');
    expect(safeAdminError({ details: { reason: 'owner_suspended' } })).toContain('החזרה לפעילות');
    expect(safeAdminError({ details: { reason: 'thread_not_active' } })).toContain('השרשור הראשי');
    expect(safeAdminError({ details: { reason: 'account_enforcement_conflict' } })).toContain('מצב האכיפה');
    expect(safeAdminError({ details: { reason: 'decision_retry_conflict' } })).toContain('פרטי הניסיון החוזר');
    expect(safeAdminError({ details: { reason: 'already_suspended' } })).toContain('כבר מושעה');
  });
});
