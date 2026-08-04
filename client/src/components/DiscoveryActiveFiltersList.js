import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { activeFiltersListStyles as styles, colors } from '../styles';
import {
  CATEGORIES,
  ENVIRONMENTS,
  INTERESTS,
  NEEDS,
  PACES,
  POST_BUDGETS,
  ROUTE_DIFFICULTIES,
  SEASONS,
  TAGS,
  TRANSPORT_MODES,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
  VIBES,
} from '../constants/travelTaxonomy';
import { hasDiscoveryFilters } from '../utils/discoveryFilters';

const mapOptions = (options) => Object.fromEntries(options.map((item) => [item.value || item.id, item.label || item.postLabel]));
const labels = {
  categoryIds: mapOptions(CATEGORIES),
  subcategoryIds: mapOptions(TAGS),
  interestIds: mapOptions(INTERESTS),
  audienceIds: mapOptions(TRAVEL_PARTIES),
  vibeIds: mapOptions(VIBES),
  travelerStyleIds: mapOptions(TRAVELER_STYLES),
  needIds: mapOptions(NEEDS),
  budgetLevels: Object.fromEntries(POST_BUDGETS.map((item) => [item.value, item.postLabel])),
  seasons: mapOptions(SEASONS),
  environments: mapOptions(ENVIRONMENTS),
  difficultyIds: mapOptions(ROUTE_DIFFICULTIES),
  transportModeIds: mapOptions(TRANSPORT_MODES),
  paceIds: mapOptions(PACES),
};

function Chip({ text, onRemove }) {
  return (
    <View style={styles.chip}>
      <TouchableOpacity onPress={onRemove} accessibilityRole="button" accessibilityLabel={`הסר ${text}`}>
        <Ionicons name="close-circle" size={18} color={colors.white} />
      </TouchableOpacity>
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

export default function DiscoveryActiveFiltersList({ filters, onRemove, includeRoute = false }) {
  if (!hasDiscoveryFilters(filters)) return null;
  const fields = [
    'categoryIds', 'subcategoryIds', 'interestIds', 'audienceIds', 'vibeIds', 'travelerStyleIds',
    'budgetLevels', 'seasons', 'environments', 'needIds',
    ...(includeRoute ? ['difficultyIds', 'transportModeIds', 'paceIds'] : []),
  ];
  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
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
        {includeRoute && filters.durationDays && (
          <Chip text={`ימים: ${filters.durationDays.min || '0'}–${filters.durationDays.max || '∞'}`}
            onRemove={() => onRemove?.('durationDays')} />
        )}
        {includeRoute && filters.distanceKm && (
          <Chip text={`מרחק: ${filters.distanceKm.min || '0'}–${filters.distanceKm.max || '∞'} ק״מ`}
            onRemove={() => onRemove?.('distanceKm')} />
        )}
      </ScrollView>
    </View>
  );
}
