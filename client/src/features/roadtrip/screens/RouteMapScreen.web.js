import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import {
  buildGoogleMapsDaySegments,
  buildGoogleMapsPlaceUrl,
  flattenRouteStops,
  hasValidStopLocation,
} from '../utils/routeStops';
import { colors, routeMapStyles as styles } from '../../../styles';
import { openSafeExternalUrl } from '../../../utils/safeExternalUrl';

const ALL_DAYS = 'all';

async function openUrl(url) {
  if (!url) return;
  try {
    await openSafeExternalUrl(url, 'googleMaps');
  } catch {
    Alert.alert('לא ניתן לפתוח את המפה', 'לא הצלחנו לפתוח את Google Maps. אפשר לנסות שוב.');
  }
}

export default function RouteMapScreen({ route, navigation }) {
  const { routeData } = route.params || {};
  const days = Array.isArray(routeData?.days) ? routeData.days : [];
  const requestedDayIndex = Number(route?.params?.initialDayIndex);
  const initialDayIndex = Number.isInteger(requestedDayIndex) && requestedDayIndex >= 0 && requestedDayIndex < days.length
    ? requestedDayIndex
    : 0;
  const [selectedDay, setSelectedDay] = useState(initialDayIndex);
  const allStops = useMemo(() => flattenRouteStops(routeData), [routeData]);
  const selectedStops = useMemo(() => (selectedDay === ALL_DAYS
    ? allStops
    : allStops.filter((stop) => stop.dayIndex === selectedDay)), [allStops, selectedDay]);
  const preciseStops = useMemo(() => selectedStops.filter(hasValidStopLocation), [selectedStops]);
  const directions = useMemo(() => selectedDay === ALL_DAYS
    ? []
    : buildGoogleMapsDaySegments(routeData, selectedDay), [routeData, selectedDay]);
  const hiddenStopCount = selectedStops.length - preciseStops.length;

  if (!routeData || !days.length) {
    return (
      <View style={styles.screen} testID="route-map-unavailable">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton} accessibilityLabel="חזרה למסלול">
            <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <AppText style={styles.headerTitle}>המפה אינה זמינה</AppText>
          <View style={styles.headerActionSpacer} />
        </View>
        <View style={styles.emptyState}><AppText style={styles.emptyTitle}>לא הצלחנו לטעון את פרטי המסלול.</AppText></View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="route-map-web-list">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton} accessibilityLabel="חזרה למסלול">
          <Ionicons name="chevron-forward" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <AppText style={styles.headerTitle} numberOfLines={1}>{routeData?.title || routeData?.Title || 'מפת המסלול'}</AppText>
          <AppText style={styles.headerSubtitle}>{selectedDay === ALL_DAYS ? 'כל המסלול' : `יום ${selectedDay + 1}`} · {preciseStops.length === 1 ? 'נקודה מדויקת אחת' : `${preciseStops.length} נקודות מדויקות`}</AppText>
        </View>
        <View style={styles.headerActionSpacer} />
      </View>

      {days.length > 1 ? (
        <View style={styles.mapDayTabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mapDayTabs}>
            {days.map((day, index) => (
              <Pressable
                key={day?.id || `web-day-${index}`}
                style={[styles.mapDayTab, selectedDay === index && styles.mapDayTabActive]}
                onPress={() => setSelectedDay(index)}
                accessibilityRole="tab"
                accessibilityState={{ selected: selectedDay === index }}
                testID={`route-map-day-${index}`}
              >
                <AppText style={[styles.mapDayTabText, selectedDay === index && styles.mapDayTabTextActive]}>יום {index + 1}</AppText>
              </Pressable>
            ))}
            <Pressable
              style={[styles.mapDayTab, selectedDay === ALL_DAYS && styles.mapDayTabActive]}
              onPress={() => setSelectedDay(ALL_DAYS)}
              accessibilityRole="tab"
              accessibilityState={{ selected: selectedDay === ALL_DAYS }}
              testID="route-map-all-days"
            >
              <AppText style={[styles.mapDayTabText, selectedDay === ALL_DAYS && styles.mapDayTabTextActive]}>כל המסלול</AppText>
            </Pressable>
          </ScrollView>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.webListContent}>
        <Ionicons name="map-outline" size={48} color={colors.textMuted} />
        <AppText style={styles.emptyTitle}>עצירות המסלול</AppText>
        <AppText style={styles.emptyText}>
          בגרסת האינטרנט אפשר לפתוח את העצירות והקטעים ב־Google Maps. באפליקציה מוצגת מפה אינטראקטיבית מלאה.
        </AppText>

        {!!hiddenStopCount && (
          <View style={styles.webNotice} testID="route-map-hidden-notice">
            <AppText style={styles.webNoticeText}>
              {hiddenStopCount === 1
                ? 'עצירה אחת אינה מוצגת כי אין לה נקודה מדויקת.'
                : `${hiddenStopCount} עצירות אינן מוצגות כי אין להן נקודה מדויקת.`}
            </AppText>
          </View>
        )}

        {directions.map((segment, index) => (
          <TouchableOpacity key={segment.id} style={styles.primaryButton} onPress={() => openUrl(segment.url)} testID={`route-map-segment-${index + 1}`}>
            <Ionicons name="navigate-outline" size={18} color={colors.white} />
            <AppText style={styles.primaryButtonText}>פתיחת קטע {index + 1} · עצירות {segment.startStopIndex + 1}–{segment.endStopIndex + 1}</AppText>
          </TouchableOpacity>
        ))}

        {selectedStops.map((stop) => {
          const canOpen = hasValidStopLocation(stop);
          const imageUrl = getMediaVariantUrl(stop.media, 'thumb', stop.image);
          return (
            <TouchableOpacity
              key={stop.id || `${stop.dayIndex}:${stop.stopIndex}`}
              style={[styles.webStopCard, !canOpen && styles.webStopCardDisabled]}
              onPress={() => canOpen && openUrl(buildGoogleMapsPlaceUrl(stop))}
              disabled={!canOpen}
            >
              {imageUrl ? (
                <CachedImage source={{ uri: imageUrl }} style={styles.webStopImage} contentFit="cover" priority="low" />
              ) : (
                <View style={styles.webStopNumber}><AppText style={styles.webStopNumberText}>{stop.stopIndex + 1}</AppText></View>
              )}
              <View style={styles.webStopCopy}>
                <AppText style={styles.webStopTitle}>{stop.title || stop.place?.name || `עצירה ${stop.stopIndex + 1}`}</AppText>
                <AppText style={styles.webStopAddress}>{stop.locationPrecision === 'general' ? 'אזור כללי' : stop.place?.address || stop.location}</AppText>
              </View>
              <Ionicons name={canOpen ? 'open-outline' : 'map-outline'} size={20} color={canOpen ? colors.primary : colors.textMuted} />
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
