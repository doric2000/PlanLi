import React from 'react';
import { View } from 'react-native';
import FlatDisclosureRow from './FlatDisclosureRow';
import { discoveryFilterStyles as styles } from '../styles';

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
      <FlatDisclosureRow
        title={title}
        summary={summary}
        expanded={expanded}
        onPress={onToggle}
        testID={`discovery-section-${id}`}
      />
      {expanded ? <View style={styles.disclosureBody}>{children}</View> : null}
    </View>
  );
}
