import { createOperationStore } from '../src/features/operations/createOperationStore';
import { selectBanner } from '../src/features/operations/operationModel';
import { syncPublishOperation } from '../src/features/operations/publishOperation';
import { syncBackgroundHistory } from '../src/features/operations/BackgroundMediaService';

let mockStore;
const mockCall = jest.fn();
jest.mock('../src/features/operations/operationService', () => ({ get operationStore() { return mockStore; } }));
jest.mock('../src/config/firebase', () => ({ auth: { currentUser: { uid: 'owner' } }, cloudFunctions: {} }));
jest.mock('firebase/functions', () => ({ httpsCallable: () => (data) => mockCall(data).then((value) => ({ data: value })) }));
jest.mock('firebase/app-check', () => ({ getToken: jest.fn() }));
jest.mock('../modules/planli-transfers', () => ({ __esModule: true, default: null }));
jest.mock('../src/features/community/publishing/recommendationPublishStorage', () => ({}));
jest.mock('../src/utils/travelMediaPreparation', () => ({}));

beforeEach(() => { mockStore = createOperationStore({ storage: { getItem: async () => null, setItem: async () => {} } }); });

test('local publication recovery retains dismissal and an explicit retry exposes its next failure', async () => {
  const job = { id: 'post', ownerUid: 'owner', contentType: 'recommendation', status: 'failed' };
  await syncPublishOperation(job);
  await mockStore.dismiss('publish:post', 'owner');
  await syncPublishOperation({ ...job, status: 'queued' });
  await syncPublishOperation(job);
  expect(selectBanner(mockStore.getSnapshot())).toBeNull();
  await syncPublishOperation({ ...job, feedbackAttempt: 2 });
  expect(selectBanner(mockStore.getSnapshot())).toMatchObject({ attempt: 2, status: 'failed' });
});

test('server ready mapping and stale attempts cannot resurrect a dismissed outcome', async () => {
  const job = { operationId: 'remote', kind: 'avatar', status: 'failed', attempt: 1 };
  mockCall.mockResolvedValue({ operations: [job] });
  await syncBackgroundHistory('owner');
  await mockStore.dismiss('background:remote', 'owner');
  for (const status of ['ready', 'failed']) {
    mockCall.mockResolvedValue({ operations: [{ ...job, status }] });
    await syncBackgroundHistory('owner');
    expect(selectBanner(mockStore.getSnapshot())).toBeNull();
  }
  mockCall.mockResolvedValue({ operations: [{ ...job, attempt: 2 }] });
  await syncBackgroundHistory('owner');
  expect(selectBanner(mockStore.getSnapshot())).toMatchObject({ attempt: 2, status: 'failed' });
  await mockStore.dismiss('background:remote', 'owner');
  mockCall.mockResolvedValue({ operations: [job] });
  await syncBackgroundHistory('owner');
  expect(selectBanner(mockStore.getSnapshot())).toBeNull();
  expect(mockStore.getSnapshot()[0].attempt).toBe(2);
});
