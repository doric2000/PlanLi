import React from 'react';
import { View } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { cards, typography, colors } from '../../../styles'; // Adjust import paths based on location

export const InfoCard = ({ icon, title, data, subData, color, iconColor, library = 'Ionicons' }) => (
  <View style={[cards.info, { backgroundColor: color }]}>
    <View style={cards.infoHeader}>
      <AppText style={[typography.labelSmall, { color: colors.textSecondary }]}>{title}</AppText>
      {library === 'Material' ? (
        <MaterialCommunityIcons name={icon} size={20} color={iconColor} />
      ) : (
        <Ionicons name={icon} size={20} color={iconColor} />
      )}
    </View>
    <View style={cards.infoContent}>
      <AppText style={[typography.h4, { marginBottom: 2 }]}>{data || '-'}</AppText>
      <AppText style={[typography.caption, { color: colors.textLight }]}>{subData || ''}</AppText>
    </View>
  </View>
);