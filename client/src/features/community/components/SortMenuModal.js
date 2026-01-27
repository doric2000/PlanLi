import React from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../../styles';

export const SortMenuModal = ({ visible, onClose, sortBy, onSelect }) => {
  return (
    <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.sortMenu}>
          <Text style={{ ...typography.h3, textAlign: 'center', marginBottom: spacing.md }}>מיין לפי</Text>
          {['popularity', 'newest'].map((option) => (
            <TouchableOpacity 
              key={option}
              style={[styles.sortOption, sortBy === option && { backgroundColor: colors.background }]}
              onPress={() => onSelect(option)}
            >
              <View style={styles.sortOptionLabelRow}>
                <Ionicons
                  name={option === 'popularity' ? 'trending-up-outline' : 'time-outline'}
                  size={16}
                  color={sortBy === option ? colors.primary : colors.textSecondary}
                  style={{ marginLeft: 6 }}
                />
                <Text style={{ color: sortBy === option ? colors.primary : colors.textPrimary }}>
                  {option === 'popularity' ? 'הכי פופולרי' : 'הכי חדש'}
                </Text>
              </View>
              {sortBy === option && <Ionicons name="checkmark" size={18} color={colors.primary} />}
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