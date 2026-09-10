import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import FilterModal from './FilterModal';
import DiscoveryFilterContent from './DiscoveryFilterContent';
import { routesFilterModalStyles as styles } from '../styles';
import { createEmptyDiscoveryFilters } from '../utils/discoveryFilters';
import { rememberDiscoveryDestinations } from '../utils/recentDiscoveryDestinations';
import { communityDiscoveryStyles as communityStyles } from '../styles/communityDiscovery';

export default function RoutesFilterModal({ visible, onClose, filters, onApply, onUseProfile }) {
  const [temporary, setTemporary] = useState(filters || {});
  useEffect(() => {
    if (visible) setTemporary(filters || {});
  }, [visible, filters]);
  return (
    <FilterModal visible={visible} tall title="סינון מסלולים" onClose={onClose} presentation="community"
      subtitle="אפשר לבחור כמה אפשרויות. לכל לשונית נשמר הסינון שלה."
      overlayStyle={styles.modalOverlay} contentStyle={styles.modalContent}
      clearText="נקה הכול" applyText="הצג תוצאות"
      onClear={() => setTemporary((current) => ({ ...createEmptyDiscoveryFilters(), query: current.query || '' }))}
      onApply={() => {
        rememberDiscoveryDestinations(temporary.destinations).catch(() => {});
        onApply?.(temporary);
      }}>
      {visible ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scrollContent, communityStyles.sheetContent]}>
          <DiscoveryFilterContent filters={temporary} onChange={setTemporary}
            surface="routes" destinationsEnabled={visible} onUseProfile={onUseProfile ? () => {
              const next = onUseProfile(temporary);
              if (next) setTemporary(next);
            } : null} />
        </ScrollView>
      ) : null}
    </FilterModal>
  );
}
