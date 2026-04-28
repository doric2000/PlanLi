import React from 'react';
import { View, Text } from 'react-native';
import { colors, common, spacing, typography, screenHeaderStyles as styles } from '../styles';

/**
 * Reusable Header Component.
 * Enforces a symmetrical 3-column layout.
 */
const ScreenHeader = ({ title, subtitle, renderRight, renderLeft, compact = false }) => {
  return (
    <View style={[styles.headerRow, compact && styles.headerRowCompact]}>
      
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



export default ScreenHeader;
