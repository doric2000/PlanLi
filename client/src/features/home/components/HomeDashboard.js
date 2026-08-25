import React, { useMemo } from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import RtlHorizontalScrollView from '../../../components/RtlHorizontalScrollView';
import { colors, homeScreenStyles as styles } from '../../../styles';
import { getRecommendationImageUrls, getRouteImageUrls } from '../../../utils/mediaAssets';
import { getRouteDestinationPreviews } from '../../roadtrip/utils/routeDestinationPreviews';

const CONTENT_FALLBACK_GRADIENTS = {
  route: ['#31557E', '#1E3A5F'],
  recommendation: ['#F5961D', '#B85E18'],
};

function numericCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function getDraftSummary(draft) {
  const days = Array.isArray(draft?.days) ? draft.days : [];
  const dayCount = numericCount(draft?.dayCount) || days.length;
  const stopCount = days.reduce(
    (total, day) => total + (Array.isArray(day?.stops) ? day.stops.length : 0),
    0,
  );
  const cityName = draft?.area?.cityName || draft?.area?.name || '';
  const countryName = draft?.area?.countryName || '';
  const location = [cityName, countryName].filter(Boolean).join(' · ');
  const metrics = [
    dayCount ? `${dayCount} ${dayCount === 1 ? 'יום' : 'ימים'}` : '',
    stopCount ? `${stopCount} תחנות` : '',
  ].filter(Boolean).join(' · ');
  return [location, metrics].filter(Boolean).join('  ·  ');
}

function continuationContent(draft, recentDestination) {
  if (draft) {
    return {
      mode: 'draft',
      icon: 'map-outline',
      eyebrow: 'ממשיכים לתכנן',
      title: draft.title || 'המסלול שבנית',
      description: getDraftSummary(draft) || 'הטיוטה שלך מחכה בדיוק מהמקום שבו עצרת.',
      actionLabel: 'המשך תכנון',
    };
  }
  if (recentDestination) {
    const name = recentDestination.name || recentDestination.id;
    return {
      mode: 'recent',
      icon: 'location-outline',
      eyebrow: 'חוזרים ליעד',
      title: `ממשיכים לגלות את ${name}`,
      description: [recentDestination.countryName, 'המלצות, מסלולים ורעיונות מחכים לך'].filter(Boolean).join(' · '),
      actionLabel: 'לכל מה שיש ביעד',
    };
  }
  return {
    mode: 'new',
    icon: 'compass-outline',
    eyebrow: 'מתחילים מכאן',
    title: 'הטיול הבא מתחיל כאן',
    description: 'בחרו יעד, אספו השראה והפכו אותה למסלול שאפשר לצאת איתו לדרך.',
    actionLabel: 'בחירת יעד',
  };
}

export function HomeContinuationCard({
  loading,
  error,
  draft,
  recentDestination,
  onPress,
  onRetry,
}) {
  const hasContinuation = Boolean(draft || recentDestination);

  if (loading && !hasContinuation) {
    return (
      <View style={[styles.continuationCard, styles.continuationLoading]} testID="home-continuation-loading">
        <ActivityIndicator color={colors.white} />
        <AppText style={styles.continuationLoadingText}>בודקים איפה ממשיכים…</AppText>
      </View>
    );
  }

  if (error && !hasContinuation) {
    return (
      <View style={[styles.continuationCard, styles.continuationError]} testID="home-continuation-error">
        <View style={styles.continuationIcon}>
          <Ionicons name="cloud-offline-outline" size={24} color={colors.primary} />
        </View>
        <View style={styles.continuationErrorCopy}>
          <AppText style={styles.continuationErrorTitle}>לא הצלחנו לטעון את התכנון</AppText>
          <AppText style={styles.continuationErrorText}>אפשר לנסות שוב בלי לעכב את שאר עמוד הבית.</AppText>
        </View>
        <TouchableOpacity
          onPress={onRetry}
          style={styles.inlineRetryButton}
          accessibilityRole="button"
          accessibilityLabel="ניסיון נוסף לטעינת התכנון"
          testID="home-continuation-retry"
        >
          <AppText style={styles.inlineRetryText}>ניסיון נוסף</AppText>
        </TouchableOpacity>
      </View>
    );
  }

  const content = continuationContent(draft, recentDestination);
  return (
    <LinearGradient
      colors={content.mode === 'recent' ? ['#31557E', '#203B5D'] : ['#28486D', '#172F4C']}
      start={{ x: 1, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.continuationCard}
      testID={`home-continuation-${content.mode}`}
    >
      <View pointerEvents="none" style={[styles.continuationGlow, styles.continuationGlowLarge]} />
      <View pointerEvents="none" style={[styles.continuationGlow, styles.continuationGlowSmall]} />
      <View style={styles.continuationTopRow}>
        <View style={styles.continuationIcon}>
          <Ionicons name={content.icon} size={24} color={colors.primary} />
        </View>
        <AppText style={styles.continuationEyebrow}>{content.eyebrow}</AppText>
      </View>
      <AppText style={styles.continuationTitle} numberOfLines={2}>{content.title}</AppText>
      <AppText style={styles.continuationDescription} numberOfLines={2}>{content.description}</AppText>
      {loading ? (
        <View
          style={styles.continuationRefreshNotice}
          accessibilityRole="status"
          accessibilityLabel="מרעננים את פרטי התכנון"
          testID="home-continuation-refreshing"
        >
          <ActivityIndicator size="small" color={colors.white} />
          <AppText style={styles.continuationRefreshNoticeText}>מרעננים את פרטי התכנון…</AppText>
        </View>
      ) : error ? (
        <TouchableOpacity
          onPress={onRetry}
          style={styles.continuationRefreshNotice}
          accessibilityRole="button"
          accessibilityLabel="פרטי התכנון לא עודכנו, ניסיון נוסף"
          testID="home-continuation-stale-error"
        >
          <Ionicons name="cloud-offline-outline" size={17} color={colors.white} />
          <AppText style={styles.continuationRefreshNoticeText}>הפרטים לא עודכנו · ניסיון נוסף</AppText>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={styles.continuationAction}
        accessibilityRole="button"
        accessibilityLabel={content.actionLabel}
        testID="home-continuation-action"
      >
        <Ionicons name="arrow-back" size={18} color={colors.primary} />
        <AppText style={styles.continuationActionText}>{content.actionLabel}</AppText>
      </TouchableOpacity>
    </LinearGradient>
  );
}

export function HomeQuickActions({ onCreateRoute, onOpenCommunity, onOpenFavorites }) {
  const actions = [
    {
      key: 'route',
      icon: 'map-outline',
      label: 'בניית מסלול',
      hint: 'מתכננים יום־יום',
      onPress: onCreateRoute,
    },
    {
      key: 'community',
      icon: 'people-outline',
      label: 'הקהילה',
      hint: 'מגלים המלצות',
      onPress: onOpenCommunity,
    },
    {
      key: 'favorites',
      icon: 'bookmark-outline',
      label: 'השמורים שלי',
      hint: 'חוזרים לרעיונות',
      onPress: onOpenFavorites,
    },
  ];

  return (
    <View style={styles.quickSection}>
      <AppText style={styles.sectionTitle}>מה אפשר לעשות עכשיו?</AppText>
      <View style={styles.quickActionsRow}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.key}
            onPress={action.onPress}
            activeOpacity={0.78}
            style={styles.quickAction}
            accessibilityRole="button"
            accessibilityLabel={`${action.label}, ${action.hint}`}
            testID={`home-quick-action-${action.key}`}
          >
            <View style={styles.quickActionIcon}>
              <Ionicons name={action.icon} size={22} color={colors.primary} />
            </View>
            <AppText style={styles.quickActionLabel} numberOfLines={2}>{action.label}</AppText>
            <AppText style={styles.quickActionHint} numberOfLines={2}>{action.hint}</AppText>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function routeCardMeta(item) {
  const dayCount = numericCount(item?.dayCount) || (Array.isArray(item?.days) ? item.days.length : 0);
  const destinations = getRouteDestinationPreviews(item, 2).map((destination) => destination.name);
  return [
    dayCount ? `${dayCount} ${dayCount === 1 ? 'יום' : 'ימים'}` : '',
    destinations.join(' · '),
  ].filter(Boolean).join('  ·  ') || 'מסלול מהקהילה';
}

function recommendationCardMeta(item) {
  const destination = item?.destination || {};
  const place = [destination.cityName, destination.countryName].filter(Boolean).join(', ');
  return place || item?.category || item?.description || 'המלצה מהקהילה';
}

function HomeContentCard({ item, kind, personalized, index, onPress }) {
  const isRoute = kind === 'route';
  const imageUrl = isRoute
    ? getRouteImageUrls(item, 'thumb')[0] || item?.thumbnail_url || null
    : getRecommendationImageUrls(item, 'thumb')[0] || item?.thumbnail_url || null;
  const title = item?.title || (isRoute ? 'מסלול לטיול הבא' : 'המלצה ששווה לשמור');
  const meta = isRoute ? routeCardMeta(item) : recommendationCardMeta(item);

  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      activeOpacity={0.88}
      style={styles.contentCard}
      accessibilityRole="button"
      accessibilityLabel={`פתיחת ${isRoute ? 'המסלול' : 'ההמלצה'}: ${title}`}
      testID={`home-${kind}-card-${item?.id || index}`}
    >
      <View style={styles.contentImageWrap}>
        {imageUrl ? (
          <CachedImage
            source={{ uri: imageUrl }}
            style={styles.contentImage}
            contentFit="cover"
            priority={index === 0 ? 'normal' : 'low'}
          />
        ) : (
          <LinearGradient
            colors={CONTENT_FALLBACK_GRADIENTS[kind]}
            style={styles.contentFallback}
          >
            <Ionicons
              name={isRoute ? 'map-outline' : 'camera-outline'}
              size={34}
              color="rgba(255,255,255,0.78)"
            />
          </LinearGradient>
        )}
        <LinearGradient
          pointerEvents="none"
          colors={['transparent', 'rgba(10,20,40,0.42)']}
          style={styles.contentImageShade}
        />
        {personalized ? (
          <View style={styles.personalizedBadge}>
            <Ionicons name="sparkles" size={12} color={colors.primary} />
            <AppText style={styles.personalizedBadgeText}>מותאם לך</AppText>
          </View>
        ) : null}
      </View>
      <View style={styles.contentCardCopy}>
        <AppText style={styles.contentCardTitle} numberOfLines={2}>{title}</AppText>
        <View style={styles.contentCardMetaRow}>
          <Ionicons
            name={isRoute ? 'calendar-clear-outline' : 'location-outline'}
            size={14}
            color={colors.textMuted}
          />
          <AppText style={styles.contentCardMeta} numberOfLines={1}>{meta}</AppText>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function RailStatus({ kind, error, onRetry, onSeeAll }) {
  return (
    <View style={styles.railStatus} testID={`home-${kind}-${error ? 'error' : 'empty'}`}>
      <View style={styles.railStatusIcon}>
        <Ionicons
          name={error ? 'cloud-offline-outline' : kind === 'route' ? 'map-outline' : 'bulb-outline'}
          size={24}
          color={colors.primary}
        />
      </View>
      <View style={styles.railStatusCopy}>
        <AppText style={styles.railStatusTitle}>
          {error ? 'לא הצלחנו לטעון כרגע' : kind === 'route' ? 'עוד לא נמצאו מסלולים' : 'עוד לא נמצאו המלצות'}
        </AppText>
        <AppText style={styles.railStatusText}>
          {error ? 'שאר עמוד הבית ממשיך לעבוד כרגיל.' : 'אפשר לעבור לעמוד המלא ולגלות עוד.'}
        </AppText>
      </View>
      <TouchableOpacity
        onPress={error ? onRetry : onSeeAll}
        style={styles.railStatusAction}
        accessibilityRole="button"
        accessibilityLabel={error ? 'ניסיון נוסף' : 'פתיחת העמוד המלא'}
      >
        <AppText style={styles.railStatusActionText}>{error ? 'לנסות שוב' : 'לגלות עוד'}</AppText>
      </TouchableOpacity>
    </View>
  );
}

function RailRefreshNotice({ kind, loading, error, onRetry }) {
  if (!loading && !error) return null;
  if (loading) {
    return (
      <View
        style={styles.railRefreshNotice}
        accessibilityRole="status"
        accessibilityLabel="מרעננים את התוכן"
        testID={`home-${kind}-refreshing`}
      >
        <ActivityIndicator size="small" color={colors.navActive} />
        <AppText style={styles.railRefreshNoticeText}>מרעננים…</AppText>
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onRetry}
      style={styles.railRefreshNotice}
      accessibilityRole="button"
      accessibilityLabel="התוכן לא עודכן, ניסיון נוסף"
      testID={`home-${kind}-stale-error`}
    >
      <Ionicons name="cloud-offline-outline" size={17} color={colors.navActive} />
      <AppText style={styles.railRefreshNoticeText}>לא הצלחנו לרענן · ניסיון נוסף</AppText>
    </TouchableOpacity>
  );
}

export function HomeContentRail({
  kind,
  items,
  loading,
  error,
  mode,
  onRetry,
  onSeeAll,
  onItemPress,
}) {
  const personalized = mode === 'personalized';
  const isRoute = kind === 'route';
  const hasItems = Boolean(items?.length);
  const title = useMemo(() => {
    if (isRoute) return personalized ? 'מסלולים שמתאימים לך' : 'מסלולים חדשים';
    return personalized ? 'המלצות בשבילך' : 'חדש מהקהילה';
  }, [isRoute, personalized]);
  const subtitle = personalized
    ? 'לפי ההעדפות והפעילות שלך'
    : isRoute ? 'רעיונות שאפשר להפוך לטיול' : 'מקומות וחוויות שעלו לאחרונה';

  return (
    <View style={styles.contentSection} testID={`home-${kind}-section`}>
      <View style={styles.contentSectionHeader}>
        <View style={styles.contentSectionHeading}>
          <AppText style={styles.sectionTitle}>{title}</AppText>
          <AppText style={styles.sectionSubtitle}>{subtitle}</AppText>
        </View>
        <TouchableOpacity
          onPress={onSeeAll}
          style={styles.sectionLinkButton}
          accessibilityRole="button"
          accessibilityLabel={isRoute ? 'הצגת כל המסלולים' : 'הצגת כל ההמלצות'}
        >
          <AppText style={styles.sectionLink}>לכל העמוד</AppText>
          <Ionicons name="chevron-back" size={15} color={colors.navActive} />
        </TouchableOpacity>
      </View>

      {loading && !hasItems ? (
        <View style={styles.railSkeletonRow} testID={`home-${kind}-loading`}>
          {[0, 1].map((index) => (
            <View key={index} style={styles.railSkeletonCard}>
              <View style={styles.railSkeletonImage} />
              <View style={styles.railSkeletonLineWide} />
              <View style={styles.railSkeletonLineShort} />
            </View>
          ))}
        </View>
      ) : !hasItems ? (
        <RailStatus kind={kind} error={error} onRetry={onRetry} onSeeAll={onSeeAll} />
      ) : (
        <>
          <RailRefreshNotice
            kind={kind}
            loading={loading}
            error={error}
            onRetry={onRetry}
          />
          <RtlHorizontalScrollView contentContainerStyle={styles.contentRail}>
            {items.map((item, index) => (
              <HomeContentCard
                key={item?.id || `${kind}-${index}`}
                item={item}
                kind={kind}
                personalized={personalized && Boolean(item?.personalization)}
                index={index}
                onPress={onItemPress}
              />
            ))}
          </RtlHorizontalScrollView>
        </>
      )}
    </View>
  );
}
