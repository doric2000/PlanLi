import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import FilterModal from './FilterModal';
import DiscoveryFilterContent from './DiscoveryFilterContent';
import { recommendationsFilterModalStyles as styles } from '../styles';
import { createEmptyDiscoveryFilters } from '../utils/discoveryFilters';
import { rememberDiscoveryDestinations } from '../utils/recentDiscoveryDestinations';

export default function RecommendationsFilterModal({
  visible,
  onClose,
  filters,
  onApply,
  onUseProfile,
}) {
  const [temporary, setTemporary] = useState(filters || {});
  useEffect(() => {
    if (visible) setTemporary(filters || {});
  }, [visible, filters]);
  return (
    <FilterModal visible={visible} tall title="סינון המלצות" onClose={onClose}
      overlayStyle={styles.modalOverlay} contentStyle={styles.modalContent}
      clearText="נקה הכול" applyText="הצג תוצאות"
      onClear={() => setTemporary(createEmptyDiscoveryFilters())}
      onApply={() => {
        rememberDiscoveryDestinations(temporary.destinations).catch(() => {});
        onApply?.(temporary);
      }}>
      {visible ? (
        <ScrollView style={styles.scrollWrapper} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          <DiscoveryFilterContent filters={temporary} onChange={setTemporary}
            surface="recommendations" destinationsEnabled={visible} onUseProfile={onUseProfile ? () => {
              const next = onUseProfile(temporary);
              if (next) setTemporary(next);
            } : null} />
        </ScrollView>
      ) : null}
    </FilterModal>
  );
}
