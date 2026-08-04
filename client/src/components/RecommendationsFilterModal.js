import React, { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import FilterModal from './FilterModal';
import DiscoveryFilterContent from './DiscoveryFilterContent';
import { recommendationsFilterModalStyles as styles } from '../styles';

export default function RecommendationsFilterModal({
  visible,
  onClose,
  filters,
  onApply,
  onClear,
  onUseProfile,
}) {
  const [temporary, setTemporary] = useState(filters || {});
  useEffect(() => {
    if (visible) setTemporary(filters || {});
  }, [visible, filters]);
  return (
    <FilterModal visible={visible} tall title="סינון המלצות" onClose={onClose} onClear={onClear}
      onApply={() => onApply?.(temporary)}>
      <ScrollView style={styles.scrollWrapper} showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <DiscoveryFilterContent filters={temporary} onChange={setTemporary} onUseProfile={onUseProfile ? () => {
          const next = onUseProfile(temporary);
          if (next) setTemporary(next);
        } : null} />
      </ScrollView>
    </FilterModal>
  );
}
