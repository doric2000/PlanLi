import React, { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth } from '../../../config/firebase';
import { colors, common } from '../../../styles';
import ProfileView from '../components/ProfileView';
import { useProfileContent } from '../hooks/useProfileContent';
import { useProfileData } from '../hooks/useProfileData';
import { waitForRefreshConfirmation } from '../../../utils/refreshFeedback';

export default function UserProfileScreen({ route, navigation }) {
  const uid = route?.params?.uid;
  const currentUser = auth.currentUser;
  const [refreshing, setRefreshing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const {
    userData,
    stats,
    loading: profileLoading,
    statsLoading,
    error: profileError,
    refresh,
  } = useProfileData({ uid, user: currentUser });
  const {
    recommendations,
    routes,
    loading: contentLoading,
    error: contentError,
    refresh: refreshContent,
  } = useProfileContent({ uid, user: currentUser, isOwnProfile: false });

  const refreshProfile = useCallback(() => {
    const attempts = [
      refresh({ silent: true }),
      refreshContent({ silent: true }),
    ];
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

  if (profileLoading) {
    return (
      <SafeAreaView style={common.container}>
        <View style={common.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <ProfileView
      navigation={navigation}
      userData={userData}
      stats={stats}
      statsLoading={statsLoading}
      recommendations={recommendations}
      routes={routes}
      contentLoading={contentLoading}
      contentError={contentError || profileError}
      isOwner={false}
      profileUid={uid}
      onBackPress={() => navigation.goBack()}
      refreshing={refreshing}
      confirming={confirming}
      onRefresh={refreshProfile}
    />
  );
}
