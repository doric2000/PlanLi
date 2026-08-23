import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useCallback, useRef } from 'react';

import { auth } from '../config/firebase';
import {
  deleteContentPublishMedia,
  materializeContentPublishMedia,
  persistContentPublishMedia,
} from '../features/publishing/contentPublishStorage';

const STORAGE_KEY_PREFIX = '@planli/recommendation-draft-media-v1';

const storageKey = (uid) => `${STORAGE_KEY_PREFIX}:${uid}`;

async function readManifest(uid) {
  try {
    const serialized = await AsyncStorage.getItem(storageKey(uid));
    const parsed = serialized ? JSON.parse(serialized) : null;
    return parsed && Array.isArray(parsed.entries) ? parsed : null;
  } catch {
    return null;
  }
}

async function deleteManifestFiles(manifest) {
  await Promise.allSettled((manifest?.entries || []).map((entry) => (
    deleteContentPublishMedia(entry.localReference)
  )));
}

export default function useRecommendationDraftMedia() {
  const jobIdRef = useRef(randomUUID());
  const draftIdRef = useRef('');
  const entriesByUriRef = useRef(new Map());

  const persistManifest = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !draftIdRef.current) return;
    const entries = Array.from(entriesByUriRef.current.values()).map(({ mediaId, localReference }) => ({
      mediaId,
      localReference,
    }));
    await AsyncStorage.setItem(storageKey(uid), JSON.stringify({
      version: 1,
      draftId: draftIdRef.current,
      jobId: jobIdRef.current,
      entries,
      updatedAt: Date.now(),
    }));
  }, []);

  const bindDraft = useCallback(async (draftId) => {
    draftIdRef.current = draftId || '';
    await persistManifest();
  }, [persistManifest]);

  const persistUris = useCallback(async (uris) => {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('You must be signed in to keep selected images.');
    for (const uri of (Array.isArray(uris) ? uris : []).filter(Boolean)) {
      if (entriesByUriRef.current.has(uri)) continue;
      const mediaId = randomUUID();
      const localReference = await persistContentPublishMedia({
        ownerUid: uid,
        jobId: jobIdRef.current,
        mediaId,
        uri,
      });
      entriesByUriRef.current.set(uri, { uri, mediaId, localReference });
    }
    await persistManifest();
    return uris;
  }, [persistManifest]);

  const forgetUri = useCallback(async (uri) => {
    const entry = entriesByUriRef.current.get(uri);
    if (!entry) return;
    entriesByUriRef.current.delete(uri);
    await deleteContentPublishMedia(entry.localReference);
    await persistManifest();
  }, [persistManifest]);

  const mediaForUri = useCallback((uri) => {
    const entry = entriesByUriRef.current.get(uri);
    return entry ? { uri, mediaId: entry.mediaId, localReference: entry.localReference } : { uri };
  }, []);

  const restoreDraft = useCallback(async (draftId, expectedCount = 0) => {
    const uid = auth.currentUser?.uid;
    draftIdRef.current = draftId || '';
    if (!uid || !draftId) return { uris: [], missingCount: Number(expectedCount || 0) };
    const manifest = await readManifest(uid);
    if (!manifest || manifest.draftId !== draftId) {
      if (manifest) {
        await deleteManifestFiles(manifest);
        await AsyncStorage.removeItem(storageKey(uid));
      }
      return { uris: [], missingCount: Number(expectedCount || 0) };
    }
    jobIdRef.current = manifest.jobId || jobIdRef.current;
    const uris = [];
    for (const entry of manifest.entries) {
      try {
        const materialized = await materializeContentPublishMedia(entry.localReference);
        entriesByUriRef.current.set(materialized.uri, { ...entry, uri: materialized.uri });
        uris.push(materialized.uri);
      } catch {
        // Missing local files are reported to the composer and omitted.
      }
    }
    return { uris, missingCount: Math.max(0, Number(expectedCount || 0) - uris.length) };
  }, []);

  const clearDraft = useCallback(async ({ deleteFiles = true } = {}) => {
    const uid = auth.currentUser?.uid;
    const entries = Array.from(entriesByUriRef.current.values());
    const manifest = uid ? await readManifest(uid) : null;
    entriesByUriRef.current.clear();
    draftIdRef.current = '';
    if (deleteFiles) {
      const references = [...entries, ...(manifest?.entries || [])]
        .map((entry) => entry.localReference)
        .filter((reference, index, all) => reference?.key &&
          all.findIndex((candidate) => candidate?.platform === reference.platform && candidate?.key === reference.key) === index);
      await Promise.allSettled(references.map((reference) => deleteContentPublishMedia(reference)));
    }
    if (uid) await AsyncStorage.removeItem(storageKey(uid));
  }, []);

  const clearStaleDraft = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const manifest = await readManifest(uid);
    if (manifest) await deleteManifestFiles(manifest);
    await AsyncStorage.removeItem(storageKey(uid));
  }, []);

  return {
    bindDraft,
    clearDraft,
    clearStaleDraft,
    forgetUri,
    mediaForUri,
    persistUris,
    restoreDraft,
  };
}

export const recommendationDraftMediaStorage = { STORAGE_KEY_PREFIX, readManifest };
