import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
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
      {!!label && <Text style={styles.optionGroupLabel}>{label}</Text>}
      {!!helper && <Text style={styles.optionGroupHelper}>{helper}</Text>}
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
              <Text style={[styles.optionChipText, active && styles.optionChipTextSelected]}>
                {option.postLabel || option.label}
              </Text>
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
          <Text style={styles.showAllText}>הצג הכול ({result.hiddenCount} נוספים)</Text>
        </TouchableOpacity>
      ) : expanded && !alwaysShowAll && (options || []).length > collapsedLimit ? (
        <TouchableOpacity style={styles.showAllButton} onPress={() => setExpanded(false)} accessibilityRole="button">
          <Text style={styles.showAllText}>הצג פחות</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
