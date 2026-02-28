import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, community } from '../../../styles';

export const SortMenuModal = ({ visible, onClose, sortBy, onSelect }) => {
  const options = [
    { key: 'popularity', label: 'הכי פופולרי', icon: 'trending-up-outline' },
    { key: 'newest', label: 'הכי חדש', icon: 'time-outline' },
    { key: 'nearby', label: 'הכי קרוב אליי', icon: 'navigate-outline' },
  ];

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={community.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={community.sortMenu}>
          <Text style={community.sortTitle}>מיין לפי</Text>
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
                <Text
                  style={[
                    community.sortOptionText,
                    sortBy === option.key && community.sortOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </View>
              {sortBy === option.key && <Ionicons name="checkmark" size={18} color={colors.primary} />}
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
};
