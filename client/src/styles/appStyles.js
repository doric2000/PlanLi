import { fontFamilies } from "./typography";
import { StyleSheet, Dimensions, Platform } from 'react-native';
import { colors } from './colors';
import { common } from './common';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HEADER_HEIGHT = 54;
const SIDE_SIZE = 44;
const H_PADDING = 10;

// features/publishing/ContentPublishBanner.js
export const contentPublishBannerStyles = StyleSheet.create({
	banner: {
		position: 'absolute',
		left: 14,
		right: 14,
		zIndex: 1000,
		elevation: 14,
		borderRadius: 16,
		backgroundColor: colors.white,
		borderWidth: 1,
		borderColor: 'rgba(30,58,95,0.12)',
		paddingHorizontal: 14,
		paddingVertical: 12,
		shadowColor: '#000000',
		shadowOpacity: 0.16,
		shadowRadius: 12,
		shadowOffset: { width: 0, height: 5 },
	},
	bannerFailed: { borderColor: 'rgba(196,52,52,0.28)', backgroundColor: '#FFF9F9' },
	bannerSuccess: { borderColor: 'rgba(23,114,69,0.24)', backgroundColor: '#F7FFF9' },
	contentRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
	copy: { flex: 1, gap: 7 },
	title: { textAlign: 'right', color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.semiBold },
	errorText: { textAlign: 'right', color: colors.textMuted, fontSize: 12 },
	progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#E6EAF0', overflow: 'hidden' },
	progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
	actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 10 },
	action: { paddingHorizontal: 10, paddingVertical: 7 },
	primaryAction: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.primary },
	actionText: { color: colors.primary, fontSize: 13, fontFamily: fontFamilies.semiBold },
	primaryActionText: { color: colors.white, fontSize: 13, fontFamily: fontFamilies.semiBold },
	discardText: { color: colors.error },
});

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
		fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
    color: "#111827",
    textAlign: "right",
  },

  destructiveBtn: { backgroundColor: "#FEF2F2" },
  destructiveText: { color: "#EF4444" },

  cancelBtn: { backgroundColor: "#E5E7EB", marginBottom: 0 },
  cancelText: {
    fontSize: 16,
    fontFamily: fontFamilies.semiBold,
    color: "#374151",
    textAlign: "center",
  },
});

// components/ActiveFiltersList.js
export const activeFiltersListStyles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
  },
  clearText: {
    color: colors.info,
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
  },
});

export const discoveryFilterTriggerStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandOrange,
    borderWidth: 1,
    borderColor: colors.white,
    zIndex: 2,
  },
  badgeText: {
    color: colors.white,
    fontSize: 9,
    fontFamily: fontFamilies.semiBold,
  },
  emptyActions: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  emptyAction: {
    borderRadius: spacing.radiusFull,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyActionPrimary: {
    backgroundColor: colors.primary,
  },
  emptyActionText: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
  },
  emptyActionTextPrimary: {
    color: colors.white,
  },
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
    writingDirection: 'rtl',
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
  removeOverlayBtn: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(153,27,27,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row-reverse',
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
    fontFamily: fontFamilies.semiBold,
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

export const imageCropReviewStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B1220',
  },
  header: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  headerAction: {
    width: 64,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  counter: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontFamily: fontFamilies.regular,
  },
  cancelText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    fontFamily: fontFamilies.medium,
  },
  confirmText: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
  },
  stage: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  viewport: {
    maxWidth: 640,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  imageWrap: {
    position: 'absolute',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  footer: {
    minHeight: 88,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  helper: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 13,
    lineHeight: 20,
    fontFamily: fontFamilies.regular,
    textAlign: 'center',
    writingDirection: 'rtl',
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
  },
});

// components/Discovery*Filter*.js
export const discoveryFilterStyles = StyleSheet.create({
  modalOverlay: {
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    paddingHorizontal: Platform.OS === 'web' ? spacing.xl : 0,
    paddingVertical: Platform.OS === 'web' ? spacing.xl : 0,
  },
  modalContent: {
    width: '100%',
    maxWidth: 760,
    height: Platform.OS === 'web' ? '90%' : '92%',
    maxHeight: Platform.OS === 'web' ? 900 : undefined,
    alignSelf: 'center',
    borderRadius: Platform.OS === 'web' ? spacing.radiusXL : undefined,
    borderTopLeftRadius: spacing.radiusXL,
    borderTopRightRadius: spacing.radiusXL,
    overflow: 'hidden',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  scrollWrapper: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  content: {
    gap: 0,
  },
  profilePresetButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    paddingHorizontal: 2,
    paddingVertical: spacing.sm,
  },
  profilePresetCopy: {
    flex: 1,
    alignItems: 'flex-end',
  },
  profilePresetTitle: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
  },
  profilePresetText: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: spacing.xs,
    textAlign: 'right',
  },
  destinationSection: {
    zIndex: 20,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  primarySectionTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
  },
  primarySectionHelper: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    textAlign: 'right',
  },
  destinationInputWrap: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
  },
  destinationInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: spacing.md,
    writingDirection: 'rtl',
  },
  selectedDestinations: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  selectedDestinationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: spacing.radiusFull,
    borderWidth: 1,
    borderColor: colors.accentLight,
    backgroundColor: '#F7F9FF',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  selectedDestinationText: {
    color: colors.primary,
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
    writingDirection: 'rtl',
  },
  destinationSuggestionsPanel: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: spacing.radiusMedium,
    backgroundColor: colors.white,
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  destinationSuggestionGroup: {
    paddingTop: spacing.xs,
  },
  destinationSuggestionGroupTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: fontFamilies.semiBold,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    textAlign: 'right',
  },
  destinationSuggestion: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  destinationSuggestionTextWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  destinationSuggestionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
  },
  destinationSuggestionSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
  },
  destinationEmptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    padding: spacing.md,
    textAlign: 'right',
  },
  destinationLoadingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySection: {
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  categoryGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  categoryChip: {
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 14,
  },
  inlineNotice: {
    color: colors.info,
    fontSize: 12,
    marginTop: spacing.sm,
    textAlign: 'right',
  },
  subcategoryPanel: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  categoryTabs: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  categoryTab: {
    borderRadius: spacing.radiusFull,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  categoryTabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.accentLight,
  },
  categoryTabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
  },
  categoryTabTextActive: {
    color: colors.primary,
  },
  subcategoryTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
    marginBottom: spacing.sm,
    textAlign: 'right',
  },
  serviceGroupTabs: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  serviceGroupTab: {
    borderRadius: spacing.radiusSmall,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  serviceGroupTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  serviceGroupTabText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontFamily: fontFamilies.semiBold,
  },
  serviceGroupTabTextActive: {
    color: colors.white,
  },
  disclosureSection: {
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 62,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  disclosureTitleWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  disclosureTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
  },
  disclosureSummary: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
    maxWidth: '100%',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  disclosureBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    backgroundColor: colors.white,
    paddingTop: spacing.md,
    paddingHorizontal: 2,
  },
  optionGroup: {
    marginBottom: spacing.md,
  },
  optionGroupLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fontFamilies.semiBold,
    marginBottom: spacing.sm,
    textAlign: 'right',
  },
  optionGroupHelper: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.sm,
    textAlign: 'right',
  },
  optionGrid: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  showAllButton: {
    alignSelf: 'flex-end',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs,
  },
  showAllText: {
    color: colors.info,
    fontSize: 12,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
  },
  rangeGrid: {
    gap: spacing.sm,
  },
});

export const recommendationsFilterModalStyles = discoveryFilterStyles;
export const routesFilterModalStyles = discoveryFilterStyles;

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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
    fontSize: 14,
  },
  textSelected: {
    color: '#fff',
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
    lineHeight: 18,
  },
  addMoreBtn: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.sm,
  },
  addMoreText: {
    color: colors.primary,
    fontFamily: fontFamilies.semiBold,
  },
  taxonomySection: {
    marginBottom: spacing.md,
  },
  taxonomyHint: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'right',
    writingDirection: 'rtl',
    marginBottom: 4,
  },
  taxonomyToggle: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  taxonomyToggleText: {
    color: colors.primary,
    fontSize: 13,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
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
    fontFamily: fontFamilies.semiBold,
    color: colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
    marginBottom: 8,
  },
  unsavedDialogMessage: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamilies.regular,
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
    fontFamily: fontFamilies.semiBold,
    color: colors.textPrimary,
    writingDirection: 'rtl',
  },
  unsavedDialogButtonDestructiveText: {
    fontSize: 17,
    fontFamily: fontFamilies.regular,
    color: colors.error,
    writingDirection: 'rtl',
  },
});

// features/community/screens/CommunityScreen.js
export const communityScreenStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.heroBlueGradient[1],
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.heroBlueGradient[1],
  },
  filtersAfterOverlappingHeader: {
    paddingTop: 8,
    position: 'relative',
    zIndex: 2,
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
    fontFamily: fontFamilies.semiBold,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  headerSubtitle: {
    marginTop: 2,
    color: 'rgba(255,255,255,0.66)',
    fontSize: 13,
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
    writingDirection: 'rtl',
  },
  mapModeSummary: {
    minWidth: 132,
    paddingHorizontal: 11,
  },
  searchRow: {
    position: 'relative',
    zIndex: 3,
    marginTop: 12,
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
    fontFamily: fontFamilies.semiBold,
    paddingVertical: 0,
    writingDirection: 'rtl',
  },
  feedContent: {
    flexGrow: 1,
    paddingTop: 0,
    paddingHorizontal: 0,
    backgroundColor: colors.appSurface,
  },
  feedContentEmpty: {
    flexGrow: 1,
  },
  feedBodyState: {
    flex: 1,
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedEmptyState: {
    marginTop: 0,
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
    fontFamily: fontFamilies.semiBold,
    fontSize: 12,
  },

  pricePill: {
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  pricePillText: {
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
		flexGrow: 1,
		backgroundColor: colors.appSurface,
	},
	header: {
		paddingHorizontal: 20,
		paddingBottom: 18,
		borderBottomLeftRadius: 30,
		borderBottomRightRadius: 30,
		overflow: "hidden",
	},
	headerLayer: {
		position: "relative",
		zIndex: 100,
		elevation: 12,
	},
	headerTitleRow: {
		position: "relative",
		zIndex: 2,
		alignItems: "flex-end",
		justifyContent: "center",
		minHeight: 56,
	},
	headline: {
		color: "#FFFFFF",
		fontSize: 34,
		lineHeight: 34,
		fontFamily: fontFamilies.semiBold,
		textAlign: "right",
		writingDirection: "rtl",
	},
	subtitle: {
		marginTop: 8,
		color: "rgba(255,255,255,0.62)",
		fontSize: 14,
		fontFamily: fontFamilies.medium,
		textAlign: "right",
		writingDirection: "rtl",
	},
	searchWrap: {
		position: "relative",
		zIndex: 20,
		marginTop: 12,
	},
	searchInputWrapper: {
		height: 48,
		borderRadius: 16,
		backgroundColor: "rgba(255,255,255,0.12)",
		borderWidth: 1.5,
		borderColor: "rgba(255,255,255,0.18)",
		paddingHorizontal: 0,
	},
	searchInput: {
		color: "#FFFFFF",
		fontSize: 15,
		fontFamily: fontFamilies.medium,
		paddingLeft: 16,
		paddingRight: 48,
		textAlign: "right",
		writingDirection: "rtl",
	},
	searchIcon: {
		top: 15,
	},
	searchLoader: {
		left: 16,
		top: 16,
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
		fontFamily: fontFamilies.semiBold,
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
	sectionTitle: {
		fontSize: 18,
		fontFamily: fontFamilies.medium,
		color: "#0F1729",
		textAlign: "right",
		writingDirection: "rtl",
	},
	sectionLink: {
		fontSize: 13,
		color: colors.navActive,
		fontFamily: fontFamilies.medium,
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
		fontFamily: fontFamilies.semiBold,
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
	featuredCity: {
		color: "#FFFFFF",
		fontSize: 21,
		fontFamily: fontFamilies.semiBold,
		textAlign: "right",
		writingDirection: "rtl",
	},
	featuredCountry: {
		marginTop: 3,
		color: "rgba(255,255,255,0.74)",
		fontSize: 12,
		fontFamily: fontFamilies.regular,
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
		fontFamily: fontFamilies.regular,
		textAlign: "center",
		writingDirection: "rtl",
	},
	emptyText: {
		width: "100%",
		color: "#6B7280",
		fontSize: 16,
		fontFamily: fontFamilies.regular,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  email: {
    maxWidth: '86%',
    marginTop: 2,
    color: colors.textLight,
    fontSize: 14,
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
  },
  rightSpacer: { width: 44, height: 44 },

  container: { flex: 1, paddingHorizontal: 16, paddingTop: 18, gap: 12 },

  notice: {
    borderRadius: 12,
    backgroundColor: '#FFF7E8',
    color: '#7A4B00',
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 21,
    padding: 14,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  noticeBlocked: { backgroundColor: '#F3F4F6', color: '#4B5563' },

  label: { fontSize: 14, fontFamily: fontFamilies.semiBold, textAlign: 'right', color: '#111827' },
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
  primaryBtnText: { color: '#fff', fontFamily: fontFamilies.semiBold, fontSize: 16 },
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
    fontFamily: fontFamilies.semiBold,
  },
  rightSpacer: { width: 44, height: 44 },

  container: { flex: 1, paddingHorizontal: 16, paddingTop: 18, gap: 12 },

  label: { fontSize: 14, fontFamily: fontFamilies.semiBold, textAlign: 'right', color: '#111827' },
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
  primaryBtnText: { color: '#fff', fontFamily: fontFamilies.semiBold, fontSize: 16 },
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
    fontFamily: fontFamilies.semiBold,
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
      fontFamily: fontFamilies.semiBold,
      textAlign: 'right',
      writingDirection: 'rtl',
    },
    contentSubtitle: {
      marginTop: 2,
      color: colors.textLight,
      fontSize: 13,
      fontFamily: fontFamilies.semiBold,
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
      fontFamily: fontFamilies.semiBold,
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
      fontFamily: fontFamilies.semiBold,
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
      fontFamily: fontFamilies.semiBold,
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
      fontFamily: fontFamilies.semiBold,
      textAlign: 'center',
      writingDirection: 'rtl',
    },
    emptyText: {
      marginTop: 5,
      color: colors.textLight,
      fontSize: 13,
      fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
  primaryBtnText: { color: '#fff', fontFamily: fontFamilies.semiBold, fontSize: 16 },
  dangerButton: { backgroundColor: '#B42318' },
  buttonDisabled: { opacity: 0.6 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.48)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { width: '100%', maxWidth: 420, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20 },
  modalTitle: { fontSize: 20, fontFamily: fontFamilies.semiBold, color: '#111827', textAlign: 'right' },
  modalText: { marginTop: 8, color: '#4B5563', lineHeight: 20, textAlign: 'right' },
  modalInput: {
    height: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginTop: 18,
    textAlign: 'right',
  },
  modalActions: { flexDirection: 'row-reverse', gap: 10, marginTop: 18 },
  modalCancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F3F4F6' },
  modalCancelText: { color: '#374151', fontFamily: fontFamilies.semiBold },
  modalDeleteButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#B42318' },
  modalDeleteText: { color: '#FFFFFF', fontFamily: fontFamilies.semiBold },

  emptyStateContainer: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    padding: 18,
    alignItems: 'center',
  },
  emptyStateTitle: {
    color: '#111827',
    fontSize: 16,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'center',
  },
  emptyStateText: {
    marginTop: 6,
    color: '#6B7280',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  list: { gap: 10 },
  blockedUserRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(17,24,39,0.08)',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 10,
  },
  blockedUserContent: { flex: 1 },
  blockedUserName: {
    color: '#111827',
    fontSize: 16,
    fontFamily: fontFamilies.semiBold,
    textAlign: 'right',
  },
  blockedUserId: {
    marginTop: 2,
    color: '#6B7280',
    fontSize: 12,
    textAlign: 'right',
  },
  unblockButton: {
    minWidth: 86,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 14,
  },
  unblockButtonText: {
    color: '#B42318',
    fontFamily: fontFamilies.semiBold,
    fontSize: 13,
  },
  unblockButtonDisabled: {
    opacity: 0.55,
  },
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
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
    fontFamily: fontFamilies.semiBold,
  },
});

// components/ExactLocationPicker.js
export const exactLocationPickerStyles = StyleSheet.create({
	wrap: {
		width: "100%",
	},
	label: {
		fontSize: 14,
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
	previewCard: {
		marginTop: 12,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 14,
		overflow: 'hidden',
		backgroundColor: colors.card,
	},
	choiceCard: {
		marginTop: 12,
		padding: 12,
		gap: 8,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 14,
		backgroundColor: colors.card,
	},
	choiceHeading: {
		fontSize: 15,
		fontFamily: fontFamilies.semiBold,
		color: colors.textPrimary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	choiceHelper: {
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	choiceButton: {
		minHeight: 52,
		paddingHorizontal: 12,
		paddingVertical: 8,
		justifyContent: 'center',
		borderWidth: 1,
		borderColor: colors.primary,
		borderRadius: 10,
	},
	choiceTitle: {
		fontSize: 14,
		fontFamily: fontFamilies.semiBold,
		color: colors.primary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	choiceMeta: {
		marginTop: 2,
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	previewMap: {
		width: '100%',
		height: 190,
		borderWidth: 0,
	},
	previewCopy: {
		paddingHorizontal: 14,
		paddingTop: 12,
		gap: 4,
	},
	previewTitle: {
		fontSize: 15,
		fontFamily: fontFamilies.semiBold,
		color: colors.textPrimary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	previewAddress: {
		fontSize: 12,
		color: colors.textSecondary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	previewDestination: {
		fontSize: 12,
		fontFamily: fontFamilies.semiBold,
		color: colors.primary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
	previewActions: {
		flexDirection: 'row-reverse',
		gap: 8,
		padding: 12,
	},
	confirmButton: {
		minHeight: 44,
		flex: 1,
		borderRadius: 10,
		backgroundColor: colors.primary,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 12,
	},
	confirmButtonText: {
		fontSize: 14,
		fontFamily: fontFamilies.semiBold,
		color: colors.white,
	},
	chooseAnotherButton: {
		minHeight: 44,
		flex: 1,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.border,
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 12,
	},
	chooseAnotherText: {
		fontSize: 13,
		fontFamily: fontFamilies.semiBold,
		color: colors.textSecondary,
		textAlign: 'center',
	},
	retryButton: {
		minHeight: 44,
		marginTop: 8,
		alignSelf: 'flex-end',
		justifyContent: 'center',
		paddingHorizontal: 14,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: colors.error,
	},
	retryText: {
		fontSize: 13,
		fontFamily: fontFamilies.semiBold,
		color: colors.error,
	},
	manualCountryText: {
		marginTop: 6,
		fontSize: 13,
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
    headerTitle: { fontSize: 18, fontFamily: fontFamilies.semiBold, textAlign: 'right' },
    headerBtn: { fontSize: 16, color: '#007AFF' },
    headerBtnStrong: { fontFamily: fontFamilies.semiBold },
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
        fontFamily: fontFamilies.semiBold,
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
        fontFamily: fontFamilies.semiBold,
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
        fontFamily: fontFamilies.semiBold,
    },
    stopTextWrap: {
        flex: 1,
        minWidth: 0,
        alignItems: "flex-end",
    },
    stopTitle: {
        fontSize: 14,
        fontFamily: fontFamilies.semiBold,
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
        fontFamily: fontFamilies.semiBold,
        writingDirection: "rtl",
    },
    imagePickerSpacing: {
        marginBottom: spacing.xl,
    },
    photoLabel: { fontSize: 16, fontFamily: fontFamilies.semiBold, marginBottom: 8, color: '#334155', textAlign: 'right' },
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
		fontFamily: fontFamilies.semiBold,
		color: colors.textPrimary,
		textAlign: "center",
		writingDirection: "rtl",
	},
	headerButton: {
		fontSize: 15,
		color: colors.primary,
		fontFamily: fontFamilies.semiBold,
		minWidth: 52,
		textAlign: "center",
	},
	headerButtonStrong: {
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	autoHint: {
		fontSize: 12,
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
		color: "#0F172A",
		fontSize: 16,
		textAlign: "right",
		writingDirection: "rtl",
	},
	editHint: {
		color: colors.primary,
		fontSize: 13,
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.regular,
	},
	headerTitle: {
		fontSize: 18,
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
	},
	stopTextWrap: {
		flex: 1,
		minWidth: 0,
		alignItems: "flex-end",
	},
	stopTitle: {
		fontSize: 14,
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
		color: "#ffffffff",
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 15,
		color: "#f0f0f0ff",
		textAlign: "center",
		fontFamily: fontFamilies.regular,
	},
});

// features/roadtrip/components/PlacesRoute.js
export const placesRouteStyles = StyleSheet.create({
	container: {
		flexDirection: "row-reverse",
		alignItems: "center",
		minWidth: 0,
	},
	containerCompact: {
		alignSelf: "stretch",
	},
	routeItem: {
		flexDirection: "row-reverse",
		alignItems: "center",
		minWidth: 0,
		flexShrink: 1,
	},
	placeBox: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 7,
		minWidth: 0,
		backgroundColor: "#F7F9FC",
		paddingLeft: 9,
		paddingRight: 4,
		paddingVertical: 4,
		borderRadius: 18,
		borderWidth: 1,
		borderColor: "rgba(30,58,95,0.10)",
	},
	placeBoxCompact: {
		paddingLeft: 7,
		gap: 5,
	},
	placeImage: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: colors.borderLight,
	},
	placeImageFallback: {
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: colors.primary,
		alignItems: "center",
		justifyContent: "center",
	},
	placeText: {
		fontSize: 13,
		color: colors.textPrimary,
		fontFamily: fontFamilies.medium,
		maxWidth: 96,
		textAlign: "right",
		writingDirection: "rtl",
	},
	placeTextCompact: {
		fontSize: 12,
		maxWidth: 72,
	},
	connector: {
		width: 12,
		height: 1,
		backgroundColor: "rgba(46,196,182,0.52)",
		marginHorizontal: 3,
	},
	moreBadge: {
		marginRight: 6,
		width: 30,
		height: 30,
		borderRadius: 15,
		backgroundColor: colors.primarySoft || "#E7F7F5",
		alignItems: "center",
		justifyContent: "center",
	},
	moreText: {
		fontSize: 11,
		fontFamily: fontFamilies.semiBold,
		color: colors.primary,
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
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
		marginTop: 2,
		marginBottom: 10,
		overflow: "hidden",
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
        fontFamily: fontFamilies.semiBold,
        textAlign: 'right',
        writingDirection: 'rtl',
        marginBottom: spacing.lg,
        color: colors.textPrimary || '#111827',
    },
    fieldLabel: {
        textAlign: 'right',
        fontSize: 14,
        fontFamily: fontFamilies.semiBold,
        marginBottom: 8,
        color: colors.textPrimary || '#111827',
        writingDirection: 'rtl',
    },
    descriptionField: {
        marginBottom: spacing.xl,
    },
	confirmationRow: {
		flexDirection: 'row-reverse',
		alignItems: 'flex-start',
		gap: spacing.sm,
		padding: spacing.md,
		marginBottom: spacing.lg,
		borderRadius: 12,
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.border,
	},
	confirmationBox: {
		width: 22,
		height: 22,
		borderRadius: 6,
		borderWidth: 1.5,
		borderColor: colors.textSecondary,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.white,
	},
	confirmationBoxChecked: {
		backgroundColor: colors.primary,
		borderColor: colors.primary,
	},
	confirmationCheck: {
		color: colors.white,
		fontSize: 14,
		fontFamily: fontFamilies.semiBold,
	},
	confirmationText: {
		flex: 1,
		fontSize: 13,
		lineHeight: 19,
		color: colors.textPrimary,
		textAlign: 'right',
		writingDirection: 'rtl',
	},
});

// features/roadtrip/screens/RouteDetailScreen.js
export const routeDetailScreenStyles = StyleSheet.create({
    page: {
        flex: 1,
    },
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
        fontFamily: fontFamilies.semiBold,
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
    routePreviewSection: {
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
    },
    metricsRow: {
        marginTop: 22,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: colors.divider,
        flexDirection: 'row-reverse',
        justifyContent: 'space-around',
    },
    metric: {
        minWidth: 78,
        alignItems: 'center',
        gap: 3,
    },
    metricValue: {
        color: colors.textPrimary,
        fontSize: 16,
        fontFamily: fontFamilies.semiBold,
    },
    metricLabel: {
        color: colors.textMuted,
        fontSize: 11,
        fontFamily: fontFamilies.medium,
        writingDirection: 'rtl',
    },
    mapPreviewSpacing: {
        marginTop: 13,
    },
    destinationsSpacing: {
        marginTop: 14,
        overflow: 'hidden',
    },
    itinerarySpacing: {
        marginTop: 14,
    },
    placesRouteSpacing: {
        marginTop: spacing.md,
        overflow: 'hidden',
    },
    subsectionTitle: {
        fontSize: 15,
        fontFamily: fontFamilies.semiBold,
        color: colors.textPrimary,
        marginBottom: spacing.sm,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
    detailSection: {
        marginTop: spacing.lg,
        paddingTop: spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.borderLight,
    },
    factsGrid: {
        flexDirection: 'row-reverse',
        flexWrap: 'wrap',
        columnGap: spacing.md,
    },
    factItem: {
        width: '47%',
    },
    metadataGroup: {
        marginTop: spacing.sm,
    },
    metadataTitle: {
        fontSize: 12,
        color: colors.textMuted,
        fontFamily: fontFamilies.medium,
        textAlign: 'right',
        writingDirection: 'rtl',
        marginBottom: spacing.xs,
    },
    needRow: {
        minHeight: 48,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    needText: {
        flex: 1,
        fontSize: 14,
        color: colors.textPrimary,
        textAlign: 'right',
        writingDirection: 'rtl',
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
        fontFamily: fontFamilies.semiBold,
        textAlign: "right",
        writingDirection: "rtl",
    },
    mapButtonTextDisabled: {
        color: colors.textMuted,
    },
    mapUnavailable: {
        minHeight: 58,
        marginTop: spacing.sm,
        marginBottom: spacing.lg,
        paddingHorizontal: spacing.md,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.background,
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: spacing.sm,
    },
    mapUnavailableText: {
        flex: 1,
        fontSize: 13,
        color: colors.textMuted,
        textAlign: 'right',
        writingDirection: 'rtl',
    },
});

// components/MediaGalleryModal.js
export const mediaGalleryModalStyles = StyleSheet.create({
	screen: { flex: 1, backgroundColor: '#070B12' },
	header: {
		height: 62, paddingHorizontal: 16, flexDirection: 'row-reverse', alignItems: 'center',
		justifyContent: 'space-between', zIndex: 5,
	},
	closeButton: {
		width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
		backgroundColor: 'rgba(255,255,255,0.12)',
	},
	counter: { color: colors.white, fontSize: 14, fontFamily: fontFamilies.semiBold },
	headerSpacer: { width: 44 },
	page: { alignItems: 'center', justifyContent: 'center', paddingBottom: 54 },
	image: { width: '100%', height: '100%' },
	caption: {
		position: 'absolute', left: 20, right: 20, bottom: 16, color: colors.white,
		fontSize: 15, fontFamily: fontFamilies.medium, textAlign: 'center', writingDirection: 'rtl',
	},
	webNavigation: {
		...StyleSheet.absoluteFillObject, paddingHorizontal: 22, flexDirection: 'row',
		alignItems: 'center', justifyContent: 'space-between',
	},
	navButton: {
		width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.56)',
		alignItems: 'center', justifyContent: 'center',
	},
	navButtonDisabled: { opacity: 0.25 },
});

// features/roadtrip/components/RouteStopMarker.js
export const routeStopMarkerStyles = StyleSheet.create({
	touchTarget: { width: 56, height: 64, alignItems: 'center', justifyContent: 'flex-start' },
	touchTargetCompact: { width: 42, height: 50 },
	halo: {
		width: 52, height: 58, borderRadius: 26, alignItems: 'center', paddingTop: 2,
		backgroundColor: 'transparent',
	},
	haloSelected: { backgroundColor: 'rgba(255,149,31,0.24)' },
	haloCompact: { width: 40, height: 46, borderRadius: 20 },
	pinHead: {
		width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center',
		justifyContent: 'center', backgroundColor: colors.primary, borderWidth: 3,
		borderColor: colors.white, zIndex: 2, ...shadows.small,
	},
	pinHeadSelected: { borderColor: colors.brandOrange, transform: [{ scale: 1.08 }] },
	pinHeadCompact: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
	tail: {
		width: 15, height: 15, marginTop: -9, backgroundColor: colors.primary,
		borderRightWidth: 2, borderBottomWidth: 2, borderColor: colors.white,
		transform: [{ rotate: '45deg' }], zIndex: 1,
	},
	tailSelected: { backgroundColor: colors.brandOrange },
	tailCompact: { width: 12, height: 12, marginTop: -7 },
	image: { width: '100%', height: '100%' },
	number: { color: colors.white, fontSize: 16, fontFamily: fontFamilies.semiBold },
	numberCompact: { fontSize: 12 },
	badge: {
		position: 'absolute', right: -1, bottom: -1, minWidth: 18, height: 18, borderRadius: 9,
		paddingHorizontal: 3, backgroundColor: colors.brandOrange, borderWidth: 2,
		borderColor: colors.white, alignItems: 'center', justifyContent: 'center',
	},
	badgeCompact: { minWidth: 15, height: 15, borderRadius: 8, borderWidth: 1 },
	badgeText: { color: colors.white, fontSize: 9, fontFamily: fontFamilies.semiBold },
	badgeTextCompact: { fontSize: 8 },
});

// features/roadtrip/components/RouteItinerary.js
export const routeItineraryStyles = StyleSheet.create({
	container: { gap: 12 },
	dayCard: {
		borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
		overflow: 'hidden',
	},
	dayCardOpen: { borderColor: 'rgba(30,58,95,0.24)', ...shadows.small },
	dayHeader: {
		minHeight: 104, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
		backgroundColor: '#F8FAFC',
	},
	dayImageButton: { width: 78, height: 78, borderRadius: 15, overflow: 'hidden' },
	dayImage: { width: '100%', height: '100%', backgroundColor: colors.borderLight },
	photoIndicator: {
		position: 'absolute', left: 5, bottom: 5, width: 26, height: 26, borderRadius: 13,
		backgroundColor: 'rgba(15,23,42,0.68)', alignItems: 'center', justifyContent: 'center',
	},
	dayFallback: {
		width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primary,
		alignItems: 'center', justifyContent: 'center',
	},
	dayFallbackText: { color: colors.white, fontSize: 21, fontFamily: fontFamilies.semiBold },
	dayCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
	dayTitle: { fontSize: 17, fontFamily: fontFamilies.semiBold, color: colors.textPrimary, writingDirection: 'rtl' },
	dayDescription: { marginTop: 3, fontSize: 13, lineHeight: 19, color: colors.textSecondary, textAlign: 'right', writingDirection: 'rtl' },
	dayMeta: { marginTop: 5, fontSize: 12, fontFamily: fontFamilies.semiBold, color: colors.primary, writingDirection: 'rtl' },
	stopsGrid: { padding: 12, flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 },
	stopCard: {
		width: '100%', minHeight: 94, padding: 10, borderRadius: 15, borderWidth: 1,
		borderColor: colors.borderLight, backgroundColor: colors.white,
		flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
	},
	stopCardWide: { width: '48.8%' },
	stopImageButton: { width: 68, height: 68, borderRadius: 13, overflow: 'hidden' },
	stopImage: { width: '100%', height: '100%', backgroundColor: colors.borderLight },
	stopNumberOverlay: {
		position: 'absolute', right: 5, top: 5, minWidth: 24, height: 24, borderRadius: 12,
		paddingHorizontal: 5, backgroundColor: 'rgba(30,58,95,0.92)', alignItems: 'center', justifyContent: 'center',
	},
	stopNumberOverlayText: { color: colors.white, fontSize: 11, fontFamily: fontFamilies.semiBold },
	stopNumber: {
		width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
		alignItems: 'center', justifyContent: 'center',
	},
	stopNumberText: { color: colors.white, fontSize: 16, fontFamily: fontFamilies.semiBold },
	stopCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
	stopTitle: { fontSize: 14, fontFamily: fontFamilies.semiBold, color: colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
	stopDescription: { marginTop: 3, fontSize: 12, lineHeight: 17, color: colors.textSecondary, textAlign: 'right', writingDirection: 'rtl' },
	stopAddress: { marginTop: 4, fontSize: 11, lineHeight: 16, color: colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
	mapButton: {
		width: 44, height: 44, borderRadius: 14, backgroundColor: '#E7F7F5',
		alignItems: 'center', justifyContent: 'center',
	},
	mapButtonDisabled: { backgroundColor: colors.surfaceSubtle },
});

// features/roadtrip/components/RouteMapPreview.js
export const routeMapPreviewStyles = StyleSheet.create({
	container: {
		width: "100%",
		borderRadius: 20,
		overflow: "hidden",
		backgroundColor: colors.white,
		borderWidth: 1,
		borderColor: "rgba(30,58,95,0.10)",
		...shadows.small,
	},
	mapFrame: {
		height: 168,
		position: "relative",
		overflow: "hidden",
	},
	map: {
		...StyleSheet.absoluteFillObject,
	},
	mapShade: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: "rgba(15,23,42,0.04)",
	},
	webFallback: {
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#EAF1F3",
	},
	cta: {
		position: "absolute",
		left: 10,
		right: 10,
		bottom: 10,
		minHeight: 54,
		borderRadius: 16,
		backgroundColor: "rgba(255,255,255,0.96)",
		borderWidth: 1,
		borderColor: "rgba(30,58,95,0.10)",
		paddingHorizontal: 12,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 10,
		...shadows.small,
	},
	ctaIcon: {
		width: 34,
		height: 34,
		borderRadius: 12,
		backgroundColor: "#E7F7F5",
		alignItems: "center",
		justifyContent: "center",
	},
	ctaCopy: {
		flex: 1,
		minWidth: 0,
		alignItems: "flex-end",
	},
	ctaTitle: {
		fontSize: 14,
		fontFamily: fontFamilies.semiBold,
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	ctaSubtitle: {
		marginTop: 2,
		fontSize: 11,
		color: colors.textSecondary,
		textAlign: "right",
		writingDirection: "rtl",
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
		fontFamily: fontFamilies.semiBold,
		color: colors.textPrimary,
		textAlign: "right",
		writingDirection: "rtl",
	},
	headerSubtitle: {
		marginTop: 2,
		fontSize: 12,
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
		writingDirection: "rtl",
	},
	headerActionTextDisabled: {
		color: colors.textMuted,
	},
	map: {
		flex: 1,
	},
	mapWrap: {
		flex: 1,
		position: "relative",
	},
	mapControls: {
		position: "absolute",
		right: 14,
		gap: 10,
		zIndex: 20,
	},
	mapControlsDefault: {
		bottom: 22,
	},
	mapControlsSelected: {
		top: 14,
	},
	mapControlButton: {
		width: 46,
		height: 46,
		borderRadius: 23,
		backgroundColor: "rgba(255,255,255,0.96)",
		borderWidth: 1,
		borderColor: "rgba(30,58,95,0.12)",
		alignItems: "center",
		justifyContent: "center",
		...shadows.small,
	},
	locationNotice: {
		position: "absolute",
		left: 28,
		right: 28,
		bottom: 24,
		minHeight: 42,
		borderRadius: 16,
		backgroundColor: "rgba(255,255,255,0.96)",
		borderWidth: 1,
		borderColor: "rgba(30,58,95,0.12)",
		paddingHorizontal: 14,
		alignItems: "center",
		justifyContent: "center",
		zIndex: 18,
	},
	locationNoticeText: {
		fontSize: 12,
		fontFamily: fontFamilies.semiBold,
		color: colors.textPrimary,
		textAlign: "center",
		writingDirection: "rtl",
	},
	webStopCard: {
		width: '100%', maxWidth: 680, minHeight: 82, marginTop: 10, padding: 10,
		borderRadius: 16, borderWidth: 1, borderColor: colors.border,
		backgroundColor: colors.white, flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
		...shadows.small,
	},
	webStopImage: { width: 58, height: 58, borderRadius: 14, backgroundColor: colors.borderLight },
	webStopNumber: {
		width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary,
		alignItems: 'center', justifyContent: 'center',
	},
	webStopNumberText: { color: colors.white, fontFamily: fontFamilies.semiBold, fontSize: 16 },
	webStopCopy: { flex: 1, minWidth: 0, alignItems: 'flex-end' },
	webStopTitle: { fontSize: 15, fontFamily: fontFamilies.semiBold, color: colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
	webStopAddress: { marginTop: 4, fontSize: 12, color: colors.textSecondary, textAlign: 'right', writingDirection: 'rtl' },
	webMap: {
		width: "100%",
		height: "100%",
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
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
		textAlign: "right",
		writingDirection: "rtl",
	},
	sheetTitle: {
		marginTop: 2,
		fontSize: 17,
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
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
		fontFamily: fontFamilies.semiBold,
		writingDirection: "rtl",
	},
});

// features/roadtrip/screens/RoutesScreen.js
export const routesScreenStyles = StyleSheet.create({
	screen: {
		flex: 1,
		backgroundColor: colors.heroBlueGradient[1],
	},
	scroll: {
		flex: 1,
		backgroundColor: colors.heroBlueGradient[1],
	},
	filtersAfterOverlappingHeader: {
		paddingTop: 8,
		position: 'relative',
		zIndex: 2,
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
		fontFamily: fontFamilies.semiBold,
		textAlign: "center",
		writingDirection: "rtl",
	},
	headerSubtitle: {
		marginTop: 2,
		color: "rgba(255,255,255,0.66)",
		fontSize: 13,
		fontFamily: fontFamilies.semiBold,
		textAlign: "center",
		writingDirection: "rtl",
	},
	headerSideSpacer: {
		width: 42,
		height: 42,
	},
	sortGlassButton: {
		minWidth: 76,
		height: 42,
		paddingHorizontal: 10,
		borderRadius: 14,
		backgroundColor: "rgba(255,255,255,0.13)",
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.18)",
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		gap: 4,
	},
	sortGlassText: {
		color: "#FFFFFF",
		fontSize: 12,
		fontFamily: fontFamilies.semiBold,
	},
	searchRow: {
		position: "relative",
		zIndex: 3,
		marginTop: 12,
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
		fontFamily: fontFamilies.semiBold,
		paddingVertical: 0,
		writingDirection: "rtl",
	},
	destinationClearBtn: {
		alignItems: "center",
		justifyContent: "center",
	},
	feedContent: {
		flexGrow: 1,
		paddingBottom: 118,
		backgroundColor: colors.appSurface,
	},
	feedContentEmpty: {
		flexGrow: 1,
	},
	feedBodyState: {
		flex: 1,
		minHeight: 220,
		alignItems: 'center',
		justifyContent: 'center',
	},
	feedEmptyState: {
		marginTop: 0,
	},
	generateCardWrap: {
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 4,
	},
});

// features/favorites/screen/FavoritesScreen.js
export const favoritesSwipeStyles = StyleSheet.create({
  content: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.appSurface,
  },
  page: {
    flex: 1,
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
  swipeButton: {
    flex: 1,
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
    fontFamily: fontFamilies.semiBold,
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
