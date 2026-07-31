import { getFavoriteErrorAlert } from '../src/utils/favoriteErrors';

describe('favorite error copy', () => {
  it('explains that a deleted source cannot be favorited', () => {
    expect(
      getFavoriteErrorAlert(
        { code: 'firestore/permission-denied' },
        'add'
      )
    ).toEqual({
      title: 'התוכן אינו זמין',
      message: 'הפריט כבר נמחק ולא ניתן לשמור אותו במועדפים.',
    });
  });

  it('keeps ordinary failures generic', () => {
    expect(getFavoriteErrorAlert(new Error('offline'), 'remove')).toEqual({
      title: 'שגיאה',
      message: 'offline',
    });
  });
});
