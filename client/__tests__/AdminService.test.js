import { httpsCallable } from 'firebase/functions';
import {
  ADMIN_CALLABLE_TIMEOUTS,
  approveSystemRecommendationCandidate,
  bulkApproveSystemRecommendationCandidates,
  deleteUserAsAdmin,
  getModerationDashboard,
  resolveModerationCase,
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
    await setUserSuspension('user-1', true, 'reason', 168, 'operation-1');
    await deleteUserAsAdmin('user-2', 'reason');
    await getModerationDashboard();
    await resolveModerationCase({ caseId: 'case-1' });

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'setUserSuspension', {
      timeout: ADMIN_CALLABLE_TIMEOUTS.setUserSuspension,
    });
    const suspensionIndex = httpsCallable.mock.calls.findIndex(([, name]) => name === 'setUserSuspension');
    expect(httpsCallable.mock.results[suspensionIndex].value).toHaveBeenCalledWith({
      identifier: 'user-1',
      suspended: true,
      reason: 'reason',
      durationHours: 168,
      operationId: 'operation-1',
    });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'deleteUserAsAdmin', {
      timeout: ADMIN_CALLABLE_TIMEOUTS.deleteUserAsAdmin,
    });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'getModerationDashboard', {
      timeout: 70000,
    });
    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'resolveModerationCase', {
      timeout: ADMIN_CALLABLE_TIMEOUTS.resolveModerationCase,
    });
    expect(ADMIN_CALLABLE_TIMEOUTS.setUserSuspension).toBeGreaterThan(300000);
    expect(ADMIN_CALLABLE_TIMEOUTS.deleteUserAsAdmin).toBeGreaterThan(540000);
  });

  it('sends exact candidate revisions and allows publication to outlast the server', async () => {
    await approveSystemRecommendationCandidate('cand_1', 4);
    await bulkApproveSystemRecommendationCandidates([{ candidateId: 'cand_1', expectedRevision: 4 }]);
    const approveIndex = httpsCallable.mock.calls.findIndex(([, name]) => name === 'approveSystemRecommendationCandidate');
    expect(httpsCallable.mock.results[approveIndex].value).toHaveBeenCalledWith({ candidateId: 'cand_1', expectedRevision: 4 });
    expect(ADMIN_CALLABLE_TIMEOUTS.approveSystemRecommendationCandidate).toBeGreaterThan(300000);
    expect(ADMIN_CALLABLE_TIMEOUTS.bulkApproveSystemRecommendationCandidates).toBeGreaterThan(540000);
  });
});
