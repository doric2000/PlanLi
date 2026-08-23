import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
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
  formatRouteDuration,
  formatRouteLegEstimate,
  getStopCoordinates,
  getStopMediaAssets,
} from '../utils/routeStops';

function galleryForStop(stop, stopIndex) {
  const values = [];
  const add = (media, fallback, photoIndex) => {
    const url = getMediaVariantUrl(media, 'large', fallback);
    if (!url || values.some((item) => item.url === url)) return;
    values.push({
      id: `${stop?.id || stopIndex}:photo:${photoIndex}`,
      url,
      thumbUrl: getMediaVariantUrl(media, 'thumb', fallback),
      media,
      caption: stop?.title || `עצירה ${stopIndex + 1}`,
    });
  };
  const assets = getStopMediaAssets(stop);
  if (assets.length) assets.forEach((asset, index) => add(asset, null, index));
  else add(null, stop?.image, 0);
  return values.slice(0, 3);
}

function stopLocationLabel(stop) {
  if (stop?.locationPrecision === 'general') {
    return stop?.destination?.cityName || stop?.location || stop?.place?.name || '';
  }
  return stop?.place?.address || stop?.location || stop?.place?.name || '';
}

export default function RouteItinerary({
  day,
  dayIndex = 0,
  dayCount = 1,
  onPreviousDay,
  onNextDay,
  onOpenRecommendation,
}) {
  const stops = Array.isArray(day?.stops) ? day.stops : [];
  const [expandedStopKey, setExpandedStopKey] = useState(null);
  const [gallery, setGallery] = useState({ visible: false, items: [], index: 0 });
  const [navigationStop, setNavigationStop] = useState(null);
  const stopGalleries = useMemo(() => stops.map(galleryForStop), [stops]);

  useEffect(() => {
    setExpandedStopKey(null);
    setNavigationStop(null);
  }, [dayIndex]);

  const openGallery = (stopIndex, photoIndex = 0) => {
    const items = stopGalleries[stopIndex] || [];
    if (items.length) setGallery({ visible: true, items, index: Math.min(photoIndex, items.length - 1) });
  };

  return (
    <View style={styles.container} testID="route-itinerary">
      <View style={[styles.dayCard, styles.dayCardOpen]}>
        <View style={styles.dayHeader} testID={`route-day-header-${dayIndex}`}>
          <View style={styles.dayFallback}><AppText style={styles.dayFallbackText}>{dayIndex + 1}</AppText></View>
          <View style={styles.dayCopy}>
            <AppText style={styles.dayTitle}>יום {dayIndex + 1}</AppText>
            <AppText style={styles.dayMeta}>{stops.length} עצירות</AppText>
          </View>
        </View>

        {!!day?.description && (
          <View style={styles.dayNote} testID={`route-day-note-${dayIndex}`}>
            <AppText style={styles.dayNoteTitle}>הערה ליום</AppText>
            <AppText style={styles.dayNoteText}>{day.description}</AppText>
          </View>
        )}

        {!stops.length ? (
          <View style={styles.emptyDay}>
            <Ionicons name="location-outline" size={24} color={colors.textMuted} />
            <AppText style={styles.emptyDayText}>אין עצירות ביום הזה.</AppText>
          </View>
        ) : (
          <View style={styles.stopsList} testID={`route-day-stops-${dayIndex}`}>
            {stops.map((stop, stopIndex) => {
              const stopKey = stop?.id || `${dayIndex}:${stopIndex}`;
              const isExpanded = expandedStopKey === stopKey;
              const photos = stopGalleries[stopIndex] || [];
              const meta = [stop?.startTime, formatRouteDuration(stop?.durationMinutes)].filter(Boolean).join(' · ');
              const locationLabel = stopLocationLabel(stop);
              const canNavigate = Boolean(buildGoogleMapsPlaceUrl(stop) || buildWazePlaceUrl(stop));
              const recommendationId = stop?.source?.recommendationId;
              const previousStop = stops[stopIndex - 1];
              const legEstimate = stopIndex > 0 && getStopCoordinates(previousStop) && getStopCoordinates(stop)
                ? formatRouteLegEstimate(stop)
                : '';
              return (
                <View key={stopKey}>
                  {!!legEstimate && (
                    <View style={styles.legEstimate} testID={`route-leg-estimate-${stopIndex}`}>
                      <Ionicons name="navigate-outline" size={14} color={colors.textMuted} />
                      <AppText style={styles.legEstimateText}>{legEstimate}</AppText>
                    </View>
                  )}
                  <View style={[styles.stopCard, isExpanded && styles.stopCardExpanded]} testID={`route-stop-card-${dayIndex}-${stopIndex}`}>
                    <View style={styles.stopHeader}>
                      {photos[0]?.thumbUrl ? (
                        <Pressable
                          style={styles.stopImageButton}
                          onPress={() => openGallery(stopIndex, 0)}
                          accessibilityRole="button"
                          accessibilityLabel={`פתיחת התמונות של ${stop?.title || `עצירה ${stopIndex + 1}`}`}
                          testID={`route-stop-photo-${dayIndex}-${stopIndex}`}
                        >
                          <CachedImage source={{ uri: photos[0].thumbUrl }} style={styles.stopImage} contentFit="cover" priority="low" />
                          <View style={styles.stopNumberOverlay}><AppText style={styles.stopNumberOverlayText}>{stopIndex + 1}</AppText></View>
                        </Pressable>
                      ) : (
                        <View style={styles.stopNumber}><AppText style={styles.stopNumberText}>{stopIndex + 1}</AppText></View>
                      )}

                      <Pressable
                        style={styles.stopCopy}
                        onPress={() => setExpandedStopKey(isExpanded ? null : stopKey)}
                        accessibilityRole="button"
                        accessibilityState={{ expanded: isExpanded }}
                        accessibilityLabel={`${isExpanded ? 'צמצום' : 'הרחבת'} פרטי ${stop?.title || `עצירה ${stopIndex + 1}`}`}
                        testID={`route-stop-toggle-${dayIndex}-${stopIndex}`}
                      >
                        <AppText style={styles.stopTitle}>{stop?.title || stop?.place?.name || `עצירה ${stopIndex + 1}`}</AppText>
                        {!!meta && <AppText style={styles.stopMeta}>{meta}</AppText>}
                        <View style={styles.locationLine}>
                          {stop?.locationPrecision === 'general' ? (
                            <View style={styles.generalBadge}><AppText style={styles.generalBadgeText}>אזור כללי</AppText></View>
                          ) : null}
                          {!!locationLabel && <AppText style={styles.stopAddress} numberOfLines={1}>{locationLabel}</AppText>}
                        </View>
                      </Pressable>

                      {canNavigate ? (
                        <Pressable
                          style={styles.mapButton}
                          onPress={() => setNavigationStop(stop)}
                          accessibilityRole="button"
                          accessibilityLabel={`אפשרויות ניווט אל ${stop?.title || 'העצירה'}`}
                          testID={`route-stop-map-${dayIndex}-${stopIndex}`}
                        >
                          <Ionicons name="navigate-outline" size={19} color={colors.primary} />
                        </Pressable>
                      ) : null}
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={19} color={colors.textMuted} />
                    </View>

                    {isExpanded ? (
                      <View style={styles.stopExpanded} testID={`route-stop-expanded-${dayIndex}-${stopIndex}`}>
                        {!!stop?.description && <AppText style={styles.stopDescription}>{stop.description}</AppText>}
                        {!!locationLabel && (
                          <View style={styles.stopExpandedAddressRow}>
                            <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                            <AppText style={styles.stopExpandedAddress}>{locationLabel}</AppText>
                          </View>
                        )}
                        {photos.length > 1 ? (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
                            {photos.map((photo, photoIndex) => (
                              <Pressable key={photo.id} onPress={() => openGallery(stopIndex, photoIndex)} style={styles.photoStripButton}>
                                <CachedImage source={{ uri: photo.thumbUrl || photo.url }} style={styles.photoStripImage} contentFit="cover" priority="low" />
                              </Pressable>
                            ))}
                          </ScrollView>
                        ) : null}
                        <View style={styles.stopActions}>
                          {recommendationId ? (
                            <Pressable
                              style={styles.secondaryAction}
                              onPress={() => onOpenRecommendation?.(recommendationId)}
                              accessibilityRole="button"
                              testID={`route-stop-recommendation-${dayIndex}-${stopIndex}`}
                            >
                              <Ionicons name="heart-outline" size={17} color={colors.primary} />
                              <AppText style={styles.secondaryActionText}>צפייה בהמלצה</AppText>
                            </Pressable>
                          ) : null}
                          {canNavigate ? (
                            <Pressable style={styles.primaryAction} onPress={() => setNavigationStop(stop)} accessibilityRole="button">
                              <Ionicons name="navigate-outline" size={17} color={colors.white} />
                              <AppText style={styles.primaryActionText}>אפשרויות ניווט</AppText>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {dayCount > 1 ? (
          <View style={styles.dayNavigation}>
            <Pressable
              style={[styles.dayNavigationButton, dayIndex === 0 && styles.dayNavigationButtonDisabled]}
              onPress={onPreviousDay}
              disabled={dayIndex === 0}
              accessibilityRole="button"
              testID="route-previous-day"
            >
              <Ionicons name="chevron-forward" size={18} color={dayIndex === 0 ? colors.textMuted : colors.primary} />
              <AppText style={[styles.dayNavigationText, dayIndex === 0 && styles.dayNavigationTextDisabled]}>ליום הקודם</AppText>
            </Pressable>
            <Pressable
              style={[styles.dayNavigationButton, dayIndex === dayCount - 1 && styles.dayNavigationButtonDisabled]}
              onPress={onNextDay}
              disabled={dayIndex === dayCount - 1}
              accessibilityRole="button"
              testID="route-next-day"
            >
              <AppText style={[styles.dayNavigationText, dayIndex === dayCount - 1 && styles.dayNavigationTextDisabled]}>ליום הבא</AppText>
              <Ionicons name="chevron-back" size={18} color={dayIndex === dayCount - 1 ? colors.textMuted : colors.primary} />
            </Pressable>
          </View>
        ) : null}
      </View>

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
