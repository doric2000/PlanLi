import { fontFamilies } from "../styles/typography";
import React from 'react';
import { StyleSheet, View } from 'react-native';
import AppText from "./AppText";
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing } from '../styles';

export default function EmptyState({ icon = 'inbox', title, message, children }) {
  return (
    <View style={styles.wrap}>
      <MaterialIcons name={icon} size={38} color={colors.textMuted} />
      <AppText style={styles.title}>{title}</AppText>
      {message ? <AppText style={styles.message}>{message}</AppText> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { marginTop: 12, color: colors.textPrimary, fontSize: 18, fontFamily: fontFamilies.semiBold, textAlign: 'center', writingDirection: 'rtl' },
  message: { marginTop: 6, color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', writingDirection: 'rtl' },
});
