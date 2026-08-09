import React from 'react';
import { View, TouchableOpacity, Modal } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons } from '@expo/vector-icons';
import { colors, community } from '../../../styles';

export const SortMenuModal = ({ visible, onClose, sortBy, onSelect, personalizationAvailable = false, includeNearby = true }) => {
  const options = [
    ...(personalizationAvailable
      ? [{ key: 'personalized', label: 'בשבילך', icon: 'person-outline' }]
      : []),
    { key: 'popularity', label: 'הכי פופולרי', icon: 'trending-up-outline' },
    { key: 'newest', label: 'הכי חדש', icon: 'time-outline' },
    ...(includeNearby ? [{ key: 'nearby', label: 'הכי קרוב אליי', icon: 'navigate-outline' }] : []),
  ];

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={community.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={community.sortMenu}>
          <AppText style={community.sortTitle}>מיין לפי</AppText>
          {options.map((option) => (
            <TouchableOpacity 
              key={option.key}
              style={[community.sortOption, sortBy === option.key && community.sortOptionSelected]}
              onPress={() => onSelect(option.key)}
            >
              <View style={community.sortOptionLabelRow}>
                <Ionicons
                  name={option.icon}
                  size={16}
                  color={sortBy === option.key ? colors.primary : colors.textSecondary}
                  style={community.sortOptionIcon}
                />
                <AppText
                  style={[
                    community.sortOptionText,
                    sortBy === option.key && community.sortOptionTextSelected,
                  ]}
                >
                  {option.label}
                </AppText>
              </View>
              {sortBy === option.key && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};
