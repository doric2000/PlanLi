import { StyleSheet, Dimensions } from 'react-native';
import { colors } from './colors';
import { common } from './common';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HEADER_HEIGHT = 54;
const SIDE_SIZE = 44;
const H_PADDING = 10;

// components/ActionBar.js
export const actionBarStyles = StyleSheet.create({
	overlayFooter: {
		backgroundColor: 'rgba(15,23,42,0.32)',
		borderTopWidth: 0,
		borderRadius: 24,
		paddingHorizontal: 12,
		paddingVertical: 8,
		justifyContent: 'flex-start',
		borderWidth: 1,
		borderColor: 'rgba(255,255,255,0.14)',
	},
	overlayActionGroup: {
		gap: 14,
	},
	overlayActionButton: {
		gap: 5,
	},
	overlayText: {
		color: '#FFFFFF',
		fontWeight: '800',
		textShadowColor: 'rgba(0,0,0,0.35)',
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
	},
});

// components/ActionMenu.js
export const actionMenuStyles = StyleSheet.create({
  menuBtn: {
    padding: 6,
    borderRadius: 999,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "white",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    textAlign: "right",
    flex: 1,
  },
  closeBtn: { padding: 6 },

  actionBtn: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  actionText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    textAlign: "right",
  },

  destructiveBtn: { backgroundColor: "#FEF2F2" },
  destructiveText: { color: "#EF4444" },

  cancelBtn: { backgroundColor: "#E5E7EB", marginBottom: 0 },
  cancelText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
    textAlign: "center",
  },
});

// components/ActiveFiltersList.js
export const activeFiltersListStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg, 
    flexDirection: 'row-reverse', // Keeps the RTL flow for Hebrew
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary, 
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  // Optional: distinct style for tags to differentiate from parent categories
  tagChip: {
    backgroundColor: colors.secondary || colors.primary, 
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  chipText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
  }
});

// components/BackButton.js
export const backButtonStyles = StyleSheet.create({
  button: {
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// components/CityCard.js
export const cityCardStyles = StyleSheet.create({
  homeCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#0F1729',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  homeImageContainer: {
    width: '100%',
    height: 120,
    position: 'relative',
    overflow: 'hidden',
  },
  homeImage: {
    width: '100%',
    height: '100%',
  },
  homeImagePlaceholder: {
    width: '100%',
    height: '100%',
  },
  homeImageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
    backgroundColor: 'rgba(10,20,60,0.18)',
  },
  saveButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,41,0.28)',
  },
  saveButtonActive: {
    backgroundColor: 'rgba(245,150,29,0.88)',
  },
  homeInfo: {
    paddingHorizontal: 12,
    paddingTop: 11,
    paddingBottom: 12,
  },
  homeCity: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F1729',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  homeCountry: {
    fontSize: 12,
    color: '#8A90A8',
    marginTop: 2,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  homeMetaRow: {
    minHeight: 18,
    marginTop: 9,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  homeMetaItem: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 3,
  },
  homeTravelerText: {
    fontSize: 11,
    color: colors.navActive,
    fontWeight: '700',
    writingDirection: 'rtl',
  },
  homeRatingText: {
    fontSize: 11,
    color: colors.brandOrange,
    fontWeight: '700',
  },
});

// components/ImagePickerBox.js
export const imagePickerBoxStyles = StyleSheet.create({
  container: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardBackground || '#FFFFFF',
  },
  carouselWrap: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F3F4F6',
  },
  carouselWrapContain: {
    backgroundColor: '#000000',
  },
  image: {
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    marginTop: 10,
    fontSize: 14,
    color: colors.textSecondary || '#6B7280',
  },
  editBtn: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  dotActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  countBadge: {
    position: 'absolute',
    right: 10,
    top: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  navOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  navZoneLeft: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 8,
  },
  navZoneRight: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 8,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// components/RecommendationCard.js
export const recommendationCardStyles = StyleSheet.create({
  feedCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    marginBottom: 18,
    overflow: 'hidden',
  },
  feedCarouselContainer: {
    aspectRatio: 0.78,
    borderRadius: 0,
    overflow: 'hidden',
  },
  feedImagePlaceholder: {
    flex: 1,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedTopGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
    zIndex: 3,
  },
  feedBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 160,
    zIndex: 3,
  },
  feedHeaderOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 6,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  feedAuthorInfo: {
    flex: 1,
    minWidth: 0,
  },
  feedAvatarRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.78)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  feedAuthorTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  feedUsername: {
    color: '#FFFFFF',
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  feedMetaText: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  feedHeaderActions: {
    backgroundColor: 'rgba(15,23,42,0.22)',
    borderRadius: 22,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  feedDotsContainer: {
    bottom: 72,
    zIndex: 6,
  },
  feedActionOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    zIndex: 7,
  },
  feedContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
  },
  feedTitle: {
    fontSize: 17,
  },
  feedDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});

// components/RecommendationMeta.js
export const recommendationMetaStyles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  rowButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8EEF5',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  mapsButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(46,196,182,0.30)',
    backgroundColor: 'rgba(46,196,182,0.10)',
  },
  icon: {
    marginLeft: 8,
  },
  rowText: {
    color: colors.textSecondary,
    textAlign: 'right',
    flexShrink: 1,
  },
  mapsText: {
    color: colors.textPrimary,
    fontWeight: '800',
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: '#E8EEF5',
    marginVertical: 12,
  },
  badgesRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});

// components/RecommendationsFilterModal.js
export const recommendationsFilterModalStyles = StyleSheet.create({
  section: {
    marginBottom: spacing.md,
  },
  dynamicSection: {
    marginTop: spacing.xs,
  },
  lastSection: {
    marginBottom: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.xl, // Extra padding ensures bottom content is not hidden
  },
scrollWrapper: {
    // מגביל את אזור הבחירה ל-60% מגובה המסך כדי להשאיר מקום לכותרת ולכפתורים
    maxHeight: SCREEN_HEIGHT * 0.6, 
  },
  scrollContent: {
    paddingBottom: spacing.xl,
    flexGrow: 1, // מבטיח שהתוכן יתפרס נכון אם הוא קטן מהגובה המקסימלי
  }
});

// components/RoutesFilterModal.js
export const routesFilterModalStyles = StyleSheet.create({
  section: {
    marginBottom: spacing.md,
  },
  dynamicSection: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  rangeSection: {
    marginTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.md,
  }
});

// components/ScreenHeader.js
export const screenHeaderStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row-reverse', // RTL Support
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.background,
    minHeight: 60,
  },
  headerRowCompact: {
    paddingVertical: spacing.sm,
    minHeight: 52,
  },
  sideContainerRight: {
    width: 80, // Fixed width enforces symmetry
    height: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  sideContainerLeft: {
    width: 80, // Fixed width
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...common.screenHeaderTitle,
    textAlign: 'center',
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 2,
  },
});

// features/admin/screens/AdminPanelScreen.js
export const adminPanelScreenStyles = StyleSheet.create({
  container: {
    padding: 16,
  },
  headerTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
    textAlign: 'right',
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    writingDirection: 'rtl',
  },
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
  },
  statusWrap: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    flex: 1,
    textAlign: 'right',
    color: colors.textSecondary,
    lineHeight: 18,
  },
  statusError: {
    color: colors.error,
  },
  statusSuccess: {
    color: colors.success,
  },
});

// features/community/components/ChipSelector.js
export const chipSelectorStyles = StyleSheet.create({
  inputWrapper: {
    marginBottom: 20,
  },
  label: {
    textAlign: "right",
    marginBottom: 8,
    fontWeight: 'bold',
    fontSize: 14,
    color: colors.textPrimary || '#333',
  },
  chipScroll: {
    flexDirection: 'row-reverse',
  }
});

// features/community/components/SegmentedControl.js
export const segmentedControlStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  label: {
    textAlign: "right",
    marginBottom: 8,
    fontWeight: 'bold',
    fontSize: 14,
    color: '#333', 
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1, // Distribute width equally
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderLight || '#f0f0f0', 
    borderRadius: 8,
    marginHorizontal: 4, // Spacing between buttons
  },
  buttonSelected: {
    backgroundColor: colors.primary || '#2EC4B6', // Active color
  },
  text: {
    color: colors.textSecondary || '#666',
    fontWeight: '600',
    fontSize: 14,
  },
  textSelected: {
    color: '#fff',
    fontWeight: 'bold',
  }
});

// features/community/components/SelectField.js
export const selectFieldStyles = StyleSheet.create({
  container: {
    marginBottom: 10,
    flex: 1, 
  },
  // Specific override for this component's label alignment
  labelOverride: {
    textAlign: "right", 
  },
  button: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    
    // Using global colors for theme consistency
    borderWidth: 1,
    borderColor: colors.border || '#e8e8e8', 
    backgroundColor: colors.background || '#fff', 
    borderRadius: 12, 
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  disabledButton: {
    opacity: 0.5, 
    backgroundColor: colors.borderLight || '#f5f5f5'
  },
  valueText: {
    color: colors.textPrimary || '#000', 
    fontSize: 16,
    textAlign: 'right', 
  },
  placeholderText: {
    color: colors.placeholder || '#a0a0a0', 
    fontSize: 16,
    textAlign: 'right',
  }
});

// features/community/components/SelectionModal.js
export const selectionModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    width: '100%',
    maxHeight: '70%',
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 5,
  },
  title: {
    flex: 1,
    textAlign: 'right',
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  item: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemText: {
    fontSize: 16,
    color: colors.text,
  },
  selectedText: {
    color: colors.primary,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: colors.muted,
    fontSize: 16,
  }
});

// features/community/screens/AddRecommendationScreen.js
export const addRecommendationScreenStyles = StyleSheet.create({
  scrollContent: { padding: spacing.lg, paddingBottom: 40 },
  imagesRow: {
    marginTop: -spacing.lg,
    marginBottom: spacing.xl,
  },
  imagesScroll: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    marginLeft: spacing.sm,
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  addMoreBtn: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.sm,
  },
  addMoreText: {
    color: colors.primary,
    fontWeight: '700',
  },
});

// features/community/screens/CommunityScreen.js
export const communityScreenStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.appSurface,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    overflow: 'hidden',
  },
  headerCircleLarge: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    top: -58,
    right: -44,
  },
  headerCircleSmall: {
    position: 'absolute',
    width: 134,
    height: 134,
    borderRadius: 67,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    top: 30,
    right: 24,
  },
  topActionsRow: {
    position: 'relative',
    zIndex: 2,
    minHeight: 56,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  headerSubtitle: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.66)',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  glassIconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassIconButtonActive: {
    backgroundColor: 'rgba(245,150,29,0.88)',
    borderColor: 'rgba(255,255,255,0.32)',
  },
  sortGlassButton: {
    minWidth: 72,
    height: 42,
    borderRadius: 14,
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sortGlassText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    writingDirection: 'rtl',
  },
  searchRow: {
    position: 'relative',
    zIndex: 3,
    marginTop: 12,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
  },
  searchPill: {
    flex: 1,
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
  searchInput: {
    flex: 1,
    height: '100%',
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
    writingDirection: 'rtl',
  },
  feedContent: {
    paddingTop: 0,
    paddingHorizontal: 0,
    backgroundColor: colors.appSurface,
  },
});

// features/community/screens/RecommendationDetailScreen.js
export const recommendationDetailScreenStyles = StyleSheet.create({
  topPillsRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  categoryPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  categoryPillText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 12,
  },

  pricePill: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pricePillText: {
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'right',
  },

  titleRtl: {
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },

  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EEF5',
    padding: 14,
    marginTop: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginRight: 8,
    textAlign: 'right',
  },

  bodyText: {
    lineHeight: 24,
    textAlign: 'right',
  },

  tagsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
  },
  tagPill: {
    backgroundColor: '#EFF6FF',
    borderColor: '#DBEAFE',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginLeft: 8,
    marginBottom: 8,
  },
  tagPillText: {
    color: '#2563EB',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'right',
  },

  stickyActionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E8EEF5',
    paddingTop: 6,
    paddingHorizontal: 20,
  },
  stickyActionBarInner: {
    borderBottomWidth: 0,
  },
});

// features/home/screens/HomeScreen.js
export const homeScreenStyles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.heroBlueGradient[1],
	},
	scroll: {
		flex: 1,
		backgroundColor: colors.appSurface,
	},
	scrollContent: {
		backgroundColor: colors.appSurface,
	},
	header: {
		paddingHorizontal: 20,
		paddingBottom: 18,
		borderBottomLeftRadius: 30,
		borderBottomRightRadius: 30,
		overflow: "hidden",
	},
	headerCircleLarge: {
		position: "absolute",
		width: 210,
		height: 210,
		borderRadius: 105,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.06)",
		top: -58,
		right: -44,
	},
	headerCircleSmall: {
		position: "absolute",
		width: 134,
		height: 134,
		borderRadius: 67,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.08)",
		top: 30,
		right: 24,
	},
	headerTop: {
		position: "relative",
		zIndex: 2,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		marginBottom: 0,
		minHeight: 40,
	},
	avatarButton: {
		position: "absolute",
		left: 0,
		top: 0,
		width: 42,
		height: 42,
		borderRadius: 21,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.brandOrange,
		borderWidth: 2,
		borderColor: "rgba(255,255,255,0.22)",
	},
	avatarImage: {
		width: "100%",
		height: "100%",
		borderRadius: 21,
	},
	avatarInitial: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "800",
	},
	avatarBadge: {
		position: "absolute",
		bottom: 0,
		right: 0,
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#00D4AA",
		borderWidth: 2,
		borderColor: colors.navActive,
	},
	headlineWrap: {
		position: "relative",
		zIndex: 2,
		alignItems: "flex-end",
		marginTop: -4,
		marginBottom: 12,
	},
	headline: {
		color: "#FFFFFF",
		fontSize: 34,
		lineHeight: 34,
		fontWeight: "800",
		textAlign: "right",
		writingDirection: "rtl",
	},
	subtitle: {
		marginTop: 8,
		color: "rgba(255,255,255,0.62)",
		fontSize: 14,
		fontWeight: "500",
		textAlign: "right",
		writingDirection: "rtl",
	},
	searchWrap: {
		position: "relative",
		zIndex: 20,
	},
	searchInputWrapper: {
		height: 50,
		borderRadius: 16,
		backgroundColor: "rgba(255,255,255,0.12)",
		borderWidth: 1.5,
		borderColor: "rgba(255,255,255,0.18)",
		paddingHorizontal: 0,
	},
	searchInput: {
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "500",
		paddingLeft: 58,
		paddingRight: 48,
		textAlign: "right",
		writingDirection: "rtl",
	},
	searchIcon: {
		top: 15,
	},
	searchLoader: {
		left: 56,
		top: 16,
	},
	filterButton: {
		position: "absolute",
		left: 8,
		top: 8,
		width: 34,
		height: 34,
		borderRadius: 10,
		backgroundColor: colors.brandOrange,
		alignItems: "center",
		justifyContent: "center",
	},
	searchDropdown: {
		top: 58,
		borderRadius: 16,
		borderColor: "rgba(27,45,122,0.12)",
	},
	body: {
		backgroundColor: colors.appSurface,
		paddingBottom: 8,
	},
	sectionFirst: {
		paddingTop: 24,
	},
	categoryScroll: {
		direction: "rtl",
	},
	categoryContent: {
		flexDirection: "row",
		direction: "rtl",
		gap: 10,
		paddingHorizontal: 20,
		paddingBottom: 4,
	},
	categoryChip: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 7,
		paddingHorizontal: 16,
		paddingVertical: 9,
		borderRadius: 40,
		backgroundColor: "#FFFFFF",
		borderWidth: 1.5,
		borderColor: "#E8E9F0",
	},
	categoryChipActive: {
		backgroundColor: colors.navActive,
		borderColor: colors.navActive,
	},
	categoryText: {
		fontSize: 13,
		fontWeight: "700",
		color: "#555A66",
		writingDirection: "rtl",
	},
	categoryTextActive: {
		color: "#FFFFFF",
	},
	section: {
		paddingTop: 24,
		paddingHorizontal: 20,
	},
	sectionHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 14,
	},
	sectionTitleGroup: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 6,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: "#0F1729",
		textAlign: "right",
		writingDirection: "rtl",
	},
	sectionLink: {
		fontSize: 13,
		color: colors.navActive,
		fontWeight: "700",
		textAlign: "left",
		writingDirection: "rtl",
	},
	featuredContentScroll: {
		flexDirection: "row-reverse",
		gap: 14,
		paddingRight: 0,
		paddingLeft: 4,
	},
	featuredCard: {
		width: 280,
		height: 180,
		borderRadius: 20,
		overflow: "hidden",
		position: "relative",
		backgroundColor: colors.navActive,
	},
	featuredImage: {
		width: "100%",
		height: "100%",
	},
	featuredOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	featuredTravelers: {
		position: "absolute",
		top: 12,
		right: 12,
		backgroundColor: "rgba(255,255,255,0.18)",
		borderRadius: 20,
		paddingHorizontal: 10,
		paddingVertical: 6,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 4,
	},
	featuredTravelersText: {
		color: "#FFFFFF",
		fontSize: 11,
		fontWeight: "700",
		writingDirection: "rtl",
	},
	featuredContent: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 16,
		paddingBottom: 14,
		alignItems: "flex-end",
	},
	featuredBadge: {
		backgroundColor: colors.brandOrange,
		paddingHorizontal: 9,
		paddingVertical: 4,
		borderRadius: 20,
		marginBottom: 7,
	},
	featuredBadgeText: {
		color: "#FFFFFF",
		fontSize: 10,
		fontWeight: "800",
		writingDirection: "rtl",
	},
	featuredCity: {
		color: "#FFFFFF",
		fontSize: 21,
		fontWeight: "800",
		textAlign: "right",
		writingDirection: "rtl",
	},
	featuredCountry: {
		marginTop: 3,
		color: "rgba(255,255,255,0.74)",
		fontSize: 12,
		fontWeight: "600",
		textAlign: "right",
		writingDirection: "rtl",
	},
	destinationGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
	},
	loadingRow: {
		minHeight: 80,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row-reverse",
		gap: 8,
	},
	fullWidthStatus: {
		width: "100%",
		minHeight: 140,
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
	},
	statusText: {
		color: "#6B7280",
		fontSize: 14,
		fontWeight: "600",
		textAlign: "center",
		writingDirection: "rtl",
	},
	emptyText: {
		width: "100%",
		color: "#6B7280",
		fontSize: 16,
		fontWeight: "700",
		textAlign: "center",
		paddingVertical: 36,
		writingDirection: "rtl",
	},
});

// features/notifications/screens/NotificationScreen.js
export const notificationScreenStyles = StyleSheet.create({
  header: {
    position: 'relative',
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: H_PADDING,
    backgroundColor: '#F8F9FA',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSideLeft: {
    position: 'absolute',
    left: H_PADDING,
    top: 0,
    bottom: 0,
    width: SIDE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSideRight: {
    position: 'absolute',
    right: H_PADDING,
    top: 0,
    bottom: 0,
    minWidth: SIDE_SIZE,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  backButtonContainer: {
    width: SIDE_SIZE,
    height: SIDE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1E3A5F',
    textAlign: 'center',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#6C757D',
    textAlign: 'center',
  },
});

// features/profile/components/ProfileBadge.js
export const profileBadgeStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});

// features/profile/components/ProfileHeader.js
export const profileHeaderStyles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  smartProfileCta: {
    marginTop: 10,
  },
  smartProfileCtaText: {
    color: colors.accent,
    fontWeight: '600',
  },
});

// features/profile/components/ProfileMenuList.js
export const profileMenuListStyles = StyleSheet.create({
  iconContainer: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: colors.secondary,
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});

// features/profile/screens/ChangeNameScreen.js
export const changeNameScreenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
  },
  rightSpacer: { width: 44, height: 44 },

  container: { flex: 1, paddingHorizontal: 16, paddingTop: 18, gap: 12 },

  label: { fontSize: 14, fontWeight: '700', textAlign: 'right', color: '#111827' },
  input: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#111827',
  },

  primaryBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22375B',
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.7 },
});

// features/profile/screens/ChangePasswordScreen.js
export const changePasswordScreenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
  },
  rightSpacer: { width: 44, height: 44 },

  container: { flex: 1, paddingHorizontal: 16, paddingTop: 18, gap: 12 },

  label: { fontSize: 14, fontWeight: '700', textAlign: 'right', color: '#111827' },
  note: { color: '#6B7280', textAlign: 'right', lineHeight: 18 },

  passwordRow: {
    height: 54,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  passwordInput: { flex: 1, fontSize: 15, color: '#111827', paddingVertical: 0 },
  eyeBtn: { paddingHorizontal: 6, paddingVertical: 10 },

  primaryBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22375B',
    marginTop: 6,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  btnDisabled: { opacity: 0.7 },
});

// features/profile/screens/EditProfileScreen.js
export const editProfileScreenStyles = StyleSheet.create({
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 40,
  },
  sectionLabel: {
    textAlign: "right",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 8,
    color: colors.textPrimary,
  },
});

// features/profile/screens/ProfileScreen.js
export const createProfileScreenStyles = (insets) => StyleSheet.create({
    menuButton: {
      position: 'absolute',
      top: insets.top + 8,
      right: 12,
      zIndex: 999,
      elevation: 10,
      padding: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.95)',
    },
    tabRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(0,0,0,0.08)',
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderBottomWidth: 2,
    },
    tabText: {
      fontWeight: '700',
    },
  });

// features/profile/screens/SettingsScreen.js
export const settingsScreenStyles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  header: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
  },
  rightSpacer: {
    width: 44, // אותו רוחב כמו backBtn כדי לשמור סימטריה
    height: 44,
  },

  container: { flex: 1, paddingHorizontal: 16, paddingTop: 18, gap: 12 },

  primaryBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22375B',
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});

// features/profile/screens/UserProfileScreen.js
export const userProfileScreenStyles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: "900",
    color: "#111827",
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  tabText: {
    fontWeight: '700',
  },
  emptyHint: {
    opacity: 0.6,
    writingDirection: 'rtl',
    textAlign: 'right',
  },

  columnWrapper: {
    justifyContent: 'space-between',
  },
  gridItem: {
    marginTop: 12,
    flexBasis: '50%',
    maxWidth: '50%',
    paddingHorizontal: 6,
  },
  tile: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  tileImageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#F3F4F6',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  tileImagePlaceholder: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  tileTitle: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '800',
    color: '#111827',
    writingDirection: 'rtl',
    textAlign: 'right',
    minHeight: 40,
  },
});

// features/roadtrip/components/ActiveRouteFiltersList.js
export const activeRouteFiltersListStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    flexDirection: "row-reverse",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    gap: 6,
  },
  chipText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: "600",
  },
});

// features/roadtrip/components/DayEditorModal.js
export const dayEditorModalStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#fff' },
    header: {
        flexDirection: 'row-reverse',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#E2E8F0',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', textAlign: 'right' },
    headerBtn: { fontSize: 16, color: '#007AFF' },
    content: { padding: 20 },
    photoLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#334155', textAlign: 'right' },
    removeBtn: { marginTop: 10, alignItems: 'center' },
    removeText: { color: '#EF4444' }
});

// features/roadtrip/components/DayList.js
export const dayListStyles = StyleSheet.create({
	container: { marginBottom: 20 },
	headerRow: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1f2937", textAlign: "right" },
	addBtn: {
		backgroundColor: "#E0F2FE",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
	},
	addBtnText: { color: "#0284C7", fontWeight: "600", fontSize: 12 },
	dayCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 12,
		marginBottom: 10,
		borderWidth: 1,
		borderColor: "#E2E8F0",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.05,
		shadowRadius: 2,
		elevation: 2,
	},
	dayHeader: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	dayTitle: { fontWeight: "700", color: "#0F172A", fontSize: 16, textAlign: "right" },

	actionsContainer: {
		flexDirection: "row-reverse",
		alignItems: "center",
	},
	deleteBtn: {
		padding: 4,
		marginRight: 8,
		backgroundColor: "#FEF2F2",
		borderRadius: 4,
	},
	deleteIcon: {
		fontSize: 14,
		color: "#f57c7cff",
	},
	editHint: { color: "#94A3B8", fontSize: 14 },

	contentRow: { flexDirection: "row" },
	textContainer: { flex: 1, paddingLeft: 10 },
	description: { color: "#64748B", fontSize: 14, textAlign: "right" },
	thumbnail: {
		width: 50,
		height: 50,
		borderRadius: 8,
		backgroundColor: "#F1F5F9",
	},
	emptyText: { color: "#94A3B8", fontStyle: "italic", fontSize: 13, textAlign: "right" },
});

// features/roadtrip/components/DayViewModal.js
export const dayViewModalStyles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#fff",
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#E2E8F0",
	},
	closeBtn: {
		fontSize: 24,
		color: "#64748B",
		fontWeight: "300",
	},
	headerTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: "#0F172A",
	},
	content: {
		flex: 1,
	},
	image: {
		width: "100%",
		height: 300,
		backgroundColor: "#F1F5F9",
	},
	descriptionContainer: {
		padding: 20,
	},
	label: {
		fontSize: 14,
		fontWeight: "700",
		color: "#64748B",
		marginBottom: 8,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	description: {
		fontSize: 16,
		lineHeight: 24,
		color: "#334155",
	},
});

// features/roadtrip/components/GenerateTripCard.js
export const generateTripCardStyles = StyleSheet.create({
	card: {
		width: "100%",
		borderRadius: 20,
		padding: 20,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 5,
		minHeight: 180,
	},
	icon: {
		marginBottom: 16,
		opacity: 0.8,
	},
	title: {
		fontSize: 20,
		fontWeight: "700",
		color: "#ffffffff",
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 15,
		color: "#f0f0f0ff",
		textAlign: "center",
		fontWeight: "400",
	},
});

// features/roadtrip/components/PlacesInput.js
export const placesInputStyles = StyleSheet.create({
	headerRow: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: spacing.sm,
	},
	label: { ...typography.label, color: colors.textPrimary, textAlign: "right" },
	addBtn: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 12,
		backgroundColor: colors.infoLight,
	},
	addText: { color: colors.info, fontSize: 16, fontWeight: "700" },
	row: {
		flexDirection: "row-reverse",
		alignItems: "center",
		backgroundColor: colors.background,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: colors.border,
		paddingHorizontal: 10,
		paddingVertical: 8,
	},
	rowError: {
		borderColor: colors.error,
		backgroundColor: colors.errorLight,
	},
	rowValid: {
		borderColor: colors.success,
		backgroundColor: colors.successLight,
	},
	input: { flex: 1, fontSize: 15, color: colors.textPrimary, paddingVertical: 6, textAlign: "right" },
	removeBtn: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: colors.errorLight,
		alignItems: "center",
		justifyContent: "center",
		marginLeft: spacing.sm,
	},
	removeText: { color: colors.error, fontSize: 18, fontWeight: "700" },
	checkmark: {
		color: colors.success,
		fontSize: 18,
		fontWeight: "700",
		marginLeft: spacing.sm,
	},
	errorText: {
		color: colors.error,
		fontSize: 12,
		marginTop: 4,
		marginRight: 4,
		textAlign: "right",
	},
	suggestionsContainer: {
		backgroundColor: colors.white,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.border,
		marginTop: 4,
		...shadows.small,
	},
	suggestionItem: {
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	suggestionContent: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
	},
	suggestionText: {
		fontSize: 14,
		color: colors.textPrimary,
		flex: 1,
		textAlign: "right",
	},
	suggestionType: {
		fontSize: 11,
		color: colors.textSecondary,
		marginLeft: spacing.sm,
	},
	suggestionTypeRow: {
		flexDirection: "row-reverse",
		alignItems: "center",
		marginRight: spacing.sm,
	},
});

// features/roadtrip/components/PlacesRoute.js
export const placesRouteStyles = StyleSheet.create({
	container: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		marginVertical: 8,
	},
	routeItem: {
		flexDirection: "row",
		alignItems: "center",
		marginRight: 4,
	},
	placeBox: {
		backgroundColor: "#E0F2FE", // Light blue background
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#BAE6FD", // Border color
	},
	placeText: {
		fontSize: 13,
		color: "#4d4d4dff",
		fontWeight: "500",
		maxWidth: 100,
	},
	arrow: {
		marginHorizontal: 4,
	},
});

// features/roadtrip/components/RouteCard.js
export const routeCardStyles = StyleSheet.create({
	headerActions: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 8,
	},
	metaRow: {
		flexDirection: "row-reverse",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 8,
		marginBottom: 8,
	},
	metaPill: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 6,
		backgroundColor: "#F3F4F6",
		borderRadius: 12,
		paddingHorizontal: 10,
		paddingVertical: 6,
	},
	metaText: {
		...typography.caption,
		color: "#111827",
		textAlign: "right",
		writingDirection: "rtl",
	},
	locationRow: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 4,
		marginBottom: 6,
	},
});

// features/roadtrip/screens/AddRoutesScreen.js
export const addRoutesScreenStyles = StyleSheet.create({
    container: {
        backgroundColor: colors.white || '#FFFFFF',
    },
    scrollContent: { padding: spacing.lg, paddingBottom: 40 },
    screenTitle: {
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'right',
        marginBottom: spacing.lg,
        color: colors.textPrimary || '#111827',
    },
    fieldLabel: {
        textAlign: 'right',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 8,
        color: colors.textPrimary || '#111827',
    },
});

// features/roadtrip/screens/RouteDetailScreen.js
export const routeDetailScreenStyles = StyleSheet.create({
    headerSection: {
        backgroundColor: colors.white,
        padding: spacing.screenHorizontal,
        borderBottomWidth: 1,
        borderBottomColor: colors.border
    },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        marginBottom: spacing.md
    },
    metaRow: {
        flexDirection: 'row',
        gap: spacing.lg,
        marginBottom: spacing.lg
    },
    metaItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    placesSection: {
        marginBottom: spacing.lg
    },
    subsectionTitle: {
        ...typography.caption,
        color: colors.textLight,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: spacing.sm
    },
    tagsSection: {
        marginTop: spacing.sm
    },
    tagsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: spacing.sm
    },
    timelineSection: {
        padding: spacing.screenHorizontal,
        backgroundColor: colors.white,
        marginTop: spacing.sm
    },
    timeline: {
        paddingLeft: 10
    },
    emptyState: {
        padding: spacing.xxxl,
        alignItems: 'center'
    },
    emptyText: {
        ...typography.bodySmall,
        color: colors.textMuted,
    }
});

// features/roadtrip/screens/RoutesScreen.js
export const routesScreenStyles = StyleSheet.create({
	destinationSearchWrap: {
		paddingHorizontal: spacing.lg,
		paddingTop: 0,
		paddingBottom: spacing.xs,
	},
	destinationSearchRow: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: spacing.sm,
	},
	destinationFilterBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#FFFFFF",
		borderWidth: 1,
		borderColor: colors.borderLight || "#F3F4F6",
		...shadows.small,
	},
	destinationSearchPill: {
		flex: 1,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: spacing.sm,
		backgroundColor: "#FFFFFF",
		borderWidth: 1,
		borderColor: colors.borderLight || "#F3F4F6",
		borderRadius: 18,
		paddingHorizontal: spacing.md,
		height: 36,
		...shadows.small,
	},
	destinationSearchInput: {
		flex: 1,
		color: colors.textPrimary,
		fontSize: 14,
		paddingVertical: 0,
		writingDirection: "rtl",
	},
	destinationClearBtn: {
		alignItems: "center",
		justifyContent: "center",
	},
});

// navigation/TabNavigator.js
export const tabNavigatorStyles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: 70,
    borderRadius: 31,
    backgroundColor: 'rgba(236, 239, 246, 0.88)',
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    paddingTop: 0,
    paddingBottom: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 18,
    overflow: 'hidden',
  },
  item: {
    paddingVertical: 0,
    height: 62,
  },
  iconSlot: {
    marginTop: 0,
    width: '100%',
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeIconWrap: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    writingDirection: 'rtl',
  },
  communityDot: {
    position: 'absolute',
    top: -2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandOrange,
  },
  profileImage: {
    backgroundColor: '#E5E7EB',
  },
});
