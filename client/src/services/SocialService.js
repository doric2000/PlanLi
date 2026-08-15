import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from '../config/firebase';

const callables = new Map();

const call = async (name, payload = {}) => {
  if (!callables.has(name)) {
    callables.set(name, httpsCallable(cloudFunctions, name));
  }
  const response = await callables.get(name)(payload);
  return response.data;
};

export const setFavorite = (target, saved) =>
  call('setFavorite', { target, saved });

export const setReaction = (target, liked) =>
  call('setReaction', { target, liked });

export const getReactionState = (target) =>
  call('getReactionState', { target });

export const saveComment = (target, text, commentId = null) =>
  call('saveComment', { target, text, ...(commentId ? { commentId } : {}) });

export const deleteComment = (target, commentId) =>
  call('deleteComment', { target, commentId });

export const deleteContent = (target) =>
  call('deleteContent', { target });

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
