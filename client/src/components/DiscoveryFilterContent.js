import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import AppText from './AppText';
import DiscoveryCategorySelector from './DiscoveryCategorySelector';
import DiscoveryDestinationAutocomplete from './DiscoveryDestinationAutocomplete';
import DiscoveryDisclosureSection from './DiscoveryDisclosureSection';
import DiscoveryOptionGroup from './DiscoveryOptionGroup';
import MinMaxInputs from './MinMaxInputs';
import {
  ENVIRONMENTS, NEEDS, PACES, POST_BUDGETS, ROUTE_DIFFICULTIES,
  SEASONS, TRANSPORT_MODES, TRAVELER_STYLES, TRAVEL_PARTIES, VIBES,
} from '../constants/travelTaxonomy';
import { discoveryFilterStyles as styles } from '../styles';
import { communityDiscoveryStyles as s } from '../styles/communityDiscovery';
import { getRelevantDiscoveryFacets, summarizeSelections } from '../utils/progressiveDiscoveryFilters';

const durations = [
  { label: 'יום אחד', value: { min: 1, max: 1 } },
  { label: '2–3 ימים', value: { min: 2, max: 3 } },
  { label: '4+ ימים', value: { min: 4, max: '' } },
];

export default function DiscoveryFilterContent({ filters, onChange, surface = 'recommendations', onUseProfile, destinationsEnabled = true }) {
  const current = filters || {};
  const routes = surface === 'routes';
  const [expanded, setExpanded] = useState({});
  const relevant = useMemo(() => getRelevantDiscoveryFacets(current), [current.categoryIds, current.subcategoryIds]);
  const patch = (next) => onChange?.({ ...current, ...next });
  const toggle = (field, id, max = 20) => {
    const values = current[field] || [];
    patch({ [field]: values.includes(id) ? values.filter((v) => v !== id) : [...values, id].slice(0, max) });
  };
  const group = (field, label, options, prefix, maximum, relevantIds) => (
    <DiscoveryOptionGroup label={label} options={options} selectedIds={current[field] || []}
      onToggle={(id) => toggle(field, id, maximum)} testIDPrefix={prefix} relevantIds={relevantIds}
      alwaysShowAll design="community" />
  );
  const section = (id, title, summary, children) => (
    <DiscoveryDisclosureSection id={id} title={title} summary={summary} expanded={expanded[id]}
      onToggle={() => setExpanded((previous) => ({ ...previous, [id]: !previous[id] }))}>
      {children}
    </DiscoveryDisclosureSection>
  );
  const needs = <DiscoveryOptionGroup label="צרכים שחשובים לי" helper="יוצגו רק תוצאות שבהן המידע הזה צוין במפורש"
    options={NEEDS} selectedIds={current.needIds || []} onToggle={(id) => toggle('needIds', id, NEEDS.length)}
    alwaysShowAll design="community" testIDPrefix="discovery-need" />;
  const atmosphere = <>
    {group('vibeIds', 'אווירה', VIBES, 'discovery-vibe', 8, relevant.vibes)}
    {routes && group('travelerStyleIds', 'סגנון טיול', TRAVELER_STYLES, 'discovery-style', 6, relevant.travelerStyles)}
    {group('environments', 'סביבה', ENVIRONMENTS, 'discovery-environment', ENVIRONMENTS.length, relevant.environments)}
  </>;

  return <View style={styles.content}>
    <DiscoveryDestinationAutocomplete destinations={current.destinations || []} onChange={(destinations) => patch({ destinations })} enabled={destinationsEnabled} design="community" />
    <DiscoveryCategorySelector filters={current} onChange={onChange} design="community" />
    {routes && <>
      <AppText style={s.filterHeading}>משך המסלול</AppText>
      <View style={s.durationChoices}>{durations.map(({ label, value }, index) => {
        const selected = Number(current.durationDays?.min) === value.min && String(current.durationDays?.max ?? '') === String(value.max);
        return <Pressable key={label} style={[s.durationChoice, selected && s.durationSelected]}
          accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: selected }} aria-checked={selected}
          onPress={() => patch({ durationDays: selected ? null : value })} testID={`discovery-duration-${index}`}>
          <AppText style={[s.activeLabel, selected && s.whiteLabel]}>{label}</AppText>
        </Pressable>;
      })}</View>
    </>}
    {group('budgetLevels', routes ? 'תקציב' : 'רמת מחיר', POST_BUDGETS, 'discovery-budget', POST_BUDGETS.length)}
    {routes ? <>
      {group('difficultyIds', 'רמת קושי', ROUTE_DIFFICULTIES, 'discovery-difficulty', 3)}
      {group('transportModeIds', 'איך מתניידים?', TRANSPORT_MODES, 'discovery-transport', TRANSPORT_MODES.length)}
      {section('advanced', 'אפשרויות מתקדמות', 'קצב, עונות, מרחק, אופי המסלול וצרכים נוספים', <>
        {group('paceIds', 'קצב', PACES, 'discovery-pace', PACES.length)}
        {group('seasons', 'עונות', SEASONS, 'discovery-season', SEASONS.length, relevant.seasons)}
        <MinMaxInputs label="טווח ימים" minValue={current.durationDays?.min ?? ''} maxValue={current.durationDays?.max ?? ''}
          onChangeMin={(min) => patch({ durationDays: { ...current.durationDays, min } })}
          onChangeMax={(max) => patch({ durationDays: { ...current.durationDays, max } })} />
        <MinMaxInputs label="מרחק מחושב" unitSuffix="ק״מ" minValue={current.distanceKm?.min ?? ''} maxValue={current.distanceKm?.max ?? ''}
          onChangeMin={(min) => patch({ distanceKm: { ...current.distanceKm, min } })}
          onChangeMax={(max) => patch({ distanceKm: { ...current.distanceKm, max } })} />
        {atmosphere}
        {needs}
      </>)}
    </> : <>
      {group('audienceIds', 'עם מי מטיילים?', TRAVEL_PARTIES, 'discovery-audience', 6)}
      {needs}
      {section('atmosphere', 'אווירה וסביבה', summarizeSelections(VIBES, current.vibeIds), atmosphere)}
    </>}
    {!!onUseProfile && <Pressable style={s.secondaryAction} onPress={onUseProfile} accessibilityRole="button" testID="discovery-use-profile">
      <AppText style={s.activeLabel}>מלאו מההעדפות שלי</AppText>
    </Pressable>}
  </View>;
}
