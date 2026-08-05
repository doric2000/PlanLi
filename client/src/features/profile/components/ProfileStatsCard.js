import React from 'react';
import { Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const STATS = [
  { key: 'recommendations', label: 'המלצות', icon: 'thumb-up', color: '#E85D3F' },
  { key: 'routes', label: 'מסלולים', icon: 'map', color: '#2563EB' },
  { key: 'likesReceived', label: 'לייקים', icon: 'favorite', color: '#DB2777' },
];

export default function ProfileStatsCard({ stats, loading, styles }) {
  return (
    <View style={styles.statsCard} accessibilityRole="summary">
      {STATS.map((item, index) => (
        <React.Fragment key={item.key}>
          <View style={styles.statItem}>
            <View style={[styles.statIconBubble, { backgroundColor: `${item.color}18` }]}>
              <MaterialIcons name={item.icon} size={17} color={item.color} />
            </View>
            {loading ? (
              <View style={styles.statSkeleton} />
            ) : (
              <Text style={styles.statNumber}>{Number(stats?.[item.key] || 0)}</Text>
            )}
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
          {index < STATS.length - 1 ? <View style={styles.statDivider} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}
