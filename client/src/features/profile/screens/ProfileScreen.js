/**
 * Shared self/public profile entry point for authenticated users.
 */
import React, { useCallback, useEffect, useState } from 'react';
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
import { isSmartProfileComplete } from '../../../hooks/useSmartProfile';
import ProfileView from '../components/ProfileView';
import SupportModal from '../components/SupportModal';

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
  const {
    userData,
    stats,
    loading,
    statsLoading,
    refresh,
    setUserData,
  } = useProfileData({ uid: profileUid, user });
  const {
    recommendations,
    routes,
    loading: contentLoading,
    refresh: refreshContent,
  } = useProfileContent({ uid: profileUid });

  const { onPickImage, uploading } = useProfilePhoto({
    uid: profileUid,
    user,
    userData,
    updateLocalUserData: setUserData,
  });

  useEffect(() => {
    if (route?.params?.openSupport) {
      setSupportOpen(true);
      navigation.setParams({ openSupport: false });
    }
  }, [route?.params?.openSupport, navigation]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refresh(true);
      refreshContent(true);
    });
    return unsubscribe;
  }, [navigation, refresh, refreshContent]);

  const handleSaveBio = useCallback(async (bio) => {
    const result = await saveProfile({ bio }, { verifySmartProfile: false });
    setUserData({ bio: result?.bio ?? bio });
  }, [setUserData]);

  const preferencesCompleted = isSmartProfileComplete(userData?.smartProfile);
  const openPreferences = useCallback(() => {
    getRootNavigation(navigation)?.navigate?.(
      preferencesCompleted ? 'EditProfile' : 'PreferenceSetup'
    );
  }, [navigation, preferencesCompleted]);

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
        contentLoading={contentLoading}
        isOwner={isMyProfile}
        onPickImage={isMyProfile ? onPickImage : undefined}
        uploading={isMyProfile ? uploading : false}
        onEditSmartProfile={isMyProfile ? openPreferences : undefined}
        onSaveBio={isMyProfile ? handleSaveBio : undefined}
        onMenuPress={isMyProfile
          ? () => navigation.dispatch(DrawerActions.openDrawer())
          : undefined}
        onBackPress={!isMyProfile ? () => navigation.goBack() : undefined}
        onRefresh={() => {
          refresh();
          refreshContent();
        }}
      />
      <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}

export default ProfileScreen;
