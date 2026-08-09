import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, spacing } from '../styles';

export default function EmptyState({ icon = 'inbox', title, message, children }) {
  return (
    <View style={styles.wrap}>
      <MaterialIcons name={icon} size={38} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexGrow: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { marginTop: 12, color: colors.textPrimary, fontSize: 18, fontWeight: '800', textAlign: 'center', writingDirection: 'rtl' },
  message: { marginTop: 6, color: colors.textSecondary, fontSize: 14, lineHeight: 20, textAlign: 'center', writingDirection: 'rtl' },
});
