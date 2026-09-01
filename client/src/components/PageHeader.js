import React from 'react';
import { View } from 'react-native';
import AppText from "./AppText";
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, pageHeaderStyles as styles, TAB_HERO_BASE_HEIGHT } from '../styles';

export default function PageHeader({
  title,
  subtitle,
  variant = 'main',
  renderStart,
  renderEnd,
  renderTitleAccessory,
  children,
  style,
  contentStyle,
  overlapNext = false,
  allowOverflow = false,
  testID,
  rootRef,
  onLayout,
}) {
  const insets = useSafeAreaInsets();
  const hero = variant === 'hero';
  const detail = variant === 'detail';
  const hasTop = Boolean(title || subtitle || renderStart || renderEnd || renderTitleAccessory);

  return (
    <View
      collapsable={false}
      ref={rootRef}
      onLayout={onLayout}
      testID={testID}
      style={[
        styles.shell,
        hero ? styles.hero : styles.surface,
        detail && styles.detail,
        overlapNext && styles.overlapNext,
        allowOverflow && styles.allowOverflow,
        {
          paddingTop: insets.top + (detail ? 4 : 8),
          ...(hero ? { height: insets.top + TAB_HERO_BASE_HEIGHT } : {}),
        },
        style,
      ]}
    >
      {hero ? (
        <LinearGradient
          pointerEvents="none"
          colors={colors.heroBlueGradient}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.heroBackground}
        />
      ) : null}
      <View style={[styles.content, contentStyle]}>
        {hasTop ? <View style={[styles.topRow, detail && styles.topRowDetail]}>
          <View style={styles.side}>{renderStart?.() || null}</View>
          <View style={styles.titleWrap}>
            <View style={styles.titleLine}>
              <AppText style={[styles.title, hero && styles.titleHero]} numberOfLines={1}>{title}</AppText>
              {renderTitleAccessory ? (
                <View style={styles.titleAccessory}>{renderTitleAccessory()}</View>
              ) : null}
            </View>
            {subtitle ? (
              <AppText style={[styles.subtitle, hero && styles.subtitleHero]} numberOfLines={2}>{subtitle}</AppText>
            ) : null}
          </View>
          <View style={[styles.side, styles.sideEnd]}>{renderEnd?.() || null}</View>
        </View> : null}
        {children ? <View style={styles.body}>{children}</View> : null}
      </View>
    </View>
  );
}
