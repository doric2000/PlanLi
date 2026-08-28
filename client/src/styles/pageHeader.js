import { StyleSheet } from 'react-native';

import { colors } from './colors';
import { layout, radii } from './designTokens';
import { fontFamilies } from './typography';

export const TAB_HERO_BASE_HEIGHT = 150;
export const TAB_HERO_ACTION_HEIGHT = layout.touchTarget;
export const TAB_HERO_OVERLAP = radii.xl;
export const TAB_HERO_SEARCH_ICON_SIZE = 19;
export const TAB_HERO_SIDE_WIDTH = 80;

export const pageHeaderStyles = StyleSheet.create({
  shell: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  surface: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  hero: {
    borderBottomLeftRadius: TAB_HERO_OVERLAP,
    borderBottomRightRadius: TAB_HERO_OVERLAP,
    paddingBottom: 18,
  },
  heroBackground: {
    ...StyleSheet.absoluteFillObject,
    borderBottomLeftRadius: TAB_HERO_OVERLAP,
    borderBottomRightRadius: TAB_HERO_OVERLAP,
  },
  overlapNext: {
    marginBottom: -TAB_HERO_OVERLAP,
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
    minHeight: 56,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  topRowDetail: { minHeight: 48 },
  side: {
    width: TAB_HERO_SIDE_WIDTH,
    minHeight: TAB_HERO_ACTION_HEIGHT,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sideEnd: { alignItems: 'flex-start' },
  titleWrap: { flex: 1, alignItems: 'center', minWidth: 0 },
  titleLine: {
    minHeight: TAB_HERO_ACTION_HEIGHT,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  titleAccessory: {
    width: TAB_HERO_ACTION_HEIGHT,
    height: TAB_HERO_ACTION_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
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

export const tabHeroStyles = StyleSheet.create({
  fixedHeader: {
    position: 'relative',
    zIndex: 100,
    elevation: 12,
  },
  iconAction: {
    width: TAB_HERO_ACTION_HEIGHT,
    height: TAB_HERO_ACTION_HEIGHT,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelAction: {
    width: TAB_HERO_SIDE_WIDTH,
    height: TAB_HERO_ACTION_HEIGHT,
    borderRadius: 14,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  labelText: {
    color: colors.white,
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
    writingDirection: 'rtl',
  },
  mapLabelAction: {
    width: 136,
    paddingHorizontal: 9,
  },
  mapLabelText: {
    flexShrink: 1,
    fontSize: 11,
  },
  searchRow: {
    position: 'relative',
    zIndex: 20,
    marginTop: 12,
  },
  searchField: {
    width: '100%',
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 9,
  },
  searchIcon: {
    position: 'relative',
    top: 0,
    right: 0,
    marginLeft: 0,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: colors.white,
    fontSize: 15,
    fontFamily: fontFamilies.semiBold,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bodyContentInset: {
    paddingTop: TAB_HERO_OVERLAP,
  },
});
