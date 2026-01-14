import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, TouchableOpacity, StyleSheet, Image, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';

import { auth, db } from '../../../config/firebase';
import { common, colors } from '../../../styles';

import BackButton from '../../../components/BackButton';
import { RouteCard } from '../../roadtrip/components/RouteCard';

import ProfileHeader from '../components/ProfileHeader';
import ProfileStatsCard from '../components/ProfileStatsCard';
import { useProfileData } from '../hooks/useProfileData';
import { getSmartProfileBadges } from '../utils/smartProfileBadges';

export default function UserProfileScreen({ route, navigation }) {
  const uid = route?.params?.uid;

  const currentUser = auth.currentUser;

  const [contentTab, setContentTab] = useState('recommendations');
  const [myRecs, setMyRecs] = useState([]);
  const [myRoutes, setMyRoutes] = useState([]);
  const [contentLoading, setContentLoading] = useState(false);

  const activeData = contentTab === 'recommendations' ? myRecs : myRoutes;

  const { userData, stats, loading: profileLoading, refresh } = useProfileData({
    uid,
    user: currentUser,
  });

  // Privacy: do not show email + price preferences (budget/travelStyle)
  const publicUserData = useMemo(() => {
    if (!userData) return userData;

    const smartProfile = userData?.smartProfile ? { ...userData.smartProfile } : null;
    if (smartProfile) {
      delete smartProfile.travelStyle;
      delete smartProfile.budget;
      delete smartProfile.budgetTag;
      delete smartProfile.travelStyleTag;
    }

    return {
      ...userData,
      email: '',
      smartProfile,
    };
  }, [userData]);

  const smartBadges = useMemo(
    () => getSmartProfileBadges(publicUserData?.smartProfile),
    [publicUserData?.smartProfile]
  );

  const renderTileImage = useCallback((uri) => {
    if (!uri) return null;

    // On web, routes/recommendations might contain leftover local preview URIs (blob:)
    // that were never uploaded. Those are not accessible to other users and can
    // trigger: "Not allowed to load local resource: blob:".
    if (typeof uri === 'string' && uri.startsWith('blob:')) return null;

    if (Platform.OS === 'web') {
      return (
        <img
          src={uri}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      );
    }

    return <Image source={{ uri }} style={styles.tileImage} resizeMode="cover" />;
  }, []);

  const RecommendationTile = useCallback(
    ({ item }) => {
      const imageUriRaw = Array.isArray(item?.images) && item.images.length ? item.images[0] : null;
      const imageUri = typeof imageUriRaw === 'string' && imageUriRaw.startsWith('blob:') ? null : imageUriRaw;
      const title = item?.title || item?.name || item?.location || 'המלצה';

      return (
        <TouchableOpacity
          style={styles.tile}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('RecommendationDetail', { item })}
        >
          <View style={styles.tileImageWrap}>
            {imageUri ? (
              renderTileImage(imageUri)
            ) : (
              <View style={styles.tileImagePlaceholder} />
            )}
          </View>
          <Text style={styles.tileTitle} numberOfLines={2}>
            {title}
          </Text>
        </TouchableOpacity>
      );
    },
    [navigation, renderTileImage]
  );

  const RouteTile = useCallback(
    ({ item }) => {
      const thumbnailUrlRaw = Array.isArray(item?.tripDaysData)
        ? item.tripDaysData.find((day) => day?.image)?.image || null
        : null;
      const thumbnailUrl = typeof thumbnailUrlRaw === 'string' && thumbnailUrlRaw.startsWith('blob:') ? null : thumbnailUrlRaw;
      const title = item?.Title || item?.title || 'טיול';

      return (
        <TouchableOpacity
          style={styles.tile}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('RouteDetail', { routeData: item })}
        >
          <View style={styles.tileImageWrap}>
            {thumbnailUrl ? (
              renderTileImage(thumbnailUrl)
            ) : (
              <View style={styles.tileImagePlaceholder} />
            )}
          </View>
          <Text style={styles.tileTitle} numberOfLines={2}>
            {title}
          </Text>
        </TouchableOpacity>
      );
    },
    [navigation, renderTileImage]
  );

  const loadContent = useCallback(async () => {
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
      setMyRecs(recSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

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
      setMyRoutes(routesSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.log('loadContent error:', e?.message || e);
    } finally {
      setContentLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      refresh?.();
      loadContent();
    });
    return unsubscribe;
  }, [navigation, refresh, loadContent]);

  const header = useMemo(() => {
    const recCount = myRecs.length;
    const routesCount = myRoutes.length;

    return (
      <View>
        <View style={styles.topRow}>
          <BackButton color="dark" variant="solid" />
          <Text style={styles.title}>פרופיל</Text>
          <View style={{ width: 40 }} />
        </View>

        {profileLoading ? (
          <View style={[common.loadingContainer, { paddingVertical: 18 }]}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : (
          <>
            <ProfileHeader
              userData={publicUserData}
              stats={stats}
              smartBadges={smartBadges}
              onPickImage={undefined}
              uploading={false}
              onEditSmartProfile={undefined}
            />
            <ProfileStatsCard stats={stats} />
          </>
        )}

        {/* Tabs (same style as ProfileScreen) */}
        <View style={{ marginTop: 14 }}>
          <View style={styles.tabRow}>
            <TouchableOpacity
              onPress={() => setContentTab('recommendations')}
              style={[
                styles.tabBtn,
                {
                  borderBottomColor:
                    contentTab === 'recommendations' ? colors.textPrimary : 'transparent',
                },
              ]}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.tabText,
                  { opacity: contentTab === 'recommendations' ? 1 : 0.5 },
                ]}
              >
                המלצות 
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setContentTab('routes')}
              style={[
                styles.tabBtn,
                {
                  borderBottomColor: contentTab === 'routes' ? colors.textPrimary : 'transparent',
                },
              ]}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.tabText,
                  { opacity: contentTab === 'routes' ? 1 : 0.5 },
                ]}
              >
                טיולים 
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
    );
  }, [profileLoading, publicUserData, stats, smartBadges, myRecs.length, myRoutes.length, contentTab, contentLoading]);

  const renderItem = useCallback(
    ({ item }) => {
      if (contentLoading) return null;

      if (contentTab === 'recommendations') {
        return (
          <View style={styles.gridItem}>
            <RecommendationTile item={item} />
          </View>
        );
      }

      // Routes: show the actual RouteCard (routes typically don't have a stable cover photo)
      const isOwner = currentUser && item.userId === currentUser.uid;
      return (
        <RouteCard
          item={item}
          onPress={() => navigation.navigate('RouteDetail', { routeData: item })}
          isOwner={isOwner}
          showActionBar={false}
          showActionMenu={false}
        />
      );
    },
    [contentLoading, contentTab, currentUser, navigation, RecommendationTile]
  );

  return (
    <SafeAreaView style={common.container}>
      <FlatList
        key={contentTab}
        data={activeData}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={contentTab === 'routes' ? { marginBottom: 12 } : null}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={
          contentTab === 'routes'
            ? { paddingHorizontal: 12, paddingBottom: 40 }
            : { ...common.profileScrollContent, paddingHorizontal: 12 }
        }
        renderItem={renderItem}
        ListEmptyComponent={
          !contentLoading ? (
            <View style={{ paddingTop: 18, paddingHorizontal: 16 }}>
              <Text style={styles.emptyHint}>
                {contentTab === 'recommendations' ? 'אין המלצות עדיין.' : 'אין טיולים עדיין.'}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
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
  emptyHint: {
    opacity: 0.6,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  columnWrapper: {
    justifyContent: 'space-between',
  },
  gridItem: {
    marginTop: 12,
    flexBasis: '50%',
    maxWidth: '50%',
    paddingHorizontal: 6,
  },
  tile: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  tileImageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#F3F4F6',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileImagePlaceholder: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  tileTitle: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    writingDirection: 'rtl',
    textAlign: 'right',
    minHeight: 40,
  },
});
