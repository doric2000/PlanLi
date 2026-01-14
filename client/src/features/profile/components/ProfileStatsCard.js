import React from 'react';
import { View, Text } from 'react-native';

import { cards, typography } from '../../../styles';

export default function ProfileStatsCard({ stats }) {
  return (
    <View style={cards.profileStats}>
      <View style={cards.profileStatItem}>
        <Text style={typography.profileStatNumber}>{stats?.reviews || 0}</Text>
        <Text style={typography.profileStatLabel}>המלצות</Text>
      </View>

      <View style={cards.profileStatDivider} />

      <View style={cards.profileStatItem}>
        <Text style={typography.profileStatNumber}>{stats?.trips || 0}</Text>
        <Text style={typography.profileStatLabel}>טיולים</Text>
      </View>
    </View>
  );
}
