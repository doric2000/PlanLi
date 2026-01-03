import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, buttons, common } from '../../../styles';

const SUPPORT_ITEMS = [
  { icon: 'mail-outline', text: 'support@planli.app' },
  { icon: 'help-circle-outline', text: 'FAQ: Coming soon' },
  { icon: 'bug-outline', text: 'Report a bug: Nadav Cohen' },
  { icon: 'call-outline', text: '+972 54-286-9666' },
];

export default function SupportModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={common.supportModalOverlay}>
        <View style={common.supportModalCard}>
          <View style={common.supportHeader}>
            <Text style={[typography.sectionTitle, { fontWeight: '700', fontSize: 25 }]}>Help & Support</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={{ marginBottom: 12 }}>
            {SUPPORT_ITEMS.map((item) => (
              <View key={item.text} style={common.supportRow}>
                <View style={common.supportIconWrap}>
                  <Ionicons name={item.icon} size={18} color={colors.textSecondary} />
                </View>
                <Text style={common.supportBodyText}>{item.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity style={[buttons.primary, { marginTop: 14 }]} onPress={onClose} activeOpacity={0.85}>
            <Text style={buttons.primaryText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
