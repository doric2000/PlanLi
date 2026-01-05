/**
 * Screen for displaying and editing user profile.
 * Now composed from smaller hooks/components to keep it maintainable.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  FlatList,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Text,
  StyleSheet
} from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons , Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import appConfig from '../../../../app.json';
import { auth } from '../../../config/firebase';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { colors, common, buttons, typography } from '../../../styles';
import ProfileHeader from '../components/ProfileHeader';
import ProfileStatsCard from '../components/ProfileStatsCard';
import ProfileMenuList from '../components/ProfileMenuList';
import RecommendationCard from '../../../components/RecommendationCard';
import SupportModal from '../components/SupportModal';
import { useProfileData } from '../hooks/useProfileData';
import { useProfilePhoto } from '../hooks/useProfilePhoto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSmartProfileBadges } from '../utils/smartProfileBadges';
import { db } from '../../../config/firebase';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';


const MENU_ITEMS = [
  { icon: 'person-outline', label: 'Edit Profile' },
  { icon: 'settings-outline', label: 'Settings' },
  { icon: 'notifications-outline', label: 'Notifications' },
  { icon: 'help-circle-outline', label: 'Help & Support' },
];

const ProfileScreen = ({ navigation , route }) => {
  const { user } = useCurrentUser();
  const uid = user?.uid;
  const [supportOpen, setSupportOpen] = useState(false);
  const [contentTab, setContentTab] = useState('recommendations');
  const [myRecs, setMyRecs] = useState([]);
  const [myRoutes, setMyRoutes] = useState([]);
  const [contentLoading, setContentLoading] = useState(false);
  const activeData = contentTab === 'recommendations' ? myRecs : myRoutes;



  const { userData, stats, loading, refresh, resetProfileState, setUserData } = useProfileData({
    uid,
    user,
  });

  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    menuButton: {
      position: 'absolute',
      top: insets.top + 8,
      right: 12,
      zIndex: 999,
      elevation: 10,
      padding: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.95)',
    },
  });

  const loadMyContent = useCallback(async () => {
    if (!uid) return;
    setContentLoading(true);

    try {
      // --- Recommendations ---
      let recSnap;
      try {
        const recQ = query(
          collection(db, 'recommendations'),
          where('userId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        recSnap = await getDocs(recQ);
      } catch (err) {
        console.log('Ordered recs query failed, fallback:', err?.message);
        const recQFallback = query(
          collection(db, 'recommendations'),
          where('userId', '==', uid),
          limit(30)
        );
        recSnap = await getDocs(recQFallback);
      }

      console.log('uid:', uid, 'myRecs:', recSnap.size);
      setMyRecs(recSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // --- Routes ---
      let routesSnap;
      try {
        const routesQ = query(
          collection(db, 'routes'),
          where('userId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        routesSnap = await getDocs(routesQ);
      } catch (err) {
        console.log('Ordered routes query failed, fallback:', err?.message);
        const routesQFallback = query(
          collection(db, 'routes'),
          where('userId', '==', uid),
          limit(30)
        );
        routesSnap = await getDocs(routesQFallback);
      }

      console.log('uid:', uid, 'myRoutes:', routesSnap.size);
      setMyRoutes(routesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.log('loadMyContent error:', e?.message || e);
    } finally {
      setContentLoading(false);
    }
  }, [uid]);





  useEffect(() => {
    if (route?.params?.openSupport) {
      setSupportOpen(true);
      navigation.setParams({ openSupport: false });
    }
  }, [route?.params?.openSupport, navigation]);

  const { onPickImage, uploading } = useProfilePhoto({
    uid,
    user,
    userData,
    updateLocalUserData: setUserData,
  });
  useEffect(() => {
    loadMyContent();
  }, [loadMyContent]);


  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refresh();
      loadMyContent();
    });
    return unsubscribe;
  }, [navigation, refresh, loadMyContent]);



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
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
        activeOpacity={0.85}
      >
        <Ionicons name="menu" size={22} color={colors.textPrimary} />
      </TouchableOpacity>

      <FlatList
        data={activeData}
        keyExtractor={(item) => item.id}
        extraData={contentTab}
        contentContainerStyle={common.profileScrollContent}
        ListHeaderComponent={
          <>
            <ProfileHeader
              userData={userData}
              stats={stats}
              smartBadges={smartBadges}
              onPickImage={onPickImage}
              uploading={uploading}
              onEditSmartProfile={() => handleMenuPress('Edit Profile')}
            />

            <ProfileStatsCard stats={stats} />

            {/* Tabs */}
            <View style={{ marginTop: 14 }}>
              <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.08)' }}>
                <TouchableOpacity
                  onPress={() => setContentTab('recommendations')}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderBottomWidth: 2,
                    borderBottomColor: contentTab === 'recommendations' ? colors.textPrimary : 'transparent',
                  }}
                >
                  <Text style={{ fontWeight: '700', opacity: contentTab === 'recommendations' ? 1 : 0.5 }}>
                    Recommendations
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setContentTab('routes')}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    alignItems: 'center',
                    borderBottomWidth: 2,
                    borderBottomColor: contentTab === 'routes' ? colors.textPrimary : 'transparent',
                  }}
                >
                  <Text style={{ fontWeight: '700', opacity: contentTab === 'routes' ? 1 : 0.5 }}>
                    Routes
                  </Text>
                </TouchableOpacity>
              </View>

              {contentLoading ? (
                <View style={{ paddingTop: 18, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : null}
            </View>
          </>
        }
        renderItem={({ item }) => {
          if (contentLoading) return null;

          if (contentTab === 'recommendations') {
            // 👈 כאן זה נהיה כמו Community
            return (
              <RecommendationCard
                item={item}
                navigation={navigation}
                currentUserId={uid}
                onDeleted={(deletedId) => {
                  setMyRecs(prev => prev.filter(r => r.id !== deletedId));
                }}
                onUpdated={(updatedItem) => {
                  setMyRecs(prev => prev.map(r => (r.id === updatedItem.id ? updatedItem : r)));
                }}
                onRefresh={loadMyContent}
              />
            );
          }
          return (
            <TouchableOpacity
              style={{ marginHorizontal: 16, marginTop: 12, padding: 14, borderRadius: 12, backgroundColor: '#fff' }}
            >
              <Text style={{ fontWeight: '800' }}>{item.title || item.name || 'Untitled route'}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          !contentLoading ? (
            <View style={{ paddingTop: 18, paddingHorizontal: 16 }}>
              <Text style={{ opacity: 0.6 }}>
                {contentTab === 'recommendations' ? 'No recommendations yet.' : 'No routes yet.'}
              </Text>
            </View>
          ) : null
        }
      />

      <SupportModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </SafeAreaView>
  );
};

export default ProfileScreen;
