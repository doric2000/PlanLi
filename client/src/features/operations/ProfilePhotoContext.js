import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { doc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from '../../config/firebase';
import { useAuth } from '../auth/AuthContext';
import { useImagePickerWithUpload } from '../../hooks/useImagePickerWithUpload';
import { normalizeImageUri } from '../../hooks/useImagePicker';
import { primeUserDataCache } from '../../hooks/useUserData';
import { saveProfile } from '../../services/ProfileService';
import { invalidateProfileResource } from '../profile/services/ProfileResourceService';
import {
  persistRecommendationPublishMedia, materializeRecommendationPublishMedia,
  deleteRecommendationPublishMedia,
} from '../community/publishing/recommendationPublishStorage';
import { operationStore } from './operationService';
import { safeOperationError, TERMINAL_STATES } from './operationModel';
import { useOperations } from './OperationState';
import { backgroundTransfersAvailable, runBackgroundMedia, removeBackgroundSources, discardBackgroundJob } from './BackgroundMediaService';

export const AVATAR_IMAGE_OPTIONS = Object.freeze({
  normalizeToAspect: true, normalizeAspect: [1, 1], normalizeWidth: 768,
  normalizeHeight: 768, maxLongEdge: 768, normalizeCompress: 0.9,
  revokeSourceObjectUrl: false,
});
const QUEUE_KEY = '@planli/profile-photo-jobs';
const PhotoContext = createContext({ jobs: [], enqueue: null, retry: null, discard: null, lastSaved: null });

export function ProfilePhotoProvider({ children }) {
  const { user } = useAuth();
  const { active } = useOperations();
  const [jobs, setJobs] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [wake, setWake] = useState(0);
  const jobsRef = useRef([]);
  const writes = useRef(Promise.resolve());
  const running = useRef(false);
  const accepting = useRef(false);
  const { uploadImageAsset } = useImagePickerWithUpload({ kind: 'avatar' });
  const uploadRef = useRef(uploadImageAsset);
  uploadRef.current = uploadImageAsset;
  const commit = useCallback(async (transform) => {
    const next = transform(jobsRef.current);
    jobsRef.current = next;
    setJobs(next);
    writes.current = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next)));
    await writes.current;
  }, []);
  const record = useCallback(async (job, patch = {}, durable = true) => {
    job = jobsRef.current.find((entry) => entry.id === job.id) || job;
    await operationStore.update({
      id: job.id, ownerUid: job.ownerUid, kind: 'avatar', source: 'avatar', targetId: job.ownerUid,
      serverOperationId: job.background?.operationId,
      status: job.status, stage: job.status, createdAt: job.createdAt, updatedAt: job.updatedAt,
      ...patch,
    }, { durable }).catch(() => {});
  }, []);
  const change = useCallback(async (id, patch) => {
    await commit((current) => current.map((job) => job.id === id ? { ...job, ...patch, updatedAt: Date.now() } : job));
    const next = jobsRef.current.find((job) => job.id === id);
    if (next) await record(next, patch);
    return next;
  }, [commit, record]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(QUEUE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) throw new Error('Invalid photo queue');
        if (!mounted) return;
        const restored = parsed.filter((job) => job?.id && job.ownerUid && job.localReference).map((job) => ({
          ...job, status: job.background ? (job.status === 'failed' ? 'failed' : 'queued') : ['saving', 'success', 'uncertain'].includes(job.status) ? 'reconciling'
            : job.status === 'failed' ? 'failed' : 'queued',
        }));
        await commit(() => restored);
        await Promise.all(restored.map((job) => record(job)));
        if (mounted) setHydrated(true);
      } catch {
        // Keep the existing queue untouched if recovery cannot read it.
        if (mounted) setHydrated(false);
      }
    })();
    return () => { mounted = false; };
  }, [commit, record]);

  const enqueue = useCallback(async (uri) => {
    const ownerUid = user?.uid;
    if (!hydrated || !ownerUid || auth.currentUser?.uid !== ownerUid) throw new Error('Photo queue unavailable');
    if (accepting.current || jobsRef.current.some((job) => job.ownerUid === ownerUid && !TERMINAL_STATES.has(job.status))) return null;
    accepting.current = true;
    const id = randomUUID();
    let reference;
    try {
      await record({ id, ownerUid, status: 'preparing', createdAt: Date.now() });
      reference = await persistRecommendationPublishMedia({ ownerUid, jobId: id, mediaId: id, uri });
      const job = { id, ownerUid, localReference: reference, status: 'queued', createdAt: Date.now(), updatedAt: Date.now() };
      await commit((current) => [...current, job]);
      await record(job);
      return id;
    } catch (error) {
      await commit((current) => current.filter((job) => job.id !== id)).catch(() => {});
      if (reference) await deleteRecommendationPublishMedia(reference).catch(() => {});
      const safe = safeOperationError(error);
      await record({ id, ownerUid, status: 'failed' }, { message: safe.message, code: safe.code });
      throw error;
    } finally { accepting.current = false; }
  }, [commit, hydrated, record, user?.uid]);

  const process = useCallback(async (initial) => {
    let materialized;
    let saved = false;
    let asset = initial.asset;
    const assertOwner = () => {
      if (auth.currentUser?.uid !== initial.ownerUid) {
        const error = new Error('Account changed'); error.code = 'auth/unauthenticated'; throw error;
      }
    };
    try {
      assertOwner();
      if (initial.background || (backgroundTransfersAvailable() && !asset)) {
        const result = await runBackgroundMedia({ job: initial, kind: 'avatar', media: [initial],
          normalize: async (uri) => { const normalized = await normalizeImageUri(uri, AVATAR_IMAGE_OPTIONS);
            return { uri: normalized, temporary: normalized !== uri }; },
          checkpoint: (background) => change(initial.id, { background }),
          stage: (status) => change(initial.id, { status }),
          progress: (_index, progress) => record(initial, { progress }, false),
        });
        asset = result.photoMedia; saved = true;
      }
      if (!saved && initial.status === 'reconciling') {
        const snapshot = await getDocFromServer(doc(db, 'users', initial.ownerUid));
        saved = Boolean(asset?.assetId && snapshot.data()?.photoMedia?.assetId === asset.assetId);
        if (!saved) {
          await change(initial.id, { status: 'uncertain', acknowledged: false,
            message: 'לא ניתן לאשר את השמירה הקודמת. בדקו את תמונת הפרופיל ובחרו תמונה מחדש במידת הצורך.' });
          return;
        }
      }
      if (!saved) {
        if (!asset) {
          await change(initial.id, { status: 'preparing' });
          materialized = await materializeRecommendationPublishMedia(initial.localReference);
          const started = Date.now();
          const uri = await normalizeImageUri(materialized.uri, AVATAR_IMAGE_OPTIONS);
          console.info('avatar_preparation_timing', { durationMs: Date.now() - started });
          assertOwner();
          asset = await uploadRef.current(uri, {
            expectedOwnerUid: initial.ownerUid,
            onStage: (stage) => change(initial.id, { status: stage }).catch(() => {}),
            onProgress: (progress) => record(initial, { progress }, false),
          });
          if (!asset?.assetId || !asset?.feed?.url) throw new Error('Invalid prepared avatar');
          await change(initial.id, { asset });
        }
        assertOwner();
        await change(initial.id, { status: 'saving', asset });
        await saveProfile({ photoMedia: asset }, { feedback: false });
        saved = true;
      }
      await change(initial.id, { status: 'success', acknowledged: false, progress: 1 });
      primeUserDataCache(initial.ownerUid, {
        displayName: auth.currentUser?.uid === initial.ownerUid ? auth.currentUser.displayName : undefined,
        photoURL: asset.feed.url, photoMedia: asset,
      });
      invalidateProfileResource(initial.ownerUid);
      setLastSaved({ ownerUid: initial.ownerUid, asset, at: Date.now() });
      if (auth.currentUser?.uid === initial.ownerUid) {
        await auth.currentUser.reload().catch(() => record(initial, { status: 'success', stage: 'success', refreshNeeded: true }));
      }
      await removeBackgroundSources(jobsRef.current.find((job) => job.id === initial.id) || initial).catch(() => {});
      await deleteRecommendationPublishMedia(initial.localReference).catch(() => {});
      await commit((current) => current.filter((job) => job.id !== initial.id));
    } catch (error) {
      if (saved) {
        await record(initial, { status: 'success', stage: 'success', refreshNeeded: true });
        return;
      }
      const safe = safeOperationError(error);
      const current = jobsRef.current.find((job) => job.id === initial.id);
      const uncertain = !current?.background && (current?.status === 'saving' || initial.status === 'reconciling');
      await change(initial.id, { status: uncertain ? 'uncertain' : 'failed', acknowledged: false,
        code: safe.code, message: uncertain ? 'ייתכן שהתמונה נשמרה. בדקו את הפרופיל לפני ניסיון נוסף.' : safe.message }).catch(() => {});
    } finally { materialized?.revoke?.(); }
  }, [change, commit, record]);

  useEffect(() => {
    if (!hydrated || !active || !user?.uid || running.current) return;
    const job = jobsRef.current.find((entry) => entry.ownerUid === user.uid && ['queued', 'reconciling'].includes(entry.status));
    if (!job) return;
    running.current = true;
    process(job).finally(() => { running.current = false; setWake((value) => value + 1); });
  }, [active, hydrated, jobs, process, user?.uid, wake]);
  const retry = useCallback(async (id) => {
    const job = jobsRef.current.find((entry) => entry.id === id && entry.ownerUid === user?.uid);
    if (job?.status === 'failed') await change(id, { status: 'queued', message: null, code: null, dismissed: false, acknowledged: false,
      ...(job.background ? { background: { ...job.background, retryRequested: true } } : {}) });
  }, [change, user?.uid]);
  const discard = useCallback(async (id) => {
    const job = jobsRef.current.find((entry) => entry.id === id && entry.ownerUid === user?.uid);
    if (!job || !TERMINAL_STATES.has(job.status)) return;
    await discardBackgroundJob(job);
    await commit((current) => current.filter((entry) => entry.id !== id));
    await deleteRecommendationPublishMedia(job.localReference);
    await operationStore.remove(id, job.ownerUid);
  }, [commit, user?.uid]);
  return <PhotoContext.Provider value={{ jobs: jobs.filter((job) => job.ownerUid === user?.uid), enqueue, retry, discard, lastSaved }}>
    {children}
  </PhotoContext.Provider>;
}
export const useProfilePhotoJobs = () => useContext(PhotoContext);
