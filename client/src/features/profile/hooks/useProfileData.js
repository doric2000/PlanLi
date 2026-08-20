import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  buildProfileUserData,
  DEFAULT_PROFILE_STATS,
  peekProfileResource,
  requestProfileResource,
} from '../services/ProfileResourceService';

export function useProfileData({ uid, user }) {
  const isOwnProfile = Boolean(uid && user?.uid === uid);
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
  const liveOwnerData = useMemo(
    () => buildProfileUserData(profileUser, profileUser, true),
    [profileUser]
  );
  const [userData, setUserDataState] = useState(
    cached?.userData || (isOwnProfile ? liveOwnerData : buildProfileUserData())
  );
  const [stats, setStats] = useState(cached?.stats || DEFAULT_PROFILE_STATS);
  const [loading, setLoading] = useState(Boolean(uid) && !cached && !isOwnProfile);
  const [statsLoading, setStatsLoading] = useState(Boolean(uid) && !cached);
  const [error, setError] = useState(null);

  useEffect(() => {
    const next = peekProfileResource(uid, isOwnProfile);
    setUserDataState(next?.userData || (isOwnProfile ? liveOwnerData : buildProfileUserData()));
    setStats(next?.stats || DEFAULT_PROFILE_STATS);
    setLoading(Boolean(uid) && !next && !isOwnProfile);
    setStatsLoading(Boolean(uid) && !next);
    setError(null);
  }, [uid, isOwnProfile]);

  useEffect(() => {
    if (isOwnProfile) setUserDataState(liveOwnerData);
  }, [isOwnProfile, user?.displayName, user?.photoURL, user?.photoMedia, user?.email, user?.bio, user?.isExpert, user?.smartProfile]);

  const refresh = useCallback(({ silent = false } = {}) => {
    const attempt = requestProfileResource({ uid, user: profileUser, isOwnProfile });
    if (!silent && attempt.requested) {
      if (!isOwnProfile) setLoading(true);
      setStatsLoading(true);
    }
    if (attempt.requested) setError(null);
    const promise = attempt.promise.then((resource) => {
      setUserDataState(isOwnProfile ? buildProfileUserData(profileUser, profileUser, true) : resource.userData);
      setStats(resource.stats);
      return resource;
    }).catch((error) => {
      console.error('Error fetching profile resource:', error);
      setError(error);
      throw error;
    }).finally(() => {
      setLoading(false);
      setStatsLoading(false);
    });
    return { requested: attempt.requested, source: attempt.source, promise };
  }, [uid, profileUser, isOwnProfile]);

  useEffect(() => {
    refresh({ silent: Boolean(cached) || isOwnProfile }).promise.catch(() => {});
  }, [refresh]);

  const resetProfileState = useCallback(() => {
    setUserDataState(isOwnProfile ? liveOwnerData : buildProfileUserData());
    setStats(DEFAULT_PROFILE_STATS);
  }, [isOwnProfile, liveOwnerData]);

  const setUserData = useCallback((next) => {
    setUserDataState((previous) => ({
      ...previous,
      ...(typeof next === 'function' ? next(previous) : next),
    }));
  }, []);

  return {
    userData,
    stats,
    loading,
    statsLoading,
    error,
    refresh,
    resetProfileState,
    setUserData,
    setStats,
  };
}

export default useProfileData;
