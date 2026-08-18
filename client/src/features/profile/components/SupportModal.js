import { fontFamilies } from "../../../styles/typography";
import React from 'react';
import { Modal, View, TouchableOpacity } from 'react-native';
import AppText from "../../../components/AppText";
import { Ionicons } from '@expo/vector-icons';

import { colors, typography, buttons, common } from '../../../styles';

const SUPPORT_ITEMS = [
  { icon: 'mail-outline', text: 'planli.travel.il@gmail.com' },
  { icon: 'help-circle-outline', text: 'מענה לשאלות, ערעורים ודיווחי בטיחות' },
  { icon: 'bug-outline', text: 'דיווח על תקלה: planli.travel.il@gmail.com' },
  { icon: 'call-outline', text: '+972 52-535-2725' },
];

export default function SupportModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={common.supportModalOverlay}>
        <View style={common.supportModalCard}>
          <View style={common.supportHeader}>
            <AppText style={[typography.sectionTitle, { fontFamily: fontFamilies.semiBold, fontSize: 25 }]}>עזרה ותמיכה</AppText>
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
                <AppText style={common.supportBodyText}>{item.text}</AppText>
              </View>
            ))}
          </View>

          <TouchableOpacity style={[buttons.primary, { marginTop: 14 }]} onPress={onClose} activeOpacity={0.85}>
            <AppText style={buttons.primaryText}>סגירה</AppText>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
