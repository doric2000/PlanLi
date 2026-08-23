import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import useRecommendationDraftMedia from '../src/hooks/useRecommendationDraftMedia';

const mockPersistMedia = jest.fn();
const mockMaterializeMedia = jest.fn();
const mockDeleteMedia = jest.fn();
let mockUuidSerial = 0;

jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mockUuidSerial}`,
}));
jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'owner-1' } },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));
jest.mock('../src/features/publishing/contentPublishStorage', () => ({
  persistContentPublishMedia: (...args) => mockPersistMedia(...args),
  materializeContentPublishMedia: (...args) => mockMaterializeMedia(...args),
  deleteContentPublishMedia: (...args) => mockDeleteMedia(...args),
}));

describe('useRecommendationDraftMedia', () => {
  let stored;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUuidSerial = 0;
    stored = null;
    AsyncStorage.getItem.mockImplementation(async () => stored);
    AsyncStorage.setItem.mockImplementation(async (_key, value) => { stored = value; });
    AsyncStorage.removeItem.mockImplementation(async () => { stored = null; });
    mockPersistMedia.mockImplementation(async ({ jobId, mediaId }) => ({
      platform: 'native', key: `file:///durable/${jobId}/${mediaId}.jpg`,
    }));
    mockMaterializeMedia.mockImplementation(async (reference) => ({
      uri: reference.key, revoke: jest.fn(),
    }));
    mockDeleteMedia.mockResolvedValue(undefined);
  });

  it('restores selected photos after unmount and removes an individual durable file', async () => {
    const first = renderHook(() => useRecommendationDraftMedia());
    await act(async () => {
      await first.result.current.persistUris(['file:///picked.jpg']);
      await first.result.current.bindDraft('draft-1');
    });
    const reference = first.result.current.mediaForUri('file:///picked.jpg').localReference;
    first.unmount();

    const second = renderHook(() => useRecommendationDraftMedia());
    let restored;
    await act(async () => { restored = await second.result.current.restoreDraft('draft-1', 1); });
    expect(restored).toEqual({ uris: [reference.key], missingCount: 0 });
    await act(async () => { await second.result.current.forgetUri(reference.key); });
    expect(mockDeleteMedia).toHaveBeenCalledWith(reference);
  });

  it('reports device-only photos missing on another device', async () => {
    stored = JSON.stringify({
      version: 1,
      draftId: 'draft-1',
      jobId: 'old-job',
      entries: [{ mediaId: 'media-1', localReference: { platform: 'native', key: 'file:///missing.jpg' } }],
    });
    mockMaterializeMedia.mockRejectedValueOnce(new Error('missing'));
    const hook = renderHook(() => useRecommendationDraftMedia());
    let restored;
    await act(async () => { restored = await hook.result.current.restoreDraft('draft-1', 2); });
    expect(restored).toEqual({ uris: [], missingCount: 2 });
  });

  it('discard deletes manifest files even before the draft was restored', async () => {
    const reference = { platform: 'native', key: 'file:///durable/unopened.jpg' };
    stored = JSON.stringify({
      version: 1, draftId: 'draft-1', jobId: 'old-job',
      entries: [{ mediaId: 'media-1', localReference: reference }],
    });
    const hook = renderHook(() => useRecommendationDraftMedia());
    await act(async () => { await hook.result.current.clearDraft({ deleteFiles: true }); });
    expect(mockDeleteMedia).toHaveBeenCalledWith(reference);
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });

  it('transfers references to the publish queue without copying or deleting them', async () => {
    const hook = renderHook(() => useRecommendationDraftMedia());
    await act(async () => {
      await hook.result.current.persistUris(['file:///picked.jpg']);
      await hook.result.current.bindDraft('draft-1');
    });
    const media = hook.result.current.mediaForUri('file:///picked.jpg');
    await act(async () => { await hook.result.current.clearDraft({ deleteFiles: false }); });
    expect(media.localReference).toEqual(expect.objectContaining({ platform: 'native' }));
    expect(mockPersistMedia).toHaveBeenCalledTimes(1);
    expect(mockDeleteMedia).not.toHaveBeenCalled();
  });
});
