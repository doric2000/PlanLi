import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../styles';

export const SortMenuModal = ({ visible, onClose, sortBy, onSelect }) => {
  const options = [
    { key: 'popularity', label: 'הכי פופולרי', icon: 'trending-up-outline' },
    { key: 'newest', label: 'הכי חדש', icon: 'time-outline' },
    { key: 'nearby', label: 'הכי קרוב אליי', icon: 'navigate-outline' },
  ];

  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sortMenu}>
          <Text style={{ ...typography.h3, textAlign: 'center', marginBottom: spacing.md }}>מיין לפי</Text>
          {options.map((option) => (
            <TouchableOpacity 
              key={option.key}
              style={[styles.sortOption, sortBy === option.key && { backgroundColor: colors.background }]}
              onPress={() => onSelect(option.key)}
            >
              <View style={styles.sortOptionLabelRow}>
                <Ionicons
                  name={option.icon}
                  size={16}
                  color={sortBy === option.key ? colors.primary : colors.textSecondary}
                  style={{ marginLeft: 6 }}
                />
                <Text style={{ color: sortBy === option.key ? colors.primary : colors.textPrimary }}>
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

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' },
  sortMenu: { width: 220, backgroundColor: 'white', borderRadius: 12, padding: spacing.md, elevation: 5, },
  sortOption: { flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  sortOptionLabelRow: { flexDirection: 'row-reverse', alignItems: 'center' }
});