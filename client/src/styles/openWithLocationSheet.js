import { StyleSheet } from 'react-native';

import { colors } from './colors';
import { layout, radii } from './designTokens';
import { spacing } from './spacing';
import { fontFamilies } from './typography';

export const openWithLocationSheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15,23,42,0.32)',
  },
  sheet: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: 10,
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  handle: {
    width: 42,
    height: 4,
    marginBottom: 10,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: colors.border,
  },
  header: {
    minHeight: layout.touchTarget,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerSide: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  options: {
    marginTop: spacing.md,
  },
  option: {
    minHeight: 54,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  optionText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontFamily: fontFamilies.medium,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
