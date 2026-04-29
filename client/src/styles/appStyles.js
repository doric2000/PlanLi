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
    aspectRatio: 1.10,
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
    height: 118,
    zIndex: 3,
  },
  feedBottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 118,
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
    paddingTop: 10,
    paddingBottom: 12,
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
  unsavedDialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  unsavedDialogCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#F2F2F7',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
  },
  unsavedDialogTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  unsavedDialogMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 20,
  },
  unsavedDialogActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  unsavedDialogButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  unsavedDialogButtonNeutral: {
    backgroundColor: '#E5E5EA',
  },
  unsavedDialogButtonNeutralText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    writingDirection: 'rtl',
  },
  unsavedDialogButtonDestructiveText: {
    fontSize: 17,
    fontWeight: '400',
    color: colors.error,
    writingDirection: 'rtl',
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
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    marginHorizontal: 3,
    marginBottom: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});

// features/profile/components/ProfileHeader.js
export const profileHeaderStyles = StyleSheet.create({
  hero: {
    position: 'relative',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderBottomLeftRadius: 34,
    borderBottomRightRadius: 34,
    paddingTop: 42,
    paddingHorizontal: 22,
    paddingBottom: 22,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 22,
    elevation: 5,
  },
  heroWash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  avatarStage: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarRing: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: colors.white,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8,
  },
  avatarImage: {
    width: 106,
    height: 106,
    borderRadius: 53,
  },
  webAvatarImage: {
    width: 106,
    height: 106,
    borderRadius: 53,
    objectFit: 'cover',
    display: 'block',
  },
  avatarPlaceholder: {
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.primary,
    fontSize: 42,
    fontWeight: '900',
  },
  cameraButton: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 7,
  },
  name: {
    maxWidth: '86%',
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  email: {
    maxWidth: '86%',
    marginTop: 2,
    color: colors.textLight,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  badgeRow: {
    flexDirection: 'row-reverse',
    marginTop: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    rowGap: 2,
  },
  smartProfileCta: {
    marginTop: 10,
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: 'rgba(30,58,95,0.14)',
    backgroundColor: 'rgba(30,58,95,0.05)',
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  smartProfileCtaText: {
    color: colors.primary,
    fontWeight: '900',
    writingDirection: 'rtl',
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
    screen: {
      flex: 1,
      backgroundColor: colors.appSurface,
    },
    menuButton: {
      position: 'absolute',
      top: insets.top + 16,
      right: 18,
      zIndex: 999,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.82)',
      borderWidth: 1,
      borderColor: 'rgba(17,24,39,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 7,
    },
    backButton: {
      position: 'absolute',
      top: insets.top + 16,
      left: 18,
      zIndex: 999,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: 'rgba(255,255,255,0.82)',
      borderWidth: 1,
      borderColor: 'rgba(17,24,39,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.08,
      shadowRadius: 14,
      elevation: 7,
    },
    listContent: {
      paddingBottom: insets.bottom + 118,
    },
    headerBlock: {
      paddingBottom: 14,
    },
    contentIntro: {
      marginTop: 14,
      paddingHorizontal: 22,
      alignItems: 'flex-end',
    },
    contentTitle: {
      color: colors.textPrimary,
      fontSize: 24,
      fontWeight: '900',
      textAlign: 'right',
      writingDirection: 'rtl',
    },
    contentSubtitle: {
      marginTop: 2,
      color: colors.textLight,
      fontSize: 13,
      fontWeight: '700',
      textAlign: 'right',
      writingDirection: 'rtl',
    },
    tabRow: {
      flexDirection: 'row-reverse',
      marginTop: 14,
      marginHorizontal: 18,
      padding: 5,
      borderRadius: 26,
      backgroundColor: 'rgba(255,255,255,0.78)',
      borderWidth: 1,
      borderColor: 'rgba(17,24,39,0.06)',
    },
    tabBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: 22,
      flexDirection: 'row-reverse',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    tabBtnActive: {
      backgroundColor: colors.primary,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.14,
      shadowRadius: 12,
      elevation: 4,
    },
    tabBtnInactive: {
      backgroundColor: 'transparent',
    },
    tabText: {
      fontSize: 14,
      fontWeight: '900',
      writingDirection: 'rtl',
    },
    tabTextActive: {
      color: colors.white,
    },
    tabTextInactive: {
      color: colors.textSecondary,
    },
    contentLoading: {
      paddingTop: 16,
      alignItems: 'center',
    },
    gridRow: {
      flexDirection: 'row-reverse',
      paddingHorizontal: 3,
    },
    gridTile: {
      flex: 1,
      maxWidth: '33.333%',
      aspectRatio: 1,
      margin: 1.5,
      backgroundColor: colors.primary,
      overflow: 'hidden',
      position: 'relative',
    },
    gridImage: {
      width: '100%',
      height: '100%',
    },
    gridWebImage: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      display: 'block',
    },
    gridFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    gridShade: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: '52%',
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    gridTypeBadge: {
      position: 'absolute',
      top: 7,
      right: 7,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: 'rgba(15,23,42,0.52)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.26)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    gridTextWrap: {
      position: 'absolute',
      left: 7,
      right: 7,
      bottom: 7,
      alignItems: 'flex-end',
    },
    gridTitle: {
      color: colors.white,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'right',
      writingDirection: 'rtl',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    gridSubtitle: {
      marginTop: 1,
      color: 'rgba(255,255,255,0.82)',
      fontSize: 10,
      fontWeight: '700',
      textAlign: 'right',
      writingDirection: 'rtl',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    emptyState: {
      marginHorizontal: 22,
      marginTop: 18,
      paddingVertical: 34,
      paddingHorizontal: 18,
      borderRadius: 24,
      backgroundColor: colors.white,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(17,24,39,0.06)',
    },
    emptyTitle: {
      marginTop: 10,
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '900',
      textAlign: 'center',
      writingDirection: 'rtl',
    },
    emptyText: {
      marginTop: 5,
      color: colors.textLight,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 19,
      textAlign: 'center',
      writingDirection: 'rtl',
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

// components/ExactLocationPicker.js
export const exactLocationPickerStyles = StyleSheet.create({
	wrap: {
		width: "100%",
	},
	label: {
		fontSize: 14,
		fontWeight: "700",
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
		marginBottom: 8,
	},
	statusRow: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 8,
		marginTop: 8,
	},
	statusText: {
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	selectedText: {
		marginTop: 8,
		fontSize: 12,
		fontWeight: "700",
		color: colors.success,
		textAlign: "right",
		writingDirection: "rtl",
	},
	errorWrap: {
		marginTop: 8,
		alignItems: "flex-end",
	},
	errorText: {
		fontSize: 12,
		color: colors.error,
		textAlign: "right",
		writingDirection: "rtl",
	},
	manualCountryText: {
		marginTop: 6,
		fontSize: 13,
		fontWeight: "800",
		color: colors.primary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	changeCountryButton: {
		alignSelf: "flex-end",
		marginTop: 8,
	},
	changeCountryText: {
		color: colors.textSecondary,
		fontWeight: "700",
		textAlign: "right",
		writingDirection: "rtl",
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
    headerBtnStrong: { fontWeight: '800' },
    headerBtnDisabled: { opacity: 0.5 },
    content: { flex: 1, padding: 20 },
    scrollContent: { paddingBottom: 36 },
    descriptionInput: { height: 130 },
    stopsSection: {
        marginTop: 18,
        marginBottom: 22,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
        paddingTop: 16,
    },
    stopsHeader: {
        flexDirection: "row-reverse",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 10,
    },
    stopsTitle: {
        fontSize: 16,
        fontWeight: "800",
        color: colors.textPrimary,
        textAlign: "right",
        writingDirection: "rtl",
    },
    addStopButton: {
        backgroundColor: colors.infoLight,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 16,
    },
    addStopText: {
        color: colors.info,
        fontSize: 12,
        fontWeight: "800",
        writingDirection: "rtl",
    },
    emptyStopsText: {
        color: colors.textMuted,
        fontSize: 13,
        textAlign: "right",
        writingDirection: "rtl",
        lineHeight: 19,
    },
    stopCard: {
        flexDirection: "row-reverse",
        alignItems: "center",
        gap: 10,
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.borderLight,
        borderRadius: 14,
        padding: 10,
        marginBottom: 8,
    },
    stopThumb: {
        width: 42,
        height: 42,
        borderRadius: 10,
        backgroundColor: colors.borderLight,
    },
    stopNumberBadge: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: colors.primary,
        alignItems: "center",
        justifyContent: "center",
    },
    stopNumberText: {
        color: colors.white,
        fontWeight: "900",
    },
    stopTextWrap: {
        flex: 1,
        minWidth: 0,
        alignItems: "flex-end",
    },
    stopTitle: {
        fontSize: 14,
        fontWeight: "800",
        color: colors.textPrimary,
        textAlign: "right",
        writingDirection: "rtl",
    },
    stopMeta: {
        marginTop: 2,
        fontSize: 12,
        color: colors.textSecondary,
        textAlign: "right",
        writingDirection: "rtl",
    },
    deleteStopButton: {
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: 10,
        backgroundColor: colors.errorLight,
    },
    deleteStopText: {
        color: colors.error,
        fontSize: 12,
        fontWeight: "800",
        writingDirection: "rtl",
    },
    imagePickerSpacing: {
        marginBottom: spacing.xl,
    },
    photoLabel: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#334155', textAlign: 'right' },
    removeBtn: { marginTop: 10, alignItems: 'center' },
    removeText: { color: '#EF4444' }
});

// features/roadtrip/components/StopEditorModal.js
export const stopEditorModalStyles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.white,
	},
	header: {
		flexDirection: "row-reverse",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 16,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	headerTitle: {
		flex: 1,
		fontSize: 16,
		fontWeight: "800",
		color: colors.textPrimary,
		textAlign: "center",
		writingDirection: "rtl",
	},
	headerButton: {
		fontSize: 15,
		color: colors.primary,
		fontWeight: "700",
		minWidth: 52,
		textAlign: "center",
	},
	headerButtonStrong: {
		fontWeight: "900",
	},
	content: {
		flex: 1,
		padding: 18,
	},
	scrollContent: {
		paddingBottom: 36,
	},
	locationWrap: {
		marginTop: 16,
		marginBottom: 18,
		zIndex: 20,
	},
	descriptionInput: {
		height: 110,
	},
	photoLabel: {
		fontSize: 14,
		fontWeight: "800",
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
		marginTop: 12,
		marginBottom: 8,
	},
	imagePickerSpacing: {
		marginBottom: spacing.lg,
	},
	removeButton: {
		alignSelf: "center",
		paddingHorizontal: 14,
		paddingVertical: 8,
		borderRadius: 14,
		backgroundColor: colors.errorLight,
	},
	removeText: {
		color: colors.error,
		fontWeight: "800",
		writingDirection: "rtl",
	},
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
	sectionTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	autoHint: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textMuted,
		textAlign: "left",
		writingDirection: "rtl",
	},
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
	dayTitle: {
		fontWeight: "800",
		color: "#0F172A",
		fontSize: 16,
		textAlign: "right",
		writingDirection: "rtl",
	},
	editHint: {
		color: colors.primary,
		fontSize: 13,
		fontWeight: "800",
		textAlign: "left",
		writingDirection: "rtl",
	},
	contentRow: { flexDirection: "row", alignItems: "center" },
	textContainer: { flex: 1, paddingLeft: 10 },
	description: {
		color: "#64748B",
		fontSize: 14,
		textAlign: "right",
		writingDirection: "rtl",
	},
	thumbnail: {
		width: 50,
		height: 50,
		borderRadius: 8,
		backgroundColor: "#F1F5F9",
	},
	stopsCount: {
		marginTop: 8,
		color: colors.primary,
		fontSize: 12,
		fontWeight: "800",
		textAlign: "right",
		writingDirection: "rtl",
	},
	emptyText: {
		color: "#94A3B8",
		fontStyle: "italic",
		fontSize: 13,
		textAlign: "right",
		writingDirection: "rtl",
	},
});

// features/roadtrip/components/DayViewModal.js
export const dayViewModalStyles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#fff",
	},
	header: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#E2E8F0",
	},
	closeButton: {
		width: 34,
		height: 34,
		alignItems: "center",
		justifyContent: "center",
		borderRadius: 17,
		backgroundColor: colors.background,
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
		textAlign: "center",
		writingDirection: "rtl",
	},
	headerSpacer: {
		width: 30,
	},
	content: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 32,
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
		fontWeight: "800",
		color: colors.textPrimary,
		marginBottom: 8,
		textAlign: "right",
		writingDirection: "rtl",
	},
	description: {
		fontSize: 16,
		lineHeight: 24,
		color: "#334155",
		textAlign: "right",
		writingDirection: "rtl",
	},
	stopsContainer: {
		paddingHorizontal: 20,
		paddingBottom: 28,
	},
	stopRow: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 10,
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.borderLight,
		borderRadius: 14,
		padding: 10,
		marginBottom: 9,
	},
	stopImage: {
		width: 46,
		height: 46,
		borderRadius: 12,
		backgroundColor: colors.borderLight,
	},
	stopNumberBadge: {
		width: 46,
		height: 46,
		borderRadius: 23,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	stopNumberText: {
		color: colors.white,
		fontWeight: "900",
	},
	stopTextWrap: {
		flex: 1,
		minWidth: 0,
		alignItems: "flex-end",
	},
	stopTitle: {
		fontSize: 14,
		fontWeight: "900",
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	stopAddress: {
		marginTop: 2,
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	stopDescription: {
		marginTop: 3,
		fontSize: 12,
		lineHeight: 17,
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	mapIconWrap: {
		alignItems: "center",
		justifyContent: "center",
		minWidth: 38,
	},
	mapIconText: {
		marginTop: 2,
		fontSize: 10,
		fontWeight: "800",
		color: colors.primary,
		textAlign: "center",
		writingDirection: "rtl",
	},
	emptyStopsText: {
		paddingVertical: 12,
		fontSize: 14,
		color: colors.textMuted,
		textAlign: "right",
		writingDirection: "rtl",
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
		flexDirection: "row-reverse",
		flexWrap: "wrap",
		alignItems: "center",
		marginVertical: 8,
	},
	routeItem: {
		flexDirection: "row-reverse",
		alignItems: "center",
		marginLeft: 4,
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
		textAlign: "right",
		writingDirection: "rtl",
	},
	arrow: {
		marginHorizontal: 4,
	},
});

// features/roadtrip/components/RouteCard.js
export const routeCardStyles = StyleSheet.create({
	feedCard: {
		width: "100%",
		backgroundColor: "#FFFFFF",
		marginBottom: 18,
		overflow: "hidden",
	},
	feedCarouselContainer: {
		aspectRatio: 1.25,
		borderRadius: 0,
		overflow: "hidden",
	},
	feedImagePlaceholder: {
		flex: 1,
		backgroundColor: "#1F2937",
		alignItems: "center",
		justifyContent: "center",
	},
	feedPlaceholderText: {
		marginTop: 8,
		color: "rgba(255,255,255,0.76)",
		fontSize: 14,
		fontWeight: "800",
		textAlign: "center",
		writingDirection: "rtl",
	},
	feedTopGradient: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		height: 118,
		zIndex: 3,
	},
	feedBottomGradient: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		height: 118,
		zIndex: 3,
	},
	feedHeaderOverlay: {
		position: "absolute",
		top: 12,
		left: 12,
		right: 12,
		zIndex: 6,
		flexDirection: "row-reverse",
		alignItems: "center",
		justifyContent: "space-between",
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
		borderColor: "rgba(255,255,255,0.78)",
		overflow: "hidden",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(255,255,255,0.18)",
	},
	feedAuthorTextWrap: {
		flex: 1,
		minWidth: 0,
	},
	feedUsername: {
		color: "#FFFFFF",
		fontSize: 16,
		textShadowColor: "rgba(0,0,0,0.55)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 4,
	},
	feedMetaText: {
		color: "rgba(255,255,255,0.86)",
		fontSize: 12,
		fontWeight: "700",
		textAlign: "right",
		writingDirection: "rtl",
		textShadowColor: "rgba(0,0,0,0.5)",
		textShadowOffset: { width: 0, height: 1 },
		textShadowRadius: 3,
	},
	feedHeaderActions: {
		backgroundColor: "rgba(15,23,42,0.22)",
		borderRadius: 22,
		paddingHorizontal: 4,
		paddingVertical: 2,
	},
	feedDotsContainer: {
		bottom: 72,
		zIndex: 6,
	},
	feedActionOverlay: {
		position: "absolute",
		left: 12,
		right: 12,
		bottom: 16,
		zIndex: 7,
	},
	feedContent: {
		paddingHorizontal: 16,
		paddingTop: 10,
		paddingBottom: 12,
		backgroundColor: "#FFFFFF",
	},
	feedTitle: {
		fontSize: 17,
	},
	feedDescription: {
		fontSize: 14,
		lineHeight: 20,
	},
	moreTagsText: {
		...typography.caption,
		color: colors.info,
		alignSelf: "center",
		marginRight: 8,
	},
	placesPreview: {
		marginBottom: 6,
	},
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
    fieldWrap: {
        marginBottom: spacing.lg,
    },
    screenTitle: {
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'right',
        writingDirection: 'rtl',
        marginBottom: spacing.lg,
        color: colors.textPrimary || '#111827',
    },
    fieldLabel: {
        textAlign: 'right',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 8,
        color: colors.textPrimary || '#111827',
        writingDirection: 'rtl',
    },
    descriptionField: {
        marginBottom: spacing.xl,
    },
});

// features/roadtrip/screens/RouteDetailScreen.js
export const routeDetailScreenStyles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: colors.background,
    },
    headerBar: {
        minHeight: 58,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: spacing.md,
        backgroundColor: colors.white,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    headerBackButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '900',
        color: colors.textPrimary,
        textAlign: 'center',
        writingDirection: 'rtl',
    },
    headerSideSpacer: {
        width: 44,
        height: 44,
    },
    scrollContent: {
        paddingBottom: spacing.xxxl,
    },
    headerSection: {
        backgroundColor: colors.white,
        padding: spacing.screenHorizontal,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        alignItems: 'stretch',
    },
    routeTitle: {
        ...typography.h1,
        textAlign: 'right',
        writingDirection: 'rtl',
        marginBottom: spacing.sm,
    },
    authorRow: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: spacing.sm,
        marginBottom: spacing.md
    },
    authorText: {
        ...typography.meta,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    descriptionText: {
        ...typography.body,
        marginBottom: spacing.md,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    metaRow: {
        flexDirection: 'row-reverse',
        justifyContent: 'flex-start',
        gap: spacing.lg,
        marginBottom: spacing.lg
    },
    metaItem: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
    },
    metaIcon: {
        marginLeft: 6,
    },
    metaText: {
        ...typography.meta,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    placesSection: {
        marginBottom: spacing.lg
    },
    placesRouteSpacing: {
        marginTop: spacing.sm,
    },
    subsectionTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: colors.textPrimary,
        marginBottom: spacing.sm,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    tagsSection: {
        marginTop: spacing.sm
    },
    tagsContainer: {
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
        gap: spacing.sm
    },
    timelineSection: {
        padding: spacing.screenHorizontal,
        backgroundColor: colors.white,
        marginTop: spacing.sm
    },
    timelineTitle: {
        ...typography.h3,
        marginBottom: 20,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    timeline: {
        paddingRight: 10
    },
    emptyState: {
        padding: spacing.xxxl,
        alignItems: 'center'
    },
    emptyText: {
        ...typography.bodySmall,
        color: colors.textMuted,
        textAlign: 'center',
        writingDirection: 'rtl',
    },
    mapButton: {
        marginTop: spacing.sm,
        marginBottom: spacing.md,
        flexDirection: "row-reverse",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: colors.primary,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    mapButtonDisabled: {
        backgroundColor: colors.borderLight,
        borderWidth: 1,
        borderColor: colors.border,
    },
    mapButtonText: {
        color: colors.white,
        fontSize: 14,
        fontWeight: "800",
        textAlign: "right",
        writingDirection: "rtl",
    },
    mapButtonTextDisabled: {
        color: colors.textMuted,
    },
});

// features/roadtrip/screens/RouteMapScreen.js
export const routeMapStyles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.background,
	},
	header: {
		height: 64,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 10,
		paddingHorizontal: 14,
		backgroundColor: colors.white,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
		zIndex: 5,
	},
	headerIconButton: {
		width: 42,
		height: 42,
		borderRadius: 21,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.background,
	},
	headerTextWrap: {
		flex: 1,
		minWidth: 0,
		alignItems: "flex-end",
	},
	headerTitle: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	headerSubtitle: {
		marginTop: 2,
		fontSize: 12,
		fontWeight: "700",
		color: colors.textSecondary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	headerActionButton: {
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 14,
		backgroundColor: colors.primary,
	},
	headerActionButtonDisabled: {
		backgroundColor: colors.borderLight,
	},
	headerActionText: {
		color: colors.white,
		fontSize: 12,
		fontWeight: "900",
		writingDirection: "rtl",
	},
	headerActionTextDisabled: {
		color: colors.textMuted,
	},
	map: {
		flex: 1,
	},
	webMapWrap: {
		flex: 1,
	},
	webMap: {
		width: "100%",
		height: "100%",
	},
	markerWrap: {
		width: 56,
		height: 56,
		alignItems: "center",
		justifyContent: "center",
		overflow: "visible",
	},
	marker: {
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: colors.primary,
		borderWidth: 3,
		borderColor: colors.white,
		alignItems: "center",
		justifyContent: "center",
		overflow: "visible",
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.22,
		shadowRadius: 8,
		elevation: 6,
		position: "relative",
	},
	markerImage: {
		width: "100%",
		height: "100%",
		borderRadius: 21,
	},
	markerNumberBadge: {
		position: "absolute",
		right: -7,
		bottom: -7,
		minWidth: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: colors.brandOrange,
		borderWidth: 2,
		borderColor: colors.white,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: 3,
	},
	markerNumberText: {
		color: colors.white,
		fontSize: 12,
		fontWeight: "900",
		lineHeight: 16,
		textAlign: "center",
	},
	markerText: {
		color: colors.white,
		fontWeight: "900",
		fontSize: 15,
	},
	emptyState: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.xl,
	},
	emptyTitle: {
		marginTop: 14,
		fontSize: 18,
		fontWeight: "900",
		color: colors.textPrimary,
		textAlign: "center",
		writingDirection: "rtl",
	},
	emptyText: {
		marginTop: 6,
		fontSize: 14,
		color: colors.textSecondary,
		textAlign: "center",
		writingDirection: "rtl",
	},
	sheet: {
		position: "absolute",
		left: 14,
		right: 14,
		bottom: 18,
		backgroundColor: colors.white,
		borderRadius: 18,
		padding: 14,
		borderWidth: 1,
		borderColor: colors.borderLight,
		...shadows.small,
	},
	sheetHeader: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 10,
	},
	sheetCloseButton: {
		width: 34,
		height: 34,
		borderRadius: 17,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.background,
	},
	sheetTitleWrap: {
		flex: 1,
		minWidth: 0,
		alignItems: "flex-end",
	},
	sheetKicker: {
		fontSize: 11,
		color: colors.textMuted,
		fontWeight: "800",
		textAlign: "right",
		writingDirection: "rtl",
	},
	sheetTitle: {
		marginTop: 2,
		fontSize: 17,
		fontWeight: "900",
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	sheetImage: {
		width: 54,
		height: 54,
		borderRadius: 14,
		backgroundColor: colors.borderLight,
	},
	sheetImageFallback: {
		width: 54,
		height: 54,
		borderRadius: 27,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	sheetImageFallbackText: {
		color: colors.white,
		fontWeight: "900",
		fontSize: 18,
	},
	sheetAddress: {
		marginTop: 10,
		fontSize: 13,
		color: colors.textSecondary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	sheetDescription: {
		marginTop: 8,
		fontSize: 14,
		lineHeight: 20,
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	primaryButton: {
		marginTop: 12,
		flexDirection: "row-reverse",
		alignItems: "center",
		justifyContent: "center",
		gap: 8,
		backgroundColor: colors.primary,
		borderRadius: 14,
		paddingVertical: 12,
	},
	primaryButtonText: {
		color: colors.white,
		fontSize: 14,
		fontWeight: "900",
		writingDirection: "rtl",
	},
});

// features/roadtrip/screens/RoutesScreen.js
export const routesScreenStyles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.appSurface,
	},
	header: {
		paddingHorizontal: 18,
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
		borderColor: "rgba(255,255,255,0.07)",
		top: -58,
		right: -44,
	},
	headerCircleSmall: {
		position: "absolute",
		width: 134,
		height: 134,
		borderRadius: 67,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.09)",
		top: 30,
		right: 24,
	},
	topActionsRow: {
		position: "relative",
		zIndex: 2,
		minHeight: 56,
		flexDirection: "row-reverse",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 12,
	},
	headerTitleWrap: {
		flex: 1,
		alignItems: "center",
	},
	headerTitle: {
		color: "#FFFFFF",
		fontSize: 26,
		lineHeight: 31,
		fontWeight: "900",
		textAlign: "center",
		writingDirection: "rtl",
	},
	headerSubtitle: {
		marginTop: 2,
		color: "rgba(255,255,255,0.66)",
		fontSize: 13,
		fontWeight: "700",
		textAlign: "center",
		writingDirection: "rtl",
	},
	headerSideSpacer: {
		width: 42,
		height: 42,
	},
	glassIconButton: {
		width: 42,
		height: 42,
		borderRadius: 14,
		backgroundColor: "rgba(255,255,255,0.13)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.18)",
		alignItems: "center",
		justifyContent: "center",
	},
	glassIconButtonActive: {
		backgroundColor: "rgba(245,150,29,0.88)",
		borderColor: "rgba(255,255,255,0.32)",
	},
	searchRow: {
		position: "relative",
		zIndex: 3,
		marginTop: 12,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 10,
	},
	searchPill: {
		flex: 1,
		height: 48,
		borderRadius: 16,
		backgroundColor: "rgba(255,255,255,0.12)",
		borderWidth: 1.5,
		borderColor: "rgba(255,255,255,0.18)",
		paddingHorizontal: 14,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 9,
	},
	searchInput: {
		flex: 1,
		height: "100%",
		color: "#FFFFFF",
		fontSize: 15,
		fontWeight: "600",
		paddingVertical: 0,
		writingDirection: "rtl",
	},
	destinationClearBtn: {
		alignItems: "center",
		justifyContent: "center",
	},
	feedContent: {
		paddingBottom: 118,
	},
	generateCardWrap: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 4,
	},
});

// navigation/TabNavigator.js
export const tabNavigatorStyles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    // height must match TAB_BAR_HEIGHT in client/src/navigation/tabBarLayout.js
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
