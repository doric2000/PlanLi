import {
  contentDeletionFailureMessage,
  isAppCheckDeletionFailure,
} from '../src/utils/contentDeletionError';

test('recognizes native App Check failures without exposing provider details', () => {
  const error = new Error('App Attest provider could not create a token');
  error.code = 'appCheck/token-error';

  expect(isAppCheckDeletionFailure(error)).toBe(true);
  expect(contentDeletionFailureMessage(error, 'recommendation')).toBe(
    'לא הצלחנו לאמת את האפליקציה. עדכנו לגרסה החדשה ביותר ונסו שוב.'
  );
});

test('preserves the existing generic messages for unrelated failures', () => {
  const error = Object.assign(new Error('Unavailable'), { code: 'functions/unavailable' });

  expect(isAppCheckDeletionFailure(error)).toBe(false);
  expect(contentDeletionFailureMessage(error, 'recommendation')).toBe(
    'לא הצלחנו למחוק את ההמלצה.'
  );
  expect(contentDeletionFailureMessage(error, 'route')).toBe(
    'לא הצלחנו למחוק את המסלול.'
  );
});
