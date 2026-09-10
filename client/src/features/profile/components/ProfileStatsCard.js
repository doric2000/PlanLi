import React from 'react';
import { View } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../../styles';

const OUTLINE_ICONS = { recommendations: 'thumbs-up-outline', routes: 'map-outline', likesReceived: 'heart-outline' };

const STATS = [
  { key: 'recommendations', label: 'המלצות', icon: 'thumb-up', color: '#E85D3F' },
  { key: 'routes', label: 'מסלולים', icon: 'map', color: '#2563EB' },
  { key: 'likesReceived', label: 'לייקים', icon: 'favorite', color: '#DB2777' },
];

export default function ProfileStatsCard({ stats, loading, styles, refreshed = false }) {
  return (
    <View style={styles.statsCard} accessibilityRole="summary">
      {STATS.map((item, index) => (
        <React.Fragment key={item.key}>
          <View style={styles.statItem}>
            <View style={[styles.statIconBubble, { backgroundColor: refreshed ? 'transparent' : `${item.color}18` }]}>
              {refreshed ? <Ionicons name={OUTLINE_ICONS[item.key]} size={20} color={colors.primary} /> : <MaterialIcons name={item.icon} size={17} color={item.color} />}
            </View>
            {loading ? (
              <View style={styles.statSkeleton} />
            ) : (
              <AppText style={styles.statNumber}>{Number(stats?.[item.key] || 0)}</AppText>
            )}
            <AppText style={styles.statLabel}>{item.label}</AppText>
          </View>
          {index < STATS.length - 1 ? <View style={styles.statDivider} /> : null}
        </React.Fragment>
      ))}
    </View>
  );
}
