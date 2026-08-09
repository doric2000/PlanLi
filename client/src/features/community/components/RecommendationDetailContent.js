import React, { useMemo } from 'react';
import { Linking, Pressable, View } from 'react-native';
import AppText from "../../../components/AppText";
import MetadataLine from '../../../components/MetadataLine';
import UsefulFactItem from '../../../components/UsefulFactItem';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import { Avatar } from '../../../components/Avatar';
import { getTravelCategoryPresentation } from '../../../constants/travelPresentation';
import { colors } from '../../../styles';
import { getPlaceCoordinates } from '../../../utils/distance';
import { formatTimestamp } from '../../../utils/formatTimestamp';
import { getRecommendationDetailSections } from '../utils/recommendationDetailPresentation';
import { recommendationDetailStyles as styles } from './recommendationDetailStyles';

function getDestinationLabel(destination = {}) {
  return [destination.cityName, destination.countryName].filter(Boolean).join(', ');
}

function buildMapsUrl(item) {
  const place = item?.place || {};
  if (place.url) return place.url;

  const coordinates = getPlaceCoordinates(place);
  const fallback = [
    place.name,
    place.address,
    item?.destination?.cityName,
    item?.destination?.countryName,
  ].filter(Boolean).join(' ');
  const query = coordinates ? `${coordinates.lat},${coordinates.lng}` : fallback;
  if (!query) return '';

  const placeId = place.placeId
    ? `&query_place_id=${encodeURIComponent(place.placeId)}`
    : '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}${placeId}`;
}

const EXTRA_METADATA_ICONS = {
  interests: 'interests',
  travelerStyles: 'explore',
  seasons: 'calendar-today',
};

export default function RecommendationDetailContent({
  item,
  author,
  canEdit,
  navigation,
  onEdit,
}) {
  const presentation = useMemo(
    () => getTravelCategoryPresentation(item?.categoryId, item?.category),
    [item?.category, item?.categoryId]
  );
  const sections = useMemo(() => getRecommendationDetailSections(item), [item]);
  const destinationLabel = getDestinationLabel(item?.destination);
  const mapsUrl = buildMapsUrl(item);
  const placeLabel = item?.place?.name || item?.place?.address || '';
  const dateLabel = formatTimestamp(item?.createdAt);

  const openDestination = () => {
    const destination = item?.destination || {};
    if (!destination.cityId || !destination.countryId) return;
    navigation.navigate('LandingPage', {
      cityId: destination.cityId,
      countryId: destination.countryId,
    });
  };

  return (
    <View style={styles.contentSurface} testID="recommendation-detail-content">
      <View style={styles.categoryRow}>
        <MaterialIcons name={presentation.icon} size={19} color={colors.textSecondary} />
        <AppText style={styles.categoryText}>{presentation.label}</AppText>
      </View>

      <AppText style={styles.title}>{item.title}</AppText>

      {(destinationLabel || placeLabel) ? (
        <View style={styles.locationStack}>
          {!!destinationLabel && (
            <Pressable
              style={styles.locationRow}
              onPress={openDestination}
              disabled={!item?.destination?.cityId || !item?.destination?.countryId}
              accessibilityRole="button"
              accessibilityLabel={`פתיחת היעד ${destinationLabel}`}
            >
              <Ionicons name="location-outline" size={19} color={colors.textMuted} />
              <AppText style={styles.locationText}>{destinationLabel}</AppText>
              {!!(item?.destination?.cityId && item?.destination?.countryId) && (
                <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
              )}
            </Pressable>
          )}
          {!!placeLabel && (
            <Pressable
              style={styles.locationRow}
              onPress={() => mapsUrl && Linking.openURL(mapsUrl).catch(() => {})}
              disabled={!mapsUrl}
              accessibilityRole="button"
              accessibilityLabel={`פתיחת ${placeLabel} במפה`}
            >
              <Ionicons name="map-outline" size={19} color={colors.textMuted} />
              <AppText style={[styles.locationText, styles.placeText]} numberOfLines={2}>
                {[placeLabel, item?.place?.address].filter((value, index, all) => value && all.indexOf(value) === index).join(' · ')}
              </AppText>
              {!!mapsUrl && <Ionicons name="chevron-back" size={18} color={colors.textMuted} />}
            </Pressable>
          )}
        </View>
      ) : null}

      <View style={styles.authorRow}>
        <Pressable
          style={styles.authorButton}
          onPress={() => item.ownerId && navigation.navigate('UserProfile', { uid: item.ownerId })}
          disabled={!item.ownerId}
          accessibilityRole="button"
          accessibilityLabel={`פתיחת הפרופיל של ${author?.displayName || 'כותב ההמלצה'}`}
        >
          <Avatar
            photoURL={author?.photoURL}
            photoMedia={author?.photoMedia}
            displayName={author?.displayName}
            size={48}
          />
          <View style={styles.authorCopy}>
            <AppText style={styles.authorName} numberOfLines={1}>
              {author?.displayName || 'מטייל/ת PlanLi'}
            </AppText>
            {!!dateLabel && <AppText style={styles.authorDate}>{dateLabel}</AppText>}
          </View>
        </Pressable>

        {canEdit ? (
          <Pressable
            style={styles.editButton}
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="עריכת ההמלצה"
            testID="recommendation-detail-edit"
          >
            <MaterialIcons name="edit" size={17} color={colors.primary} />
            <AppText style={styles.editText}>עריכה</AppText>
          </Pressable>
        ) : null}
      </View>

      {!!item.description && (
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>על המקום</AppText>
          <AppText style={styles.body}>{item.description}</AppText>
        </View>
      )}

      {!!sections.facts.length && (
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>פרטים שימושיים</AppText>
          <View style={styles.factsGrid}>
            {sections.facts.map((fact) => (
              <UsefulFactItem
                key={fact.id}
                icon={fact.icon}
                title={fact.title}
                value={fact.value}
                style={[
                  styles.factItem,
                  fact.id === 'audiences' && styles.factItemFull,
                ]}
                testID={`recommendation-fact-${fact.id}`}
              />
            ))}
          </View>
        </View>
      )}

      {!!sections.tags.length && (
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>מה תמצאו כאן</AppText>
          <MetadataLine
            icon="local-offer"
            values={sections.tags}
            style={styles.metadataLine}
            testID="recommendation-tags-metadata"
          />
        </View>
      )}

      {!!sections.extras.length && (
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>מידע נוסף</AppText>
          {sections.extras.map((group) => (
            <View key={group.id} style={styles.extraGroup}>
              <AppText style={styles.extraTitle}>{group.title}</AppText>
              <MetadataLine
                icon={EXTRA_METADATA_ICONS[group.id] || 'label-outline'}
                values={group.values}
                style={styles.extraMetadataLine}
                testID={`recommendation-extra-${group.id}`}
              />
            </View>
          ))}
        </View>
      )}

      {!!sections.needs.length && (
        <View style={styles.section}>
          <AppText style={styles.sectionTitle}>חשוב לדעת</AppText>
          <View style={styles.needsList}>
            {sections.needs.map((need) => (
              <View key={need} style={styles.needRow}>
                <View style={styles.needIcon}>
                  <MaterialIcons name="info-outline" size={20} color={colors.textSecondary} />
                </View>
                <AppText style={styles.needText}>{need}</AppText>
                <Ionicons name="chevron-back" size={17} color={colors.textMuted} />
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
