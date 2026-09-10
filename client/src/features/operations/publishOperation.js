import { safeOperationError } from './operationModel';
import { operationStore } from './operationService';

export function publishOperation(job) {
  const outcome = job.result?.publicationStatus;
  const status = job.status === 'success'
    ? outcome === 'active' ? 'success' : outcome === 'moderation_hold' ? 'review' : 'uncertain'
    : job.status;
  const error = job.error ? safeOperationError(job.error) : null;
  return {
    id: `publish:${job.id}`, ownerUid: job.ownerUid, kind: job.contentType || 'recommendation',
    serverOperationId: job.background?.operationId,
    source: 'publish', status, stage: job.stage, createdAt: job.createdAt, updatedAt: job.updatedAt,
    legacyEditor: job.contentType !== 'route' && !job.payload?.draftId,
    discoveryRegionIds: job.contentType === 'route' ? job.result?.discoveryRegionIds : [job.result?.discoveryRegionId].filter(Boolean),
    targetId: job.result?.routeId || job.result?.recommendationId || null,
    // Per-image byte progress is real; preparing/processing have no invented percentage.
    progress: job.stage === 'uploading' && job.media?.length
      ? job.media.reduce((sum, item) => sum + Math.min(1, Math.max(0, item.progress || 0)), 0) / job.media.length : null,
    message: status === 'review' ? 'הפרסום נשמר וממתין לבדיקה. הוא עדיין לא מוצג לציבור.'
      : status === 'uncertain' ? 'התוכן נשמר, אך עדיין לא התקבל אישור שהוא מוצג לציבור.' : error?.message,
    code: error?.code,
  };
}

export async function syncPublishOperation(job, durable = true) {
  await operationStore.hydrate();
  const value = publishOperation(job);
  const previous = operationStore.getSnapshot().find((entry) => entry.id === value.id && entry.ownerUid === job.ownerUid);
  if (previous?.status !== value.status) {
    value.acknowledged = false;
    value.dismissed = false;
    value.visibleMs = 0;
  }
  return operationStore.update(value, { durable });
}
