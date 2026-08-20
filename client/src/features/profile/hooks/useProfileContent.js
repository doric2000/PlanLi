import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  peekProfileResource,
  requestProfileResource,
} from '../services/ProfileResourceService';

export function useProfileContent({ uid, user, isOwnProfile = false }) {
  const profileUser = useMemo(() => user, [
    user?.uid,
    user?.displayName,
    user?.photoURL,
    user?.photoMedia,
    user?.email,
    user?.bio,
    user?.isExpert,
    user?.smartProfile,
  ]);
  const cached = peekProfileResource(uid, isOwnProfile);
  const [recommendations, setRecommendations] = useState(cached?.recommendations || []);
  const [routes, setRoutes] = useState(cached?.routes || []);
  const [loading, setLoading] = useState(Boolean(uid) && !cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    const next = peekProfileResource(uid, isOwnProfile);
    setRecommendations(next?.recommendations || []);
    setRoutes(next?.routes || []);
    setLoading(Boolean(uid) && !next);
    setError(null);
  }, [uid, isOwnProfile]);

  const refresh = useCallback(({ silent = false } = {}) => {
    if (!uid) {
      setRecommendations([]);
      setRoutes([]);
      setLoading(false);
      return { requested: false, source: 'empty', promise: Promise.resolve() };
    }
    const attempt = requestProfileResource({ uid, user: profileUser, isOwnProfile });
    if (!silent && attempt.requested) setLoading(true);
    if (attempt.requested) setError(null);
    const promise = attempt.promise.then((resource) => {
        setRecommendations(resource.recommendations);
        setRoutes(resource.routes);
        setError(null);
        return resource;
      })
      .catch((requestError) => {
        setError(requestError);
        throw requestError;
      })
      .finally(() => setLoading(false));
    return { requested: attempt.requested, source: attempt.source, promise };
  }, [uid, profileUser, isOwnProfile]);

  useEffect(() => {
    refresh({ silent: Boolean(cached) }).promise.catch((error) => {
      console.error('Error fetching profile content:', error);
    });
  }, [refresh]);

  return { recommendations, routes, loading, error, refresh };
}

export default useProfileContent;
