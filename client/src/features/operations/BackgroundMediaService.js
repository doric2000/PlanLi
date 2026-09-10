import { AppState, Platform } from 'react-native';
import { getToken } from 'firebase/app-check';
import { httpsCallable } from 'firebase/functions';
import { randomUUID } from 'expo-crypto';
import nativeTransfers from '../../../modules/planli-transfers';
import { auth, appCheck, cloudFunctions, mediaBucket } from '../../config/firebase';
import { localEmulatorSettings } from '../../config/localEmulators';
import { prepareTravelMediaSource, deletePreparedTravelMedia } from '../../utils/travelMediaPreparation';
import { materializeRecommendationPublishMedia } from '../community/publishing/recommendationPublishStorage';
import { operationStore } from './operationService';
import { safeOperationError } from './operationModel';

export const backgroundTransfersAvailable = () => Boolean(nativeTransfers && Platform.OS !== 'web' && !localEmulatorSettings());
const call = async (name, data) => (await httpsCallable(cloudFunctions, name, { timeout: 70000 })(data)).data;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const terminal = (status) => ['success', 'review', 'failed', 'discarded'].includes(status);
function owner(uid) {
  if (auth.currentUser?.uid !== uid) throw Object.assign(new Error('Account changed'), { code: 'auth/unauthenticated' });
}
export const getBackgroundOperation = (operationId) => call('getBackgroundOperations', { operationId });
export const acknowledgeBackgroundOperation = (operationId) => call('acknowledgeBackgroundOperation', { operationId });
export const retryBackgroundOperation = (operationId) => call('retryBackgroundOperation', { operationId });

async function createSession(uid, operationId, item) {
  owner(uid);
  const [token, check] = await Promise.all([auth.currentUser.getIdToken(), getToken(appCheck)]);
  owner(uid);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(mediaBucket.replace(/^gs:\/\//, ''))}/o?name=${encodeURIComponent(item.stagingPath)}`, {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Firebase ${token}`, 'X-Firebase-AppCheck': check.token,
        'Content-Type': 'application/json', 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(item.bytes), 'X-Goog-Upload-Header-Content-Type': 'image/jpeg' },
      body: JSON.stringify({ name: item.stagingPath, contentType: 'image/jpeg', cacheControl: 'private,max-age=0,no-store',
        metadata: { ownerUid: uid, variant: 'staging', operationId } }),
    });
    if (!response.ok) throw Object.assign(new Error('Upload session unavailable'), {
      code: response.status === 401 || response.status === 403 ? 'storage/permission-denied' : 'storage/unavailable',
    });
    const url = response.headers.get('X-Goog-Upload-URL');
    if (!url?.startsWith('https://firebasestorage.googleapis.com/')) throw new Error('Invalid upload session');
    return url;
  } finally { clearTimeout(timer); }
}

// Persist the manifest before the callable. Its operation ID and request body never
// change after admission, including after an ambiguous timeout or a cold restart.
export async function runBackgroundMedia({ job, kind, media, checkpoint, stage, progress, normalize }) {
  const uid = job.ownerUid;
  owner(uid);
  let background = job.background;
  if (!background) {
    background = { operationId: job.publishRequestId || job.id,
      items: media.map((entry) => ({ id: randomUUID(), ...(entry.slot ? { slot: entry.slot } : {}),
        ...(entry.asset || entry.preparedAsset ? { asset: entry.asset || entry.preparedAsset } : {}) })) };
    await checkpoint(background);
  }
  for (let index = 0; index < background.items.length; index += 1) {
    const item = background.items[index];
    if (item.asset || item.bytes) continue;
    owner(uid);
    await stage('preparing');
    let materialized; let prepared;
    try {
      const staged = (await nativeTransfers.list(uid)).find((entry) => entry.id === item.id);
      let result = staged;
      if (!result) {
        materialized = await materializeRecommendationPublishMedia(media[index].localReference);
        prepared = normalize ? await normalize(materialized.uri) : await prepareTravelMediaSource(materialized.uri, media[index].transform);
        result = await nativeTransfers.stage(item.id, uid, prepared.uri);
      }
      background = { ...background, items: background.items.map((entry, i) => i === index
        ? { ...entry, bytes: result.bytes, stagingPath: `media-staging/${uid}/${entry.id}.jpg` } : entry) };
      await checkpoint(background);
    } finally { if (prepared) await deletePreparedTravelMedia(prepared).catch(() => {}); materialized?.revoke?.(); }
  }
  owner(uid);
  if (!background.accepted) {
    const data = { operationId: background.operationId, kind, items: background.items,
      ...(job.payload?.draftId ? { draftId: job.payload.draftId, expectedVersion: job.payload.expectedVersion }
        : kind === 'recommendation' ? { payload: job.payload } : {}) };
    await call('startBackgroundOperation', data);
    background = { ...background, accepted: true };
    await checkpoint(background);
  }
  let remote = await getBackgroundOperation(background.operationId);
  if (remote.status === 'failed' && background.retryRequested) {
    remote = await retryBackgroundOperation(background.operationId);
  }
  const explicitRetry = background.retryRequested === true;
  if (explicitRetry) { background = { ...background, retryRequested: false }; await checkpoint(background); }
  if (!terminal(remote.status)) {
    const tasks = await nativeTransfers.list(uid);
    for (const item of background.items) {
      owner(uid);
      const state = remote.items?.find((entry) => entry.id === item.id)?.state;
      if (item.asset || ['uploaded', 'prepared'].includes(state)) continue;
      const task = tasks.find((entry) => entry.id === item.id);
      if (['scheduled', 'uploading', 'uploaded'].includes(task?.state)) continue;
      if (task?.state === 'failed' && !explicitRetry) continue;
      await nativeTransfers.schedule(item.id, uid, await createSession(uid, background.operationId, item));
    }
  }
  let lastReportedFailure = false;
  while (true) {
    owner(uid);
    if (terminal(remote.status)) {
      if (['failed', 'discarded'].includes(remote.status)) throw Object.assign(new Error('Background operation failed'), {
        code: remote.error?.code || 'functions/internal', background: true,
        details: { reason: remote.error?.reason, retryable: remote.error?.retryable === true, publishStage: remote.stage },
      });
      return remote.result;
    }
    if (AppState.currentState === 'active' || !AppState.currentState) {
      await stage(remote.stage === 'uploading' ? 'uploading' : remote.stage === 'saving' ? 'saving' : 'processing');
      const tasks = await nativeTransfers.list(uid);
      for (let i = 0; i < background.items.length; i += 1) {
        const task = tasks.find((entry) => entry.id === background.items[i].id);
        if (task) progress?.(i, task.state === 'uploaded' ? 1 : task.progress || 0);
      }
      if (!lastReportedFailure && tasks.some((task) => task.state === 'failed' && background.items.some((item) => item.id === task.id))) {
        await call('reportBackgroundTransferFailure', { operationId: background.operationId,
          itemIds: tasks.filter((task) => task.state === 'failed' && background.items.some((item) => item.id === task.id)).map((task) => task.id) }).catch(() => {});
        lastReportedFailure = true;
      }
      try { remote = await getBackgroundOperation(background.operationId); }
      catch (error) {
        if (/unauthenticated|permission-denied|not-found/.test(String(error?.code))) throw error;
        await stage('waiting');
      }
    }
    await wait(4000);
  }
}

export async function removeBackgroundSources(job) {
  if (!job.background || !nativeTransfers) return;
  await Promise.all(job.background.items.map((item) => nativeTransfers.remove(item.id, job.ownerUid)));
}
export async function discardBackgroundJob(job) {
  if (job.background?.accepted) await call('discardBackgroundOperation', { operationId: job.background.operationId });
  await removeBackgroundSources(job);
}

export async function syncBackgroundHistory(uid, operationId, before) {
  owner(uid);
  const response = operationId ? { operations: [await getBackgroundOperation(operationId)] }
    : await call('getBackgroundOperations', before ? { before } : {});
  await operationStore.hydrate();
  owner(uid);
  for (const job of response.operations) {
    if (job.status === 'discarded') continue;
    const previous = operationStore.getSnapshot().find((entry) => entry.ownerUid === uid && entry.serverOperationId === job.operationId);
    const error = job.error ? safeOperationError(job.error) : null;
    await operationStore.update({ ...(previous || {}), id: previous?.id || `background:${job.operationId}`,
      ownerUid: uid, kind: job.kind, source: previous?.source || 'background', serverOperationId: job.operationId,
      status: job.status === 'ready' ? 'processing' : job.status, stage: job.stage, retryable: job.error?.retryable === true,
      discoveryRegionIds: job.kind === 'route' ? job.result?.discoveryRegionIds : [job.result?.discoveryRegionId].filter(Boolean),
      targetId: job.result?.routeId || job.result?.recommendationId || (job.kind === 'avatar' ? uid : null),
      createdAt: job.createdAt, updatedAt: job.updatedAt, message: error?.message || null, code: error?.code || null,
      ...(previous?.status !== job.status ? { acknowledged: false, dismissed: false, visibleMs: 0 } : {}),
    });
  }
  return response.nextBefore || null;
}
