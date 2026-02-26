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
  StyleSheet,
} from 'react-native';
import { DrawerActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';

import { auth, db } from '../../../config/firebase';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { colors, common } from '../../../styles';

import ProfileHeader from '../components/ProfileHeader';
import ProfileStatsCard from '../components/ProfileStatsCard';
import RecommendationCard from '../../../components/RecommendationCard';
import SupportModal from '../components/SupportModal';

import { useProfileData } from '../hooks/useProfileData';
import { useProfilePhoto } from '../hooks/useProfilePhoto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSmartProfileBadges } from '../utils/smartProfileBadges';

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  doc,
} from 'firebase/firestore';

import { RouteCard } from '../../roadtrip/components/RouteCard';
import { CommentsModal } from '../../../components/CommentsModal';

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
    if (authLoading) return;
    if (!isGuest) return;

    try {
      navigation.navigate?.('Auth');
      return;
    } catch {
      // ignore
    }

    const rootNav = getRootNavigation(navigation);
    rootNav?.navigate?.('Login');
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

  const [contentTab, setContentTab] = useState('recommendations');
  const [myRecs, setMyRecs] = useState([]);
  const [myRoutes, setMyRoutes] = useState([]);
  const [contentLoading, setContentLoading] = useState(false);

  // Comments (Routes)
  const [commentsModalVisible, setCommentsModalVisible] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);

  const activeData = contentTab === 'recommendations' ? myRecs : myRoutes;

  const { userData, stats, loading, refresh, resetProfileState, setUserData } = useProfileData({
    uid: profileUid,
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
    tabRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.08)',
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderBottomWidth: 2,
    },
    tabText: {
      fontWeight: '700',
    },
  });

  const loadMyContent = useCallback(async (isSilent = false) => {
    if (!profileUid) return;
    if (!isSilent) {
      setContentLoading(true);
    }

    try {
      // --- Recommendations ---
      let recSnap;
      try {
        const recQ = query(
          collection(db, 'recommendations'),
          where('userId', '==', profileUid),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        recSnap = await getDocs(recQ);
      } catch (err) {
        console.log('Ordered recs query failed, fallback:', err?.message);
        const recQFallback = query(
          collection(db, 'recommendations'),
          where('userId', '==', profileUid),
          limit(30)
        );
        recSnap = await getDocs(recQFallback);
      }

      setMyRecs(recSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // --- Routes ---
      let routesSnap;
      try {
        const routesQ = query(
          collection(db, 'routes'),
          where('userId', '==', profileUid),
          orderBy('createdAt', 'desc'),
          limit(30)
        );
        routesSnap = await getDocs(routesQ);
      } catch (err) {
        console.log('Ordered routes query failed, fallback:', err?.message);
        const routesQFallback = query(
          collection(db, 'routes'),
          where('userId', '==', profileUid),
          limit(30)
        );
        routesSnap = await getDocs(routesQFallback);
      }

      setMyRoutes(routesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.log('loadMyContent error:', e?.message || e);
    } finally {
      if (!isSilent) {
        setContentLoading(false);
      }
    }
  }, [profileUid]);

  useEffect(() => {
    if (route?.params?.openSupport) {
      setSupportOpen(true);
      navigation.setParams({ openSupport: false });
    }
  }, [route?.params?.openSupport, navigation]);

  const { onPickImage, uploading } = useProfilePhoto({
    uid: profileUid,
    user,
    userData,
    updateLocalUserData: setUserData,
  });

  useEffect(() => {
    loadMyContent();
  }, [loadMyContent]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      refresh(true);
      loadMyContent(true);
    });
    return unsubscribe;
  }, [navigation, refresh, loadMyContent]);

  const smartBadges = useMemo(
    () => getSmartProfileBadges(userData?.smartProfile),
    [userData?.smartProfile]
  );

  const handleOpenComments = (routeId) => {
    setSelectedRouteId(routeId);
    setCommentsModalVisible(true);
  };

  const handleDeleteRoute = useCallback(
    async (routeId) => {
      try {
        await deleteDoc(doc(db, 'routes', routeId));
        setMyRoutes(prev => prev.filter(r => r.id !== routeId));
      } catch (e) {
        console.log('delete route error:', e?.message || e);
        Alert.alert('שגיאה', 'לא הצלחנו למחוק את המסלול');
      }
    },
    []
  );

  const handleSignOut = useCallback(async () => {
    try {
      resetProfileState();
      await signOut(auth);

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main' }],
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
        contentContainerStyle={
          contentTab === 'routes'
            ? { padding: 15, paddingBottom: 40 }
            : common.profileScrollContent
        }
        ListHeaderComponent={
          <View style={contentTab === 'routes' ? { marginHorizontal: -15 } : null}>
            <ProfileHeader
              userData={userData}
              stats={stats}
              smartBadges={smartBadges}
              onPickImage={isMyProfile ? onPickImage : undefined}
              uploading={isMyProfile ? uploading : false}
              onEditSmartProfile={() => navigation.getParent?.()?.navigate?.('EditProfile')}
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
                    המלצות
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
                    מסלולים
                  </Text>
                </TouchableOpacity>
              </View>

              {contentLoading ? (
                <View style={{ paddingTop: 18, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : null}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          if (contentLoading) return null;

          if (contentTab === 'recommendations') {
            return (
              <RecommendationCard
                item={item}
                navigation={navigation}
                currentUserId={user?.uid}
                onDeleted={(deletedId) => setMyRecs(prev => prev.filter(r => r.id !== deletedId))}
                onUpdated={(updatedItem) => setMyRecs(prev => prev.map(r => (r.id === updatedItem.id ? updatedItem : r)))}
                onRefresh={loadMyContent}
              />
            );
          }

          const currentUser = auth.currentUser;
          const isOwner = currentUser && item.userId === currentUser.uid;

          return (
            <RouteCard
              item={item}
              onPress={() => navigation.navigate('RouteDetail', { routeData: item })}
              isOwner={isOwner}                
              onEdit={() => navigation.navigate('AddRoutesScreen', { routeToEdit: item })}
              onDelete={() => {
                Alert.alert("Delete Route", "Are you sure you want to delete this route?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await deleteDoc(doc(db, "routes", item.id));
                        setMyRoutes(prev => prev.filter(r => r.id !== item.id));
                      } catch (e) {
                        Alert.alert("Error", "Failed to delete route");
                      }
                    },
                  },
                ]);
              }}
              onCommentPress={(routeId) => {
                setSelectedRouteId(routeId);
                setCommentsModalVisible(true);
              }}
            />
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

      {/* Routes comments */}
      <CommentsModal
        visible={commentsModalVisible}
        onClose={() => setCommentsModalVisible(false)}
        postId={selectedRouteId}
        collectionName="routes"
      />
    </SafeAreaView>
  );
}

export default ProfileScreen;
