import { safeAdminError } from '../src/features/admin/adminErrors';

describe('admin errors', () => {
  it('never exposes raw callable messages', () => {
    expect(safeAdminError({ message: 'INTERNAL token and stack trace' })).toBe('הפעולה לא הושלמה. אפשר לרענן ולנסות שוב.');
    expect(safeAdminError({ details: { reason: 'recent_sign_in_required' }, message: 'raw' })).toContain('להתחבר מחדש');
    expect(safeAdminError({ details: { reason: 'destination_blocked' }, message: 'raw' })).toContain('שגיאות הזיהוי');
    expect(safeAdminError({ code: 'functions/deadline-exceeded', message: 'raw' }, { operationMayContinue: true })).toContain('עדיין מתבצעת בשרת');
  });
});
