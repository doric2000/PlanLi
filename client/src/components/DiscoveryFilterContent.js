import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DiscoveryCategorySelector from './DiscoveryCategorySelector';
import DiscoveryDestinationAutocomplete from './DiscoveryDestinationAutocomplete';
import DiscoveryDisclosureSection from './DiscoveryDisclosureSection';
import DiscoveryOptionGroup from './DiscoveryOptionGroup';
import MinMaxInputs from './MinMaxInputs';
import {
  ENVIRONMENTS,
  NEEDS,
  PACES,
  POST_BUDGETS,
  ROUTE_DIFFICULTIES,
	ROUTE_EXPERIENCE_LEVELS,
  SEASONS,
  TRANSPORT_MODES,
  TRAVELER_STYLES,
  TRAVEL_PARTIES,
  VIBES,
} from '../constants/travelTaxonomy';
import { colors, discoveryFilterStyles as styles } from '../styles';
import {
  getRelevantDiscoveryFacets,
  summarizeSelections,
} from '../utils/progressiveDiscoveryFilters';

function toggle(values, value, maximum = 20) {
  const current = Array.isArray(values) ? values : [];
  return current.includes(value)
    ? current.filter((entry) => entry !== value)
    : [...current, value].slice(0, maximum);
}

function joinSummaries(...summaries) {
  const visible = summaries.filter((summary) => summary && summary !== 'לא נבחר');
  return visible.length ? visible.join(' · ') : 'לא נבחר';
}

function rangeSummary(label, range, suffix = '') {
  if (!range || (range.min == null || range.min === '') && (range.max == null || range.max === '')) return '';
  return `${label}: ${range.min || '0'}–${range.max || '∞'}${suffix}`;
}

export default function DiscoveryFilterContent({
  filters,
  onChange,
  surface = 'recommendations',
  onUseProfile,
  destinationsEnabled = true,
}) {
  const current = filters || {};
  const isRoute = surface === 'routes';
  const [expandedSections, setExpandedSections] = useState({});
  const relevant = useMemo(() => getRelevantDiscoveryFacets(current), [
    (current.categoryIds || []).join('|'),
    (current.subcategoryIds || []).join('|'),
  ]);
  const patch = (value) => onChange?.({ ...current, ...value });
  const toggleField = (field, value, maximum) => patch({
    [field]: toggle(current[field], value, maximum),
  });
  const toggleSection = (id) => setExpandedSections((previous) => ({
    ...previous,
    [id]: !previous[id],
  }));

  const audienceBudgetSummary = joinSummaries(
    summarizeSelections(TRAVEL_PARTIES, current.audienceIds),
    summarizeSelections(POST_BUDGETS, current.budgetLevels, 1),
  );
  const atmosphereSummary = joinSummaries(
    summarizeSelections(VIBES, current.vibeIds),
	isRoute ? summarizeSelections(TRAVELER_STYLES, current.travelerStyleIds, 1) : '',
	isRoute ? summarizeSelections(SEASONS, current.seasons, 1) : '',
	summarizeSelections(ENVIRONMENTS, current.environments, 1),
  );
  const routeSummary = joinSummaries(
    summarizeSelections(ROUTE_DIFFICULTIES, current.difficultyIds, 1),
	summarizeSelections(ROUTE_EXPERIENCE_LEVELS, current.experienceLevelIds, 1),
    summarizeSelections(TRANSPORT_MODES, current.transportModeIds, 1),
    summarizeSelections(PACES, current.paceIds, 1),
    rangeSummary('ימים', current.durationDays),
    rangeSummary('מרחק', current.distanceKm, ' ק״מ'),
  );

  return (
    <View style={styles.content}>
      {!!onUseProfile && (
        <TouchableOpacity
          style={styles.profilePresetButton}
          onPress={onUseProfile}
          accessibilityRole="button"
          testID="discovery-use-profile"
        >
          <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
          <View style={styles.profilePresetCopy}>
            <Text style={styles.profilePresetTitle}>מלאו מההעדפות שלי</Text>
            <Text style={styles.profilePresetText}>הבחירות יופיעו כאן לפני ההחלה</Text>
          </View>
        </TouchableOpacity>
      )}

      <DiscoveryDestinationAutocomplete
        destinations={current.destinations || []}
        onChange={(destinations) => patch({ destinations })}
        enabled={destinationsEnabled}
      />

      <DiscoveryCategorySelector filters={current} onChange={onChange} />

      {isRoute && (
        <DiscoveryDisclosureSection
          id="route-details"
          title="פרטי המסלול"
          summary={routeSummary}
          expanded={expandedSections.routeDetails}
          onToggle={() => toggleSection('routeDetails')}
        >
          <DiscoveryOptionGroup
            label="רמת קושי"
            options={ROUTE_DIFFICULTIES}
            selectedIds={current.difficultyIds || []}
            onToggle={(id) => toggleField('difficultyIds', id, 3)}
            alwaysShowAll
            testIDPrefix="discovery-difficulty"
          />
		  <DiscoveryOptionGroup
			label="ניסיון נדרש"
			options={ROUTE_EXPERIENCE_LEVELS}
			selectedIds={current.experienceLevelIds || []}
			onToggle={(id) => toggleField('experienceLevelIds', id, ROUTE_EXPERIENCE_LEVELS.length)}
			alwaysShowAll
			testIDPrefix="discovery-experience"
		  />
          <DiscoveryOptionGroup
            label="אמצעי התניידות"
            options={TRANSPORT_MODES}
            selectedIds={current.transportModeIds || []}
            onToggle={(id) => toggleField('transportModeIds', id, 6)}
            alwaysShowAll
            testIDPrefix="discovery-transport"
          />
          <DiscoveryOptionGroup
            label="קצב"
            options={PACES}
            selectedIds={current.paceIds || []}
            onToggle={(id) => toggleField('paceIds', id, 3)}
            alwaysShowAll
            testIDPrefix="discovery-pace"
          />
          <View style={styles.rangeGrid}>
            <MinMaxInputs
              label="טווח ימים"
              minValue={current.durationDays?.min ?? ''}
              maxValue={current.durationDays?.max ?? ''}
              onChangeMin={(value) => patch({ durationDays: { ...(current.durationDays || {}), min: value } })}
              onChangeMax={(value) => patch({ durationDays: { ...(current.durationDays || {}), max: value } })}
            />
            <MinMaxInputs
              label="טווח מרחק"
              unitSuffix="ק״מ"
              minValue={current.distanceKm?.min ?? ''}
              maxValue={current.distanceKm?.max ?? ''}
              onChangeMin={(value) => patch({ distanceKm: { ...(current.distanceKm || {}), min: value } })}
              onChangeMax={(value) => patch({ distanceKm: { ...(current.distanceKm || {}), max: value } })}
            />
          </View>
        </DiscoveryDisclosureSection>
      )}

      <DiscoveryDisclosureSection
        id="audience-budget"
	title={isRoute ? "מתאים למי ותקציב" : "מתאים למי ורמת מחיר"}
        summary={audienceBudgetSummary}
        expanded={expandedSections.audienceBudget}
        onToggle={() => toggleSection('audienceBudget')}
      >
        <DiscoveryOptionGroup
          label="מתאים למי"
          options={TRAVEL_PARTIES}
          selectedIds={current.audienceIds || []}
          onToggle={(id) => toggleField('audienceIds', id, 6)}
          alwaysShowAll
          testIDPrefix="discovery-audience"
        />
        <DiscoveryOptionGroup
		  label={isRoute ? "תקציב" : "רמת מחיר"}
          options={POST_BUDGETS}
          selectedIds={current.budgetLevels || []}
          onToggle={(id) => toggleField('budgetLevels', id, POST_BUDGETS.length)}
          alwaysShowAll
          testIDPrefix="discovery-budget"
        />
      </DiscoveryDisclosureSection>

      <DiscoveryDisclosureSection
        id="atmosphere"
        title={isRoute ? "אופי המסלול" : "אווירה וסביבה"}
        summary={atmosphereSummary}
        expanded={expandedSections.atmosphere}
        onToggle={() => toggleSection('atmosphere')}
      >
        <DiscoveryOptionGroup
          label="אווירה"
          options={VIBES}
          selectedIds={current.vibeIds || []}
          relevantIds={relevant.vibes}
          onToggle={(id) => toggleField('vibeIds', id, 8)}
          collapsedLimit={4}
          testIDPrefix="discovery-vibe"
        />
		{isRoute ? (
		  <>
			<DiscoveryOptionGroup
			  label="סגנון טיול"
			  options={TRAVELER_STYLES}
			  selectedIds={current.travelerStyleIds || []}
			  relevantIds={relevant.travelerStyles}
			  onToggle={(id) => toggleField('travelerStyleIds', id, 6)}
			  collapsedLimit={4}
			  testIDPrefix="discovery-style"
			/>
			<DiscoveryOptionGroup
			  label="עונה"
			  options={SEASONS}
			  selectedIds={current.seasons || []}
			  relevantIds={relevant.seasons}
			  onToggle={(id) => toggleField('seasons', id, SEASONS.length)}
			  collapsedLimit={4}
			  testIDPrefix="discovery-season"
			/>
		  </>
		) : null}
		<DiscoveryOptionGroup
		  label="סביבה"
		  options={ENVIRONMENTS}
		  selectedIds={current.environments || []}
		  relevantIds={relevant.environments}
		  onToggle={(id) => toggleField('environments', id, ENVIRONMENTS.length)}
		  alwaysShowAll
		  testIDPrefix="discovery-environment"
		/>
      </DiscoveryDisclosureSection>

      <DiscoveryDisclosureSection
        id="needs"
        title="צרכים חשובים"
        summary={summarizeSelections(NEEDS, current.needIds)}
        expanded={expandedSections.needs}
        onToggle={() => toggleSection('needs')}
      >
        <DiscoveryOptionGroup
          helper="יוצגו רק תוצאות שבהן המידע הזה צוין במפורש"
          options={NEEDS}
          selectedIds={current.needIds || []}
          onToggle={(id) => toggleField('needIds', id, NEEDS.length)}
          alwaysShowAll
          testIDPrefix="discovery-need"
        />
      </DiscoveryDisclosureSection>

    </View>
  );
}
