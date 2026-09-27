import React from 'react';
import { View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { recommendationMarkerAppearance } from '../styles/recommendationMarker';

export default function RecommendationMapBadge({ visual, selected, iconFontReady = true, testID }) {
  const { color, ...appearance } = recommendationMarkerAppearance(visual, selected);
  return <View testID={testID} collapsable={false} style={[appearance, { alignItems: 'center', justifyContent: 'center' }]}>
    {iconFontReady && <MaterialIcons name={visual.icon} size={22} color={color} />}
  </View>;
}
