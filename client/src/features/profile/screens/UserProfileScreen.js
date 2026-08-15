import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { auth } from '../../../config/firebase';
import { colors, common } from '../../../styles';
import ProfileView from '../components/ProfileView';
import { useProfileContent } from '../hooks/useProfileContent';
import { useProfileData } from '../hooks/useProfileData';

export default function UserProfileScreen({ route, navigation }) {
  const uid = route?.params?.uid;
  const currentUser = auth.currentUser;
  const {
    userData,
    stats,
    loading: profileLoading,
    statsLoading,
    refresh,
  } = useProfileData({ uid, user: currentUser });
  const {
    recommendations,
    routes,
    loading: contentLoading,
    refresh: refreshContent,
  } = useProfileContent({ uid });

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      refresh?.(true);
      refreshContent?.(true);
    });
    return unsubscribe;
  }, [navigation, refresh, refreshContent]);

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
      isOwner={false}
      profileUid={uid}
      onBackPress={() => navigation.goBack()}
      onRefresh={() => {
        refresh();
        refreshContent();
      }}
    />
  );
}
