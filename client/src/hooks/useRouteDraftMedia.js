import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { useCallback, useRef } from 'react';

import { auth } from '../config/firebase';
import {
  deleteContentPublishMedia,
  materializeContentPublishMedia,
  persistContentPublishMedia,
} from '../features/publishing/contentPublishStorage';
import { createTravelMediaDescriptor, travelMediaIdentity, travelMediaUri } from '../utils/travelMedia';

const STORAGE_KEY_PREFIX = '@planli/route-draft-media-v1';
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

function routeMediaLocation(item, location = {}) {
  const slot = item?.slot;
  return {
    dayId: location.dayId || item?.dayId || (slot?.type === 'route-stop'
      ? slot.dayDraftId || `day-${slot.dayIndex}`
      : ''),
    stopId: location.stopId || item?.stopId || (slot?.type === 'route-stop'
      ? slot.draftId || `stop-${slot.stopIndex}`
      : ''),
  };
}

function routeMediaEntryKey({ dayId, stopId } = {}, sourceId = '') {
  return JSON.stringify([dayId || '', stopId || '', sourceId || '']);
}

function storedIdentity(entries, item, location = {}) {
  const descriptor = createTravelMediaDescriptor(item);
  if (!descriptor) return '';
  const sourceId = travelMediaIdentity(descriptor);
  const resolvedLocation = routeMediaLocation(item, location);
  if (resolvedLocation.dayId && resolvedLocation.stopId) {
    const exactKey = routeMediaEntryKey(resolvedLocation, sourceId);
    if (entries.has(exactKey)) return exactKey;
    const uri = travelMediaUri(descriptor);
    for (const [key, entry] of entries) {
      if (entry.dayId !== resolvedLocation.dayId || entry.stopId !== resolvedLocation.stopId) continue;
      if (travelMediaIdentity(entry) === sourceId ||
          [entry.uri, entry.sourceUri, entry.previewUri, entry.localReference?.key].includes(uri)) {
        return key;
      }
    }
    return exactKey;
  }
  const matches = [];
  const uri = travelMediaUri(descriptor);
  for (const [key, entry] of entries) {
    if (travelMediaIdentity(entry) === sourceId ||
        [entry.uri, entry.sourceUri, entry.previewUri, entry.localReference?.key].includes(uri)) {
      matches.push(key);
    }
  }
  return matches.length === 1 ? matches[0] : sourceId;
}

export default function useRouteDraftMedia() {
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
        dayId: entry.dayId,
        stopId: entry.stopId,
        sourceId: entry.sourceId,
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

  const persistOne = useCallback((item, { dayId, stopId } = {}) => {
    const descriptor = createTravelMediaDescriptor(item);
    if (!descriptor || descriptor.type === 'remote') return Promise.resolve(descriptor);
    if (!dayId || !stopId) return Promise.reject(new Error('A route stop is required to keep selected images.'));
    const location = { dayId, stopId };
    const identity = storedIdentity(entriesByIdentityRef.current, descriptor, location);
    const existing = entriesByIdentityRef.current.get(identity);
    if (existing) {
      const updated = {
        ...existing,
        ...descriptor,
        dayId,
        stopId,
        localReference: existing.localReference,
        persistence: 'ready',
      };
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
      const entry = {
        ...descriptor,
        sourceId: descriptor.sourceId || travelMediaIdentity(descriptor),
        dayId,
        stopId,
        mediaId,
        localReference,
        persistence: 'ready',
      };
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

  const persistMedia = useCallback(async (items, location = {}) => {
    const list = (Array.isArray(items) ? items : []).filter(Boolean);
    const results = new Array(list.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < list.length) {
        const index = cursor++;
        results[index] = await persistOne(list[index], location);
      }
    };
    await Promise.all(Array.from({ length: Math.min(2, list.length) }, worker));
    return results.filter(Boolean);
  }, [persistOne]);

  const persistUris = useCallback(async (uris, location = {}) => {
    await persistMedia(uris, location);
    return uris;
  }, [persistMedia]);

  const waitForMedia = useCallback(async (items) => {
    const descriptors = (Array.isArray(items) ? items : []).map((item) => createTravelMediaDescriptor(item)).filter(Boolean);
    await Promise.all(descriptors.map(async (item) => {
      if (item.type === 'remote') return;
      const location = routeMediaLocation(item);
      const identity = storedIdentity(entriesByIdentityRef.current, item, location);
      const pending = pendingByIdentityRef.current.get(identity);
      if (pending) await pending;
      if (!entriesByIdentityRef.current.get(identity)?.localReference && item.slot?.type === 'route-stop') {
        await persistOne(item, location);
      }
      if (!entriesByIdentityRef.current.get(storedIdentity(entriesByIdentityRef.current, item, location))?.localReference && item.slot?.type !== 'route-day') {
        throw new Error('A selected route photo is no longer available.');
      }
    }));
    return descriptors.map((item) => {
      if (item.type === 'remote') return item;
      const entry = entriesByIdentityRef.current.get(storedIdentity(
        entriesByIdentityRef.current,
        item,
        routeMediaLocation(item)
      ));
      return entry ? { ...item, ...entry, slot: item.slot, persistence: 'ready' } : item;
    });
  }, [persistOne]);

  const forgetMedia = useCallback(async (item, location = {}) => {
    const descriptor = createTravelMediaDescriptor(item);
    const identity = storedIdentity(entriesByIdentityRef.current, descriptor, location);
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

  const mediaForItem = useCallback((item, location = {}) => {
    const descriptor = createTravelMediaDescriptor(item);
    if (!descriptor) return item;
    const entry = entriesByIdentityRef.current.get(storedIdentity(
      entriesByIdentityRef.current,
      descriptor,
      location
    ));
    return entry ? { ...descriptor, ...entry } : descriptor;
  }, []);
  const mediaForUri = useCallback((uri) => mediaForItem(uri), [mediaForItem]);

  const restoreDraft = useCallback(async (draftId, expectedCount = 0) => {
    const uid = auth.currentUser?.uid;
    draftIdRef.current = draftId || '';
    if (!uid || !draftId) return { entries: [], missingCount: Number(expectedCount || 0) };
    const manifest = await readManifest(uid);
    if (!manifest || manifest.draftId !== draftId) {
      if (manifest) {
        await deleteManifestFiles(manifest);
        await AsyncStorage.removeItem(storageKey(uid));
      }
      return { entries: [], missingCount: Number(expectedCount || 0) };
    }
    jobIdRef.current = manifest.jobId || jobIdRef.current;
    const entries = [];
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
        entriesByIdentityRef.current.set(routeMediaEntryKey(entry, travelMediaIdentity(restored)), restored);
        entries.push(restored);
      } catch {
        // Missing local files are reported by count and omitted from the restored draft.
      }
    }
    return {
      entries,
      missingCount: Math.max(0, Number(expectedCount || 0) - entries.length),
    };
  }, []);

  const clearDraft = useCallback(async ({ deleteFiles = true, keepUris = [], keepItems = [] } = {}) => {
    const uid = auth.currentUser?.uid;
    const manifest = uid ? await readManifest(uid) : null;
    await Promise.allSettled(Array.from(pendingByIdentityRef.current.values()));
    const entries = [...Array.from(entriesByIdentityRef.current.values()), ...(manifest?.entries || [])];
    const kept = new Set([
      ...(keepUris || []).filter(Boolean).map((item) => storedIdentity(
        entriesByIdentityRef.current,
        item,
        routeMediaLocation(item)
      )),
      ...(keepItems || []).filter(Boolean).map((item) => storedIdentity(
        entriesByIdentityRef.current,
        item,
        routeMediaLocation(item)
      )),
    ]);
    const keptReferences = new Set(Array.from(entriesByIdentityRef.current.entries())
      .filter(([key]) => kept.has(key))
      .map(([, entry]) => `${entry.localReference?.platform || ''}:${entry.localReference?.key || ''}`));
    const references = entries
      .filter((entry) => deleteFiles || !keptReferences.has(
        `${entry.localReference?.platform || ''}:${entry.localReference?.key || ''}`
      ))
      .map((entry) => entry.localReference)
      .filter((reference, index, all) => reference?.key &&
        all.findIndex((candidate) => candidate?.platform === reference.platform && candidate?.key === reference.key) === index);
    await Promise.allSettled(references.map((reference) => deleteContentPublishMedia(reference)));
    entriesByIdentityRef.current.clear();
    pendingByIdentityRef.current.clear();
    draftIdRef.current = '';
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
    draftJobId: jobIdRef.current,
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

export const routeDraftMediaStorage = { STORAGE_KEY_PREFIX, readManifest };
