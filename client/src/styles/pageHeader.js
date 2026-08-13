import { StyleSheet } from 'react-native';

import { colors } from './colors';
import { layout, radii } from './designTokens';
import { fontFamilies } from './typography';

export const TAB_HERO_BASE_HEIGHT = 150;

export const pageHeaderStyles = StyleSheet.create({
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
