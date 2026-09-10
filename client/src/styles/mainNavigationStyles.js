import { Platform, StyleSheet } from 'react-native';
import { fontFamilies } from './typography';
import { TAB_BAR_HEIGHT } from '../navigation/tabBarLayout';

export const navigationPalette = {
  navy: '#1E3A5F', orange: '#FF9F1C', softBlue: '#EDF2F6',
  sand: '#FAF7F2', softOrange: '#FFF0DB', muted: '#647184', white: '#FFFFFF',
};

const c = navigationPalette;
const physicalDirection = Platform.OS === 'web' ? { writingDirection: 'ltr' } : { direction: 'ltr' };
export const mainNavigationStyles = StyleSheet.create({
  bar: {
    position: 'absolute', left: 12, right: 12, height: TAB_BAR_HEIGHT,
    flexDirection: 'row', ...physicalDirection, alignItems: 'stretch',
    borderRadius: 28, paddingHorizontal: 6, paddingVertical: 8,
    backgroundColor: c.white,
    shadowColor: '#14263B', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09, shadowRadius: 20, elevation: 8,
  },
  slot: { flex: 1, minWidth: 0, height: 54, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  selected: { backgroundColor: c.softBlue },
  label: { color: c.navy, fontSize: 12, lineHeight: 16, fontFamily: fontFamilies.semiBold, textAlign: 'center', writingDirection: 'rtl' },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: c.softBlue },
  create: { width: 48, height: 48, borderRadius: 16, backgroundColor: c.orange, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  unread: { position: 'absolute', top: -5, right: -8, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3, borderWidth: 1, borderColor: c.white, backgroundColor: c.orange, alignItems: 'center', justifyContent: 'center' },
  unreadText: { fontSize: 10, lineHeight: 14, fontFamily: fontFamilies.bold, color: c.navy, textAlign: 'center', writingDirection: 'ltr', includeFontPadding: false },
  pressed: { opacity: 0.72 },
  modeWrap: { paddingHorizontal: 20, paddingVertical: 12, backgroundColor: c.sand },
  modes: { flexDirection: 'row-reverse', ...physicalDirection, padding: 4, gap: 4, borderRadius: 20, backgroundColor: c.softBlue },
  mode: { flex: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8 },
  modeSelected: { backgroundColor: c.navy },
  modeText: { fontFamily: fontFamilies.semiBold, fontSize: 14, lineHeight: 20, color: c.navy, textAlign: 'center', writingDirection: 'rtl' },
  modeTextSelected: { color: c.white },
  sheetScreen: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,27,48,0.42)' },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: { flexGrow: 0, maxHeight: '90%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: c.sand },
  sheetContent: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E4E4DF' },
  sheetHeader: { ...physicalDirection, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: fontFamilies.bold, fontSize: 26, lineHeight: 32, color: c.navy, textAlign: 'right', writingDirection: 'rtl' },
  description: { fontFamily: fontFamilies.regular, fontSize: 14, lineHeight: 20, color: c.muted, textAlign: 'right', writingDirection: 'rtl' },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.white, alignItems: 'center', justifyContent: 'center' },
  action: { minHeight: 84, padding: 12, borderRadius: 20, ...physicalDirection, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: c.white },
  planAction: { backgroundColor: c.softOrange },
  actionIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: c.softBlue, alignItems: 'center', justifyContent: 'center' },
  planIcon: { backgroundColor: c.orange },
  actionTitle: { fontFamily: fontFamilies.semiBold, fontSize: 16, lineHeight: 22, color: c.navy, textAlign: 'right', writingDirection: 'rtl' },
  soon: { fontFamily: fontFamilies.semiBold, fontSize: 12, color: c.navy, writingDirection: 'rtl' },
});
