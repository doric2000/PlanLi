import { fontFamilies } from "../styles/typography";
import React from 'react';
import { StyleSheet, View } from 'react-native';
import AppText from "./AppText";
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout, radii } from '../styles';

export default function PageHeader({
  title,
  subtitle,
  variant = 'main',
  renderStart,
  renderEnd,
  children,
  style,
  contentStyle,
  overlapNext = false,
  allowOverflow = false,
  testID,
}) {
  const insets = useSafeAreaInsets();
  const hero = variant === 'hero';
  const detail = variant === 'detail';
  const hasTop = Boolean(title || subtitle || renderStart || renderEnd);
  const Container = hero ? LinearGradient : View;
  const containerProps = hero
    ? { colors: colors.heroBlueGradient, start: { x: 0.15, y: 0 }, end: { x: 0.9, y: 1 } }
    : {};

  return (
    <Container
      {...containerProps}
      testID={testID}
      style={[
        styles.shell,
        hero ? styles.hero : styles.surface,
        detail && styles.detail,
        overlapNext && styles.overlapNext,
        allowOverflow && styles.allowOverflow,
        { paddingTop: insets.top + (detail ? 4 : 8) },
        style,
      ]}
    >
      <View style={[styles.content, contentStyle]}>
        {hasTop ? <View style={[styles.topRow, detail && styles.topRowDetail]}>
          <View style={styles.side}>{renderStart?.() || null}</View>
          <View style={styles.titleWrap}>
            <AppText style={[styles.title, hero && styles.titleHero]} numberOfLines={1}>{title}</AppText>
            {subtitle ? (
              <AppText style={[styles.subtitle, hero && styles.subtitleHero]} numberOfLines={2}>{subtitle}</AppText>
            ) : null}
          </View>
          <View style={[styles.side, styles.sideEnd]}>{renderEnd?.() || null}</View>
        </View> : null}
        {children ? <View style={styles.body}>{children}</View> : null}
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
    overflow: 'hidden',
  },
  surface: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  hero: {
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
    paddingBottom: 18,
  },
  overlapNext: {
    marginBottom: -radii.xl,
    position: 'relative',
    zIndex: 5,
    elevation: 5,
  },
  allowOverflow: {
    overflow: 'visible',
  },
  detail: {
    backgroundColor: colors.surfaceElevated,
  },
  content: {
    width: '100%',
    maxWidth: layout.screenMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  topRow: {
    minHeight: 58,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  topRowDetail: { minHeight: 48 },
  side: {
    width: 72,
    minHeight: layout.touchTarget,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sideEnd: { alignItems: 'flex-start' },
  titleWrap: { flex: 1, alignItems: 'center', minWidth: 0 },
  title: {
    color: colors.textPrimary,
    fontSize: 24,
    lineHeight: 30,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  titleHero: { color: colors.white },
  subtitle: {
    marginTop: 2,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamilies.medium,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  subtitleHero: { color: 'rgba(255,255,255,0.72)' },
  body: { paddingTop: 8, position: 'relative', zIndex: 2 },
});
