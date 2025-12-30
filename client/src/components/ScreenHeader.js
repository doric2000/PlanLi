import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, common, spacing, typography } from '../styles';

/**
 * Reusable Header Component.
 * Enforces a symmetrical 3-column layout.
 */
const ScreenHeader = ({ title, subtitle, renderRight, renderLeft }) => {
  return (
    <View style={styles.headerRow}>
      
      {/* Right Side (Actions) */}
      <View style={styles.sideContainerRight}>
        {renderRight ? renderRight() : null}
      </View>

      {/* Center (Title) */}
      <View style={styles.centerContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>

      {/* Left Side (Navigation/Sort) */}
      <View style={styles.sideContainerLeft}>
        {renderLeft ? renderLeft() : null}
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row-reverse', // RTL Support
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    minHeight: 60,
  },
  sideContainerRight: {
    width: 80, // Fixed width enforces symmetry
    height: 40,
    alignItems: 'flex-start', // RTL Start
    justifyContent: 'center',
  },
  sideContainerLeft: {
    width: 80, // Fixed width
    height: 40,
    alignItems: 'flex-end', // RTL End
    justifyContent: 'center',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...common.screenHeaderTitle,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 2,
  },
});

export default ScreenHeader;