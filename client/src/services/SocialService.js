import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';
import { captureDiagnosticException } from './ErrorReporting';
import { trackOperation } from '../features/operations/operationService';

const callables = new Map();
const REPLAY_PROTECTED_CALLABLES = new Set(['deleteContent', 'requestAccountDeletion']);
const FEEDBACK = {
  setFavorite: { kind: 'favorite', quiet: true }, setReaction: { kind: 'reaction', quiet: true },
  saveComment: { kind: 'comment' }, deleteComment: { kind: 'deletion' },
  deleteContent: { kind: 'deletion' }, setNotificationRead: { kind: 'notifications', quiet: true },
  clearNotifications: { kind: 'notifications' }, deleteNotification: { kind: 'notifications', quiet: true },
  requestAccountDeletion: { kind: 'deletion' }, submitReport: { kind: 'report' }, setBlockedUser: { kind: 'block' },
};

const call = async (name, payload = {}) => {
  if (!callables.has(name)) {
    const options = REPLAY_PROTECTED_CALLABLES.has(name)
      ? { limitedUseAppCheckTokens: true }
      : undefined;
    callables.set(name, httpsCallable(cloudFunctions, name, options));
  }
  const execute = async () => (await callables.get(name)(payload)).data;
  return FEEDBACK[name] ? trackOperation({ ...FEEDBACK[name],
    targetId: payload.target?.id || payload.blockedUid || payload.notificationId,
    targetType: payload.target?.type,
  }, execute) : execute();
};

export const setFavorite = (target, saved) =>
  call('setFavorite', { target, saved });

export const setReaction = (target, liked) =>
  call('setReaction', { target, liked });

export const getReactionState = (target) =>
  call('getReactionState', { target });

export const saveComment = (target, text, options = {}) => {
  const normalized = typeof options === 'string' ? { commentId: options } : options || {};
  return call('saveComment', {
    target,
    text,
    ...(normalized.commentId ? { commentId: normalized.commentId } : {}),
    ...(normalized.replyToCommentId ? { replyToCommentId: normalized.replyToCommentId } : {}),
  });
};

export const deleteComment = (target, commentId) =>
  call('deleteComment', { target, commentId });

export const deleteContent = async (target) => {
  try {
    return await call('deleteContent', { target });
  } catch (error) {
    captureDiagnosticException(error, {
      operation: 'delete_content',
      code: error?.code || 'unknown',
      reason: 'delete_failed',
      contentType: target?.type,
    });
    throw error;
  }
};

export const setNotificationRead = (notificationId, read = true) =>
  call('setNotificationRead', { notificationId, read });

export const clearNotifications = () => call('clearNotifications');

export const deleteNotification = (notificationId) =>
  call('deleteNotification', { notificationId });

export const requestAccountDeletion = (payload = {}) => call('requestAccountDeletion', payload);

export const submitReport = (target, category, details = '') =>
  call('submitReport', { target, category, details });

export const setBlockedUser = (blockedUid, blocked = true) =>
  call('setBlockedUser', { blockedUid, blocked });
