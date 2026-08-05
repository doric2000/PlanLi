import { colors } from "./colors";
import { shadows } from "./shadows";
import { spacing } from "./spacing";
import { typography } from "./typography";

export const community = {
	// Screen
	screen: {
		flex: 1,
		backgroundColor: colors.background,
	},

	// Header sort button
	sortButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 2,
	},
	sortButtonText: {
		...typography.caption,
		fontWeight: "bold",
		color: colors.textPrimary,
	},

	// Destination search
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
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.border,
		...shadows.small,
	},
	destinationSearchPill: {
		flex: 1,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: spacing.sm,
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.border,
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

	// Sort menu modal
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.3)",
		justifyContent: "center",
		alignItems: "center",
	},
	sortMenu: {
		width: 220,
		backgroundColor: colors.card,
		borderRadius: 12,
		padding: spacing.md,
		elevation: 5,
	},
	sortTitle: {
		...typography.h3,
		textAlign: "center",
		marginBottom: spacing.md,
	},
	sortOption: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: colors.borderLight,
	},
	sortOptionSelected: {
		backgroundColor: colors.background,
	},
	sortOptionLabelRow: {
		flexDirection: "row-reverse",
		alignItems: "center",
	},
	sortOptionIcon: {
		marginLeft: 6,
	},
	sortOptionText: {
		color: colors.textPrimary,
	},
	sortOptionTextSelected: {
		color: colors.primary,
	},

	// Header map button
	headerIconButton: {
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: 12,
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.border,
	},
	headerIconButtonText: {
		...typography.caption,
		color: colors.textPrimary,
		fontWeight: "700",
	},

	// Map screen
	mapScreen: {
		flex: 1,
		backgroundColor: colors.background,
	},
	inlineMapSection: {
		flex: 1,
		paddingHorizontal: 0,
		paddingTop: 0,
		paddingBottom: 0,
	},
	inlineMapWrap: {
		flex: 1,
		borderRadius: 0,
		overflow: "hidden",
		borderWidth: 0,
		borderColor: colors.borderLight || colors.border,
		backgroundColor: colors.card,
		...shadows.small,
		position: "relative",
	},
	inlineMapContainer: {
		flex: 1,
	},
	inlineMapView: {
		flex: 1,
		backgroundColor: colors.background,
	},
	inlineLeafletMapWrap: {
		flex: 1,
	},
	inlineMapEmpty: {
		flex: 1,
		alignItems: "center",
		justifyContent: "center",
		paddingHorizontal: spacing.lg,
		gap: spacing.sm,
	},
	inlineMapEmptyText: {
		...typography.caption,
		color: colors.textSecondary,
		textAlign: "center",
		writingDirection: "rtl",
	},
	mapContainer: {
		flex: 1,
	},
	mapView: {
		flex: 1,
		backgroundColor: colors.background,
	},
	mapAttributionTopWrap: {
		position: "absolute",
		left: 8,
		top: 8,
		backgroundColor: "rgba(255,255,255,0.9)",
		borderRadius: 10,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.border,
		zIndex: 20,
	},
	mapAttributionText: {
		...typography.caption,
		color: colors.textSecondary,
	},
	defaultMapRegion: {
		latitude: 31.0461,
		longitude: 34.8516,
		latitudeDelta: 6,
		longitudeDelta: 6,
	},
	cityWideMapDelta: {
		latitudeDelta: 0.12,
		longitudeDelta: 0.12,
	},
	mapCallout: {
		minWidth: 180,
		paddingVertical: spacing.sm,
		paddingHorizontal: spacing.md,
	},
	mapCalloutTitle: {
		...typography.label,
		textAlign: "right",
		writingDirection: "rtl",
		color: colors.textPrimary,
	},
	mapCalloutHint: {
		...typography.caption,
		marginTop: 4,
		textAlign: "right",
		writingDirection: "rtl",
		color: colors.textSecondary,
	},

	// Web leaflet container
	leafletMapWrap: {
		flex: 1,
	},
	leafletMap: {
		width: "100%",
		height: "100%",
	},

	// Recommendation map markers
	mapMarkerTouchTarget: {
		width: 48,
		height: 54,
		alignItems: "center",
		justifyContent: "flex-end",
	},
	mapMarkerBubble: {
		width: 38,
		height: 38,
		borderRadius: 19,
		alignItems: "center",
		justifyContent: "center",
		borderWidth: 3,
		borderColor: colors.white,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.28,
		shadowRadius: 6,
		elevation: 7,
	},
	mapMarkerBubbleSelected: {
		width: 46,
		height: 46,
		borderRadius: 23,
		borderWidth: 4,
		shadowOpacity: 0.38,
		shadowRadius: 9,
		elevation: 12,
	},
	mapMarkerTail: {
		width: 0,
		height: 0,
		marginTop: -2,
		borderLeftWidth: 6,
		borderRightWidth: 6,
		borderTopWidth: 8,
		borderLeftColor: "transparent",
		borderRightColor: "transparent",
	},
	mapMarkerTailSelected: {
		borderLeftWidth: 7,
		borderRightWidth: 7,
		borderTopWidth: 10,
	},

	// Rich recommendation preview
	mapPreviewCard: {
		position: "absolute",
		left: spacing.md,
		right: spacing.md,
		backgroundColor: colors.card,
		borderRadius: 22,
		borderWidth: 1,
		borderColor: "rgba(255,255,255,0.9)",
		padding: 12,
		shadowColor: colors.shadow,
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.22,
		shadowRadius: 20,
		elevation: 12,
		zIndex: 1000,
	},
	mapPreviewRow: {
		flexDirection: "row-reverse",
		alignItems: "stretch",
		gap: 12,
	},
	mapPreviewImage: {
		width: 96,
		height: 132,
		borderRadius: 16,
		backgroundColor: colors.borderLight,
	},
	mapPreviewImagePlaceholder: {
		width: 96,
		height: 132,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
	},
	mapPreviewContent: {
		flex: 1,
		minWidth: 0,
	},
	mapPreviewHeaderRow: {
		minHeight: 32,
		flexDirection: "row-reverse",
		alignItems: "center",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	mapPreviewCategory: {
		minHeight: 28,
		maxWidth: "75%",
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 5,
		borderRadius: 14,
		paddingHorizontal: 9,
		paddingVertical: 4,
	},
	mapPreviewCategoryText: {
		fontSize: 12,
		fontWeight: "800",
		textAlign: "right",
		writingDirection: "rtl",
	},
	mapPreviewCloseButton: {
		width: 44,
		height: 44,
		marginTop: -7,
		marginLeft: -7,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
	},
	mapPreviewTitle: {
		...typography.h4,
		marginTop: 1,
		lineHeight: 21,
		flex: 1,
		textAlign: "right",
		writingDirection: "rtl",
		color: colors.textPrimary,
	},
	mapPreviewLocationRow: {
		marginTop: 3,
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 4,
	},
	mapPreviewLocationText: {
		...typography.caption,
		flex: 1,
		textAlign: "right",
		writingDirection: "rtl",
		color: colors.textSecondary,
	},
	mapPreviewMetaRow: {
		marginTop: 5,
		flexDirection: "row-reverse",
		alignItems: "center",
		flexWrap: "wrap",
		gap: 9,
	},
	mapPreviewMetaItem: {
		flexDirection: "row-reverse",
		alignItems: "center",
		gap: 3,
	},
	mapPreviewMetaText: {
		fontSize: 12,
		fontWeight: "700",
		color: colors.textSecondary,
	},
	mapPreviewPrimaryButton: {
		minHeight: 44,
		marginTop: 7,
		borderRadius: 13,
		flexDirection: "row-reverse",
		alignItems: "center",
		justifyContent: "center",
		gap: 5,
		paddingHorizontal: spacing.md,
	},
	mapPreviewPrimaryButtonText: {
		color: colors.white,
		fontSize: 14,
		fontWeight: "800",
	},
};
