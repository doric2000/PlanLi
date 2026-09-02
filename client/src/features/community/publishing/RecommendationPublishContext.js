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
import {
  getCurrentRecommendationDraft,
  publishRecommendationDraft,
  saveRecommendation,
  saveRecommendationDraft,
} from '../../../services/RecommendationService';
import { publishRouteDraft, saveRoute, saveRouteDraft } from '../../../services/RouteService';
import {
  addDiagnosticBreadcrumb,
  captureDiagnosticException,
} from '../../../services/ErrorReporting';
import { applyRoutePublishMedia } from '../../roadtrip/utils/routeMedia';
import { rememberDiscoveryDestinations } from '../../../utils/recentDiscoveryDestinations';
import { isValidExternalUrl, normalizeExternalUrl } from '../../../utils/externalUrl';
import {
  deletePreparedTravelMedia,
  prepareTravelMediaSource,
} from '../../../utils/travelMediaPreparation';
import {
  deleteRecommendationPublishJobMedia,
  deleteRecommendationPublishMedia,
  loadRecommendationPublishJobs,
  materializeRecommendationPublishMedia,
  persistRecommendationPublishMedia,
  saveRecommendationPublishJobs,
} from './recommendationPublishStorage';

const MAX_AUTOMATIC_RETRIES = 2;
const RETRY_DELAYS_MS = [1000, 5000];
const SUCCESS_VISIBLE_MS = 4000;
const AUTOMATIC_TRANSIENT_CODES = new Set([
  'functions/aborted',
  'functions/cancelled',
  'functions/internal',
  'functions/unavailable',
  'storage/server-file-wrong-size',
  'storage/unknown',
]);
const MANUAL_RETRY_CODES = new Set([
  'functions/deadline-exceeded',
  'media/upload-stalled',
  'storage/retry-limit-exceeded',
]);

const defaultValue = {
  activeJob: null,
  bannerJobCount: 0,
  completedVersion: 0,
  completedVersionByType: { recommendation: 0, route: 0 },
  beginReview: () => {},
  discard: async () => {},
  endReview: () => {},
  enqueueCreate: null,
  jobs: [],
  loadJobForReview: async () => null,
  retry: async () => {},
};

const ContentPublishContext = createContext(defaultValue);

export function normalizedPublishError(error) {
  const rawDetails = error?.details || {};
  const details = {
    ...(typeof rawDetails.reason === 'string' ? { reason: rawDetails.reason.slice(0, 80) } : {}),
    ...(typeof rawDetails.incidentId === 'string' ? { incidentId: rawDetails.incidentId.slice(0, 64) } : {}),
    ...(typeof rawDetails.retryable === 'boolean' ? { retryable: rawDetails.retryable } : {}),
    ...(['preparing', 'uploading', 'processing', 'saving'].includes(rawDetails.publishStage)
      ? { publishStage: rawDetails.publishStage }
      : {}),
  };
  return {
    code: String(error?.code || 'unknown'),
    message: String(error?.message || 'Could not publish this content.').slice(0, 500),
    ...(Object.keys(details).length ? { details } : {}),
  };
}

export function isTransientPublishError(error) {
  const code = String(error?.code || '');
  if (MANUAL_RETRY_CODES.has(code)) return false;
  if (error?.details?.retryable === false) return false;
  if (error?.details?.retryable === true) return true;
  if (AUTOMATIC_TRANSIENT_CODES.has(code)) return true;
  const message = String(error?.message || '').toLowerCase();
  return /network|offline|timed? out|temporar|connection|fetch failed/.test(message);
}

export function publishRetryPolicy(error, attempts) {
  const code = String(error?.code || '');
  const manualRetry = MANUAL_RETRY_CODES.has(code);
  const automaticRetry = !manualRetry && isTransientPublishError(error);
  const retryable = error?.details?.retryable === false
    ? false
    : manualRetry || automaticRetry;
  const shouldRetry = automaticRetry && attempts <= MAX_AUTOMATIC_RETRIES;
  return {
    automaticRetry,
    retryable,
    shouldRetry,
    delayMs: shouldRetry ? RETRY_DELAYS_MS[attempts - 1] : 0,
  };
}

export function normalizePublicationOutcome(result) {
  const publicationStatus = result?.publicationStatus === 'active'
    ? 'active'
    : result?.publicationStatus === 'moderation_hold'
      ? 'moderation_hold'
      : 'unknown';
  return {
    ...(result || {}),
    publicationStatus,
    publiclyVisible: publicationStatus === 'active' && result?.publiclyVisible !== false,
  };
}

function isExpiredPlaceTokenError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    ['functions/deadline-exceeded', 'functions/not-found', 'functions/failed-precondition'].includes(code) &&
    /place|search|token|expired/.test(message)
  );
}

function isMissingRecommendationDraftError(error) {
  const reason = String(error?.details?.reason || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return reason === 'RECOMMENDATION_DRAFT_NOT_FOUND' ||
    message.includes('recommendation draft does not exist');
}

function hasProviderDestinationDraft(draft) {
  if (draft?.locationMode === 'exact') {
    return Boolean(draft?.selectedCity?.providerPlaceId || draft?.selectedCity?.googlePlaceId);
  }
  return ['destination', 'pin'].includes(draft?.locationMode) &&
    Boolean(draft?.generalDestination?.providerPlaceId);
}

export function recommendationPublishProgress(job) {
  if (!job) return 0;
  if (job.status === 'success') return 1;
  if (job.stage === 'saving') return Math.max(0.88, Number(job.progress || 0));
  const media = Array.isArray(job.media) ? job.media : [];
  if (!media.length) return job.status === 'queued' ? 0 : 0.88;
  if (job.stage === 'preparing') {
    const preparationProgress = media.reduce(
      (sum, entry) => sum + (entry.type === 'remote' ? 1 : Math.max(0, Math.min(1, Number(entry.preparationProgress || 0)))),
      0
    ) / media.length;
    return Math.min(0.18, preparationProgress * 0.18);
  }
  const mediaProgress = media.reduce(
    (sum, entry) => sum + Math.max(0, Math.min(1, Number(entry.progress || 0))),
    0
  ) / media.length;
  return Math.min(0.86, Math.max(0.18, mediaProgress * 0.86));
}

function remotePreview(asset) {
  return asset?.feed?.url || asset?.large?.url || asset?.thumb?.url || null;
}

/**
 * Resolve publish media in the same order as the queued descriptors. The
 * descriptor id is intentionally retained for diagnostics and validation so a
 * completion-order change in concurrent uploads cannot reorder the payload.
 */
export function resolvePreparedPublishMedia(entries) {
  const media = Array.isArray(entries) ? entries : [];
  const identities = media.map(publishMediaIdentity);
  const assets = media.map((entry) => entry?.type === 'remote'
    ? entry.asset
    : entry.preparedAsset);
  const missing = assets.map((asset, index) => (!asset?.assetId ? identities[index] : null)).filter(Boolean);
  return {
    assets: missing.length ? null : assets,
    identities,
    missing,
  };
}

function publishMediaIdentity(entry, index) {
  return String(entry?.id || entry?.asset?.assetId || entry?.preparedAsset?.assetId || `index:${index}`);
}

function isRecommendationDraftVersionConflict(error) {
  return String(error?.details?.reason || '').toUpperCase() === 'RECOMMENDATION_DRAFT_VERSION_CONFLICT';
}

/**
 * A media upload can finish while an autosave advances the draft pointer. Refresh
 * that pointer once, keep the queued snapshot (especially its ordered media),
 * and retry the same idempotent save request without uploading again.
 */
async function saveRecommendationDraftForPublication(options) {
  try {
    return {
      saved: await saveRecommendationDraft(options),
      draft: options.draft,
      recovered: false,
    };
  } catch (error) {
    if (!options?.draftId || !isRecommendationDraftVersionConflict(error)) throw error;
    let latest;
    try {
      latest = await getCurrentRecommendationDraft();
    } catch {
      throw error;
    }
    const latestVersion = Number(latest?.version);
    const sameDraft = latest?.id === options.draftId &&
      (latest?.sourceRecommendationId || '') === (options.sourceRecommendationId || '');
    if (!sameDraft || !Number.isSafeInteger(latestVersion) || latestVersion < 1) throw error;
    const latestDraft = { ...latest };
    delete latestDraft.id;
    delete latestDraft.version;
    delete latestDraft.sourceRecommendationId;
    const retryDraft = {
      ...latestDraft,
      ...(options.draft || {}),
      media: options.draft?.media || [],
      localMediaCount: Number(options.draft?.localMediaCount || 0),
    };
    const saved = await saveRecommendationDraft({
      ...options,
      expectedVersion: latestVersion,
      draft: retryDraft,
    });
    addDiagnosticBreadcrumb({
      category: 'callable',
      message: 'Recommendation draft version refreshed before publication',
      data: {
        operation: 'recommendation_draft_version_recovery',
        stage: 'saving',
        imageCount: retryDraft.media.length,
        mediaIdentities: retryDraft.media.map((asset, index) => String(
          asset?.assetId || asset?.id || `index:${index}`
        )),
      },
    });
    return {
      saved,
      draft: retryDraft,
      recovered: true,
    };
  }
}

function mediaMappingError({ identities, missing, expectedCount }) {
  const error = new Error('One or more selected images could not be prepared in order.');
  error.code = 'media/order-mapping-incomplete';
  error.details = {
    publishStage: 'saving',
    reason: 'media_order_mapping_incomplete',
    expectedCount,
    resolvedCount: expectedCount - missing.length,
    mediaIdentities: identities,
    missingMediaIdentities: missing,
    retryable: false,
  };
  return error;
}

export function upgradeRestoredPublishJob(job) {
  const contentType = job?.contentType === 'route' ? 'route' : 'recommendation';
  const payloadContent = contentType === 'route' ? job?.payload?.route : job?.payload?.recommendation;
  const sourceVersion = Number(payloadContent?.taxonomyVersion || 0);
  const rawExternalUrl = contentType === 'recommendation'
    ? job?.draft?.details?.externalUrl
    : '';
  const normalizedExternalUrl = normalizeExternalUrl(rawExternalUrl);
  const repairedExternalUrl = typeof rawExternalUrl === 'string' &&
    rawExternalUrl !== normalizedExternalUrl &&
    isValidExternalUrl(normalizedExternalUrl);
  const normalizedDraft = repairedExternalUrl
    ? {
        ...job.draft,
        details: {
          ...job.draft?.details,
          ...(normalizedExternalUrl ? { externalUrl: normalizedExternalUrl } : { externalUrl: '' }),
        },
      }
    : job?.draft;
  const shouldRecoverExternalUrl = repairedExternalUrl &&
    job?.status === 'failed' &&
    String(job?.error?.details?.reason || '').toLowerCase() === 'invalid_selection';
  const base = {
    ...job,
    version: Number(job?.version || 1) < 4 ? 4 : job.version,
    contentType,
    draft: normalizedDraft,
    ...(shouldRecoverExternalUrl ? {
      status: 'queued',
      stage: 'queued',
      attempts: 0,
      retryAt: 0,
      error: null,
      reviewRequired: false,
    } : {}),
    ...(['preparing', 'uploading', 'saving'].includes(job?.status)
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
  const [reviewingJobIds, setReviewingJobIds] = useState(() => new Set());
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

  const beginReview = useCallback((jobId) => {
    if (!jobsRef.current.some((job) => job.id === jobId && job.status === 'failed')) return;
    setReviewingJobIds((current) => {
      const next = new Set(current);
      next.add(jobId);
      return next;
    });
  }, []);

  const endReview = useCallback((jobId) => {
    setReviewingJobIds((current) => {
      if (!current.has(jobId)) return current;
      const next = new Set(current);
      next.delete(jobId);
      return next;
    });
  }, []);

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
          transform: item.transform || null,
          preparationProgress: item.preparedAsset ? 1 : 0,
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
        transform: item?.transform || null,
        preparationProgress: 0,
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
      version: 4,
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
    endReview(jobId);
    setWakeSerial((value) => value + 1);
    return jobId;
  }, [endReview, persistSnapshot, publishSnapshot, user?.uid]);

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
    endReview(jobId);
    await deleteRecommendationPublishJobMedia(job);
  }, [commitJobs, endReview, user?.uid]);

  const setMediaProgress = useCallback((jobId, mediaId, ratio) => {
    updateJob(jobId, (job) => {
      const media = (job.media || []).map((entry) => entry.id === mediaId
        ? { ...entry, progress: Math.max(entry.progress || 0, ratio) }
        : entry);
      const next = { ...job, media };
      return { ...next, progress: recommendationPublishProgress(next) };
    }, { persist: false });
  }, [updateJob]);

  const setMediaPreparationProgress = useCallback((jobId, mediaId, ratio) => {
    updateJob(jobId, (job) => {
      const media = (job.media || []).map((entry) => entry.id === mediaId
        ? { ...entry, preparationProgress: Math.max(entry.preparationProgress || 0, ratio) }
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
    const preparedSources = [];
    let cursor = 0;
    const prepareWorker = async () => {
      while (cursor < pendingIds.length) {
        const mediaId = pendingIds[cursor];
        cursor += 1;
        const currentJob = jobsRef.current.find((entry) => entry.id === jobId);
        const mediaEntry = currentJob?.media?.find((entry) => entry.id === mediaId);
        if (!mediaEntry || mediaEntry.preparedAsset) continue;
        setMediaPreparationProgress(jobId, mediaId, 0.1);
        const materialized = await materializeRecommendationPublishMedia(mediaEntry.localReference);
        try {
          const prepared = await prepareTravelMediaSource(materialized.uri, mediaEntry.transform);
          preparedSources.push({ mediaId, prepared, materialized });
          setMediaPreparationProgress(jobId, mediaId, 1);
        } catch (error) {
          materialized.revoke();
          throw error;
        }
      }
    };
    const preparationOutcomes = await Promise.allSettled(
      Array.from({ length: Math.min(2, pendingIds.length) }, prepareWorker)
    );
    const preparationFailure = preparationOutcomes.find((outcome) => outcome.status === 'rejected');
    if (preparationFailure) {
      await Promise.allSettled(preparedSources.map(({ prepared, materialized }) => Promise.all([
        deletePreparedTravelMedia(prepared),
        Promise.resolve().then(() => materialized.revoke()),
      ])));
      throw preparationFailure.reason;
    }

    await updateJob(jobId, (job) => ({
      ...job,
      status: 'uploading',
      stage: 'uploading',
      updatedAt: Date.now(),
    }));
    cursor = 0;
    const uploadWorker = async () => {
      while (cursor < preparedSources.length) {
        const source = preparedSources[cursor++];
        const currentJob = jobsRef.current.find((entry) => entry.id === jobId);
        const mediaEntry = currentJob?.media?.find((entry) => entry.id === source.mediaId);
        if (!mediaEntry || mediaEntry.preparedAsset) continue;
        const mediaStartedAt = Date.now();
        const uploader = uploadersRef.current[currentJob.contentType || 'recommendation'];
        if (typeof uploader !== 'function') throw new Error('Media publishing is unavailable.');
        const preparedAsset = await uploader(source.prepared.uri, {
          onProgress: (ratio) => setMediaProgress(jobId, source.mediaId, ratio),
        });
        console.info('content_publish_stage_timing', {
          contentType: currentJob.contentType || 'recommendation',
          stage: 'media_pipeline',
          durationMs: Date.now() - mediaStartedAt,
        });
        await updateJob(jobId, (job) => {
          const media = (job.media || []).map((entry) => entry.id === source.mediaId
            ? { ...entry, preparedAsset, preparationProgress: 1, progress: 1 }
            : entry);
          const next = { ...job, media, updatedAt: Date.now() };
          return { ...next, progress: recommendationPublishProgress(next) };
        });
      }
    };
    try {
      const uploadOutcomes = await Promise.allSettled(
        Array.from({ length: Math.min(2, preparedSources.length) }, uploadWorker)
      );
      const uploadFailure = uploadOutcomes.find((outcome) => outcome.status === 'rejected');
      if (uploadFailure) throw uploadFailure.reason;
    } finally {
      await Promise.allSettled(preparedSources.map(async ({ prepared, materialized }) => {
        await deletePreparedTravelMedia(prepared);
        materialized.revoke();
      }));
    }
  }, [setMediaPreparationProgress, setMediaProgress, updateJob]);

  const processJob = useCallback(async (jobId) => {
    const startedAt = Date.now();
    try {
      await updateJob(jobId, (job) => ({
        ...job,
        status: 'preparing',
        stage: 'preparing',
        error: null,
        retryAt: 0,
        updatedAt: startedAt,
        timings: { ...job.timings, attemptStartedAt: startedAt },
      }));
      await preparePendingMedia(jobId);
      let current = jobsRef.current.find((entry) => entry.id === jobId);
      if (!current) return;
      const resolvedMedia = resolvePreparedPublishMedia(current.media);
      if (!resolvedMedia.assets) {
        throw mediaMappingError({
          identities: resolvedMedia.identities,
          missing: resolvedMedia.missing,
          expectedCount: current.media?.length || 0,
        });
      }
      const finalMedia = resolvedMedia.assets;
      addDiagnosticBreadcrumb({
        category: 'media',
        message: 'Prepared publication media order verified',
        data: {
          operation: 'content_publish_media_order',
          contentType: current.contentType || 'recommendation',
          imageCount: finalMedia.length,
          mediaIdentities: resolvedMedia.identities,
        },
      });

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
        if (current.payload?.draftId) {
          let publishVersion = Number(current.payload.expectedVersion);
          if (preparedEntries.length && current.payload.routeDraftMediaSaved !== true) {
            let mediaSaveRequestId = current.payload.routeDraftMediaSaveRequestId;
            if (!mediaSaveRequestId) {
              mediaSaveRequestId = randomUUID();
              await updateJob(jobId, (job) => ({
                ...job,
                payload: {
                  ...job.payload,
                  routeDraftMediaSaveRequestId: mediaSaveRequestId,
                },
                updatedAt: Date.now(),
              }));
            }
            const savedDraft = await saveRouteDraft({
              draftId: current.payload.draftId,
              sourceRouteId: current.payload.sourceRouteId || null,
              expectedVersion: publishVersion,
              saveRequestId: mediaSaveRequestId,
              draft: routePayload,
            });
            publishVersion = Number(savedDraft.version);
            await updateJob(jobId, (job) => ({
              ...job,
              payload: {
                ...job.payload,
                route: routePayload,
                expectedVersion: publishVersion,
                routeDraftMediaSaved: true,
              },
              updatedAt: Date.now(),
            }));
          }
          result = await publishRouteDraft(current.payload.draftId, publishVersion);
        } else {
          result = await saveRoute(
            routePayload,
            current.payload?.routeId || null,
            current.payload?.routeId ? null : current.publishRequestId
          );
        }
      } else {
        if (current.payload?.draftId) {
          let publishDraftId = current.payload.draftId;
          let publishVersion = Number(current.payload.expectedVersion);
          let recommendationDraft = {
            ...current.draft,
            media: finalMedia,
            localMediaCount: 0,
          };
          const hasPreparedLocalMedia = (current.media || []).some((entry) => entry.type === 'local');
          const hasProviderDestination = hasProviderDestinationDraft(current.draft);
          let mediaSaved = current.payload.recommendationDraftMediaSaved === true;
          let providerDestinationSaved = current.payload.recommendationDraftProviderDestinationSaved === true;
          if (mediaSaved && current.payload.recommendationDraftIdSynced !== true &&
              current.payload.recommendationDraftMediaSaveRequestId) {
            const replayedMediaSave = await saveRecommendationDraftForPublication({
              draftId: publishDraftId,
              sourceRecommendationId: current.payload.sourceRecommendationId || null,
              expectedVersion: publishVersion,
              saveRequestId: current.payload.recommendationDraftMediaSaveRequestId,
              draft: recommendationDraft,
            });
            publishDraftId = replayedMediaSave.saved.draftId;
            publishVersion = Number(replayedMediaSave.saved.version);
            recommendationDraft = replayedMediaSave.draft;
            await updateJob(jobId, (job) => ({
              ...job,
              draft: recommendationDraft,
              payload: {
                ...job.payload,
                draftId: publishDraftId,
                expectedVersion: publishVersion,
                recommendationDraftIdSynced: true,
              },
              updatedAt: Date.now(),
            }));
          }
          if (hasPreparedLocalMedia && !mediaSaved) {
            let mediaSaveRequestId = current.payload.recommendationDraftMediaSaveRequestId;
            if (!mediaSaveRequestId) {
              mediaSaveRequestId = randomUUID();
              await updateJob(jobId, (job) => ({
                ...job,
                payload: {
                  ...job.payload,
                  recommendationDraftMediaSaveRequestId: mediaSaveRequestId,
                },
                updatedAt: Date.now(),
              }));
            }
            const savedDraft = await saveRecommendationDraftForPublication({
              draftId: current.payload.draftId,
              sourceRecommendationId: current.payload.sourceRecommendationId || null,
              expectedVersion: publishVersion,
              saveRequestId: mediaSaveRequestId,
              draft: recommendationDraft,
            });
            publishDraftId = savedDraft.saved.draftId;
            publishVersion = Number(savedDraft.saved.version);
            recommendationDraft = savedDraft.draft;
            mediaSaved = true;
            if (hasProviderDestination) providerDestinationSaved = true;
            await updateJob(jobId, (job) => ({
              ...job,
              draft: recommendationDraft,
              payload: {
                ...job.payload,
                draftId: publishDraftId,
                expectedVersion: publishVersion,
                recommendationDraftIdSynced: true,
                recommendationDraftMediaSaved: true,
                ...(hasProviderDestination
                  ? { recommendationDraftProviderDestinationSaved: true }
                  : {}),
              },
              updatedAt: Date.now(),
            }));
          }
          if (hasProviderDestination && !providerDestinationSaved) {
            let providerDestinationSaveRequestId =
              current.payload.recommendationDraftProviderDestinationSaveRequestId;
            if (!providerDestinationSaveRequestId) {
              providerDestinationSaveRequestId = randomUUID();
              await updateJob(jobId, (job) => ({
                ...job,
                payload: {
                  ...job.payload,
                  recommendationDraftProviderDestinationSaveRequestId: providerDestinationSaveRequestId,
                },
                updatedAt: Date.now(),
              }));
            }
            const syncedDestinationDraft = await saveRecommendationDraftForPublication({
              draftId: publishDraftId,
              sourceRecommendationId: current.payload.sourceRecommendationId || null,
              expectedVersion: publishVersion,
              saveRequestId: providerDestinationSaveRequestId,
              draft: recommendationDraft,
            });
            publishDraftId = syncedDestinationDraft.saved.draftId;
            publishVersion = Number(syncedDestinationDraft.saved.version);
            recommendationDraft = syncedDestinationDraft.draft;
            await updateJob(jobId, (job) => ({
              ...job,
              draft: recommendationDraft,
              payload: {
                ...job.payload,
                draftId: publishDraftId,
                expectedVersion: publishVersion,
                recommendationDraftIdSynced: true,
                recommendationDraftProviderDestinationSaved: true,
              },
              updatedAt: Date.now(),
            }));
          }
          try {
            result = await publishRecommendationDraft(publishDraftId, publishVersion);
          } catch (error) {
            if (!isMissingRecommendationDraftError(error)) throw error;

            let recoverySaveRequestId = current.payload.recommendationDraftRecoverySaveRequestId;
            if (!recoverySaveRequestId) {
              recoverySaveRequestId = randomUUID();
              await updateJob(jobId, (job) => ({
                ...job,
                payload: {
                  ...job.payload,
                  recommendationDraftRecoverySaveRequestId: recoverySaveRequestId,
                },
                updatedAt: Date.now(),
              }));
            }
            const recoveredDraft = await saveRecommendationDraft({
              draftId: publishDraftId,
              sourceRecommendationId: current.payload.sourceRecommendationId || null,
              expectedVersion: publishVersion,
              saveRequestId: recoverySaveRequestId,
              draft: recommendationDraft,
            });
            publishDraftId = recoveredDraft.draftId;
            publishVersion = Number(recoveredDraft.version);
            recommendationDraft = { ...recommendationDraft, media: finalMedia, localMediaCount: 0 };
            await updateJob(jobId, (job) => ({
              ...job,
              draft: recommendationDraft,
              payload: {
                ...job.payload,
                draftId: publishDraftId,
                expectedVersion: publishVersion,
                recommendationDraftIdSynced: true,
                recommendationDraftMediaSaved: true,
                recommendationDraftRecovered: true,
              },
              updatedAt: Date.now(),
            }));
            result = await publishRecommendationDraft(publishDraftId, publishVersion);
          }
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
      }
      console.info('content_publish_stage_timing', {
        contentType: current.contentType || 'recommendation',
        stage: 'final_save',
        durationMs: Date.now() - saveRequestStartedAt,
      });

      result = normalizePublicationOutcome(result);
      const completedContentType = current.contentType || 'recommendation';
      if (result.publicationStatus === 'unknown') {
        captureDiagnosticException(new Error('Publication completed without a visibility status.'), {
          operation: 'content_publish_outcome',
          code: 'publication_status_missing',
          reason: 'publication_status_missing',
          contentMode: current.payload?.locationMode,
          contentType: completedContentType,
          publicationStatus: 'unknown',
        });
      }
      addDiagnosticBreadcrumb({
        category: 'callable',
        message: 'Content publication completed',
        data: {
          operation: 'content_publish_outcome',
          outcome: result.publicationStatus,
        },
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
      if (result.publicationStatus === 'active'
        && completedJob.contentType !== 'route'
        && result?.country?.id
        && result?.city?.id) {
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
      const failedStage = ['preparing', 'uploading', 'processing', 'saving'].includes(error?.details?.publishStage)
        ? error.details.publishStage
        : current.stage;
      const retryPolicy = publishRetryPolicy(error, attempts);
      const mediaIdentities = (current.media || []).map(publishMediaIdentity);
      addDiagnosticBreadcrumb({
        category: 'network',
        message: 'Content publication attempt failed',
        level: 'error',
        data: {
          operation: `publish_${current.contentType || 'recommendation'}`,
          status: failedStage,
          code: String(error?.code || 'unknown'),
          reason: String(error?.details?.reason || 'unknown'),
          attempt: attempts,
          imageCount: mediaIdentities.length,
          mediaIdentities,
          durationMs: Date.now() - startedAt,
        },
      });
      if (retryPolicy.shouldRetry) {
        console.info('content_publish_retry', {
          contentType: current.contentType || 'recommendation',
          retryNumber: attempts,
          delayMs: retryPolicy.delayMs,
          failedStage,
        });
      } else {
        const diagnosticError = new Error(`Content publication failed during ${failedStage}.`);
        diagnosticError.name = 'ContentPublishError';
        captureDiagnosticException(diagnosticError, {
          operation: `publish_${current.contentType || 'recommendation'}_${failedStage}`,
          code: String(error?.code || 'unknown'),
          contentType: current.contentType || 'recommendation',
          ...(error?.details?.reason ? { reason: String(error.details.reason) } : {}),
          ...(current.contentType !== 'route' && current.draft?.locationMode
            ? { contentMode: current.draft.locationMode }
            : {}),
        });
      }
      await updateJob(jobId, (job) => ({
        ...job,
        status: retryPolicy.shouldRetry ? 'queued' : 'failed',
        stage: retryPolicy.shouldRetry ? 'retrying' : 'failed',
        attempts,
        retryAt: retryPolicy.shouldRetry ? Date.now() + retryPolicy.delayMs : 0,
        error: normalizedPublishError({
          code: error?.code,
          message: error?.message,
          details: {
            ...(error?.details || {}),
            publishStage: failedStage,
            retryable: retryPolicy.retryable,
          },
        }),
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
  const bannerJobs = useMemo(
    () => visibleJobs.filter((job) => !reviewingJobIds.has(job.id)),
    [reviewingJobIds, visibleJobs]
  );
  const activeJob = useMemo(() => {
    const priority = ['preparing', 'uploading', 'saving', 'failed', 'queued', 'success'];
    for (const status of priority) {
      const match = bannerJobs.find((job) => job.status === status);
      if (match) return { ...match, progress: recommendationPublishProgress(match) };
    }
    return null;
  }, [bannerJobs]);

  const value = useMemo(() => ({
    activeJob,
    bannerJobCount: bannerJobs.length,
    beginReview,
    completedVersion,
    completedVersionByType,
    discard,
    endReview,
    enqueueCreate,
    jobs: visibleJobs,
    loadJobForReview,
    retry,
  }), [activeJob, bannerJobs.length, beginReview, completedVersion, completedVersionByType, discard, endReview, enqueueCreate, loadJobForReview, retry, visibleJobs]);

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
