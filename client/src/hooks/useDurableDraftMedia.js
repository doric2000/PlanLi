import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef } from 'react';

import { auth } from '../config/firebase';
import {
  deleteContentPublishMedia,
  persistContentPublishMedia,
} from '../features/publishing/contentPublishStorage';

export default function useDurableDraftMedia({ enabled = true } = {}) {
  const draftJobIdRef = useRef(randomUUID());
  const referencesByUriRef = useRef(new Map());
  const committedRef = useRef(false);

  const persistUris = useCallback(async (uris) => {
    const list = Array.isArray(uris) ? uris.filter(Boolean) : [];
    if (!enabled || !list.length) return list;
    const ownerUid = auth.currentUser?.uid;
    if (!ownerUid) throw new Error('You must be signed in to keep selected images.');
    await Promise.all(list.map(async (uri) => {
      if (referencesByUriRef.current.has(uri)) return;
      const mediaId = randomUUID();
      const localReference = await persistContentPublishMedia({
        ownerUid,
        jobId: draftJobIdRef.current,
        mediaId,
        uri,
      });
      referencesByUriRef.current.set(uri, { mediaId, localReference });
    }));
    return list;
  }, [enabled]);

  const forgetUri = useCallback(async (uri) => {
    const durable = referencesByUriRef.current.get(uri);
    if (!durable) return;
    referencesByUriRef.current.delete(uri);
    await deleteContentPublishMedia(durable.localReference);
  }, []);

  const mediaForUri = useCallback((uri) => {
    const durable = referencesByUriRef.current.get(uri);
    return durable ? { uri, ...durable } : { uri };
  }, []);

  const markEnqueued = useCallback((usedUris = null) => {
    if (Array.isArray(usedUris)) {
      const used = new Set(usedUris.filter(Boolean));
      referencesByUriRef.current.forEach((durable, uri) => {
        if (used.has(uri)) return;
        referencesByUriRef.current.delete(uri);
        deleteContentPublishMedia(durable.localReference).catch(() => {});
      });
    }
    committedRef.current = true;
    referencesByUriRef.current.clear();
  }, []);

  useEffect(() => () => {
    if (committedRef.current) return;
    const references = Array.from(referencesByUriRef.current.values());
    referencesByUriRef.current.clear();
    references.forEach(({ localReference }) => {
      deleteContentPublishMedia(localReference).catch(() => {});
    });
  }, []);

  return {
    draftJobId: draftJobIdRef.current,
    forgetUri,
    markEnqueued,
    mediaForUri,
    persistUris,
  };
}
