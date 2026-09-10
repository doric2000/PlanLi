import { Platform, StyleSheet } from 'react-native';
import { colors } from './colors';
import { fontFamilies } from './typography';

export const recommendationActionBarStyles = StyleSheet.create({
  compactActions: { minHeight: 44, paddingVertical: 0 },
  readMore: { minHeight: 44, minWidth: 72, marginRight: 'auto', justifyContent: 'center', flexShrink: 1 },
  readMoreText: { fontSize: 14, lineHeight: 20, fontFamily: fontFamilies.bold, color: colors.primary, writingDirection: 'rtl', textAlign: 'left' },
  bar: {
    backgroundColor: colors.white,
    // Isolate the physical right-hand anchor from native and inherited Web RTL.
    ...Platform.select({ web: {}, default: { direction: 'ltr' } }),
    paddingHorizontal: 16,
  },
  actions: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    alignItems: 'center',
    minHeight: 56,
    paddingVertical: 6,
  },
  group: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    width: 88,
    minHeight: 44,
    flexShrink: 0,
  },
  // Separate 44px targets for the heart and likes list, with an 8px visual gap.
  iconSlot: {
    width: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  countSlot: {
    width: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 4,
  },
  icon: {
    width: 22,
    height: 22,
    lineHeight: 22,
    includeFontPadding: false,
    textAlign: 'center',
  },
  count: {
    color: colors.primary,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamilies.semiBold,
    fontVariant: ['tabular-nums'],
    writingDirection: 'ltr',
    textAlign: 'right',
    includeFontPadding: false,
    maxWidth: '100%',
  },
  share: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
    marginRight: 'auto',
    gap: 8,
    flexShrink: 1,
  },
  shareText: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
    writingDirection: 'rtl',
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
});
