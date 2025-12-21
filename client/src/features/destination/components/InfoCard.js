import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { cards, typography, colors } from '../../../styles'; // Adjust import paths based on location

export const InfoCard = ({ icon, title, data, subData, color, iconColor, library = 'Ionicons' }) => (
  <View style={[cards.info, { backgroundColor: color }]}>
    <View style={cards.infoHeader}>
      <Text style={[typography.labelSmall, { color: colors.textSecondary }]}>{title}</Text>
      {library === 'Material' ? (
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      ) : (
        <Ionicons name={icon} size={20} color={iconColor} />
      )}
    </View>
    <View style={cards.infoContent}>
      <Text style={[typography.h4, { marginBottom: 2 }]}>{data || '-'}</Text>
      <Text style={[typography.caption, { color: colors.textLight }]}>{subData || ''}</Text>
    </View>
  </View>
);