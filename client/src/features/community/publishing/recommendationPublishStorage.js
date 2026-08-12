import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const JOBS_STORAGE_KEY = '@planli/recommendation-publish-jobs-v1';
const NATIVE_QUEUE_DIRECTORY = `${FileSystem.documentDirectory || ''}recommendation-publish-queue`;
const WEB_DB_NAME = 'planli-recommendation-publish-queue';
const WEB_STORE_NAME = 'media';

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function openWebDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Persistent browser media storage is unavailable.'));
      return;
    }
    const request = indexedDB.open(WEB_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WEB_STORE_NAME)) {
        database.createObjectStore(WEB_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open browser media storage.'));
  });
}

async function withWebStore(mode, operation) {
  const database = await openWebDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(WEB_STORE_NAME, mode);
      const store = transaction.objectStore(WEB_STORE_NAME);
      let request;
      let requestResult;
      try {
        request = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      request.onsuccess = () => {
        requestResult = request.result;
        if (mode === 'readonly') resolve(requestResult);
      };
      request.onerror = () => reject(request.error || new Error('Browser media storage failed.'));
      transaction.oncomplete = () => resolve(requestResult);
      transaction.onerror = () => reject(transaction.error || new Error('Browser media transaction failed.'));
      transaction.onabort = () => reject(transaction.error || new Error('Browser media transaction was aborted.'));
    });
  } finally {
    database.close();
  }
}

export async function loadRecommendationPublishJobs() {
  try {
    const serialized = await AsyncStorage.getItem(JOBS_STORAGE_KEY);
    const parsed = serialized ? JSON.parse(serialized) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRecommendationPublishJobs(jobs) {
  await AsyncStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(Array.isArray(jobs) ? jobs : []));
}

export async function persistRecommendationPublishMedia({ ownerUid, jobId, mediaId, uri }) {
  if (!uri) throw new Error('Missing local recommendation image.');
  const key = `${safeSegment(ownerUid)}/${safeSegment(jobId)}/${safeSegment(mediaId)}`;

  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    const blob = await response.blob();
    await withWebStore('readwrite', (store) => store.put(blob, key));
    return { platform: 'web', key };
  }

  if (!FileSystem.documentDirectory) {
    throw new Error('Persistent local media storage is unavailable.');
  }
  const jobDirectory = `${NATIVE_QUEUE_DIRECTORY}/${safeSegment(ownerUid)}/${safeSegment(jobId)}`;
  await FileSystem.makeDirectoryAsync(jobDirectory, { intermediates: true });
  const destination = `${jobDirectory}/${safeSegment(mediaId)}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return { platform: 'native', key: destination };
}

export async function materializeRecommendationPublishMedia(reference) {
  if (!reference?.key) throw new Error('Queued recommendation image is missing.');
  if (reference.platform !== 'web') return { uri: reference.key, revoke: () => {} };

  const blob = await withWebStore('readonly', (store) => store.get(reference.key));
  if (!blob) throw new Error('Queued recommendation image is no longer available.');
  const uri = URL.createObjectURL(blob);
  return {
    uri,
    revoke: () => URL.revokeObjectURL(uri),
  };
}

export async function deleteRecommendationPublishMedia(reference) {
  if (!reference?.key) return;
  if (reference.platform === 'web') {
    await withWebStore('readwrite', (store) => store.delete(reference.key)).catch(() => {});
    return;
  }
  await FileSystem.deleteAsync(reference.key, { idempotent: true }).catch(() => {});
}

export async function deleteRecommendationPublishJobMedia(job) {
  await Promise.allSettled(
    (job?.media || []).map((entry) => deleteRecommendationPublishMedia(entry.localReference))
  );
}

export const recommendationPublishStorageKeys = {
  jobs: JOBS_STORAGE_KEY,
};
