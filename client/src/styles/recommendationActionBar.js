import { Platform, StyleSheet } from 'react-native';
import { colors } from './colors';
import { fontFamilies } from './typography';

export const recommendationActionBarStyles = StyleSheet.create({
  compactActions: { minHeight: 44, paddingVertical: 0 },
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
  // Comments have one combined target, unlike the separate heart/list targets.
  comments: { flexDirection: 'row-reverse', alignItems: 'center', width: 52, minHeight: 44, gap: 3, flexShrink: 0 },
  commentIcon: { width: 22, alignItems: 'center' },
  commentCount: { width: 27, alignItems: 'center' },
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
    width: 44,
    minHeight: 44,
    marginRight: 'auto',
    flexShrink: 0,
  },
  addToTrip: {
    minWidth: 70,
    minHeight: 44,
    paddingHorizontal: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    flexShrink: 0,
  },
  addToTripText: {
    color: colors.accentAction,
    fontSize: 13,
    fontFamily: fontFamilies.bold,
    writingDirection: 'rtl',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
});
