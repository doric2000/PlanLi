import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { getDestinationImageUrl } from '../../../utils/destinationImages';
import { atlasPhotos } from '../../region/atlasAssets';
import { getDiscoveryScopeLabel } from '../../region/regionDefinitions';
import { colors } from '../../../styles';
import { homeRefreshStyles as styles, homeRefreshRailStyles } from '../../../styles/designRefresh';
import { HomeContentRail, HomeContinuationCard } from './HomeDashboard';

export function HomeRegionHero({ regionId, mode, onChangeRegion, onExplore }) {
  const scope = getDiscoveryScopeLabel({ regionId, mode });
  const global = mode === 'global';
  const title = global ? 'כל העולם פתוח בפניך' : scope ? `${scope} מחכה לך` : 'המקום הבא שלך מתחיל כאן';
  const action = global ? 'גלו המלצות מכל העולם' : scope ? `גלו המלצות ב${scope}` : 'בחרו לאן ממשיכים';
  return (
    <View style={styles.hero} testID="home-region-hero">
      <CachedImage source={atlasPhotos[regionId] || atlasPhotos.europe} style={styles.heroImage} contentFit="cover" priority="high" />
      <LinearGradient pointerEvents="none" colors={['rgba(10,26,43,0.3)', 'rgba(10,26,43,0.12)', 'rgba(10,26,43,0.86)']} style={styles.heroImage} />
      <View style={styles.heroTop}>
        <AppText style={styles.scope}>{global ? 'מגלים בלי גבולות · כל העולם' : scope ? `האזור שלך · ${scope}` : 'עולם שלם של אפשרויות'}</AppText>
        <Pressable onPress={onChangeRegion} accessibilityRole="button" accessibilityLabel="החלפת אזור" style={styles.changeRegion} testID="home-region-preview-change">
          <AppText style={styles.changeText}>החלפת אזור</AppText>
        </Pressable>
      </View>
      <View style={styles.heroCopy}>
        <AppText style={styles.heroTitle}>{title}</AppText>
        <AppText style={styles.heroSubtitle}>מקומות חדשים. רעיונות ששווה לשמור.</AppText>
        <Pressable onPress={scope ? onExplore : onChangeRegion} accessibilityRole="button" accessibilityLabel={action} style={styles.heroButton} testID="home-region-explore">
          <AppText style={styles.heroButtonText}>{action}</AppText>
          <Ionicons name="arrow-back-outline" size={18} color={colors.primary} />
        </Pressable>
      </View>
    </View>
  );
}

export function HomeSavedDestinations({ favorites = [], loading, error, reload, isGuest, onOpenFavorites, onOpenDestination }) {
  return (
    <View style={styles.section} testID="home-saved-destinations">
      <View style={styles.sectionHeader}>
        <AppText style={styles.sectionTitle}>יעדים ששמרת</AppText>
        <Pressable onPress={onOpenFavorites} accessibilityRole="button" style={styles.sectionLink}>
          <AppText style={styles.sectionLinkText}>לכל השמורים</AppText>
        </Pressable>
      </View>
      {loading && !favorites.length ? (
        <View style={styles.empty} testID="home-saved-loading"><ActivityIndicator color={colors.primary} /><AppText style={styles.emptyText}>טוענים את היעדים שלך…</AppText></View>
      ) : error && !favorites.length ? (
        <Pressable onPress={reload || onOpenFavorites} accessibilityRole="button" style={styles.empty} testID="home-saved-error">
          <AppText style={styles.savedTitle}>לא הצלחנו לטעון את השמורים</AppText>
          <AppText style={styles.emptyText}>לחצו לניסיון נוסף. שאר עמוד הבית זמין לכם.</AppText>
        </Pressable>
      ) : favorites.length ? (
        <View style={styles.savedRow}>
          {favorites.slice(0, 2).map((city) => {
            const name = city?.identity?.names?.he || city?.names?.he || city?.name || 'יעד שמור';
            const image = getDestinationImageUrl(city, 'feed');
            return (
              <Pressable key={`${city.countryId}:${city.id}`} onPress={() => onOpenDestination(city)} style={styles.savedCard} accessibilityRole="button" accessibilityLabel={`פתיחת היעד: ${name}`} testID={`home-saved-${city.id}`}>
                <View style={styles.savedPhoto}>
                  {image ? <CachedImage source={{ uri: image }} style={styles.heroImage} contentFit="cover" /> : <Ionicons name="location-outline" size={28} color={colors.primary} />}
                  <View style={styles.savedIcon} pointerEvents="none"><Ionicons name="bookmark" size={18} color={colors.primary} /></View>
                </View>
                <View style={styles.savedCopy}>
                  <AppText style={styles.savedTitle} numberOfLines={2}>{name}</AppText>
                  <AppText style={styles.savedMeta} numberOfLines={2}>{city.countryNames?.he || city.countryName || 'מקום ששווה לחזור אליו'}</AppText>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Pressable onPress={onOpenFavorites} accessibilityRole="button" style={styles.empty} testID="home-saved-empty">
          <Ionicons name="bookmark-outline" size={24} color={colors.primary} />
          <AppText style={styles.savedTitle}>{isGuest ? 'הרעיונות שלך, במקום אחד' : 'נשמר לך מקום לרעיון הבא'}</AppText>
          <AppText style={styles.emptyText}>{isGuest ? 'התחברו כדי לשמור יעדים ולחזור אליהם בהמשך.' : 'שמרו יעדים שאהבתם והם יחכו לכם כאן. המלצות ומסלולים שמורים מחכים בעמוד המועדפים.'}</AppText>
        </Pressable>
      )}
    </View>
  );
}

export default function HomeRefreshDashboard({
  regionId, mode, showRegion, isGuest, favoriteCities, onOpenProfile, onOpenFavorites,
  onOpenCommunity, onChangeRegion, onOpenDestination, continuation, routes, recommendations,
  preferencePrompt, onCreateRoute,
}) {
  const actions = [
    { id: 'favorites', icon: 'bookmark-outline', label: 'השמורים שלי', onPress: onOpenFavorites },
    { id: 'profile', icon: 'person-outline', label: isGuest ? 'התחברות' : 'הפרופיל שלי', onPress: onOpenProfile },
    { id: 'community', icon: 'people-outline', label: 'הקהילה', onPress: onOpenCommunity },
  ];
  return (
    <View style={styles.dashboard} testID="home-dashboard">
      <View style={styles.quickRow}>
        {actions.map((action) => (
          <Pressable key={action.id} onPress={action.onPress} style={styles.quick} accessibilityRole="button" accessibilityLabel={action.label} testID={`home-quick-action-${action.id}`}>
            <Ionicons name={action.icon} size={24} color={colors.primary} />
            <AppText style={styles.quickText}>{action.label}</AppText>
          </Pressable>
        ))}
      </View>
      {showRegion ? <HomeRegionHero regionId={regionId} mode={mode} onChangeRegion={onChangeRegion} onExplore={onOpenCommunity} /> : null}
      <HomeSavedDestinations {...favoriteCities} isGuest={isGuest} onOpenFavorites={onOpenFavorites} onOpenDestination={onOpenDestination} />
      <View style={styles.section}>
        <HomeContinuationCard {...continuation} appearanceStyles={homeRefreshRailStyles} />
        <Pressable onPress={onCreateRoute} accessibilityRole="button" style={styles.createRoute} testID="home-quick-action-route">
          <Ionicons name="add-outline" size={22} color={colors.primary} />
          <AppText style={styles.quickText}>בניית מסלול חדש</AppText>
        </Pressable>
      </View>
      {preferencePrompt}
      <HomeContentRail kind="recommendation" {...recommendations} appearanceStyles={homeRefreshRailStyles} />
      <HomeContentRail kind="route" {...routes} appearanceStyles={homeRefreshRailStyles} />
    </View>
  );
}
