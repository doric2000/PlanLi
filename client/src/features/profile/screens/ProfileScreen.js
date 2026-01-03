/**
 * Screen for displaying and editing user profile.
 * Now composed from smaller hooks/components to keep it maintainable.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import appConfig from '../../../../app.json';
import { auth } from '../../../config/firebase';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { colors, common, buttons, typography } from '../../../styles';
import ProfileHeader from '../components/ProfileHeader';
import ProfileStatsCard from '../components/ProfileStatsCard';
import ProfileMenuList from '../components/ProfileMenuList';
import SupportModal from '../components/SupportModal';
import { useProfileData } from '../hooks/useProfileData';
import { useProfilePhoto } from '../hooks/useProfilePhoto';
import { getSmartProfileBadges } from '../utils/smartProfileBadges';

const MENU_ITEMS = [
  { icon: 'person-outline', label: 'Edit Profile' },
  { icon: 'settings-outline', label: 'Settings' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'help-circle-outline', label: 'Help & Support' },
];

const ProfileScreen = ({ navigation }) => {
  const { user } = useCurrentUser();
  const uid = user?.uid;
  const [supportOpen, setSupportOpen] = useState(false);

  const { userData, stats, loading, refresh, resetProfileState, setUserData } = useProfileData({
    uid,
    user,
  });

  const { onPickImage, uploading } = useProfilePhoto({
    uid,
    user,
    userData,
    updateLocalUserData: setUserData,
  });

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', refresh);
    return unsubscribe;
  }, [navigation, refresh]);

  const smartBadges = useMemo(
    () => getSmartProfileBadges(userData?.smartProfile),
    [userData?.smartProfile]
  );

  const navigateToStack = useCallback(
    (screenName, params) => {
      // אם אנחנו בתוך Tabs, ה-parent הוא ה-Stack הראשי
      const parent = navigation.getParent?.();
      if (parent?.navigate) return parent.navigate(screenName, params);
      return navigation.navigate(screenName, params);
    },
    [navigation]
  );

  const handleMenuPress = useCallback(
    (label) => {
      if (label === 'Edit Profile') {
        return navigateToStack('EditProfile');
      }

      if (label === 'Help & Support') {
        setSupportOpen(true);
        return;
      }

      Alert.alert('Coming soon', label);
    },
    [navigateToStack]
  );

  const handleSignOut = useCallback(async () => {
    try {
      resetProfileState();
      await signOut(auth);

      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out: ' + error.message);
    }
  }, [resetProfileState, navigation]);

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
    <SafeAreaView style={common.container}>
      <ScrollView contentContainerStyle={common.profileScrollContent}>
        <ProfileHeader
          userData={userData}
          stats={stats}
          smartBadges={smartBadges}
          onPickImage={onPickImage}
          uploading={uploading}
          onEditSmartProfile={() => handleMenuPress('Edit Profile')}
        />

        <ProfileStatsCard stats={stats} />

        <ProfileMenuList items={MENU_ITEMS} onPressItem={handleMenuPress} />

        <TouchableOpacity style={buttons.signOut} onPress={handleSignOut} activeOpacity={0.85}>
          <MaterialIcons name="logout" size={20} color={colors.error} />
          <Text style={buttons.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={typography.profileVersion}>Version {appConfig.expo.version}</Text>
      </ScrollView>

      <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </SafeAreaView>
  );
};

export default ProfileScreen;
