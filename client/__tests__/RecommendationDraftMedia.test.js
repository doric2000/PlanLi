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
    expect(restored).toEqual({
      uris: [reference.key],
      items: [expect.objectContaining({ uri: reference.key, transform: null })],
      order: ['file:///picked.jpg'],
      missingCount: 0,
    });
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
    expect(restored).toEqual({ uris: [], items: [], order: ['media-1'], missingCount: 2 });
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
    await act(async () => {
      await hook.result.current.clearDraft({ deleteFiles: false, keepUris: ['file:///picked.jpg'] });
    });
    expect(media.localReference).toEqual(expect.objectContaining({ platform: 'native' }));
    expect(mockPersistMedia).toHaveBeenCalledTimes(1);
    expect(mockDeleteMedia).not.toHaveBeenCalled();
  });

  it('deletes stale local references that were not transferred to the publish queue', async () => {
    const hook = renderHook(() => useRecommendationDraftMedia());
    await act(async () => {
      await hook.result.current.persistUris(['file:///queued.jpg', 'file:///stale.jpg']);
      await hook.result.current.bindDraft('draft-1');
    });
    const queued = hook.result.current.mediaForUri('file:///queued.jpg').localReference;
    const stale = hook.result.current.mediaForUri('file:///stale.jpg').localReference;
    await act(async () => {
      await hook.result.current.clearDraft({ deleteFiles: false, keepUris: ['file:///queued.jpg'] });
    });
    expect(mockDeleteMedia).toHaveBeenCalledWith(stale);
    expect(mockDeleteMedia).not.toHaveBeenCalledWith(queued);
  });

  it('stores crop transforms additively while legacy manifests restore as already processed', async () => {
    const transform = {
      version: 1,
      crop: { originX: 100, originY: 0, width: 1200, height: 1200 },
      maxLongEdge: 1600,
      compress: 0.94,
      format: 'jpeg',
    };
    const hook = renderHook(() => useRecommendationDraftMedia());
    await act(async () => {
      await hook.result.current.persistMedia([{
        sourceId: 'asset:selected-1',
        assetId: 'selected-1',
        uri: 'file:///raw.heic',
        width: 1600,
        height: 1200,
        transform,
      }]);
      await hook.result.current.bindDraft('draft-2');
    });
    expect(JSON.parse(stored)).toEqual(expect.objectContaining({
      version: 3,
      entries: [expect.objectContaining({ sourceId: 'asset:selected-1', transform })],
    }));

    stored = JSON.stringify({
      version: 1,
      draftId: 'legacy-draft',
      jobId: 'legacy-job',
      entries: [{ mediaId: 'legacy-media', localReference: { platform: 'native', key: 'file:///legacy.jpg' } }],
    });
    const legacyHook = renderHook(() => useRecommendationDraftMedia());
    let restored;
    await act(async () => { restored = await legacyHook.result.current.restoreDraft('legacy-draft', 1); });
    expect(restored.items[0].transform).toBeNull();
  });

  it('persists reordered media identities and the latest crop while the first copy is pending', async () => {
    let finishCopy;
    mockPersistMedia.mockImplementationOnce(() => new Promise((resolve) => { finishCopy = resolve; }));
    const hook = renderHook(() => useRecommendationDraftMedia());
    const firstCrop = {
      version: 1,
      crop: { originX: 0, originY: 0, width: 1200, height: 1200 },
      maxLongEdge: 1600,
      compress: 0.94,
      format: 'jpeg',
    };
    const latestCrop = {
      ...firstCrop,
      crop: { originX: 180, originY: 0, width: 1200, height: 1200 },
    };
    const first = {
      sourceId: 'local-1', uri: 'file:///one.jpg', width: 1600, height: 1200, transform: firstCrop,
    };
    const second = {
      sourceId: 'local-2', uri: 'file:///two.jpg', width: 1600, height: 1200, transform: firstCrop,
    };

    let firstPersist;
    let latestPersist;
    await act(async () => {
      firstPersist = hook.result.current.persistMedia([first, second]);
      await Promise.resolve();
      latestPersist = hook.result.current.persistMedia([
        second,
        { ...first, transform: latestCrop },
      ]);
      finishCopy({ platform: 'native', key: 'file:///durable/local-1.jpg' });
      await Promise.all([firstPersist, latestPersist]);
      await hook.result.current.bindDraft('draft-reordered');
    });

    const manifest = JSON.parse(stored);
    expect(manifest.version).toBe(3);
    expect(manifest.order).toEqual(['local-2', 'local-1']);
    expect(manifest.entries.find((entry) => entry.sourceId === 'local-1').transform).toEqual(latestCrop);
  });
});
