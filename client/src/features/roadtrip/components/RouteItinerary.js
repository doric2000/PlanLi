import React, { useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import CachedImage from '../../../components/CachedImage';
import MediaGalleryModal from '../../../components/MediaGalleryModal';
import OpenWithLocationSheet from '../../../components/OpenWithLocationSheet';
import { getMediaVariantUrl } from '../../../utils/mediaAssets';
import { colors, routeItineraryStyles as styles } from '../../../styles';
import {
  buildGoogleMapsPlaceUrl,
  buildWazePlaceUrl,
  getStopCoordinates,
  getStopMediaAssets,
} from '../utils/routeStops';

function galleryForDay(day, dayIndex) {
  const values = [];
  const add = (media, fallback, caption, id) => {
    const url = getMediaVariantUrl(media, 'large', fallback);
    if (!url || values.some((item) => item.url === url)) return;
    values.push({ id, url, media, caption });
  };
  add(day?.media, day?.image, `יום ${dayIndex + 1}`, `${day?.id || dayIndex}:cover`);
  (day?.stops || []).forEach((stop, index) => {
    const assets = getStopMediaAssets(stop);
    if (!assets.length) {
      add(null, stop?.image, stop?.title || `תחנה ${index + 1}`, stop?.id || `${dayIndex}:${index}`);
      return;
    }
    assets.forEach((asset, photoIndex) => add(
      asset,
      null,
      stop?.title || `תחנה ${index + 1}`,
      `${stop?.id || `${dayIndex}:${index}`}:photo:${photoIndex}`
    ));
  });
  return values;
}

export default function RouteItinerary({ days = [] }) {
  const { width } = useWindowDimensions();
  const [expandedDay, setExpandedDay] = useState(days.length ? 0 : null);
  const [gallery, setGallery] = useState({ visible: false, items: [], index: 0 });
  const [navigationStop, setNavigationStop] = useState(null);
  const twoColumns = width >= 720;

  const dayGalleries = useMemo(() => days.map(galleryForDay), [days]);
  const openGallery = (dayIndex, url) => {
    const items = dayGalleries[dayIndex] || [];
    const index = Math.max(0, items.findIndex((item) => item.url === url));
    if (items.length) setGallery({ visible: true, items, index });
  };

  return (
    <View style={styles.container} testID="route-itinerary">
      {days.map((day, dayIndex) => {
        const stops = Array.isArray(day?.stops) ? day.stops : [];
        const inferredDaySummary = stops.slice(0, 3)
          .map((stop) => stop?.title || stop?.place?.name || stop?.location)
          .filter(Boolean)
          .join(' · ');
        const isOpen = expandedDay === dayIndex;
        const dayItems = dayGalleries[dayIndex] || [];
        const coverUrl = dayItems[0]?.url || '';
        const coverThumb = getMediaVariantUrl(day?.media, 'thumb', day?.image)
          || stops.map((stop) => getMediaVariantUrl(stop?.media, 'thumb', stop?.image)).find(Boolean);
        return (
          <View key={day?.id || `day:${dayIndex}`} style={[styles.dayCard, isOpen && styles.dayCardOpen]}>
            <Pressable
              style={styles.dayHeader}
              onPress={() => setExpandedDay(isOpen ? null : dayIndex)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              testID={`route-day-toggle-${dayIndex}`}
            >
              {coverThumb ? (
                <Pressable
                  style={styles.dayImageButton}
                  onPress={() => openGallery(dayIndex, coverUrl)}
                  testID={`route-day-photo-${dayIndex}`}
                >
                  <CachedImage source={{ uri: coverThumb }} style={styles.dayImage} contentFit="cover" priority="low" />
                  <View style={styles.photoIndicator}><Ionicons name="images-outline" size={15} color={colors.white} /></View>
                </Pressable>
              ) : (
                <View style={styles.dayFallback}><AppText style={styles.dayFallbackText}>{dayIndex + 1}</AppText></View>
              )}
              <View style={styles.dayCopy}>
                <AppText style={styles.dayTitle}>יום {dayIndex + 1}</AppText>
                <AppText style={styles.dayDescription} numberOfLines={isOpen ? 3 : 2}>
                  {day?.description || inferredDaySummary}
                </AppText>
                <AppText style={styles.dayMeta}>{stops.length} תחנות</AppText>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={21} color={colors.textMuted} />
            </Pressable>

            {isOpen ? (
              <View style={styles.stopsGrid} testID={`route-day-stops-${dayIndex}`}>
                {stops.map((stop, stopIndex) => {
                  const thumb = getMediaVariantUrl(stop?.media, 'thumb', stop?.image);
                  const large = getMediaVariantUrl(stop?.media, 'large', stop?.image);
                  const canNavigate = Boolean(
                    buildGoogleMapsPlaceUrl(stop) || buildWazePlaceUrl(stop)
                  );
                  return (
                    <View
                      key={stop?.id || `${dayIndex}:${stopIndex}`}
                      style={[styles.stopCard, twoColumns && styles.stopCardWide]}
                      testID={`route-stop-card-${dayIndex}-${stopIndex}`}
                    >
                      {thumb ? (
                        <Pressable
                          style={styles.stopImageButton}
                          onPress={() => openGallery(dayIndex, large)}
                          testID={`route-stop-photo-${dayIndex}-${stopIndex}`}
                        >
                          <CachedImage source={{ uri: thumb }} style={styles.stopImage} contentFit="cover" priority="low" />
                          <View style={styles.stopNumberOverlay}><AppText style={styles.stopNumberOverlayText}>{stopIndex + 1}</AppText></View>
                        </Pressable>
                      ) : (
                        <View style={styles.stopNumber}><AppText style={styles.stopNumberText}>{stopIndex + 1}</AppText></View>
                      )}
                      <View style={styles.stopCopy}>
                        <AppText style={styles.stopTitle}>{stop?.title || stop?.place?.name}</AppText>
                        {!!stop?.description && <AppText style={styles.stopDescription} numberOfLines={3}>{stop.description}</AppText>}
                        <AppText style={styles.stopAddress} numberOfLines={2}>{stop?.place?.address || stop?.location || stop?.place?.name}</AppText>
                      </View>
                      <Pressable
                        style={[styles.mapButton, !canNavigate && styles.mapButtonDisabled]}
                        onPress={() => canNavigate && setNavigationStop(stop)}
                        disabled={!canNavigate}
                        accessibilityRole="button"
                        accessibilityLabel={`אפשרויות ניווט אל ${stop?.title || 'התחנה'}`}
                        testID={`route-stop-map-${dayIndex}-${stopIndex}`}
                      >
                        <Ionicons name="map-outline" size={19} color={canNavigate ? colors.primary : colors.textMuted} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      })}

      <MediaGalleryModal
        visible={gallery.visible}
        items={gallery.items}
        initialIndex={gallery.index}
        onClose={() => setGallery((current) => ({ ...current, visible: false }))}
      />
      <OpenWithLocationSheet
        visible={Boolean(navigationStop)}
        onClose={() => setNavigationStop(null)}
        place={navigationStop ? {
          ...(navigationStop.place || {}),
          name: navigationStop.place?.name || navigationStop.title || navigationStop.location,
          address: navigationStop.place?.address || navigationStop.location,
          coordinates: getStopCoordinates(navigationStop),
        } : null}
        destination={navigationStop?.destination || null}
      />
    </View>
  );
}
