import { randomUUID } from 'expo-crypto';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { auth } from '../../../config/firebase';
import { TRAVEL_TAXONOMY_VERSION } from '../../../constants/travelTaxonomy';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';
import { saveRecommendation } from '../../../services/RecommendationService';
import { saveRoute } from '../../../services/RouteService';
import { applyRoutePublishMedia } from '../../roadtrip/utils/routeMedia';
import { rememberDiscoveryDestinations } from '../../../utils/recentDiscoveryDestinations';
import {
  deleteRecommendationPublishJobMedia,
  deleteRecommendationPublishMedia,
  loadRecommendationPublishJobs,
  materializeRecommendationPublishMedia,
  persistRecommendationPublishMedia,
  saveRecommendationPublishJobs,
} from './recommendationPublishStorage';

const MAX_AUTOMATIC_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 5000, 15000];
const SUCCESS_VISIBLE_MS = 4000;
const TRANSIENT_CODES = new Set([
  'functions/aborted',
  'functions/cancelled',
  'functions/deadline-exceeded',
  'functions/internal',
  'functions/resource-exhausted',
  'functions/unavailable',
  'storage/retry-limit-exceeded',
  'storage/server-file-wrong-size',
  'storage/unknown',
]);

const defaultValue = {
  activeJob: null,
  completedVersion: 0,
  completedVersionByType: { recommendation: 0, route: 0 },
  discard: async () => {},
  enqueueCreate: null,
  jobs: [],
  loadJobForReview: async () => null,
  retry: async () => {},
};

const ContentPublishContext = createContext(defaultValue);

function normalizedError(error) {
  return {
    code: String(error?.code || 'unknown'),
    message: String(error?.message || 'Could not publish this content.').slice(0, 500),
  };
}

export function isTransientPublishError(error) {
  const code = String(error?.code || '');
  if (TRANSIENT_CODES.has(code)) return true;
  const message = String(error?.message || '').toLowerCase();
  return /network|offline|timed? out|temporar|connection|fetch failed/.test(message);
}

function isExpiredPlaceTokenError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    ['functions/deadline-exceeded', 'functions/not-found', 'functions/failed-precondition'].includes(code) &&
    /place|search|token|expired/.test(message)
  );
}

export function recommendationPublishProgress(job) {
  if (!job) return 0;
  if (job.status === 'success') return 1;
  if (job.stage === 'saving') return Math.max(0.88, Number(job.progress || 0));
  const media = Array.isArray(job.media) ? job.media : [];
  if (!media.length) return job.status === 'queued' ? 0 : 0.88;
  const mediaProgress = media.reduce(
    (sum, entry) => sum + Math.max(0, Math.min(1, Number(entry.progress || 0))),
    0
  ) / media.length;
  return Math.min(0.86, mediaProgress * 0.86);
}

function remotePreview(asset) {
  return asset?.feed?.url || asset?.large?.url || asset?.thumb?.url || null;
}

export function upgradeRestoredPublishJob(job) {
  const contentType = job?.contentType === 'route' ? 'route' : 'recommendation';
  const payloadContent = contentType === 'route' ? job?.payload?.route : job?.payload?.recommendation;
  const sourceVersion = Number(payloadContent?.taxonomyVersion || 0);
  const base = {
    ...job,
    version: Number(job?.version || 1) < 2 ? 2 : job.version,
    contentType,
    ...(['uploading', 'saving'].includes(job?.status)
      ? { status: 'queued', stage: 'queued', retryAt: 0 }
      : {}),
  };
  if (sourceVersion >= TRAVEL_TAXONOMY_VERSION) return base;

  const budget = contentType === 'route'
    ? payloadContent?.attributes?.budgetLevel
    : payloadContent?.budget;
  if (budget !== 'economy') {
    return {
      ...base,
      payload: contentType === 'route'
        ? { ...base.payload, route: { ...payloadContent, taxonomyVersion: TRAVEL_TAXONOMY_VERSION } }
        : {
            ...base.payload,
            recommendation: { ...payloadContent, taxonomyVersion: TRAVEL_TAXONOMY_VERSION },
          },
    };
  }

  const reviewMessage = 'יש לבחור מחדש חינם או ₪ לפני הפרסום.';
  return {
    ...base,
    status: 'failed',
    stage: 'failed',
    retryAt: 0,
    reviewRequired: true,
    error: { code: 'taxonomy/review-required', message: reviewMessage },
    payload: contentType === 'route'
      ? {
          ...base.payload,
          route: {
            ...payloadContent,
            taxonomyVersion: TRAVEL_TAXONOMY_VERSION,
            attributes: { ...payloadContent?.attributes, budgetLevel: '' },
          },
        }
      : {
          ...base.payload,
          recommendation: {
            ...payloadContent,
            taxonomyVersion: TRAVEL_TAXONOMY_VERSION,
            budget: '',
          },
        },
    draft: contentType === 'route'
      ? {
          ...base.draft,
          route: {
            ...base.draft?.route,
            taxonomyVersion: TRAVEL_TAXONOMY_VERSION,
            attributes: { ...base.draft?.route?.attributes, budgetLevel: '' },
          },
        }
      : { ...base.draft, budget: '' },
  };
}

export function ContentPublishProvider({ children }) {
  const { user, loading: authLoading } = useAuthUser();
  const [jobs, setJobs] = useState([]);
  const [hydrated, setHydrated] = useState(false);
  const [completedVersion, setCompletedVersion] = useState(0);
  const [completedVersionByType, setCompletedVersionByType] = useState({
    recommendation: 0,
    route: 0,
  });
  const [wakeSerial, setWakeSerial] = useState(0);
  const [appActive, setAppActive] = useState(
    !['background', 'inactive'].includes(AppState.currentState)
  );
  const jobsRef = useRef([]);
  const processingRef = useRef(false);
  const persistenceRef = useRef(Promise.resolve());
  const reviewSourcesRef = useRef(new Map());
  const successTimersRef = useRef(new Map());
  const recommendationUploader = useImagePickerWithUpload({ kind: 'recommendation' });
  const routeUploader = useImagePickerWithUpload({ kind: 'route' });
  const uploadersRef = useRef({
    recommendation: recommendationUploader.uploadImageAsset,
    route: routeUploader.uploadImageAsset,
  });
  uploadersRef.current = {
    recommendation: recommendationUploader.uploadImageAsset,
    route: routeUploader.uploadImageAsset,
  };

  const publishSnapshot = useCallback((nextJobs) => {
    jobsRef.current = nextJobs;
    setJobs(nextJobs);
  }, []);

  const persistSnapshot = useCallback((nextJobs) => {
    persistenceRef.current = persistenceRef.current
      .catch(() => {})
      .then(() => saveRecommendationPublishJobs(nextJobs));
    return persistenceRef.current;
  }, []);

  const commitJobs = useCallback((transform, { persist = true } = {}) => {
    const nextJobs = transform(jobsRef.current);
    publishSnapshot(nextJobs);
    return persist ? persistSnapshot(nextJobs) : Promise.resolve(nextJobs);
  }, [persistSnapshot, publishSnapshot]);

  const updateJob = useCallback((jobId, updater, options) => commitJobs(
    (current) => current.map((job) => job.id === jobId ? updater(job) : job),
    options
  ), [commitJobs]);

  useEffect(() => {
    let mounted = true;
    loadRecommendationPublishJobs().then((storedJobs) => {
      if (!mounted) return;
      Promise.allSettled(
        storedJobs.filter((job) => job?.status === 'success').map(deleteRecommendationPublishJobMedia)
      );
      const restored = storedJobs
        .filter((job) => job && job.id && job.ownerUid && job.status !== 'success')
        .map(upgradeRestoredPublishJob);
      publishSnapshot(restored);
      if (JSON.stringify(restored) !== JSON.stringify(storedJobs)) persistSnapshot(restored);
      setHydrated(true);
    });
    return () => { mounted = false; };
  }, [persistSnapshot, publishSnapshot]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => () => {
    successTimersRef.current.forEach((timer) => clearTimeout(timer));
    reviewSourcesRef.current.forEach((source) => source.revokes?.forEach((revoke) => revoke()));
  }, []);

  const enqueueCreate = useCallback(async ({
    contentType = 'recommendation', payload, media, draft, sourceJobId = null, draftJobId = null,
  }) => {
    if (!['recommendation', 'route'].includes(contentType)) {
      throw new Error('Unsupported content publication type.');
    }
    const ownerUid = user?.uid || auth.currentUser?.uid;
    if (!ownerUid) throw new Error('You must be signed in to publish.');
    const sourceJob = sourceJobId
      ? jobsRef.current.find((job) => job.id === sourceJobId && job.ownerUid === ownerUid)
      : null;
    if (sourceJobId && !sourceJob) throw new Error('The queued recommendation is no longer available.');

    const jobId = sourceJob?.id || draftJobId || randomUUID();
    const publishRequestId = sourceJob?.publishRequestId || randomUUID();
    const reviewSource = reviewSourcesRef.current.get(jobId);
    const reusableByUri = reviewSource?.entriesByUri || new Map();
    const createdReferences = [];

    const mediaOutcomes = await Promise.allSettled((media || []).map(async (item, index) => {
      if (item?.asset) {
        return {
          id: item.asset.assetId || `remote-${index}`,
          type: 'remote',
          asset: item.asset,
          slot: item.slot || null,
          progress: 1,
        };
      }
      const reusable = reusableByUri.get(item?.uri);
      if (reusable) {
        return { ...reusable, slot: item.slot || reusable.slot || null };
      }
      if (item?.localReference?.key) {
        return {
          id: item.mediaId || randomUUID(),
          type: 'local',
          localReference: item.localReference,
          slot: item.slot || null,
          preparedAsset: item.preparedAsset || null,
          progress: item.preparedAsset ? 1 : 0,
        };
      }
      const mediaId = randomUUID();
      const localReference = await persistRecommendationPublishMedia({
        ownerUid,
        jobId,
        mediaId,
        uri: item?.uri,
      });
      createdReferences.push(localReference);
      return {
        id: mediaId,
        type: 'local',
        localReference,
        slot: item.slot || null,
        preparedAsset: null,
        progress: 0,
      };
    }));
    const failedMedia = mediaOutcomes.find((outcome) => outcome.status === 'rejected');
    if (failedMedia) {
      await Promise.allSettled(createdReferences.map(deleteRecommendationPublishMedia));
      throw failedMedia.reason;
    }
    const nextMedia = mediaOutcomes.map((outcome) => outcome.value);

    const now = Date.now();
    const nextJob = {
      version: 2,
      id: jobId,
      publishRequestId,
      contentType,
      ownerUid,
      createdAt: sourceJob?.createdAt || now,
      updatedAt: now,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      retryAt: 0,
      progress: 0,
      error: null,
      payload,
      draft,
      media: nextMedia,
      timings: { queuedAt: now },
    };

    const nextJobs = sourceJob
      ? jobsRef.current.map((job) => job.id === jobId ? nextJob : job)
      : [...jobsRef.current, nextJob];
    publishSnapshot(nextJobs);
    try {
      await persistSnapshot(nextJobs);
    } catch (error) {
      publishSnapshot(sourceJob
        ? jobsRef.current.map((job) => job.id === jobId ? sourceJob : job)
        : jobsRef.current.filter((job) => job.id !== jobId));
      await Promise.allSettled(createdReferences.map(deleteRecommendationPublishMedia));
      throw error;
    }
    console.info('content_publish_durable_enqueue_timing', {
      contentType,
      durationMs: Date.now() - now,
      imageCount: nextMedia.length,
    });

    if (sourceJob) {
      const reusedKeys = new Set(nextMedia.map((entry) => entry.localReference?.key).filter(Boolean));
      await Promise.allSettled((sourceJob.media || [])
        .filter((entry) => entry.localReference?.key && !reusedKeys.has(entry.localReference.key))
        .map((entry) => deleteRecommendationPublishMedia(entry.localReference)));
    }
    reviewSource?.revokes?.forEach((revoke) => revoke());
    reviewSourcesRef.current.delete(jobId);
    setWakeSerial((value) => value + 1);
    return jobId;
  }, [persistSnapshot, publishSnapshot, user?.uid]);

  const loadJobForReview = useCallback(async (jobId) => {
    const ownerUid = user?.uid || auth.currentUser?.uid;
    const job = jobsRef.current.find((entry) => entry.id === jobId && entry.ownerUid === ownerUid);
    if (!job) return null;
    const entriesByUri = new Map();
    const revokes = [];
    const imageUris = [];
    const materializedMedia = [];
    for (const entry of job.media || []) {
      if (entry.type === 'remote') {
        const uri = remotePreview(entry.asset);
        if (uri) {
          imageUris.push(uri);
          materializedMedia.push({ ...entry, uri });
        }
        continue;
      }
      const materialized = await materializeRecommendationPublishMedia(entry.localReference);
      imageUris.push(materialized.uri);
      materializedMedia.push({ ...entry, uri: materialized.uri });
      entriesByUri.set(materialized.uri, entry);
      revokes.push(materialized.revoke);
    }
    const previous = reviewSourcesRef.current.get(jobId);
    previous?.revokes?.forEach((revoke) => revoke());
    reviewSourcesRef.current.set(jobId, { entriesByUri, revokes });
    return {
      ...job,
      imageUris,
      materializedMedia,
      reviewedDraft: job.contentType === 'route'
        ? {
            ...job.draft,
            route: applyRoutePublishMedia(job.draft?.route || {}, materializedMedia, { preview: true }),
          }
        : job.draft,
    };
  }, [user?.uid]);

  const retry = useCallback(async (jobId) => {
    const current = jobsRef.current.find((job) => job.id === jobId);
    if (current?.reviewRequired) return;
    await updateJob(jobId, (job) => ({
      ...job,
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      retryAt: 0,
      error: null,
      updatedAt: Date.now(),
    }));
    setWakeSerial((value) => value + 1);
  }, [updateJob]);

  const discard = useCallback(async (jobId) => {
    const job = jobsRef.current.find((entry) => entry.id === jobId);
    const ownerUid = user?.uid || auth.currentUser?.uid;
    if (!job || job.ownerUid !== ownerUid) return;
    await commitJobs((current) => current.filter((entry) => entry.id !== jobId));
    const reviewSource = reviewSourcesRef.current.get(jobId);
    reviewSource?.revokes?.forEach((revoke) => revoke());
    reviewSourcesRef.current.delete(jobId);
    await deleteRecommendationPublishJobMedia(job);
  }, [commitJobs, user?.uid]);

  const setMediaProgress = useCallback((jobId, mediaId, ratio) => {
    updateJob(jobId, (job) => {
      const media = (job.media || []).map((entry) => entry.id === mediaId
        ? { ...entry, progress: Math.max(entry.progress || 0, ratio) }
        : entry);
      const next = { ...job, media };
      return { ...next, progress: recommendationPublishProgress(next) };
    }, { persist: false });
  }, [updateJob]);

  const preparePendingMedia = useCallback(async (jobId) => {
    const initial = jobsRef.current.find((entry) => entry.id === jobId);
    const pendingIds = (initial?.media || [])
      .filter((entry) => entry.type === 'local' && !entry.preparedAsset)
      .map((entry) => entry.id);
    let cursor = 0;
    const worker = async () => {
      while (cursor < pendingIds.length) {
        const mediaId = pendingIds[cursor];
        cursor += 1;
        const currentJob = jobsRef.current.find((entry) => entry.id === jobId);
        const mediaEntry = currentJob?.media?.find((entry) => entry.id === mediaId);
        if (!mediaEntry || mediaEntry.preparedAsset) continue;
        const materialized = await materializeRecommendationPublishMedia(mediaEntry.localReference);
        try {
          const mediaStartedAt = Date.now();
          const uploader = uploadersRef.current[currentJob.contentType || 'recommendation'];
          if (typeof uploader !== 'function') throw new Error('Media publishing is unavailable.');
          const preparedAsset = await uploader(materialized.uri, {
            onProgress: (ratio) => setMediaProgress(jobId, mediaId, ratio),
          });
          console.info('content_publish_stage_timing', {
            contentType: currentJob.contentType || 'recommendation',
            stage: 'media_pipeline',
            durationMs: Date.now() - mediaStartedAt,
          });
          await updateJob(jobId, (job) => {
            const media = (job.media || []).map((entry) => entry.id === mediaId
              ? { ...entry, preparedAsset, progress: 1 }
              : entry);
            const next = { ...job, media, updatedAt: Date.now() };
            return { ...next, progress: recommendationPublishProgress(next) };
          });
        } finally {
          materialized.revoke();
        }
      }
    };
    const outcomes = await Promise.allSettled(
      Array.from({ length: Math.min(2, pendingIds.length) }, worker)
    );
    const failed = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failed) throw failed.reason;
  }, [setMediaProgress, updateJob]);

  const processJob = useCallback(async (jobId) => {
    const startedAt = Date.now();
    try {
      await updateJob(jobId, (job) => ({
        ...job,
        status: 'uploading',
        stage: 'uploading',
        error: null,
        retryAt: 0,
        updatedAt: startedAt,
        timings: { ...job.timings, attemptStartedAt: startedAt },
      }));
      await preparePendingMedia(jobId);
      let current = jobsRef.current.find((entry) => entry.id === jobId);
      if (!current) return;
      const finalMedia = (current.media || []).map((entry) =>
        entry.type === 'remote' ? entry.asset : entry.preparedAsset
      ).filter(Boolean);
      if (finalMedia.length !== (current.media || []).length) {
        throw new Error('Not every image finished preparing.');
      }

      await updateJob(jobId, (job) => ({
        ...job,
        status: 'saving',
        stage: 'saving',
        progress: 0.9,
        updatedAt: Date.now(),
        timings: { ...job.timings, saveStartedAt: Date.now() },
      }));
      current = jobsRef.current.find((entry) => entry.id === jobId);
      let result;
      const saveRequestStartedAt = Date.now();
      if (current.contentType === 'route') {
        const preparedEntries = (current.media || []).map((entry, index) => ({
          ...entry,
          asset: finalMedia[index],
        }));
        const routePayload = applyRoutePublishMedia(current.payload.route, preparedEntries);
        result = await saveRoute(routePayload, null, current.publishRequestId);
      } else {
        let savePayload = {
          ...current.payload,
          publishRequestId: current.publishRequestId,
          recommendation: { ...current.payload.recommendation, media: finalMedia },
        };
        try {
          result = await saveRecommendation(savePayload);
        } catch (error) {
          if (!current.payload?.resolvedPlaceToken || !current.draft?.selectedPlace?.placeId || !isExpiredPlaceTokenError(error)) {
            throw error;
          }
          const { resolvedPlaceToken, ...withoutExpiredToken } = current.payload;
          savePayload = {
            ...withoutExpiredToken,
            placeId: current.draft.selectedPlace.placeId,
            publishRequestId: current.publishRequestId,
            recommendation: { ...current.payload.recommendation, media: finalMedia },
          };
          await updateJob(jobId, (job) => ({
            ...job,
            payload: { ...withoutExpiredToken, placeId: current.draft.selectedPlace.placeId },
          }));
          result = await saveRecommendation(savePayload);
        }
      }
      console.info('content_publish_stage_timing', {
        contentType: current.contentType || 'recommendation',
        stage: 'final_save',
        durationMs: Date.now() - saveRequestStartedAt,
      });

      const completedAt = Date.now();
      await updateJob(jobId, (job) => ({
        ...job,
        status: 'success',
        stage: 'success',
        progress: 1,
        result,
        error: null,
        updatedAt: completedAt,
        timings: { ...job.timings, completedAt, totalDurationMs: completedAt - job.timings.queuedAt },
      }));
      const completedJob = jobsRef.current.find((entry) => entry.id === jobId);
      console.info('content_publish_total_timing', {
        contentType: completedJob.contentType || 'recommendation',
        durationMs: completedAt - completedJob.timings.queuedAt,
        imageCount: completedJob.media?.length || 0,
        retryCount: completedJob.attempts || 0,
      });
      await deleteRecommendationPublishJobMedia(completedJob).catch((error) => {
        console.warn('content_publish_cleanup_failed', {
          code: String(error?.code || 'unknown'),
        });
      });
      if (completedJob.contentType !== 'route' && result?.country?.id && result?.city?.id) {
        const name = result.city.name || result.city.id;
        const countryName = result.country.name || result.country.id;
        await rememberDiscoveryDestinations([{
          countryId: result.country.id,
          cityId: result.city.id,
          name,
          countryName,
          label: [name, countryName].filter(Boolean).join(' · '),
        }]).catch((error) => {
          console.warn('content_publish_recent_destination_failed', {
            code: String(error?.code || 'unknown'),
          });
        });
      }
      setCompletedVersion((value) => value + 1);
      setCompletedVersionByType((currentVersions) => ({
        ...currentVersions,
        [completedJob.contentType || 'recommendation']:
          Number(currentVersions[completedJob.contentType || 'recommendation'] || 0) + 1,
      }));
      const timer = setTimeout(() => {
        commitJobs((currentJobs) => currentJobs.filter((entry) => entry.id !== jobId));
        successTimersRef.current.delete(jobId);
      }, SUCCESS_VISIBLE_MS);
      successTimersRef.current.set(jobId, timer);
    } catch (error) {
      const current = jobsRef.current.find((entry) => entry.id === jobId);
      if (!current) return;
      const attempts = Number(current.attempts || 0) + 1;
      const transient = isTransientPublishError(error);
      const shouldRetry = transient && attempts <= MAX_AUTOMATIC_RETRIES;
      if (shouldRetry) {
        console.info('content_publish_retry', {
          contentType: current.contentType || 'recommendation',
          retryNumber: attempts,
          delayMs: RETRY_DELAYS_MS[attempts - 1],
          failedStage: current.stage,
        });
      }
      await updateJob(jobId, (job) => ({
        ...job,
        status: shouldRetry ? 'queued' : 'failed',
        stage: shouldRetry ? 'retrying' : 'failed',
        attempts,
        retryAt: shouldRetry ? Date.now() + RETRY_DELAYS_MS[attempts - 1] : 0,
        error: normalizedError(error),
        updatedAt: Date.now(),
      }));
    }
  }, [commitJobs, preparePendingMedia, updateJob]);

  useEffect(() => {
    if (!hydrated || authLoading || !appActive || !user?.uid || processingRef.current) return undefined;
    const now = Date.now();
    const eligible = jobsRef.current.find((job) =>
      job.ownerUid === user.uid && job.status === 'queued' && Number(job.retryAt || 0) <= now
    );
    if (eligible) {
      processingRef.current = true;
      processJob(eligible.id).finally(() => {
        processingRef.current = false;
        setWakeSerial((value) => value + 1);
      });
      return undefined;
    }
    const nextRetryAt = jobsRef.current
      .filter((job) => job.ownerUid === user.uid && job.status === 'queued' && Number(job.retryAt || 0) > now)
      .reduce((minimum, job) => Math.min(minimum, Number(job.retryAt)), Infinity);
    if (!Number.isFinite(nextRetryAt)) return undefined;
    const timer = setTimeout(() => setWakeSerial((value) => value + 1), Math.max(50, nextRetryAt - now));
    return () => clearTimeout(timer);
  }, [appActive, authLoading, hydrated, jobs, processJob, user?.uid, wakeSerial]);

  const visibleJobs = useMemo(
    () => jobs.filter((job) => job.ownerUid === user?.uid),
    [jobs, user?.uid]
  );
  const activeJob = useMemo(() => {
    const priority = ['uploading', 'saving', 'failed', 'queued', 'success'];
    for (const status of priority) {
      const match = visibleJobs.find((job) => job.status === status);
      if (match) return { ...match, progress: recommendationPublishProgress(match) };
    }
    return null;
  }, [visibleJobs]);

  const value = useMemo(() => ({
    activeJob,
    completedVersion,
    completedVersionByType,
    discard,
    enqueueCreate,
    jobs: visibleJobs,
    loadJobForReview,
    retry,
  }), [activeJob, completedVersion, completedVersionByType, discard, enqueueCreate, loadJobForReview, retry, visibleJobs]);

  return (
    <ContentPublishContext.Provider value={value}>
      {children}
    </ContentPublishContext.Provider>
  );
}

export const RecommendationPublishProvider = ContentPublishProvider;

export function useContentPublish() {
  return useContext(ContentPublishContext);
}

export function useRecommendationPublish() {
  return useContentPublish();
}

export default ContentPublishContext;
