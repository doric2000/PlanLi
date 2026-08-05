import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, discoveryFilterStyles as styles } from '../styles';

export default function DiscoveryDisclosureSection({
  id,
  title,
  summary = 'לא נבחר',
  expanded,
  onToggle,
  children,
}) {
  return (
    <View style={styles.disclosureSection}>
      <TouchableOpacity
        style={styles.disclosureHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: Boolean(expanded) }}
        accessibilityLabel={`${title}, ${summary}`}
        testID={`discovery-section-${id}`}
      >
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.textSecondary}
        />
        <View style={styles.disclosureTitleWrap}>
          <Text style={styles.disclosureTitle}>{title}</Text>
          <Text style={styles.disclosureSummary} numberOfLines={1}>{summary}</Text>
        </View>
      </TouchableOpacity>
      {expanded ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}
