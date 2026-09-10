import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { fontFamilies } from './typography';
import { refreshPalette } from './designRefresh';

export function createRefreshedProfileStyles(base, width = 390, gridColumns = 3) {
  const contentWidth = Math.min(Math.max(width, 320), 960);
  const gridWidth = contentWidth - 40;
  const tile = (gridWidth - gridColumns * 4) / gridColumns;
  const overrides = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.primary },
    list: { flex: 1, backgroundColor: refreshPalette.sand },
    listContent: { ...StyleSheet.flatten(base.listContent), backgroundColor: refreshPalette.sand },
    headerBlock: { ...StyleSheet.flatten(base.headerBlock), width: contentWidth },
    toolbar: { minHeight: 56, paddingHorizontal: 20, paddingVertical: 6, flexDirection: 'row-reverse', alignItems: 'center', gap: 12, backgroundColor: colors.primary },
    toolbarAction: { width: 44, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
    toolbarTitle: { flex: 1, color: colors.white, fontSize: 26, lineHeight: 32, fontFamily: fontFamilies.bold, textAlign: 'right', writingDirection: 'rtl' },
    heroHeader: { ...StyleSheet.flatten(base.heroHeader), width: contentWidth, paddingHorizontal: 20, paddingTop: 16 },
    heroMedia: { ...StyleSheet.flatten(base.heroMedia), height: width >= 600 ? 240 : 160, borderRadius: 20 },
    heroShade: { height: 0 },
    identityCard: { position: 'relative', marginTop: 16, paddingTop: 78, paddingHorizontal: 16, paddingBottom: 24, borderRadius: 20, alignItems: 'center', backgroundColor: colors.white, overflow: 'visible' },
    avatarWrap: { position: 'absolute', top: -56, width: 112, height: 112, padding: 4, borderRadius: 56, backgroundColor: colors.white, overflow: 'visible', zIndex: 1 },
    cameraButton: { ...StyleSheet.flatten(base.cameraButton), right: -24, bottom: -4, shadowOpacity: 0, elevation: 0 },
    name: { ...StyleSheet.flatten(base.name), maxWidth: '100%', color: refreshPalette.ink, fontSize: 26, lineHeight: 32, fontFamily: fontFamilies.bold },
    bioRow: { width: '100%', marginTop: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 },
    bio: { ...StyleSheet.flatten(base.bio), flex: 1, color: refreshPalette.muted },
    bioPlaceholder: { ...StyleSheet.flatten(base.bioPlaceholder), flex: 1, color: refreshPalette.muted },
    editIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    statusPill: { ...StyleSheet.flatten(base.statusPill), maxWidth: '100%', borderWidth: 0 },
    statusPillText: { ...StyleSheet.flatten(base.statusPillText), flexShrink: 1 },
    statsCard: { ...StyleSheet.flatten(base.statsCard), borderTopWidth: 0, marginTop: 12, paddingTop: 0 },
    statDivider: { display: 'none' },
    preferencesSection: { ...StyleSheet.flatten(base.preferencesSection), marginHorizontal: 0, borderTopWidth: 0, marginTop: 24, paddingTop: 0 },
    preferencesTitle: { ...StyleSheet.flatten(base.preferencesTitle), color: colors.primary, fontFamily: fontFamilies.bold, fontSize: 21, lineHeight: 28 },
    preferencesEdit: { ...StyleSheet.flatten(base.preferencesEdit), borderRadius: 22, backgroundColor: colors.white },
    preferenceChip: { ...StyleSheet.flatten(base.preferenceChip), minHeight: 44, borderRadius: 22 },
    contentTitle: { ...StyleSheet.flatten(base.contentTitle), color: colors.primary, fontFamily: fontFamilies.bold, fontSize: 21, lineHeight: 28, flexShrink: 1 },
    contentCount: { display: 'none' },
    contentIntroRow: { ...StyleSheet.flatten(base.contentIntroRow), paddingHorizontal: 20 },
    contentTabs: { ...StyleSheet.flatten(base.contentTabs), marginHorizontal: 20, borderWidth: 0, backgroundColor: colors.white },
    contentTab: { ...StyleSheet.flatten(base.contentTab), paddingHorizontal: 3, flexDirection: 'column', gap: 2, paddingVertical: 8 },
    contentTabActive: { backgroundColor: colors.primary },
    contentTabText: { ...StyleSheet.flatten(base.contentTabText), textAlign: 'center', flexShrink: 1 },
    gridRow: { width: gridWidth, maxWidth: '100%', alignSelf: 'center', flexDirection: 'row-reverse' },
    gridTile: { ...StyleSheet.flatten(base.gridTile), width: tile, maxWidth: tile, borderRadius: 8 },
  });
  return { ...base, ...overrides };
}
