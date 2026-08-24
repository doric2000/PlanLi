import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useCallback, useRef } from 'react';

import { auth } from '../config/firebase';
import {
  deleteContentPublishMedia,
  materializeContentPublishMedia,
  persistContentPublishMedia,
} from '../features/publishing/contentPublishStorage';
import {
  createTravelMediaDescriptor,
  travelMediaIdentity,
  travelMediaUri,
} from '../utils/travelMedia';

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

const descriptorForInput = (item) => createTravelMediaDescriptor(item) || null;

function storedIdentity(entries, item) {
  const descriptor = descriptorForInput(item);
  const identity = travelMediaIdentity(descriptor);
  if (entries.has(identity)) return identity;
  const uri = travelMediaUri(descriptor);
  for (const [key, entry] of entries) {
    if ([entry.uri, entry.sourceUri, entry.previewUri, entry.localReference?.key].includes(uri)) return key;
  }
  return identity;
}

export default function useRecommendationDraftMedia() {
  const jobIdRef = useRef(randomUUID());
  const draftIdRef = useRef('');
  const entriesByIdentityRef = useRef(new Map());
  const pendingByIdentityRef = useRef(new Map());
  const forgottenRef = useRef(new Set());
  const manifestQueueRef = useRef(Promise.resolve());

  const persistManifest = useCallback(() => {
    const uid = auth.currentUser?.uid;
    if (!uid || !draftIdRef.current) return Promise.resolve();
    manifestQueueRef.current = manifestQueueRef.current.catch(() => {}).then(() => {
      const entries = Array.from(entriesByIdentityRef.current.values()).map((entry) => ({
        sourceId: entry.sourceId,
        previewUri: entry.previewUri,
        assetId: entry.assetId || null,
        width: entry.width || null,
        height: entry.height || null,
        mediaId: entry.mediaId,
        localReference: entry.localReference,
        transform: entry.transform || null,
      }));
      return AsyncStorage.setItem(storageKey(uid), JSON.stringify({
        version: 2,
        draftId: draftIdRef.current,
        jobId: jobIdRef.current,
        entries,
        updatedAt: Date.now(),
      }));
    });
    return manifestQueueRef.current;
  }, []);

  const bindDraft = useCallback(async (draftId) => {
    draftIdRef.current = draftId || '';
    await persistManifest();
  }, [persistManifest]);

  const persistOne = useCallback((item) => {
    const descriptor = descriptorForInput(item);
    if (!descriptor || descriptor.type === 'remote') return Promise.resolve(descriptor);
    const identity = storedIdentity(entriesByIdentityRef.current, descriptor);
    const existing = entriesByIdentityRef.current.get(identity);
    if (existing) {
      const updated = { ...existing, ...descriptor, localReference: existing.localReference, persistence: 'ready' };
      entriesByIdentityRef.current.set(identity, updated);
      return persistManifest().then(() => updated);
    }
    const pending = pendingByIdentityRef.current.get(identity);
    if (pending) return pending;
    const uid = auth.currentUser?.uid;
    if (!uid) return Promise.reject(new Error('You must be signed in to keep selected images.'));
    forgottenRef.current.delete(identity);
    const promise = (async () => {
      const mediaId = descriptor.mediaId || randomUUID();
      const localReference = descriptor.localReference || await persistContentPublishMedia({
        ownerUid: uid,
        jobId: jobIdRef.current,
        mediaId,
        uri: descriptor.sourceUri || descriptor.uri,
      });
      const entry = { ...descriptor, sourceId: identity, mediaId, localReference, persistence: 'ready' };
      if (forgottenRef.current.has(identity)) {
        await deleteContentPublishMedia(localReference);
        return null;
      }
      entriesByIdentityRef.current.set(identity, entry);
      await persistManifest();
      return entry;
    })().finally(() => pendingByIdentityRef.current.delete(identity));
    pendingByIdentityRef.current.set(identity, promise);
    return promise;
  }, [persistManifest]);

  const persistMedia = useCallback(async (items) => {
    const list = (Array.isArray(items) ? items : []).filter(Boolean);
    const results = new Array(list.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const index = cursor++;
        results[index] = await persistOne(list[index]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, list.length) }, worker));
    return results.filter(Boolean);
  }, [persistOne]);

  const persistUris = useCallback(async (uris) => {
    await persistMedia(uris);
    return uris;
  }, [persistMedia]);

  const waitForMedia = useCallback(async (items) => {
    const descriptors = (Array.isArray(items) ? items : []).map(descriptorForInput).filter(Boolean);
    await Promise.all(descriptors.map((item) => persistOne(item)));
    return descriptors.map((item) => {
      if (item.type === 'remote') return item;
      const entry = entriesByIdentityRef.current.get(travelMediaIdentity(item));
      if (!entry?.localReference) throw new Error('A selected photo is no longer available.');
      return { ...item, ...entry, persistence: 'ready' };
    });
  }, [persistOne]);

  const forgetMedia = useCallback(async (item) => {
    const descriptor = descriptorForInput(item);
    const identity = storedIdentity(entriesByIdentityRef.current, descriptor);
    if (!identity) return;
    forgottenRef.current.add(identity);
    const pending = pendingByIdentityRef.current.get(identity);
    if (pending) await pending.catch(() => {});
    const entry = entriesByIdentityRef.current.get(identity);
    entriesByIdentityRef.current.delete(identity);
    if (entry?.localReference) await deleteContentPublishMedia(entry.localReference);
    await persistManifest();
  }, [persistManifest]);

  const forgetUri = useCallback((uri) => forgetMedia(uri), [forgetMedia]);

  const mediaForItem = useCallback((item) => {
    const descriptor = descriptorForInput(item);
    if (!descriptor) return item;
    const entry = entriesByIdentityRef.current.get(storedIdentity(entriesByIdentityRef.current, descriptor));
    return entry ? { ...descriptor, ...entry } : descriptor;
  }, []);
  const mediaForUri = useCallback((uri) => mediaForItem(uri), [mediaForItem]);

  const restoreDraft = useCallback(async (draftId, expectedCount = 0) => {
    const uid = auth.currentUser?.uid;
    draftIdRef.current = draftId || '';
    if (!uid || !draftId) return { uris: [], items: [], missingCount: Number(expectedCount || 0) };
    const manifest = await readManifest(uid);
    if (!manifest || manifest.draftId !== draftId) {
      if (manifest) {
        await deleteManifestFiles(manifest);
        await AsyncStorage.removeItem(storageKey(uid));
      }
      return { uris: [], items: [], missingCount: Number(expectedCount || 0) };
    }
    jobIdRef.current = manifest.jobId || jobIdRef.current;
    const items = [];
    for (const entry of manifest.entries) {
      try {
        const materialized = await materializeContentPublishMedia(entry.localReference);
        const restored = createTravelMediaDescriptor({
          ...entry,
          id: entry.sourceId || entry.mediaId,
          sourceId: entry.sourceId || entry.mediaId,
          uri: materialized.uri,
          sourceUri: materialized.uri,
          previewUri: materialized.uri,
          persistence: 'ready',
          transform: Number(manifest.version || 1) >= 2 ? entry.transform || null : null,
        });
        entriesByIdentityRef.current.set(travelMediaIdentity(restored), restored);
        items.push(restored);
      } catch {
        // Missing local files are reported to the composer and omitted.
      }
    }
    return {
      items,
      uris: items.map(travelMediaUri),
      missingCount: Math.max(0, Number(expectedCount || 0) - items.length),
    };
  }, []);

  const clearDraft = useCallback(async ({ deleteFiles = true, keepUris = [], keepItems = [] } = {}) => {
    const uid = auth.currentUser?.uid;
    const manifest = uid ? await readManifest(uid) : null;
    await Promise.allSettled(Array.from(pendingByIdentityRef.current.values()));
    const entries = [
      ...Array.from(entriesByIdentityRef.current.values()),
      ...(manifest?.entries || []),
    ];
    const kept = new Set([
      ...(keepUris || []).filter(Boolean).map((uri) => storedIdentity(entriesByIdentityRef.current, uri)),
      ...(keepItems || []).filter(Boolean).map((item) => storedIdentity(entriesByIdentityRef.current, item)),
    ]);
    const keptMediaIds = new Set(Array.from(entriesByIdentityRef.current.values())
      .filter((entry) => kept.has(travelMediaIdentity(entry)))
      .map((entry) => entry.mediaId));
    entriesByIdentityRef.current.clear();
    pendingByIdentityRef.current.clear();
    draftIdRef.current = '';
    const references = entries
      .filter((entry) => deleteFiles || !keptMediaIds.has(entry.mediaId))
      .map((entry) => entry.localReference)
      .filter((reference, index, all) => reference?.key &&
        all.findIndex((candidate) => candidate?.platform === reference.platform && candidate?.key === reference.key) === index);
    await Promise.allSettled(references.map((reference) => deleteContentPublishMedia(reference)));
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
    forgetMedia,
    forgetUri,
    mediaForItem,
    mediaForUri,
    persistMedia,
    persistUris,
    restoreDraft,
    waitForMedia,
  };
}

export const recommendationDraftMediaStorage = { STORAGE_KEY_PREFIX, readManifest };
