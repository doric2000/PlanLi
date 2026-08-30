import { Platform } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';

import useTravelMediaSource, {
  imagePickerAssetDescriptor,
  mediaLibraryAssetDescriptor,
} from '../src/hooks/useTravelMediaSource';

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-media-library/legacy', () => ({
  MediaType: { photo: 'photo' },
  SortBy: { creationTime: 'creationTime' },
  requestPermissionsAsync: jest.fn(),
  getAlbumsAsync: jest.fn(),
  getAssetsAsync: jest.fn(),
  getAssetInfoAsync: jest.fn(),
  presentPermissionsPickerAsync: jest.fn(),
}));

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
};

describe('TravelMedia platform sources', () => {
  const originalPlatform = Platform.OS;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
    jest.clearAllMocks();
  });

  it('maps source identity and dimensions without encoding the image', () => {
    expect(mediaLibraryAssetDescriptor({ id: 'asset-1', uri: 'ph://1', width: 4032, height: 3024 }))
      .toEqual(expect.objectContaining({ assetId: 'asset-1', uri: 'ph://1', width: 4032, height: 3024 }));
    expect(imagePickerAssetDescriptor({ uri: 'file:///picked.jpg', width: 1200, height: 900 }))
      .toEqual(expect.objectContaining({ uri: 'file:///picked.jpg', persistence: 'ready' }));
  });

  it('keeps the legacy inline iOS source available only when explicitly enabled', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    MediaLibrary.requestPermissionsAsync.mockResolvedValue({ granted: true, accessPrivileges: 'limited' });
    MediaLibrary.getAlbumsAsync.mockResolvedValue([{ id: 'album-1', title: 'Favorites' }]);
    MediaLibrary.getAssetsAsync
      .mockResolvedValueOnce({
        assets: [{ id: 'asset-1', uri: 'ph://1', width: 4000, height: 3000 }],
        endCursor: 'page-2', hasNextPage: true,
      })
      .mockResolvedValueOnce({
        assets: [{ id: 'asset-2', uri: 'ph://2', width: 3000, height: 4000 }],
        endCursor: null, hasNextPage: false,
      })
      .mockResolvedValueOnce({
        assets: [{ id: 'asset-3', uri: 'ph://3', width: 2000, height: 1500 }],
        endCursor: null, hasNextPage: false,
      });
    MediaLibrary.getAssetInfoAsync.mockResolvedValue({
      localUri: 'file:///icloud/asset-1.heic', width: 4000, height: 3000,
    });
    const hook = renderHook(() => useTravelMediaSource({ maxItems: 5, inlineLibraryEnabled: true }));
    await act(async () => { await hook.result.current.loadInitial(); });
    expect(hook.result.current.kind).toBe('inline-library');
    expect(hook.result.current.assets.map((item) => item.assetId)).toEqual(['asset-1']);
    expect(hook.result.current.albums).toEqual([{ id: 'album-1', title: 'Favorites' }]);
    await act(async () => { await hook.result.current.loadMore(); });
    expect(hook.result.current.assets.map((item) => item.assetId)).toEqual(['asset-1', 'asset-2']);
    await expect(hook.result.current.materialize(hook.result.current.assets[0])).resolves.toEqual(
      expect.objectContaining({ sourceUri: 'file:///icloud/asset-1.heic', persistence: 'ready' })
    );
    await act(async () => { await hook.result.current.requestMoreAccess(); });
    expect(MediaLibrary.presentPermissionsPickerAsync).toHaveBeenCalledWith(['photo']);
    expect(hook.result.current.assets.map((item) => item.assetId)).toEqual(['asset-3']);
  });

  it('uses the system picker on iOS without enumerating or requesting the photo library', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picker/ios-photo.jpg', width: 1600, height: 1200 }],
    });
    const hook = renderHook(() => useTravelMediaSource({ maxItems: 5 }));
    let picked;
    await act(async () => { picked = await hook.result.current.pickMore(4); });
    expect(hook.result.current.kind).toBe('system-picker');
    expect(picked).toEqual([expect.objectContaining({
      uri: 'file:///picker/ios-photo.jpg',
      persistence: 'ready',
    })]);
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 4,
    }));
    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(MediaLibrary.getAssetsAsync).not.toHaveBeenCalled();
  });

  it('uses the system picker on Android without requesting broad library access', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [{
        assetId: 'android-picker-asset',
        uri: 'file:///data/user/0/com.planli/cache/ImagePicker/photo.jpg',
        width: 1600,
        height: 1200,
      }],
    });
    const hook = renderHook(() => useTravelMediaSource({ maxItems: 3 }));
    let picked;
    await act(async () => { picked = await hook.result.current.pickMore(2); });
    expect(hook.result.current.kind).toBe('system-picker');
    expect(picked).toEqual([expect.objectContaining({
      assetId: 'android-picker-asset',
      uri: 'file:///data/user/0/com.planli/cache/ImagePicker/photo.jpg',
      sourceUri: 'file:///data/user/0/com.planli/cache/ImagePicker/photo.jpg',
      previewUri: 'file:///data/user/0/com.planli/cache/ImagePicker/photo.jpg',
      persistence: 'ready',
    })]);
    let materialized;
    await act(async () => { materialized = await hook.result.current.materialize(picked[0]); });
    expect(materialized).toEqual(expect.objectContaining({
      sourceUri: 'file:///data/user/0/com.planli/cache/ImagePicker/photo.jpg',
      persistence: 'ready',
    }));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(expect.objectContaining({
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 2,
    }));
    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(MediaLibrary.getAssetInfoAsync).not.toHaveBeenCalled();
  });

  it('ignores an older album response that resolves after the selected album', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const albumA = { id: 'album-a', title: 'A' };
    const albumB = { id: 'album-b', title: 'B' };
    const pageA = deferred();
    const pageB = deferred();
    MediaLibrary.getAssetsAsync.mockImplementation(({ album }) => (
      album?.id === albumA.id ? pageA.promise : pageB.promise
    ));
    const hook = renderHook(() => useTravelMediaSource({ maxItems: 5, inlineLibraryEnabled: true }));
    let requestA;
    let requestB;
    act(() => {
      requestA = hook.result.current.chooseAlbum(albumA);
      requestB = hook.result.current.chooseAlbum(albumB);
    });
    await act(async () => {
      pageB.resolve({
        assets: [{ id: 'asset-b', uri: 'ph://b', width: 1200, height: 900 }],
        endCursor: null,
        hasNextPage: false,
      });
      await requestB;
    });
    await act(async () => {
      pageA.resolve({
        assets: [{ id: 'asset-a', uri: 'ph://a', width: 1200, height: 900 }],
        endCursor: 'stale-page',
        hasNextPage: true,
      });
      await requestA;
    });
    expect(hook.result.current.selectedAlbum).toBe(albumB);
    expect(hook.result.current.assets.map((item) => item.assetId)).toEqual(['asset-b']);
    expect(hook.result.current.hasNextPage).toBe(false);
    expect(hook.result.current.loading).toBe(false);
  });

  it('does not append a stale pagination page after changing albums', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    const albumA = { id: 'album-a', title: 'A' };
    const albumB = { id: 'album-b', title: 'B' };
    const staleNextPage = deferred();
    MediaLibrary.getAssetsAsync.mockImplementation(({ album, after }) => {
      if (album?.id === albumA.id && after === 'page-a-2') return staleNextPage.promise;
      if (album?.id === albumA.id) return Promise.resolve({
        assets: [{ id: 'asset-a-1', uri: 'ph://a-1', width: 1200, height: 900 }],
        endCursor: 'page-a-2',
        hasNextPage: true,
      });
      return Promise.resolve({
        assets: [{ id: 'asset-b-1', uri: 'ph://b-1', width: 1200, height: 900 }],
        endCursor: null,
        hasNextPage: false,
      });
    });
    const hook = renderHook(() => useTravelMediaSource({ maxItems: 5, inlineLibraryEnabled: true }));
    await act(async () => { await hook.result.current.chooseAlbum(albumA); });
    let paginationRequest;
    act(() => { paginationRequest = hook.result.current.loadMore(); });
    await act(async () => { await hook.result.current.chooseAlbum(albumB); });
    await act(async () => {
      staleNextPage.resolve({
        assets: [{ id: 'asset-a-2', uri: 'ph://a-2', width: 1200, height: 900 }],
        endCursor: null,
        hasNextPage: false,
      });
      await paginationRequest;
    });
    expect(hook.result.current.selectedAlbum).toBe(albumB);
    expect(hook.result.current.assets.map((item) => item.assetId)).toEqual(['asset-b-1']);
    expect(hook.result.current.loading).toBe(false);
  });
});
