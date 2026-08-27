import { httpsCallable } from 'firebase/functions';

import { cloudFunctions } from '../config/firebase';

let listMyPendingContentCallable;

export async function listMyPendingContent({ cursor = null, limit = 30 } = {}) {
  listMyPendingContentCallable ||= httpsCallable(cloudFunctions, 'listMyPendingContent');
  const response = await listMyPendingContentCallable({
    limit,
    ...(cursor ? { cursor } : {}),
  });
  return {
    items: Array.isArray(response.data?.items) ? response.data.items : [],
    nextCursor: response.data?.nextCursor || null,
  };
}
