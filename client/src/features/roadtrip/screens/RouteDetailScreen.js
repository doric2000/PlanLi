import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StatusBar, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { CommentsModal } from '../../../components/CommentsModal';
import ContentDetailAuthorRow from '../../../components/ContentDetailAuthorRow';
import LikesModal from '../../../components/LikesModal';
import MetadataLine from '../../../components/MetadataLine';
import { RecommendationActionBar } from '../../../components/RecommendationActionBar';
import { RecommendationHero } from '../../../components/RecommendationHero';
import RtlHorizontalScrollView from '../../../components/RtlHorizontalScrollView';
import UsefulFactItem from '../../../components/UsefulFactItem';
import { auth } from '../../../config/firebase';
import { useAdminClaim } from '../../../hooks/useAdminClaim';
import { useAuthUser } from '../../../hooks/useAuthUser';
import { useUserData } from '../../../hooks/useUserData';
import { useMeaningfulPersonalizationView } from '../../../hooks/useMeaningfulPersonalizationView';
import { loadRouteDetails, recordRouteView } from '../../../services/RouteService';
import { colors, routeDetailScreenStyles as styles } from '../../../styles';
import { getBudgetLabel } from '../../../constants/travelTaxonomy';
import { canManageContent } from '../../../utils/contentPermissions';
import { getRouteImageUrls } from '../../../utils/mediaAssets';
import { recommendationDetailStyles as detailStyles } from '../../community/components/recommendationDetailStyles';
import { useCommentsCount } from '../../community/hooks/useCommentsCount';
import { useLikes } from '../../community/hooks/useLikes';
import { useContentPublish } from '../../publishing/ContentPublishContext';
import RouteItinerary from '../components/RouteItinerary';
import RouteMapPreview from '../components/RouteMapPreview';
import { buildRouteDetailPresentation } from '../utils/routeDetailPresentation';
import { getRouteDestinationPreviews } from '../utils/routeDestinationPreviews';
import { flattenRouteStops, getRouteDayStops, hasValidStopLocation } from '../utils/routeStops';
import { markNoyaContentViewed } from '../../profile/services/NoyaOnboardingStorage';

const EXTRA_ICONS = {
  difficulty: 'terrain',
  experience: 'hiking',
  transport: 'directions-car',
  pace: 'speed',
  seasons: 'wb-sunny',
  travelerStyles: 'explore',
};

function ExpandableDescription({ text }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = String(text || '').trim().length > 180;
  if (!text) return null;
  return (
    <View>
      <AppText style={detailStyles.body} numberOfLines={!expanded && canExpand ? 3 : undefined}>{text}</AppText>
      {canExpand ? (
        <Pressable
          style={styles.descriptionToggle}
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          testID="route-description-toggle"
        >
          <AppText style={styles.descriptionToggleText}>{expanded ? 'צמצום' : 'הצגת ההמשך'}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function RouteDetailScreen({ route, navigation }) {
  const initialRouteData = route?.params?.routeData || null;
  const requestedRouteId = route?.params?.routeId
    || initialRouteData?.id
    || initialRouteData?.routeId
    || '';
  const [routeData, setRouteData] = useState(initialRouteData);
  const [loadingRoute, setLoadingRoute] = useState(!initialRouteData && !!requestedRouteId);
  const [routeError, setRouteError] = useState('');
  const requestIdRef = useRef(0);
  const { completedVersionByType = {} } = useContentPublish();
  const routePublishVersion = Number(completedVersionByType.route || 0);
  const completedRouteVersionRef = useRef(routePublishVersion);

  const loadCanonicalRoute = useCallback(async () => {
    if (!requestedRouteId) {
      setRouteData(null);
      setRouteError('המסלול שאליו הפנתה ההתראה אינו זמין עוד.');
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoadingRoute(true);
    setRouteError('');
    try {
      const loaded = await loadRouteDetails(requestedRouteId);
      if (requestIdRef.current !== requestId) return;
      if (!loaded) {
        setRouteData(null);
        setRouteError('המסלול הוסר או שאינו זמין כרגע.');
        return;
      }
      setRouteData(loaded);
    } catch {
      if (requestIdRef.current === requestId) {
        setRouteData(null);
        setRouteError('לא הצלחנו לטעון את המסלול. אפשר לנסות שוב.');
      }
    } finally {
      if (requestIdRef.current === requestId) setLoadingRoute(false);
    }
  }, [requestedRouteId]);

  useEffect(() => {
    const initialId = initialRouteData?.id || initialRouteData?.routeId || '';
    if (initialRouteData && (!requestedRouteId || initialId === requestedRouteId)) {
      setRouteData(initialRouteData);
      setLoadingRoute(false);
      setRouteError('');
      return undefined;
    }
    loadCanonicalRoute();
    return () => { requestIdRef.current += 1; };
  }, [initialRouteData, loadCanonicalRoute, requestedRouteId]);

  useEffect(() => {
    if (completedRouteVersionRef.current === routePublishVersion) return;
    completedRouteVersionRef.current = routePublishVersion;
    loadCanonicalRoute();
  }, [loadCanonicalRoute, routePublishVersion]);

  const loadedRouteId = routeData?.id || routeData?.routeId || '';
  const routeReady = !!routeData && (!requestedRouteId || loadedRouteId === requestedRouteId);
  const pendingRoute = loadingRoute || (!routeReady && !!requestedRouteId && !routeError);
  if (!routeReady) {
    return (
      <SafeAreaView style={detailStyles.screen} edges={['top', 'left', 'right', 'bottom']}>
        <View style={[styles.page, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
          {pendingRoute ? <ActivityIndicator size="large" color={colors.primary} /> : (
            <Ionicons name="information-circle-outline" size={44} color={colors.textSecondary} />
          )}
          <AppText accessibilityRole={routeError ? 'alert' : undefined} style={[detailStyles.body, { marginTop: 12, textAlign: 'center' }]}>
            {pendingRoute ? 'טוענים את המסלול…' : routeError}
          </AppText>
          {!pendingRoute && routeError ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ניסיון נוסף לטעינת המסלול"
              onPress={loadCanonicalRoute}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 18 }}
            >
              <AppText style={{ color: colors.primary }}>ניסיון נוסף</AppText>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <RouteDetailLoaded
      routeData={routeData}
      navigation={navigation}
      initialCommentsOpen={route?.params?.openComments === true}
      initialCommentId={route?.params?.commentId || null}
    />
  );
}

function RouteDetailLoaded({ routeData, navigation, initialCommentsOpen, initialCommentId }) {
  const insets = useSafeAreaInsets();
  const routeId = routeData?.id || routeData?.routeId || '';
  const days = Array.isArray(routeData?.days) ? routeData.days : [];
  const allStops = useMemo(() => flattenRouteStops(days), [days]);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const activeDay = days[activeDayIndex] || days[0] || null;
  const activeStops = useMemo(() => getRouteDayStops(days, activeDayIndex), [activeDayIndex, days]);
  const activePreciseStops = useMemo(() => activeStops.filter(hasValidStopLocation), [activeStops]);
  const hiddenMapStopCount = Math.max(0, activeStops.length - activePreciseStops.length);
  const author = useUserData(routeData?.ownerId);
  const { isAdmin } = useAdminClaim();
  const { isActive } = useAuthUser();
  const images = useMemo(() => getRouteImageUrls(routeData, 'large'), [routeData]);
  const destinations = useMemo(() => getRouteDestinationPreviews(routeData, 4), [routeData]);
  const presentation = useMemo(() => buildRouteDetailPresentation(routeData), [routeData]);
  const budgetValue = routeData?.facets?.budgetLevel || routeData?.attributes?.budgetLevel || '';
  const budgetLabel = getBudgetLabel(budgetValue) || 'מחיר לא צוין';
  const { isLiked, likeCount, toggleLike } = useLikes('routes', routeId, routeData?.stats?.likeCount || 0);
  const commentsCount = useCommentsCount('routes', routeId);
  const [likesVisible, setLikesVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(initialCommentsOpen);
  const canEdit = isActive && canManageContent({ user: auth.currentUser, ownerId: routeData?.ownerId, isAdmin });
  const destinationLabel = destinations.map((item) => item.name).filter(Boolean).join(' · ');
  const personalizationItem = useMemo(() => ({ ...routeData, id: routeId }), [routeData, routeId]);
  useMeaningfulPersonalizationView({ item: personalizationItem, navigation, record: recordRouteView });

  useEffect(() => {
    if (activeDayIndex >= days.length) setActiveDayIndex(Math.max(0, days.length - 1));
  }, [activeDayIndex, days.length]);

  useEffect(() => {
    navigation.setOptions({ headerShown: false });
    markNoyaContentViewed().catch(() => {});
  }, [navigation]);

  useEffect(() => {
    if (initialCommentsOpen) setCommentsVisible(true);
  }, [initialCommentsOpen, initialCommentId]);

  const snapshotData = useMemo(() => ({
    name: routeData?.title,
    thumbnail_url: getRouteImageUrls(routeData, 'thumb')[0] || null,
    sub_text: routeData?.description ? routeData.description.slice(0, 100) : '',
    days: routeData?.dayCount,
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
            <AppText style={detailStyles.title}>{routeData?.title}</AppText>

            {!!destinationLabel && (
              <View style={styles.destinationRow}>
                <Ionicons name="location-outline" size={17} color={colors.primary} />
                <AppText style={styles.destinationText}>{destinationLabel}</AppText>
              </View>
            )}

            <ContentDetailAuthorRow
              author={{ ...author, contentCreatedAt: routeData?.createdAt }}
              ownerId={routeData?.ownerId}
              canEdit={canEdit}
              onEdit={editRoute}
              navigation={navigation}
              styles={detailStyles}
              editTestID="route-detail-edit"
            />

            <View style={styles.metricsRow}>
              <View style={styles.metric}>
                <Ionicons name="calendar-outline" size={19} color={colors.primary} />
                <AppText style={styles.metricValue} testID="route-day-count">{days.length || routeData?.dayCount || 0}</AppText>
                <AppText style={styles.metricLabel}>{days.length === 1 ? 'יום' : 'ימים'}</AppText>
              </View>
              <View style={styles.metric}>
                <Ionicons name="location-outline" size={19} color={colors.primary} />
                <AppText style={styles.metricValue} testID="route-stop-count">{allStops.length}</AppText>
                <AppText style={styles.metricLabel}>{allStops.length === 1 ? 'עצירה' : 'עצירות'}</AppText>
              </View>
              <View style={styles.metric}>
                <MaterialIcons name="payments" size={19} color={colors.primary} />
                <AppText style={[styles.metricValue, styles.metricValueCompact]} numberOfLines={1} testID="route-budget-label">{budgetLabel}</AppText>
                <AppText style={styles.metricLabel}>מחיר למסלול</AppText>
              </View>
            </View>

            {!!routeData?.description && (
              <View style={detailStyles.section}>
                <AppText style={detailStyles.sectionTitle}>על המסלול</AppText>
                <ExpandableDescription text={routeData.description} />
              </View>
            )}

            {days.length > 1 ? (
              <View style={styles.dayTabsSection}>
                <AppText style={styles.dayTabsTitle}>בחירת יום</AppText>
                <RtlHorizontalScrollView
                  contentContainerStyle={styles.dayTabsContent}
                  testID="route-day-tabs"
                >
                  {days.map((day, index) => {
                    const selected = index === activeDayIndex;
                    return (
                      <Pressable
                        key={day?.id || `route-day-tab-${index}`}
                        style={[styles.dayTab, selected && styles.dayTabSelected]}
                        onPress={() => setActiveDayIndex(index)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        testID={`route-day-tab-${index}`}
                      >
                        <AppText style={[styles.dayTabText, selected && styles.dayTabTextSelected]}>יום {index + 1}</AppText>
                      </Pressable>
                    );
                  })}
                </RtlHorizontalScrollView>
              </View>
            ) : null}

            <View style={detailStyles.section}>
              <AppText style={detailStyles.sectionTitle}>מפת יום {activeDayIndex + 1}</AppText>
              {activePreciseStops.length ? (
                <View style={styles.mapPreviewSpacing}>
                  <RouteMapPreview
                    stops={activeStops}
                    hiddenStopCount={hiddenMapStopCount}
                    onPress={() => navigation.navigate('RouteMap', { routeData, initialDayIndex: activeDayIndex })}
                  />
                </View>
              ) : (
                <View style={styles.mapUnavailable}>
                  <Ionicons name="map-outline" size={20} color={colors.textMuted} />
                  <AppText style={styles.mapUnavailableText}>אין ביום הזה נקודות מדויקות להצגה במפה.</AppText>
                </View>
              )}
              {!!hiddenMapStopCount && activePreciseStops.length ? (
                <View style={styles.mapPrecisionNotice} testID="route-map-hidden-stops-note">
                  <Ionicons name="information-circle-outline" size={17} color={colors.textSecondary} />
                  <AppText style={styles.mapPrecisionNoticeText}>
                    {hiddenMapStopCount === 1
                      ? 'עצירה אחת אינה מוצגת במפה כי אין לה נקודה מדויקת.'
                      : `${hiddenMapStopCount} עצירות אינן מוצגות במפה כי אין להן נקודה מדויקת.`}
                  </AppText>
                </View>
              ) : null}
            </View>

            <View style={detailStyles.section}>
              <AppText style={detailStyles.sectionTitle}>תוכנית היום</AppText>
              <View style={styles.itinerarySpacing}>
                <RouteItinerary
                  day={activeDay}
                  dayIndex={activeDayIndex}
                  dayCount={days.length}
                  onPreviousDay={() => setActiveDayIndex((index) => Math.max(0, index - 1))}
                  onNextDay={() => setActiveDayIndex((index) => Math.min(days.length - 1, index + 1))}
                  onOpenRecommendation={(postId) => navigation.navigate('RecommendationDetail', { postId })}
                />
              </View>
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
                <AppText style={detailStyles.sectionTitle}>מה יש במסלול</AppText>
                <MetadataLine icon="local-offer" values={tagsExpanded ? presentation.tags : presentation.tags.slice(0, 4)} style={detailStyles.metadataLine} testID="route-tags-metadata" />
                {presentation.tags.length > 4 ? (
                  <Pressable
                    style={styles.tagsToggle}
                    onPress={() => setTagsExpanded((value) => !value)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: tagsExpanded }}
                    testID="route-tags-toggle"
                  >
                    <AppText style={styles.tagsToggleText}>{tagsExpanded ? 'צמצום' : 'הצגת הכול'}</AppText>
                  </Pressable>
                ) : null}
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
                    </View>
                  ))}
                </View>
              </View>
            )}

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
      <CommentsModal
        visible={commentsVisible}
        onClose={() => setCommentsVisible(false)}
        postId={routeId}
        collectionName="routes"
        initialCommentId={initialCommentId}
      />
    </SafeAreaView>
  );
}
