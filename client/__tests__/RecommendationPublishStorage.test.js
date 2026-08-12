import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import {
  deleteRecommendationPublishMedia,
  loadRecommendationPublishJobs,
  materializeRecommendationPublishMedia,
  persistRecommendationPublishMedia,
  saveRecommendationPublishJobs,
} from '../src/features/community/publishing/recommendationPublishStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
}));

function requestFor(result) {
  const request = {};
  queueMicrotask(() => {
    request.result = result;
    request.onsuccess?.();
  });
  return request;
}

function fakeIndexedDb() {
  const values = new Map();
  return {
    values,
    open: () => {
      const request = {};
      queueMicrotask(() => {
        const store = {
          put: (value, key) => { values.set(key, value); return requestFor(key); },
          get: (key) => requestFor(values.get(key)),
          delete: (key) => { values.delete(key); return requestFor(undefined); },
        };
        request.result = {
          objectStoreNames: { contains: () => false },
          createObjectStore: jest.fn(),
          transaction: () => {
            const transaction = { objectStore: () => store };
            queueMicrotask(() => queueMicrotask(() => transaction.oncomplete?.()));
            return transaction;
          },
          close: jest.fn(),
        };
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

describe('recommendation publish storage', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  it('persists the queue manifest and copies native media into private app storage', async () => {
    const jobs = [{ id: 'job-1', ownerUid: 'owner-1' }];
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify(jobs));
    await saveRecommendationPublishJobs(jobs);
    await expect(loadRecommendationPublishJobs()).resolves.toEqual(jobs);
    const reference = await persistRecommendationPublishMedia({
      ownerUid: 'owner-1', jobId: 'job-1', mediaId: 'media-1', uri: 'file:///source.jpg',
    });

    expect(reference).toEqual({
      platform: 'native',
      key: 'file:///documents/recommendation-publish-queue/owner-1/job-1/media-1.jpg',
    });
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({
      from: 'file:///source.jpg',
      to: reference.key,
    });
    await deleteRecommendationPublishMedia(reference);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(reference.key, { idempotent: true });
  });

  it('stores browser blobs in IndexedDB and materializes a temporary preview URL', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const database = fakeIndexedDb();
    global.indexedDB = database;
    const blob = { type: 'image/jpeg', size: 100 };
    global.fetch = jest.fn(async () => ({ blob: async () => blob }));
    const originalCreateObjectUrl = URL.createObjectURL;
    const originalRevokeObjectUrl = URL.revokeObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:queued-preview');
    URL.revokeObjectURL = jest.fn();

    const reference = await persistRecommendationPublishMedia({
      ownerUid: 'owner-1', jobId: 'job-1', mediaId: 'media-1', uri: 'blob:selected',
    });
    expect(reference).toEqual({ platform: 'web', key: 'owner-1/job-1/media-1' });
    const materialized = await materializeRecommendationPublishMedia(reference);
    expect(materialized.uri).toBe('blob:queued-preview');
    materialized.revoke();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:queued-preview');
    await deleteRecommendationPublishMedia(reference);
    expect(database.values.has(reference.key)).toBe(false);

    URL.createObjectURL = originalCreateObjectUrl;
    URL.revokeObjectURL = originalRevokeObjectUrl;
    delete global.indexedDB;
  });
});
