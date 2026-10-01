jest.mock('../src/services/ErrorReporting', () => ({ captureDiagnosticException: jest.fn() }));

describe('Firestore read diagnostics', () => {
  test('redacts server messages and paths, bounds repeated failures and preserves isolation', () => {
    jest.isolateModules(() => {
      const { captureDiagnosticException } = require('../src/services/ErrorReporting');
      const { reportFirestoreReadFailure } = require('../src/services/FirestoreReadDiagnostics');
      const failure = { code: 'firestore/permission-denied', message: 'users/private-user secret' };
      reportFirestoreReadFailure(failure, 'notification_page');
      reportFirestoreReadFailure(failure, 'notification_page');
      expect(captureDiagnosticException).toHaveBeenCalledTimes(1);
      const [error, tags] = captureDiagnosticException.mock.calls[0];
      expect(error.message).toBe('Firestore read failed: permission-denied');
      expect(tags).toEqual({ operation: 'notification_page', code: 'permission-denied' });
      reportFirestoreReadFailure({ code: 'private-user' }, 'profile_content');
      expect(captureDiagnosticException.mock.calls[1][1].code).toBe('unknown');
      reportFirestoreReadFailure(failure, 'users/private-user');
      expect(captureDiagnosticException).toHaveBeenCalledTimes(2);
      captureDiagnosticException.mockImplementation(() => { throw new Error('reporter unavailable'); });
      expect(() => reportFirestoreReadFailure({ code: 'unavailable' }, 'notification_listener')).not.toThrow();
    });
  });
});
