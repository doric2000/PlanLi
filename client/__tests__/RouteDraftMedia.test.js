import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';

import useRouteDraftMedia from '../src/hooks/useRouteDraftMedia';

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

describe('useRouteDraftMedia', () => {
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
    mockMaterializeMedia.mockImplementation(async (reference) => ({ uri: reference.key }));
    mockDeleteMedia.mockResolvedValue(undefined);
  });

  it('restores each local photo to its stable day and stop identity', async () => {
    const first = renderHook(() => useRouteDraftMedia());
    await act(async () => {
      await first.result.current.persistUris(['file:///picked.jpg'], { dayId: 'day_001', stopId: 'stop-a' });
      await first.result.current.bindDraft('draft-1');
    });
    const reference = first.result.current.mediaForUri('file:///picked.jpg').localReference;
    first.unmount();

    const second = renderHook(() => useRouteDraftMedia());
    let restored;
    await act(async () => { restored = await second.result.current.restoreDraft('draft-1', 1); });
    expect(restored).toEqual({
      entries: [expect.objectContaining({
        dayId: 'day_001', stopId: 'stop-a', uri: reference.key,
      })],
      missingCount: 0,
    });
  });

  it('reports local photos that are unavailable on another device', async () => {
    stored = JSON.stringify({
      version: 1,
      draftId: 'draft-1',
      jobId: 'old-job',
      entries: [{
        dayId: 'day_001', stopId: 'stop-a', mediaId: 'media-1',
        localReference: { platform: 'native', key: 'file:///missing.jpg' },
      }],
    });
    mockMaterializeMedia.mockRejectedValueOnce(new Error('missing'));
    const hook = renderHook(() => useRouteDraftMedia());
    let restored;
    await act(async () => { restored = await hook.result.current.restoreDraft('draft-1', 1); });
    expect(restored).toEqual({ entries: [], missingCount: 1 });
  });

  it('keeps only publication-owned files when transferring the draft', async () => {
    const hook = renderHook(() => useRouteDraftMedia());
    await act(async () => {
      await hook.result.current.persistUris(
        ['file:///used.jpg', 'file:///unused.jpg'],
        { dayId: 'day_001', stopId: 'stop-a' }
      );
      await hook.result.current.bindDraft('draft-1');
    });
    const used = hook.result.current.mediaForUri('file:///used.jpg');
    const unused = hook.result.current.mediaForUri('file:///unused.jpg');
    await act(async () => {
      await hook.result.current.clearDraft({ deleteFiles: false, keepUris: ['file:///used.jpg'] });
    });
    expect(mockDeleteMedia).toHaveBeenCalledWith(unused.localReference);
    expect(mockDeleteMedia).not.toHaveBeenCalledWith(used.localReference);
    expect(AsyncStorage.removeItem).toHaveBeenCalled();
  });

  it('keeps the same source as independent durable media in different stops', async () => {
    const photo = {
      sourceId: 'asset:shared-photo',
      assetId: 'shared-photo',
      uri: 'file:///shared-photo.jpg',
      transform: {
        version: 1,
        crop: { originX: 100, originY: 0, width: 1800, height: 1350 },
      },
    };
    const hook = renderHook(() => useRouteDraftMedia());
    await act(async () => {
      await hook.result.current.persistMedia([photo], { dayId: 'day_001', stopId: 'stop-a' });
      await hook.result.current.persistMedia([photo], { dayId: 'day_001', stopId: 'stop-b' });
      await hook.result.current.bindDraft('draft-shared');
    });

    const first = hook.result.current.mediaForItem(photo, { dayId: 'day_001', stopId: 'stop-a' });
    const second = hook.result.current.mediaForItem(photo, { dayId: 'day_001', stopId: 'stop-b' });
    expect(first.mediaId).not.toBe(second.mediaId);
    expect(first.localReference).not.toEqual(second.localReference);
    expect(JSON.parse(stored).entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ stopId: 'stop-a', sourceId: 'asset:shared-photo' }),
      expect.objectContaining({ stopId: 'stop-b', sourceId: 'asset:shared-photo' }),
    ]));
    let queued;
    await act(async () => {
      queued = await hook.result.current.waitForMedia([
        {
          ...photo,
          slot: { type: 'route-stop', dayDraftId: 'day_001', draftId: 'stop-a' },
        },
        {
          ...photo,
          slot: { type: 'route-stop', dayDraftId: 'day_001', draftId: 'stop-b' },
        },
      ]);
    });
    expect(queued.map((item) => item.mediaId)).toEqual([first.mediaId, second.mediaId]);

    await act(async () => {
      await hook.result.current.forgetMedia(photo, { dayId: 'day_001', stopId: 'stop-a' });
    });
    expect(mockDeleteMedia).toHaveBeenCalledWith(first.localReference);
    expect(mockDeleteMedia).not.toHaveBeenCalledWith(second.localReference);
    expect(hook.result.current.mediaForItem(photo, {
      dayId: 'day_001', stopId: 'stop-b',
    })).toEqual(expect.objectContaining({ mediaId: second.mediaId }));
    expect(JSON.parse(stored).entries).toEqual([
      expect.objectContaining({ stopId: 'stop-b', mediaId: second.mediaId }),
    ]);
  });

  it('preserves stop order metadata and deferred transforms in the upgraded manifest', async () => {
    const transform = {
      version: 1,
      crop: { originX: 0, originY: 0, width: 1600, height: 1200 },
      maxLongEdge: 1800,
      compress: 0.94,
      format: 'jpeg',
    };
    const hook = renderHook(() => useRouteDraftMedia());
    await act(async () => {
      await hook.result.current.persistMedia([{
        sourceId: 'route-photo-1', uri: 'file:///raw-route.jpg', transform,
      }], { dayId: 'day_001', stopId: 'stop-a' });
      await hook.result.current.bindDraft('draft-2');
    });
    expect(JSON.parse(stored)).toEqual(expect.objectContaining({
      version: 2,
      entries: [expect.objectContaining({
        dayId: 'day_001', stopId: 'stop-a', sourceId: 'route-photo-1', transform,
      })],
    }));
    hook.unmount();

    const restoredHook = renderHook(() => useRouteDraftMedia());
    let restored;
    await act(async () => {
      restored = await restoredHook.result.current.restoreDraft('draft-2', 1);
    });
    expect(restored.entries).toEqual([
      expect.objectContaining({
        dayId: 'day_001', stopId: 'stop-a', sourceId: 'route-photo-1', transform,
      }),
    ]);
  });
});
