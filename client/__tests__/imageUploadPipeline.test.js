import * as ImageManipulator from 'expo-image-manipulator';
import { uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  buildImageTransform,
  normalizeImageUri,
} from '../src/hooks/useImagePicker';
import {
  uploadUrisWithConcurrency,
  useImagePickerWithUpload,
} from '../src/hooks/useImagePickerWithUpload';
import {
  FirebaseUploadStrategy,
  MEDIA_UPLOAD_STALLED_CODE,
  useImageUploader,
} from '../src/hooks/useImageUploader';
import { prepareMedia } from '../src/services/MediaService';
import { TRAVEL_UPLOAD_STALL_TIMEOUT_MS } from '../src/constants/travelMedia';

jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '123e4567-e89b-42d3-a456-426614174000'),
}));
jest.mock('firebase/storage', () => ({
  ref: jest.fn((_storage, path) => ({ path })),
  uploadBytesResumable: jest.fn((storageRef, blob) => {
    const task = {
      snapshot: { ref: storageRef },
      on: (_event, progress, _error, complete) => {
        progress?.({ bytesTransferred: blob.size || 1, totalBytes: blob.size || 1 });
        complete?.();
      },
    };
    return task;
  }),
  getDownloadURL: jest.fn(() =>
    Promise.resolve('https://example.test/staging.jpg')
  ),
  deleteObject: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/config/firebase', () => ({
  storage: { name: 'media-eu' },
  cloudFunctions: { region: 'europe-west1' },
  auth: { currentUser: { uid: 'user-1' } },
}));
jest.mock('../src/services/MediaService', () => ({
  prepareMedia: jest.fn(),
}));

const canonicalAsset = {
  assetId: '123e4567-e89b-42d3-a456-426614174010',
  large: { url: 'https://cdn/large.webp', path: 'media/u/a/large.webp' },
  feed: { url: 'https://cdn/feed.webp', path: 'media/u/a/feed.webp' },
  thumb: { url: 'https://cdn/thumb.webp', path: 'media/u/a/thumb.webp' },
};

describe('canonical image upload pipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prepareMedia.mockResolvedValue(canonicalAsset);
  });

  it('caps staging sources at 2560 without changing aspect ratio', () => {
    expect(buildImageTransform(4000, 3000, { maxLongEdge: 2560 })).toEqual({
      actions: [{ resize: { width: 2560, height: 1920 } }],
      width: 2560,
      height: 1920,
    });
  });

  it('center-crops square staging media without upscaling', () => {
    expect(
      buildImageTransform(320, 240, {
        normalizeToAspect: true,
        normalizeAspect: [1, 1],
        normalizeWidth: 2560,
        normalizeHeight: 2560,
      })
    ).toEqual({
      actions: [
        { crop: { originX: 40, originY: 0, width: 240, height: 240 } },
      ],
      width: 240,
      height: 240,
    });
  });

  it('encodes one high-quality JPEG staging source', async () => {
    ImageManipulator.manipulateAsync.mockResolvedValue({
      uri: 'blob:staging',
    });
    await expect(
      normalizeImageUri(
        'blob:source',
        { maxLongEdge: 2560, normalizeCompress: 0.94 },
        { width: 4000, height: 3000 }
      )
    ).resolves.toBe('blob:staging');
    expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
      'blob:source',
      [{ resize: { width: 2560, height: 1920 } }],
      { compress: 0.94, format: 'jpeg' }
    );
  });

  it('uploads one staging file then requests European server processing', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      blob: async () => ({
        type: 'image/jpeg',
        size: 123,
        close: jest.fn(),
      }),
    }));
    const strategy = {
      getUserId: () => 'user-1',
      generatePath: (_base, uid) =>
        `media-staging/${uid}/123e4567-e89b-42d3-a456-426614174000.jpg`,
      upload: jest.fn(async () => 'https://cdn/staging.jpg'),
      remove: jest.fn(async () => {}),
    };
    const { result } = renderHook(() =>
      useImagePickerWithUpload({ kind: 'recommendation', strategy })
    );
    let asset;
    await act(async () => {
      asset = await result.current.uploadImageAsset('file:source');
    });
    expect(strategy.upload).toHaveBeenCalledTimes(1);
    expect(strategy.upload.mock.calls[0][4]).toEqual({
      resolveDownloadUrl: false,
      stallTimeoutMs: TRAVEL_UPLOAD_STALL_TIMEOUT_MS,
    });
    expect(prepareMedia).toHaveBeenCalledWith({
      stagingPath:
        'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg',
      kind: 'recommendation',
    });
    expect(asset).toEqual(canonicalAsset);
    global.fetch = originalFetch;
  });

  it('processes at most two complete images concurrently in stable order', async () => {
    let active = 0;
    let maximum = 0;
    const worker = jest.fn(async (uri) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) =>
        setTimeout(resolve, uri === 'first' ? 10 : 2)
      );
      active -= 1;
      return `asset:${uri}`;
    });
    await expect(
      uploadUrisWithConcurrency(
        ['first', 'second', 'third', 'fourth'],
        worker,
        2
      )
    ).resolves.toEqual([
      'asset:first',
      'asset:second',
      'asset:third',
      'asset:fourth',
    ]);
    expect(maximum).toBe(2);
  });

  it('uses collision-safe staging paths and no-store metadata', async () => {
    expect(FirebaseUploadStrategy.generatePath('media-staging', 'user-1')).toBe(
      'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg'
    );
    const blob = { type: 'image/jpeg', size: 3 };
    await expect(
      FirebaseUploadStrategy.upload(
        blob,
        'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg'
      )
    ).resolves.toBe('https://example.test/staging.jpg');
    expect(uploadBytesResumable).toHaveBeenCalledWith(
      {
        path: 'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg',
      },
      blob,
      {
        contentType: 'image/jpeg',
        cacheControl: 'private,max-age=0,no-store',
      }
    );
    expect(getDownloadURL).toHaveBeenCalled();
  });

  it('skips the unused download URL lookup for staging uploads', async () => {
    const blob = { type: 'image/jpeg', size: 3 };
    await expect(
      FirebaseUploadStrategy.upload(
        blob,
        'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg',
        {},
        undefined,
        { resolveDownloadUrl: false }
      )
    ).resolves.toBeNull();
    expect(getDownloadURL).not.toHaveBeenCalled();
  });

  it('cancels an upload that makes no progress for thirty seconds', async () => {
    jest.useFakeTimers();
    let failUpload;
    const cancel = jest.fn(() => failUpload?.({ code: 'storage/canceled' }));
    uploadBytesResumable.mockImplementationOnce((storageRef) => ({
      snapshot: { ref: storageRef },
      cancel,
      on: (_event, _progress, error) => { failUpload = error; },
    }));

    const upload = FirebaseUploadStrategy.upload(
      { type: 'image/jpeg', size: 3 },
      'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg',
      {},
      undefined,
      { resolveDownloadUrl: false, stallTimeoutMs: TRAVEL_UPLOAD_STALL_TIMEOUT_MS }
    );
    const rejection = expect(upload).rejects.toMatchObject({
      code: MEDIA_UPLOAD_STALLED_CODE,
      details: { retryable: true, publishStage: 'uploading' },
    });
    jest.advanceTimersByTime(TRAVEL_UPLOAD_STALL_TIMEOUT_MS);
    await rejection;
    expect(cancel).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('keeps upload state until the resumable upload completes', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      blob: async () => ({ type: 'image/jpeg', size: 1, close: jest.fn() }),
    }));
    let finish;
    const strategy = {
      getUserId: () => 'user-1',
      generatePath: () =>
        'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg',
      upload: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      remove: jest.fn(),
    };
    const { result } = renderHook(() =>
      useImageUploader({ strategy, storagePath: 'media-staging' })
    );
    let promise;
    act(() => {
      promise = result.current.uploadImage('file:source');
    });
    await waitFor(() => expect(typeof finish).toBe('function'));
    expect(result.current.uploading).toBe(true);
    await act(async () => {
      finish('https://staging');
      await promise;
    });
    expect(result.current.uploading).toBe(false);
    global.fetch = originalFetch;
  });

  it('surfaces a stalled upload without waiting for remote rollback', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      blob: async () => ({ type: 'image/jpeg', size: 1, close: jest.fn() }),
    }));
    let finishCleanup;
    const strategy = {
      getUserId: () => 'user-1',
      generatePath: () =>
        'media-staging/user-1/123e4567-e89b-42d3-a456-426614174000.jpg',
      upload: jest.fn(async () => {
        const error = new Error('stalled');
        error.code = MEDIA_UPLOAD_STALLED_CODE;
        throw error;
      }),
      remove: jest.fn(() => new Promise((resolve) => { finishCleanup = resolve; })),
    };
    const { result } = renderHook(() =>
      useImageUploader({ strategy, storagePath: 'media-staging' })
    );

    await act(async () => {
      await expect(result.current.uploadImageDetailed('file:source')).rejects.toMatchObject({
        code: MEDIA_UPLOAD_STALLED_CODE,
      });
    });
    expect(strategy.remove).toHaveBeenCalledTimes(1);
    expect(result.current.uploading).toBe(false);
    finishCleanup();
    global.fetch = originalFetch;
  });
});
