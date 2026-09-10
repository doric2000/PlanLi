import { runBackgroundMedia, syncBackgroundHistory } from '../src/features/operations/BackgroundMediaService';

const mockCall = jest.fn();
const mockStage = jest.fn(); const mockSchedule = jest.fn(); const mockList = jest.fn();
const mockCurrent = { uid: 'owner', getIdToken: jest.fn(async () => 'private-id-token') };
const mockJournal = { entries: [], hydrate: jest.fn(async () => {}), getSnapshot: () => mockJournal.entries,
  update: jest.fn(async (entry) => { mockJournal.entries = [entry]; }) };
jest.mock('firebase/functions', () => ({ httpsCallable: (_f, name) => (data) => mockCall(name, data).then((value) => ({ data: value })) }));
jest.mock('firebase/app-check', () => ({ getToken: async () => ({ token: 'private-app-check' }) }));
jest.mock('../modules/planli-transfers', () => ({ __esModule: true, default: {
  stage: (...args) => mockStage(...args), schedule: (...args) => mockSchedule(...args), list: (...args) => mockList(...args), remove: async () => {},
} }));
jest.mock('../src/config/firebase', () => ({ auth: { get currentUser() { return mockCurrent; } }, cloudFunctions: {}, appCheck: {}, mediaBucket: 'demo-bucket' }));
jest.mock('../src/features/operations/operationService', () => ({ get operationStore() { return mockJournal; } }));
jest.mock('../src/features/community/publishing/recommendationPublishStorage', () => ({ materializeRecommendationPublishMedia: async () => ({ uri: 'file:///selected.jpg' }) }));
jest.mock('../src/utils/travelMediaPreparation', () => ({ prepareTravelMediaSource: async (uri) => ({ uri }), deletePreparedTravelMedia: async () => {} }));

const request = (background) => ({ job: { id: 'operation-id', ownerUid: 'owner', background }, kind: 'avatar',
  media: [{ localReference: 'selected' }], checkpoint: jest.fn(async () => {}), stage: jest.fn(async () => {}), progress: jest.fn() });
beforeEach(() => {
  jest.clearAllMocks(); mockJournal.entries = [];
  mockCurrent.uid = 'owner'; mockList.mockResolvedValue([]);
  mockStage.mockResolvedValue({ bytes: 512 });
});

test('a lost registration response reuses the exact persisted intent and ID', async () => {
  let saved;
  const options = request(); options.checkpoint.mockImplementation(async (value) => { saved = value; });
  mockCall.mockRejectedValueOnce(Object.assign(new Error(), { code: 'functions/deadline-exceeded' }));
  await expect(runBackgroundMedia(options)).rejects.toMatchObject({ code: 'functions/deadline-exceeded' });
  const firstBody = mockCall.mock.calls[0][1];
  expect(saved.items[0].bytes).toBe(512);
  mockCall.mockImplementation(async (name) => name === 'startBackgroundOperation' ? {} : { status: 'success', result: { photoMedia: { assetId: 'done' } } });
  await expect(runBackgroundMedia(request(saved))).resolves.toEqual({ photoMedia: { assetId: 'done' } });
  expect(mockCall.mock.calls[1][1]).toEqual(firstBody);
  expect(mockStage).toHaveBeenCalledTimes(1);
});

test('accepted completed work is reconciled without registering or uploading again', async () => {
  const options = request({ operationId: 'operation-id', accepted: true, items: [{ id: 'item-id', bytes: 512, stagingPath: 'owned' }] });
  mockCall.mockResolvedValue({ status: 'review', result: { recommendationId: 'post', publicationStatus: 'moderation_hold' } });
  await expect(runBackgroundMedia(options)).resolves.toMatchObject({ publicationStatus: 'moderation_hold' });
  expect(mockCall.mock.calls.map(([name]) => name)).toEqual(['getBackgroundOperations']);
  expect(mockSchedule).not.toHaveBeenCalled();
});

test('a failed server result requires an explicit retry and retains retry eligibility', async () => {
  const background = { operationId: 'operation-id', accepted: true, items: [{ id: 'item-id', bytes: 512 }] };
  mockCall.mockResolvedValue({ status: 'failed', error: { code: 'unavailable', reason: 'OPERATION_UPLOAD_INTERRUPTED', retryable: true } });
  await expect(runBackgroundMedia(request(background))).rejects.toMatchObject({ background: true, details: { retryable: true } });
  expect(mockCall.mock.calls.some(([name]) => name === 'retryBackgroundOperation')).toBe(false);
  mockCall.mockImplementation(async (name) => name === 'retryBackgroundOperation'
    ? { status: 'success', result: { photoMedia: { assetId: 'done' } } }
    : { status: 'failed', error: { retryable: true } });
  await expect(runBackgroundMedia(request({ ...background, retryRequested: true }))).resolves.toMatchObject({ photoMedia: { assetId: 'done' } });
});

test('storage session credentials go only to the native scheduler, never to checkpoints', async () => {
  const options = request({ operationId: 'operation-id', accepted: true, items: [{ id: 'item-id', bytes: 512, stagingPath: 'media-staging/owner/item-id.jpg' }] });
  const original = global.fetch;
  global.fetch = jest.fn(async () => ({ ok: true, headers: { get: () => 'https://firebasestorage.googleapis.com/v0/b/demo-bucket/o?upload_id=private-session' } }));
  mockList.mockResolvedValue([{ id: 'item-id', state: 'staged' }]);
  mockCall.mockResolvedValueOnce({ status: 'uploading', items: [] });
  // Stop immediately after scheduling, without relying on timers or a real network.
  mockSchedule.mockImplementationOnce(async () => { mockCurrent.uid = 'other'; });
  try {
    await expect(runBackgroundMedia(options)).rejects.toMatchObject({ code: 'auth/unauthenticated' });
    expect(mockSchedule).toHaveBeenCalledWith('item-id', 'owner', expect.stringContaining('private-session'));
    expect(JSON.stringify(options.checkpoint.mock.calls)).not.toMatch(/private-(session|id-token|app-check)/);
    const headers = global.fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Firebase private-id-token');
    expect(headers['X-Firebase-AppCheck']).toBe('private-app-check');
  } finally { global.fetch = original; }
});

test('server completion updates the same journal entry and preserves an acknowledged result', async () => {
  mockJournal.entries = [{ id: 'publish:local-job', source: 'publish', ownerUid: 'owner', serverOperationId: 'server-job', status: 'success', acknowledged: true }];
  mockCall.mockResolvedValue({ operations: [{ operationId: 'server-job', kind: 'recommendation', status: 'success', result: { recommendationId: 'post' } }] });
  await syncBackgroundHistory('owner');
  expect(mockJournal.update).toHaveBeenCalledWith(expect.objectContaining({ id: 'publish:local-job', targetId: 'post', acknowledged: true }));
});
