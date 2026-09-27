import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import FilterModal from '../../../components/FilterModal';
import DiscoveryFilterContent from '../../../components/DiscoveryFilterContent';
import { createEmptyDiscoveryFilters } from '../../../utils/discoveryFilters';
import { communityDiscoveryStyles as styles } from '../../../styles/communityDiscovery';

export default function CityFilterModal({ visible, onClose, filters, onApply, kind, cityName }) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => { if (visible) setDraft(filters); }, [visible, filters]);
  return <FilterModal visible={visible} onClose={onClose} tall presentation="community"
    title={kind === 'routes' ? 'סינון מסלולים' : 'סינון המלצות'} subtitle={`התוצאות נשארות בתוך ${cityName}`}
    clearText="נקה הכול" applyText="הצג תוצאות"
    onClear={() => setDraft({ ...createEmptyDiscoveryFilters(), query: draft?.query || '' })}
    onApply={() => onApply({ ...draft, destinations: [] })}>
    {visible && <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
      <DiscoveryFilterContent filters={draft} onChange={setDraft} surface={kind} showDestinations={false} />
    </ScrollView>}
  </FilterModal>;
}
