import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Share, StatusBar, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { CommentsModal } from '../../../components/CommentsModal';
import ContentDetailAuthorRow from '../../../components/ContentDetailAuthorRow';
import LikesModal from '../../../components/LikesModal';
import MetadataLine from '../../../components/MetadataLine';
import { RecommendationActionBar } from '../../../components/RecommendationActionBar';
import { RecommendationHero } from '../../../components/RecommendationHero';
import UsefulFactItem from '../../../components/UsefulFactItem';
import { auth } from '../../../config/firebase';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { useUserData } from '../../../hooks/useUserData';
import { recordRouteOpen } from '../../../services/RouteService';
import { colors, routeDetailScreenStyles as styles } from '../../../styles';
import { canManageContent } from '../../../utils/contentPermissions';
import { getRouteImageUrls } from '../../../utils/mediaAssets';
import { recommendationDetailStyles as detailStyles } from '../../community/components/recommendationDetailStyles';
import { useCommentsCount } from '../../community/hooks/useCommentsCount';
import { useLikes } from '../../community/hooks/useLikes';
import PlacesRoute from '../components/PlacesRoute';
import RouteItinerary from '../components/RouteItinerary';
import RouteMapPreview from '../components/RouteMapPreview';
import { buildRouteDetailPresentation } from '../utils/routeDetailPresentation';
import { getRouteDestinationPreviews } from '../utils/routeDestinationPreviews';
import { flattenValidRouteStops } from '../utils/routeStops';

const EXTRA_ICONS = {
  difficulty: 'terrain',
  experience: 'hiking',
  transport: 'directions-car',
  pace: 'speed',
  seasons: 'wb-sunny',
  travelerStyles: 'explore',
};

export default function RouteDetailScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const { routeData } = route.params;
  const routeId = routeData?.id || routeData?.routeId || '';
  const days = Array.isArray(routeData?.days) ? routeData.days : [];
  const validStops = useMemo(() => flattenValidRouteStops(days), [days]);
  const author = useUserData(routeData?.ownerId);
  const { isAdmin } = useAdminClaim();
  const { isActive } = useAuthUser();
  const images = useMemo(() => getRouteImageUrls(routeData, 'large'), [routeData]);
  const destinations = useMemo(() => getRouteDestinationPreviews(routeData, 4), [routeData]);
  const presentation = useMemo(() => buildRouteDetailPresentation(routeData), [routeData]);
  const { isLiked, likeCount, toggleLike } = useLikes('routes', routeId, routeData?.stats?.likeCount || 0);
  const commentsCount = useCommentsCount('routes', routeId);
  const [likesVisible, setLikesVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const canEdit = isActive && canManageContent({ user: auth.currentUser, ownerId: routeData?.ownerId, isAdmin });
  const destinationLabel = destinations.map((item) => item.name).filter(Boolean).join(' · ');

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
    if (isActive && routeId) recordRouteOpen(routeId).catch(() => {});
  }, [isActive, navigation, routeId]);

  const snapshotData = useMemo(() => ({
    name: routeData?.title,
    thumbnail_url: getRouteImageUrls(routeData, 'thumb')[0] || null,
    sub_text: routeData?.description ? routeData.description.slice(0, 100) : '',
    days: routeData?.dayCount,
    distance: routeData?.distanceKm,
  }), [routeData]);

  const editRoute = () => navigation.navigate('AddRoutesScreen', { routeToEdit: routeData });
  const shareRoute = async () => {
    const message = [routeData?.title, routeData?.description, destinationLabel].filter(Boolean).join('\n\n');
    try {
      await Share.share({ title: routeData?.title, message });
    } catch {
      Alert.alert('השיתוף לא זמין', 'לא הצלחנו לפתוח את אפשרויות השיתוף כרגע.');
    }
  };

  return (
    <SafeAreaView style={detailStyles.screen} edges={['left', 'right']}>
      <StatusBar barStyle={images.length ? 'light-content' : 'dark-content'} translucent backgroundColor="transparent" />
      <View style={styles.page}>
        <ScrollView
          contentContainerStyle={[detailStyles.contentContainer, { paddingBottom: 116 + (insets.bottom || 0) }]}
          showsVerticalScrollIndicator={false}
        >
          <RecommendationHero
            item={routeData}
            snapshotData={snapshotData}
            favoriteType="routes"
            imageUrls={images}
            emptyIcon="route"
          />

          <View style={detailStyles.contentSurface} testID="route-detail-content">
            <View style={detailStyles.categoryRow}>
              <MaterialIcons name="route" size={19} color={colors.textSecondary} />
              <AppText style={detailStyles.categoryText}>מסלול טיול</AppText>
            </View>

            <AppText style={detailStyles.title}>{routeData?.title}</AppText>

            <ContentDetailAuthorRow
              author={{ ...author, contentCreatedAt: routeData?.createdAt }}
              ownerId={routeData?.ownerId}
              canEdit={canEdit}
              onEdit={editRoute}
              navigation={navigation}
              styles={detailStyles}
              editTestID="route-detail-edit"
            />

            {!!routeData?.description && (
              <View style={detailStyles.section}>
                <AppText style={detailStyles.sectionTitle}>על המסלול</AppText>
                <AppText style={detailStyles.body}>{routeData.description}</AppText>
              </View>
            )}

            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Ionicons name="calendar-outline" size={19} color={colors.primary} />
                <AppText style={styles.metricValue}>{routeData?.dayCount || days.length}</AppText>
                <AppText style={styles.metricLabel}>ימים</AppText>
              </View>
              <View style={styles.metric}>
                <Ionicons name="location-outline" size={19} color={colors.primary} />
                <AppText style={styles.metricValue}>{validStops.length}</AppText>
                <AppText style={styles.metricLabel}>תחנות</AppText>
              </View>
              <View style={styles.metric}>
                <Ionicons name="navigate-outline" size={19} color={colors.primary} />
                <AppText style={styles.metricValue}>{routeData?.distanceKm || 0}</AppText>
                <AppText style={styles.metricLabel}>ק״מ</AppText>
              </View>
            </View>

            <View style={detailStyles.section}>
              <AppText style={detailStyles.sectionTitle}>המסלול על המפה</AppText>
              {validStops.length ? (
                <>
                  <View style={styles.mapPreviewSpacing}>
                    <RouteMapPreview stops={validStops} onPress={() => navigation.navigate('RouteMap', { routeData })} />
                  </View>
                  {!!destinations.length && <PlacesRoute places={destinations} compact maximum={4} style={styles.destinationsSpacing} />}
                </>
              ) : (
                <View style={styles.mapUnavailable}>
                  <Ionicons name="map-outline" size={20} color={colors.textMuted} />
                  <AppText style={styles.mapUnavailableText}>אין נקודות מפה במסלול</AppText>
                </View>
              )}
            </View>

            {!!presentation.facts.length && (
              <View style={detailStyles.section}>
                <AppText style={detailStyles.sectionTitle}>פרטים שימושיים</AppText>
                <View style={detailStyles.factsGrid}>
                  {presentation.facts.map((fact) => (
                    <UsefulFactItem
                      key={fact.id}
                      {...fact}
                      style={[detailStyles.factItem, fact.id === 'audiences' && detailStyles.factItemFull]}
                      testID={`route-fact-${fact.id}`}
                    />
                  ))}
                </View>
              </View>
            )}

            {!!presentation.tags.length && (
              <View style={detailStyles.section}>
                <AppText style={detailStyles.sectionTitle}>מה תמצאו בדרך</AppText>
                <MetadataLine icon="local-offer" values={presentation.tags} style={detailStyles.metadataLine} testID="route-tags-metadata" />
              </View>
            )}

            {!!presentation.extras.length && (
              <View style={detailStyles.section}>
                <AppText style={detailStyles.sectionTitle}>מידע נוסף</AppText>
                {presentation.extras.map((group) => (
                  <View key={group.id} style={detailStyles.extraGroup}>
                    <AppText style={detailStyles.extraTitle}>{group.title}</AppText>
                    <MetadataLine
                      icon={EXTRA_ICONS[group.id] || group.icon || 'label-outline'}
                      values={group.values}
                      style={detailStyles.extraMetadataLine}
                      testID={`route-extra-${group.id}`}
                    />
                  </View>
                ))}
              </View>
            )}

            {!!presentation.needs.length && (
              <View style={detailStyles.section}>
                <AppText style={detailStyles.sectionTitle}>חשוב לדעת</AppText>
                <View style={detailStyles.needsList}>
                  {presentation.needs.map((need) => (
                    <View key={need} style={detailStyles.needRow}>
                      <View style={detailStyles.needIcon}><MaterialIcons name="info-outline" size={20} color={colors.textSecondary} /></View>
                      <AppText style={detailStyles.needText}>{need}</AppText>
                      <Ionicons name="chevron-back" size={17} color={colors.textMuted} />
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={detailStyles.section}>
              <AppText style={detailStyles.sectionTitle}>לו״ז המסלול</AppText>
              <View style={styles.itinerarySpacing}>
                <RouteItinerary days={days} />
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={[detailStyles.stickyBar, { paddingBottom: Math.max(insets.bottom || 0, 10) }]}>
          <RecommendationActionBar
            isLiked={isLiked}
            likeCount={likeCount}
            commentsCount={commentsCount}
            reportTarget={{ type: 'route', id: routeId }}
            ownerId={routeData?.ownerId}
            onCommentPress={() => setCommentsVisible(true)}
            onLikePress={toggleLike}
            onLikesListPress={() => setLikesVisible(true)}
            onSharePress={shareRoute}
            contentLabel="המסלול"
          />
        </View>
      </View>

      <LikesModal visible={likesVisible} onClose={() => setLikesVisible(false)} collectionName="routes" itemId={routeId} likeCount={likeCount} />
      <CommentsModal visible={commentsVisible} onClose={() => setCommentsVisible(false)} postId={routeId} collectionName="routes" />
    </SafeAreaView>
  );
}
