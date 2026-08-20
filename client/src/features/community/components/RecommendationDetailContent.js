import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import AppText from "../../../components/AppText";
import ExactLocationMapPreview from '../../../components/ExactLocationMapPreview';
import MetadataLine from '../../../components/MetadataLine';
import OpenWithLocationSheet from '../../../components/OpenWithLocationSheet';
import UsefulFactItem from '../../../components/UsefulFactItem';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import ContentDetailAuthorRow from '../../../components/ContentDetailAuthorRow';
import NavigationChevron from '../../../components/NavigationChevron';
import { getTravelCategoryPresentation } from '../../../constants/travelPresentation';
import { colors } from '../../../styles';
import { getPlaceCoordinates } from '../../../utils/distance';
import { buildGoogleMapsUrl, buildWazeUrl } from '../../../utils/placeNavigation';
import { getRecommendationDetailSections } from '../utils/recommendationDetailPresentation';
import { recommendationDetailStyles as styles } from './recommendationDetailStyles';

function getDestinationLabel(destination = {}) {
  return [destination.cityName, destination.countryName].filter(Boolean).join(', ');
}

function buildMapsUrl(item) {
  return buildGoogleMapsUrl({ place: item?.place, destination: item?.destination }) || '';
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
  const wazeUrl = buildWazeUrl(item?.place);
  const placeLabel = item?.place?.name || item?.place?.address || '';
  const placeCoordinates = getPlaceCoordinates(item?.place);
  const recommendationId = item?.postId || item?.id || '';
  const [openWithVisible, setOpenWithVisible] = useState(false);

  const openDestination = () => {
    const destination = item?.destination || {};
    if (!destination.cityId || !destination.countryId) return;
    navigation.navigate('LandingPage', {
      cityId: destination.cityId,
      countryId: destination.countryId,
    });
  };

  const openOnCommunityMap = () => {
    if (!recommendationId || !placeCoordinates) return;
    navigation.navigate('Main', {
      screen: 'Tabs',
      params: {
        screen: 'Community',
        params: {
          mapFocus: {
            requestId: `${recommendationId}:${Date.now()}`,
            recommendationId,
            coordinates: placeCoordinates,
          },
        },
      },
    }, { pop: true });
  };

  return (
    <View style={styles.contentSurface} testID="recommendation-detail-content">
      <View style={styles.categoryRow}>
        <MaterialIcons name={presentation.icon} size={19} color={colors.textSecondary} />
        <AppText style={styles.categoryText}>{presentation.label}</AppText>
      </View>

      <AppText style={styles.title}>{item.title}</AppText>

      {(destinationLabel || placeLabel || placeCoordinates) ? (
        <View style={styles.locationStack}>
          {!!destinationLabel && (
            <Pressable
              style={styles.locationRow}
              onPress={openDestination}
              disabled={!item?.destination?.cityId || !item?.destination?.countryId}
              accessibilityRole="button"
              accessibilityLabel={`פתיחת היעד ${destinationLabel}`}
            >
              {!!(item?.destination?.cityId && item?.destination?.countryId) && (
                <NavigationChevron size={18} color={colors.textMuted} />
              )}
              <Ionicons name="location-outline" size={19} color={colors.textMuted} />
              <AppText style={styles.locationText}>{destinationLabel}</AppText>
            </Pressable>
          )}
          {!!placeLabel && (
            <View
              style={styles.locationRow}
            >
              <Ionicons name="map-outline" size={19} color={colors.textMuted} />
              <AppText style={[styles.locationText, styles.placeText]} numberOfLines={2}>
                {[placeLabel, item?.place?.address].filter((value, index, all) => value && all.indexOf(value) === index).join(' · ')}
              </AppText>
            </View>
          )}
          {!!(mapsUrl || wazeUrl) && (
            <Pressable
              style={styles.openWithButton}
              onPress={() => setOpenWithVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={`פתיחת ${placeLabel || 'המיקום'} באמצעות אפליקציית ניווט`}
              testID="recommendation-open-with"
            >
              <Ionicons name="navigate-outline" size={19} color={colors.white} />
              <AppText style={styles.openWithText}>פתיחה באמצעות</AppText>
            </Pressable>
          )}
          {!!placeCoordinates && (
            <Pressable
              style={styles.exactMapPreview}
              onPress={openOnCommunityMap}
              disabled={!recommendationId}
              accessibilityRole="button"
              accessibilityLabel={`הצגת ${placeLabel || 'המיקום'} במפת ההמלצות`}
              testID="recommendation-exact-map"
            >
              <ExactLocationMapPreview
                place={item?.place}
                style={styles.exactMap}
                testID="recommendation-exact-map-view"
              />
              {!!recommendationId && (
                <View style={styles.exactMapAction} pointerEvents="none">
                  <Ionicons name="map-outline" size={17} color={colors.primary} />
                  <AppText style={styles.exactMapActionText}>הצג במפה</AppText>
                </View>
              )}
            </Pressable>
          )}
        </View>
      ) : null}

      <OpenWithLocationSheet
        visible={openWithVisible}
        onClose={() => setOpenWithVisible(false)}
        place={item?.place}
        destination={item?.destination}
      />

      <ContentDetailAuthorRow
        author={{ ...author, contentCreatedAt: item?.createdAt }}
        ownerId={item.ownerId}
        canEdit={canEdit}
        onEdit={onEdit}
        navigation={navigation}
        styles={styles}
        editTestID="recommendation-detail-edit"
      />

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
