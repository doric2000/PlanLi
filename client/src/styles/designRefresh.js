import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { fontFamilies } from './typography';
import { homeScreenStyles } from './appStyles';
import { userDrawerStyles, drawerMenuListStyles } from './userMenu';

// Scoped to the Home / Profile / Drawer refresh, not global tokens.
export const refreshPalette = { sand: '#FAF7F2', ink: '#172C43', muted: '#647184', softBlue: '#EDF2F6', softOrange: '#FFF0DB' };
const text = { textAlign: 'right', writingDirection: 'rtl', color: refreshPalette.ink, fontFamily: fontFamilies.regular };
const heading = { ...text, fontFamily: fontFamilies.bold, fontSize: 21, lineHeight: 28 };

export const homeRefreshStyles = StyleSheet.create({
  screen: { backgroundColor: refreshPalette.sand },
  dashboard: { paddingHorizontal: 20, paddingTop: 20, gap: 24, width: '100%', maxWidth: 960, alignSelf: 'center' },
  quickRow: { flexDirection: 'row-reverse', gap: 8 },
  quick: { flex: 1, minWidth: 0, minHeight: 82, paddingHorizontal: 6, paddingVertical: 14, borderRadius: 10, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', gap: 8 },
  quickText: { ...text, textAlign: 'center', fontSize: 14, lineHeight: 20, fontFamily: fontFamilies.semiBold, color: colors.primary },
  hero: { minHeight: 230, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.primary },
  heroImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  heroContent: { minHeight: 230, padding: 16, gap: 24, justifyContent: 'space-between' },
  heroTop: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  scope: { ...text, fontFamily: fontFamilies.semiBold, fontSize: 12, lineHeight: 18, color: colors.white, flex: 1 },
  changeRegion: { backgroundColor: colors.white, borderRadius: 22, minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' },
  changeText: { ...text, fontSize: 14, color: colors.primary },
  heroCopy: { gap: 8 },
  heroTitle: { ...heading, fontSize: 26, lineHeight: 32, color: colors.white },
  heroSubtitle: { ...text, fontSize: 14, lineHeight: 20, color: colors.white },
  heroButton: { minHeight: 48, borderRadius: 10, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.secondary },
  heroButtonText: { ...text, color: colors.primary, fontSize: 16, lineHeight: 22, fontFamily: fontFamilies.semiBold, flexShrink: 1 },
  createRoute: { minHeight: 48, borderRadius: 10, backgroundColor: colors.white, flexDirection: 'row-reverse', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 12 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitle: { ...heading, flex: 1 },
  sectionLink: { minHeight: 44, justifyContent: 'center', maxWidth: '42%' },
  sectionLinkText: { ...text, color: colors.primary, fontSize: 14, lineHeight: 20 },
  savedRow: { flexDirection: 'row-reverse', gap: 12 },
  savedCard: { flex: 1, minWidth: 0, backgroundColor: colors.white, borderRadius: 20, overflow: 'hidden' },
  savedPhoto: { height: 116, backgroundColor: refreshPalette.softBlue, alignItems: 'center', justifyContent: 'center' },
  savedIcon: { position: 'absolute', top: 8, left: 8, width: 36, height: 36, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  savedCopy: { padding: 12, gap: 4 },
  savedTitle: { ...text, fontSize: 16, lineHeight: 22, fontFamily: fontFamilies.semiBold },
  savedMeta: { ...text, fontSize: 12, lineHeight: 18, color: refreshPalette.muted },
  empty: { backgroundColor: colors.white, padding: 18, borderRadius: 20, gap: 10 },
  emptyText: { ...text, fontSize: 14, lineHeight: 20, color: refreshPalette.muted },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: refreshPalette.softOrange, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  greetingRow: { minHeight: 56, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  greetingCopy: { flex: 1, minWidth: 0 },
  greeting: { ...text, fontSize: 14, lineHeight: 20, color: colors.white },
  greetingTitle: { ...heading, color: colors.white, fontSize: 26, lineHeight: 32 },
  headerContent: { paddingHorizontal: 20 },
  searchRow: { backgroundColor: colors.white, borderRadius: 10, gap: 0 },
  scrollContent: { backgroundColor: refreshPalette.sand, paddingTop: 0 },
  searchField: { backgroundColor: colors.white, borderColor: colors.white, borderRadius: 10 },
  searchInput: { color: colors.primary },
});

const railOverrides = StyleSheet.create({
  contentSection: { gap: 12 },
  contentSectionHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
  contentSectionHeading: { flex: 1, minWidth: 0 },
  sectionTitle: heading,
  sectionSubtitle: { ...text, fontSize: 13, lineHeight: 19, color: refreshPalette.muted },
  sectionLinkButton: { minHeight: 44, flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  sectionLink: { ...text, color: colors.primary, fontSize: 14 },
  contentRail: { gap: 12, paddingBottom: 2 },
  contentCard: { width: 200, borderRadius: 20, overflow: 'hidden', backgroundColor: colors.white },
  contentImageWrap: { height: 132, overflow: 'hidden', backgroundColor: refreshPalette.softBlue },
  contentCardCopy: { padding: 12, gap: 6 },
  contentCardTitle: { ...text, fontSize: 16, lineHeight: 22, fontFamily: fontFamilies.semiBold },
  contentCardMeta: { ...text, fontSize: 12, lineHeight: 18, color: refreshPalette.muted, flex: 1 },
  railStatus: { backgroundColor: colors.white, borderRadius: 20, padding: 16, gap: 12, flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap' },
  continuationCard: { borderRadius: 20, padding: 18, overflow: 'hidden', gap: 6 },
  continuationTitle: { ...heading, color: colors.white },
  continuationDescription: { ...text, color: 'rgba(255,255,255,0.88)', fontSize: 14, lineHeight: 20 },
  continuationAction: { backgroundColor: colors.white, minHeight: 44, borderRadius: 10, paddingHorizontal: 16, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10 },
});
export const homeRefreshRailStyles = { ...homeScreenStyles, ...railOverrides };

const drawerOverrides = StyleSheet.create({
  drawerSurface: { backgroundColor: refreshPalette.sand, borderTopLeftRadius: 28, borderBottomLeftRadius: 28, overflow: 'hidden' },
  scroll: { flex: 1, backgroundColor: refreshPalette.sand },
  brandRow: { minHeight: 88, paddingHorizontal: 20, paddingBottom: 18, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' },
  brandWordmark: { width: 164, height: 44 },
  closeButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: refreshPalette.softBlue, alignItems: 'center', justifyContent: 'center' },
  identityCard: { minHeight: 88, marginHorizontal: 20, marginTop: 6, marginBottom: 20, padding: 16, borderRadius: 20, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, overflow: 'hidden' },
  identityName: { ...text, color: colors.white, fontSize: 20, lineHeight: 26, fontFamily: fontFamilies.semiBold },
  menuLabel: { ...text, color: refreshPalette.muted, marginHorizontal: 22, marginBottom: 12, fontSize: 13 },
  footer: { marginTop: 'auto', paddingHorizontal: 20, paddingTop: 24 },
  signOutButton: { minHeight: 48, padding: 12, borderRadius: 24, flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FEECEC' },
});
export const refreshedDrawerStyles = { ...userDrawerStyles, ...drawerOverrides };
const menuOverrides = StyleSheet.create({
  group: { marginHorizontal: 20, borderRadius: 24, paddingVertical: 8, backgroundColor: colors.white, overflow: 'hidden' },
  row: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 },
  iconBubble: { width: 44, height: 44, flexShrink: 0, borderRadius: 14, backgroundColor: refreshPalette.softBlue, alignItems: 'center', justifyContent: 'center' },
  label: { ...text, fontSize: 16, lineHeight: 22, fontFamily: fontFamilies.semiBold, flex: 1, minWidth: 0, color: colors.primary },
  chevron: { flexShrink: 0 },
});
export const refreshedMenuStyles = { ...drawerMenuListStyles, ...menuOverrides };
