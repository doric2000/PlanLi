import React, { useMemo, useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import AppText from "./AppText";
import { discoveryFilterStyles as styles } from '../styles';
import { orderProgressiveOptions } from '../utils/progressiveDiscoveryFilters';

const optionId = (option) => option?.value || option?.id;

export default function DiscoveryOptionGroup({
  label,
  helper,
  options,
  selectedIds,
  relevantIds,
  onToggle,
  testIDPrefix,
  collapsedLimit = 6,
  alwaysShowAll = false,
}) {
  const [expanded, setExpanded] = useState(alwaysShowAll);
  const selected = new Set(selectedIds || []);
  const result = useMemo(() => orderProgressiveOptions(options, selectedIds, relevantIds, {
    expanded: expanded || alwaysShowAll,
    collapsedLimit,
  }), [alwaysShowAll, collapsedLimit, expanded, options, relevantIds, selectedIds]);

  return (
    <View style={styles.optionGroup}>
      {!!label && <AppText style={styles.optionGroupLabel}>{label}</AppText>}
      {!!helper && <AppText style={styles.optionGroupHelper}>{helper}</AppText>}
      <View style={styles.optionGrid}>
        {result.options.map((option) => {
          const id = optionId(option);
          const active = selected.has(id);
          const sourceIndex = Math.max(0, (options || []).findIndex((item) => optionId(item) === id));
          return (
            <TouchableOpacity
              key={id}
              style={[styles.optionChip, active && styles.optionChipSelected]}
              onPress={() => onToggle?.(id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              testID={testIDPrefix ? `${testIDPrefix}-${sourceIndex}` : undefined}
            >
              <AppText style={[styles.optionChipText, active && styles.optionChipTextSelected]}>
                {option.postLabel || option.label}
              </AppText>
            </TouchableOpacity>
          );
        })}
      </View>
      {result.hiddenCount > 0 && !alwaysShowAll ? (
        <TouchableOpacity
          style={styles.showAllButton}
          onPress={() => setExpanded(true)}
          accessibilityRole="button"
          testID={`${testIDPrefix || 'discovery-options'}-show-all`}
        >
          <AppText style={styles.showAllText}>הצג הכול ({result.hiddenCount} נוספים)</AppText>
        </TouchableOpacity>
      ) : expanded && !alwaysShowAll && (options || []).length > collapsedLimit ? (
        <TouchableOpacity style={styles.showAllButton} onPress={() => setExpanded(false)} accessibilityRole="button">
          <AppText style={styles.showAllText}>הצג פחות</AppText>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
