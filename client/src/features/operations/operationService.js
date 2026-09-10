import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { createOperationStore } from './createOperationStore';
import { safeOperationError } from './operationModel';

export const operationStore = createOperationStore({ storage: AsyncStorage });
let principal = null;
const activeTargets = new Map();
export function setOperationPrincipal(uid) { principal = uid || null; }
export function getOperationPrincipal() { return principal; }

export async function trackOperation(metadata, work) {
  const ownerUid = metadata.ownerUid || principal;
  if (!ownerUid || metadata.feedback === false) return work();
  const initiatingPrincipal = principal;
  const key = metadata.dedupeKey ? `${ownerUid}:${metadata.dedupeKey}` : null;
  if (key && activeTargets.has(key)) return activeTargets.get(key);
  const operation = (async () => {
    const id = randomUUID();
    const entry = { ...metadata, id, ownerUid, source: 'action', status: 'saving', stage: 'saving',
      createdAt: Date.now(), acknowledged: false, progress: null };
    // An unavailable journal must not turn a confirmed business save into a failure.
    const update = (patch) => operationStore.update({ ...entry, ...patch }).catch(() => {});
    await update({});
    try {
      if (principal !== initiatingPrincipal || (principal && principal !== ownerUid)) {
        throw Object.assign(new Error('Account changed'), { code: 'auth/unauthenticated' });
      }
      const result = await work();
      if (metadata.quiet) await operationStore.remove(id, ownerUid).catch(() => {});
      else await update({ status: 'success', stage: 'success', progress: 1,
        targetId: result?.recommendationId || result?.routeId || result?.tripId || metadata.targetId });
      return result;
    } catch (error) {
      const safe = safeOperationError(error);
      await update({ status: safe.uncertain ? 'uncertain' : 'failed', stage: 'failed',
        code: safe.code, message: safe.message, quiet: false });
      throw error;
    }
  })();
  if (key) activeTargets.set(key, operation);
  try { return await operation; } finally { if (key && activeTargets.get(key) === operation) activeTargets.delete(key); }
}
