import React from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';

import AppText from './AppText';
import { colors } from '../styles';

export function CenteredRefreshControl({ refreshing, onRefresh, ...props }) {
  return (
    <RefreshControl
      {...props}
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={['transparent']}
      tintColor="transparent"
      progressBackgroundColor="transparent"
    />
  );
}

export function CenteredRefreshState({
  accessibilityLabel = 'מרענן את התוכן',
  confirming = false,
  confirmationText = 'הכול מעודכן',
  style,
  testID = 'centered-refresh-state',
}) {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      accessibilityRole={confirming ? 'text' : 'progressbar'}
      style={[styles.container, style]}
      testID={testID}
    >
      {confirming ? (
        <AppText style={styles.confirmationText}>{confirmationText}</AppText>
      ) : (
        <ActivityIndicator size="large" color={colors.primary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmationText: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
