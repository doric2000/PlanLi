import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import AppText from "./AppText";
import RtlHorizontalScrollView from './RtlHorizontalScrollView';
import { Ionicons } from '@expo/vector-icons';
import { activeFiltersListStyles as styles, colors } from '../styles';
import {
  CATEGORIES,
  ENVIRONMENTS,
  NEEDS,
  PACES,
  POST_BUDGETS,
  ROUTE_DIFFICULTIES,
	ROUTE_EXPERIENCE_LEVELS,
  SEASONS,
  TAGS,
  TRANSPORT_MODES,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
  VIBES,
} from '../constants/travelTaxonomy';
import { hasDiscoveryFilters } from '../utils/discoveryFilters';
import { countDiscoveryFilters } from '../utils/progressiveDiscoveryFilters';

const mapOptions = (options) => Object.fromEntries(options.map((item) => [item.value || item.id, item.label || item.postLabel]));
const labels = {
  categoryIds: mapOptions(CATEGORIES),
  subcategoryIds: mapOptions(TAGS),
  audienceIds: mapOptions(TRAVEL_PARTIES),
  vibeIds: mapOptions(VIBES),
  travelerStyleIds: mapOptions(TRAVELER_STYLES),
  needIds: mapOptions(NEEDS),
  budgetLevels: Object.fromEntries(POST_BUDGETS.map((item) => [item.value, item.postLabel])),
  seasons: mapOptions(SEASONS),
  environments: mapOptions(ENVIRONMENTS),
  difficultyIds: mapOptions(ROUTE_DIFFICULTIES),
	experienceLevelIds: mapOptions(ROUTE_EXPERIENCE_LEVELS),
  transportModeIds: mapOptions(TRANSPORT_MODES),
  paceIds: mapOptions(PACES),
};

function Chip({ text, onRemove }) {
  return (
    <View style={styles.chip}>
      <TouchableOpacity onPress={onRemove} accessibilityRole="button" accessibilityLabel={`הסר ${text}`}>
        <Ionicons name="close-circle" size={18} color={colors.white} />
      </TouchableOpacity>
      <AppText style={styles.chipText}>{text}</AppText>
    </View>
  );
}

export default function DiscoveryActiveFiltersList({
  filters,
  onRemove,
  onClear,
  surface = 'recommendations',
}) {
  if (!hasDiscoveryFilters(filters)) return null;
  const isRoutesSurface = surface === 'routes';
  const activeCount = countDiscoveryFilters(filters);
  const fields = [
	'categoryIds', 'subcategoryIds', 'audienceIds', 'vibeIds',
	'budgetLevels', 'environments', 'needIds',
	...(isRoutesSurface ? [
	  'travelerStyleIds', 'seasons', 'difficultyIds', 'experienceLevelIds', 'transportModeIds', 'paceIds',
	] : []),
  ];
  return (
    <View style={styles.container}>
      <View style={styles.summaryRow}>
        {!!onClear && (
          <TouchableOpacity onPress={onClear} accessibilityRole="button" testID="active-filters-clear">
            <AppText style={styles.clearText}>נקה הכול</AppText>
          </TouchableOpacity>
        )}
        <AppText style={styles.summaryText}>{activeCount} מסננים פעילים</AppText>
      </View>
      <RtlHorizontalScrollView contentContainerStyle={styles.scrollContent}>
        {!!filters.query && <Chip text={filters.query} onRemove={() => onRemove?.('query')} />}
        {(filters.destinations || []).map((destination) => {
          const key = `${destination.countryId}:${destination.cityId || ''}`;
          return <Chip key={`destination-${key}`} text={destination.label || destination.cityId || destination.countryId}
            onRemove={() => onRemove?.('destinations', key)} />;
        })}
        {fields.flatMap((field) => (filters[field] || []).map((value) => (
          <Chip key={`${field}-${value}`} text={labels[field]?.[value] || value}
            onRemove={() => onRemove?.(field, value)} />
        )))}
        {isRoutesSurface && filters.durationDays && (
          <Chip text={`ימים: ${filters.durationDays.min || '0'}–${filters.durationDays.max || '∞'}`}
            onRemove={() => onRemove?.('durationDays')} />
        )}
        {isRoutesSurface && filters.distanceKm && (
          <Chip text={`מרחק: ${filters.distanceKm.min || '0'}–${filters.distanceKm.max || '∞'} ק״מ`}
            onRemove={() => onRemove?.('distanceKm')} />
        )}
      </RtlHorizontalScrollView>
    </View>
  );
}
