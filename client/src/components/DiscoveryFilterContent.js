import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import ChipSelector from '../features/community/components/ChipSelector';
import { FormInput } from './FormInput';
import MinMaxInputs from './MinMaxInputs';
import { buttons, colors, common, recommendationsFilterModalStyles as styles } from '../styles';
import {
  CATEGORIES,
  ENVIRONMENTS,
  INTERESTS,
  NEEDS,
  PACES,
  POST_BUDGETS,
  ROUTE_DIFFICULTIES,
  SEASONS,
  TAG_OPTIONS_BY_CATEGORY,
  TRANSPORT_MODES,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
  VIBES,
} from '../constants/travelTaxonomy';
import { useDestinationFilterOptions } from '../hooks/useDestinationFilterOptions';

const selectedLabels = (options, values) => options
  .filter((option) => values.includes(option.value || option.id))
  .map((option) => option.label);

function toggle(values, value, maximum = 20) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value].slice(0, maximum);
}

export default function DiscoveryFilterContent({ filters, onChange, includeRoute = false, onUseProfile }) {
  const current = filters || {};
  const [destinationQuery, setDestinationQuery] = useState('');
  const { options: destinationOptions, loading: destinationsLoading } = useDestinationFilterOptions(true);
  const selectedDestinationKeys = (current.destinations || []).map((item) => (
    item.cityId ? `city:${item.countryId}:${item.cityId}` : `country:${item.countryId}`
  ));
  const visibleDestinations = useMemo(() => {
    const normalized = destinationQuery.trim().toLocaleLowerCase('he');
    const matching = destinationOptions.filter((option) => (
      !normalized || option.label.toLocaleLowerCase('he').includes(normalized)
    )).slice(0, 20);
    const selected = destinationOptions.filter((option) => selectedDestinationKeys.includes(option.key));
    return Array.from(new Map([...selected, ...matching].map((item) => [item.key, item])).values());
  }, [destinationOptions, destinationQuery, selectedDestinationKeys.join('|')]);

  const patch = (value) => onChange?.({ ...current, ...value });
  const toggleField = (field, value, maximum) => patch({
    [field]: toggle(Array.isArray(current[field]) ? current[field] : [], value, maximum),
  });
  const toggleDestination = (key) => {
    const option = destinationOptions.find((item) => item.key === key);
    if (!option) return;
    const destinations = Array.isArray(current.destinations) ? current.destinations : [];
    const exists = selectedDestinationKeys.includes(key);
    patch({
      destinations: exists
        ? destinations.filter((item) => (item.cityId ? `city:${item.countryId}:${item.cityId}` : `country:${item.countryId}`) !== key)
        : [...destinations, { countryId: option.countryId, cityId: option.cityId, label: option.label }].slice(0, 5),
    });
  };

  return (
    <>
      {!!onUseProfile && (
        <TouchableOpacity style={buttons.secondary} onPress={onUseProfile} testID="discovery-use-profile">
          <Text style={buttons.secondaryText}>ההעדפות שלי</Text>
        </TouchableOpacity>
      )}

      <View style={styles.section}>
        <Text style={[common.modalLabel, { textAlign: 'right' }]}>יעדים (עד 5)</Text>
        <FormInput placeholder="חפשו מדינה או עיר" value={destinationQuery} onChangeText={setDestinationQuery} textAlign="right" />
        {destinationsLoading ? <ActivityIndicator color={colors.primary} /> : (
          <ChipSelector
            label="בחרו יעדים"
            items={visibleDestinations.map((item) => item.label)}
            selectedValue={visibleDestinations.filter((item) => selectedDestinationKeys.includes(item.key)).map((item) => item.label)}
            onSelect={(label) => {
              const key = visibleDestinations.find((item) => item.label === label)?.key;
              if (key) toggleDestination(key);
            }}
            multiSelect
            testIDPrefix="discovery-destination"
          />
        )}
      </View>

      <ChipSelector label="קטגוריה" items={CATEGORIES.map((item) => item.label)}
        selectedValue={CATEGORIES.filter((item) => (current.categoryIds || []).includes(item.id)).map((item) => item.label)}
        onSelect={(label) => {
          const categoryId = CATEGORIES.find((item) => item.label === label)?.id;
          if (!categoryId) return;
          const removing = (current.categoryIds || []).includes(categoryId);
          patch({
            categoryIds: toggle(current.categoryIds || [], categoryId, 8),
            ...(removing ? {
              subcategoryIds: (current.subcategoryIds || []).filter((tagId) => (
                !(TAG_OPTIONS_BY_CATEGORY[categoryId] || []).some((tag) => tag.id === tagId)
              )),
            } : {}),
          });
        }} multiSelect testIDPrefix="discovery-category" />

      {(current.categoryIds || []).map((categoryId) => (
        <ChipSelector key={categoryId}
          label={`תתי־קטגוריות · ${CATEGORIES.find((item) => item.id === categoryId)?.label || ''}`}
          items={(TAG_OPTIONS_BY_CATEGORY[categoryId] || []).map((item) => item.label)}
          selectedValue={(TAG_OPTIONS_BY_CATEGORY[categoryId] || []).filter((item) => (current.subcategoryIds || []).includes(item.id)).map((item) => item.label)}
          onSelect={(label) => {
            const id = (TAG_OPTIONS_BY_CATEGORY[categoryId] || []).find((item) => item.label === label)?.id;
            if (id) toggleField('subcategoryIds', id, 20);
          }} multiSelect testIDPrefix={`discovery-subcategory-${categoryId}`} />
      ))}

      <ChipSelector label="תחומי עניין" items={INTERESTS.map((item) => item.label)}
        selectedValue={selectedLabels(INTERESTS, current.interestIds || [])}
        onSelect={(label) => { const id = INTERESTS.find((item) => item.label === label)?.value; if (id) toggleField('interestIds', id, 12); }}
        multiSelect testIDPrefix="discovery-interest" />
      <ChipSelector label="מתאים למי" items={TRAVEL_PARTIES.map((item) => item.label)}
        selectedValue={selectedLabels(TRAVEL_PARTIES, current.audienceIds || [])}
        onSelect={(label) => { const id = TRAVEL_PARTIES.find((item) => item.label === label)?.value; if (id) toggleField('audienceIds', id, 6); }}
        multiSelect testIDPrefix="discovery-audience" />
      <ChipSelector label="אווירה" items={VIBES.map((item) => item.label)}
        selectedValue={selectedLabels(VIBES, current.vibeIds || [])}
        onSelect={(label) => { const id = VIBES.find((item) => item.label === label)?.value; if (id) toggleField('vibeIds', id, 8); }}
        multiSelect testIDPrefix="discovery-vibe" />
      <ChipSelector label="סגנון טיול" items={TRAVELER_STYLES.map((item) => item.label)}
        selectedValue={selectedLabels(TRAVELER_STYLES, current.travelerStyleIds || [])}
        onSelect={(label) => { const id = TRAVELER_STYLES.find((item) => item.label === label)?.value; if (id) toggleField('travelerStyleIds', id, 6); }}
        multiSelect testIDPrefix="discovery-style" />
      <ChipSelector label="תקציב" items={POST_BUDGETS.map((item) => item.postLabel)}
        selectedValue={POST_BUDGETS.filter((item) => (current.budgetLevels || []).includes(item.value)).map((item) => item.postLabel)}
        onSelect={(label) => { const id = POST_BUDGETS.find((item) => item.postLabel === label)?.value; if (id) toggleField('budgetLevels', id, 4); }}
        multiSelect testIDPrefix="discovery-budget" />
      <ChipSelector label="עונה" items={SEASONS.map((item) => item.label)}
        selectedValue={selectedLabels(SEASONS, current.seasons || [])}
        onSelect={(label) => { const id = SEASONS.find((item) => item.label === label)?.value; if (id) toggleField('seasons', id, 6); }}
        multiSelect testIDPrefix="discovery-season" />
      <ChipSelector label="סביבה" items={ENVIRONMENTS.map((item) => item.label)}
        selectedValue={selectedLabels(ENVIRONMENTS, current.environments || [])}
        onSelect={(label) => { const id = ENVIRONMENTS.find((item) => item.label === label)?.value; if (id) toggleField('environments', id, 3); }}
        multiSelect testIDPrefix="discovery-environment" />
      <ChipSelector label="מידע מעשי ונגישות" items={NEEDS.map((item) => item.label)}
        selectedValue={selectedLabels(NEEDS, current.needIds || [])}
        onSelect={(label) => { const id = NEEDS.find((item) => item.label === label)?.value; if (id) toggleField('needIds', id, NEEDS.length); }}
        multiSelect testIDPrefix="discovery-need" />

      {includeRoute && (
        <View style={styles.dynamicSection}>
          <ChipSelector label="רמת קושי" items={ROUTE_DIFFICULTIES.map((item) => item.label)}
            selectedValue={selectedLabels(ROUTE_DIFFICULTIES, current.difficultyIds || [])}
            onSelect={(label) => { const id = ROUTE_DIFFICULTIES.find((item) => item.label === label)?.value; if (id) toggleField('difficultyIds', id, 3); }}
            multiSelect testIDPrefix="discovery-difficulty" />
          <ChipSelector label="אמצעי התניידות" items={TRANSPORT_MODES.map((item) => item.label)}
            selectedValue={selectedLabels(TRANSPORT_MODES, current.transportModeIds || [])}
            onSelect={(label) => { const id = TRANSPORT_MODES.find((item) => item.label === label)?.value; if (id) toggleField('transportModeIds', id, 6); }}
            multiSelect testIDPrefix="discovery-transport" />
          <ChipSelector label="קצב" items={PACES.map((item) => item.label)}
            selectedValue={selectedLabels(PACES, current.paceIds || [])}
            onSelect={(label) => { const id = PACES.find((item) => item.label === label)?.value; if (id) toggleField('paceIds', id, 3); }}
            multiSelect testIDPrefix="discovery-pace" />
          <MinMaxInputs label="טווח ימים" minValue={current.durationDays?.min ?? ''} maxValue={current.durationDays?.max ?? ''}
            onChangeMin={(value) => patch({ durationDays: { ...(current.durationDays || {}), min: value } })}
            onChangeMax={(value) => patch({ durationDays: { ...(current.durationDays || {}), max: value } })} />
          <MinMaxInputs label="טווח מרחק" unitSuffix='ק"מ' minValue={current.distanceKm?.min ?? ''} maxValue={current.distanceKm?.max ?? ''}
            onChangeMin={(value) => patch({ distanceKm: { ...(current.distanceKm || {}), min: value } })}
            onChangeMax={(value) => patch({ distanceKm: { ...(current.distanceKm || {}), max: value } })} />
        </View>
      )}
    </>
  );
}
