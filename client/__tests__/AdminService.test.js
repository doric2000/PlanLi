import { httpsCallable } from 'firebase/functions';
import {
  ADMIN_CALLABLE_TIMEOUTS,
  deleteUserAsAdmin,
  getModerationDashboard,
  setUserSuspension,
} from '../src/services/AdminService';

jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: { name: 'functions' } }));

describe('AdminService callable deadlines', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    httpsCallable.mockImplementation((_functions, name) => jest.fn(async () => ({ data: { name } })));
  });

  it('uses callable-specific timeouts aligned beyond long server operations', async () => {
    await setUserSuspension('user-1', true, 'reason');
    await deleteUserAsAdmin('user-2', 'reason');
    await getModerationDashboard();

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setUserSuspension', {
      timeout: ADMIN_CALLABLE_TIMEOUTS.setUserSuspension,
    });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'deleteUserAsAdmin', {
      timeout: ADMIN_CALLABLE_TIMEOUTS.deleteUserAsAdmin,
    });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'getModerationDashboard', {
      timeout: 70000,
    });
    expect(ADMIN_CALLABLE_TIMEOUTS.setUserSuspension).toBeGreaterThan(300000);
    expect(ADMIN_CALLABLE_TIMEOUTS.deleteUserAsAdmin).toBeGreaterThan(540000);
  });
});
