/**
 * Shared self/public profile entry point for authenticated users.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { colors, common } from '../../../styles';
import { saveProfile } from '../../../services/ProfileService';
import { useProfileContent } from '../hooks/useProfileContent';
import { useProfileData } from '../hooks/useProfileData';
import { useProfilePhoto } from '../hooks/useProfilePhoto';
import ProfileView from '../components/ProfileView';
import SupportModal from '../components/SupportModal';
import { invalidateProfileResource } from '../services/ProfileResourceService';
import { waitForRefreshConfirmation } from '../../../utils/refreshFeedback';
import { useContentPublish } from '../../publishing/ContentPublishContext';

function getRootNavigation(navigation) {
  let current = navigation;
  let parent = current?.getParent?.();
  while (parent) {
    current = parent;
    parent = current?.getParent?.();
  }
  return current;
}

function ProfileScreen({ navigation, route }) {
  const { isGuest, loading: authLoading } = useAuthUser();

  useEffect(() => {
    if (authLoading || !isGuest) return;
    try {
      navigation.navigate?.('Auth');
      return;
    } catch {
      // Fall through to the root navigator when this screen is mounted outside Auth.
    }
    getRootNavigation(navigation)?.navigate?.('Login');
  }, [authLoading, isGuest, navigation]);

  if (authLoading) {
    return (
      <SafeAreaView style={common.container}>
        <View style={common.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isGuest) return null;
  return <AuthedProfileScreen navigation={navigation} route={route} />;
}

function AuthedProfileScreen({ navigation, route }) {
  const { user } = useCurrentUser();
  const profileUid = route?.params?.uid || user?.uid;
  const isMyProfile = profileUid === user?.uid;
  const [supportOpen, setSupportOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const {
    userData,
    stats,
    loading,
    statsLoading,
    error: profileError,
    refresh,
    setUserData,
  } = useProfileData({ uid: profileUid, user });
  const {
    recommendations,
    routes,
    pendingContent,
    pendingError,
    loading: contentLoading,
    error: contentError,
    refresh: refreshContent,
  } = useProfileContent({ uid: profileUid, user, isOwnProfile: isMyProfile });
  const { completedVersionByType = {} } = useContentPublish();
  const publishVersion = `${Number(completedVersionByType.recommendation || 0)}:${Number(completedVersionByType.route || 0)}`;
  const publishVersionRef = useRef(publishVersion);

  const { onPickImage, uploading } = useProfilePhoto({
    uid: profileUid,
    user,
    userData,
    updateLocalUserData: setUserData,
    onSaved: () => invalidateProfileResource(profileUid),
  });

  useEffect(() => {
    if (route?.params?.openSupport) {
      setSupportOpen(true);
      navigation.setParams({ openSupport: false });
    }
  }, [route?.params?.openSupport, navigation]);

  const refreshProfile = useCallback(() => {
    const profileAttempt = refresh({ silent: true });
    const contentAttempt = refreshContent({ silent: true });
    const attempts = [profileAttempt, contentAttempt];
    const networkPending = attempts.some((attempt) => (
      attempt.requested || attempt.source === 'in-flight'
    ));
    setRefreshing(networkPending);
    setConfirming(!networkPending);
    const promise = Promise.all(attempts.map((attempt) => attempt.promise));
    return (networkPending ? promise : Promise.all([promise, waitForRefreshConfirmation()]))
      .catch(() => undefined)
      .finally(() => {
        setRefreshing(false);
        setConfirming(false);
      });
  }, [refresh, refreshContent]);

  useEffect(() => {
    if (publishVersionRef.current === publishVersion) return;
    publishVersionRef.current = publishVersion;
    invalidateProfileResource(profileUid);
    refresh({ silent: true }).promise.catch(() => {});
    refreshContent({ silent: true }).promise.catch(() => {});
  }, [profileUid, publishVersion, refresh, refreshContent]);

  const handleSaveBio = useCallback(async (bio) => {
    const result = await saveProfile({ bio }, { verifySmartProfile: false });
    invalidateProfileResource(profileUid);
    setUserData({ bio: result?.bio ?? bio });
  }, [profileUid, setUserData]);

  const openPreferences = useCallback(() => {
    getRootNavigation(navigation)?.navigate?.('PreferenceSetup', { source: 'profile' });
  }, [navigation]);

  if (loading) {
    return (
      <SafeAreaView style={common.container}>
        <View style={common.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <ProfileView
        navigation={navigation}
        userData={userData}
        stats={stats}
        statsLoading={statsLoading}
        recommendations={recommendations}
        routes={routes}
        pendingContent={pendingContent}
        pendingError={pendingError}
        contentLoading={contentLoading}
        contentError={contentError || profileError}
        isOwner={isMyProfile}
        onPickImage={isMyProfile ? onPickImage : undefined}
        uploading={isMyProfile ? uploading : false}
        onEditSmartProfile={isMyProfile ? openPreferences : undefined}
        onSaveBio={isMyProfile ? handleSaveBio : undefined}
        onMenuPress={isMyProfile
          ? () => navigation.dispatch(DrawerActions.openDrawer())
          : undefined}
        onBackPress={!isMyProfile ? () => navigation.goBack() : undefined}
        refreshing={refreshing}
        confirming={confirming}
        onRefresh={refreshProfile}
      />
      <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}

export default ProfileScreen;
