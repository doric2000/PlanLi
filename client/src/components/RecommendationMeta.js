import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { common, typography, colors, tags as tagsStyle } from '../styles';

export const RecommendationMeta = ({ item, navigation }) => {
  return (
    <View style={[common.row, { flexWrap: 'wrap', gap: 12, marginBottom: 16 }]}> 
      {(item.location || item.country) && (
        <TouchableOpacity 
          style={common.row}
          onPress={() => {
            if (item.cityId && item.countryId) {
              navigation.navigate('LandingPage', {
                cityId: item.cityId,
                countryId: item.countryId
              });
            }
          }}
        >
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text style={[typography.body, { color: colors.textSecondary, marginLeft: 4 }]}> 
            {item.location}{item.country ? `, ${item.country}` : ''}
          </Text>
        </TouchableOpacity>
      )}
      
      {item.rating && (
        <View style={common.ratingContainer}>
          <Text style={common.ratingStar}>★</Text>
          <Text style={common.ratingText}>{item.rating}</Text>
        </View>
      )}

      {item.budget && (
        <View style={[tagsStyle.chip, { backgroundColor: colors.secondaryLight, borderColor: colors.secondary }]}> 
          <Text style={[tagsStyle.chipText, { color: colors.secondary }]}>{item.budget}</Text>
        </View>
      )}
    </View>
  );
};
