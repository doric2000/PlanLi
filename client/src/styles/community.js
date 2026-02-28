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
		marginLeft: spacing.sm,
	},
	destinationSearchPill: {
		flex: 1,
		flexDirection: "row-reverse",
		alignItems: "center",
		backgroundColor: colors.card,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.border,
		borderRadius: 18,
		paddingHorizontal: spacing.md,
		height: 36,
		...shadows.small,
	},
	destinationSearchPillIcon: {
		marginLeft: spacing.sm,
	},
	destinationSearchInput: {
		flex: 1,
		color: colors.textPrimary,
		fontSize: 14,
		paddingVertical: 0,
		writingDirection: "rtl",
	},
	destinationClearBtn: {
		marginRight: spacing.sm,
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
	mapAttributionWrap: {
		position: "absolute",
		left: 8,
		bottom: 8,
		backgroundColor: "rgba(255,255,255,0.85)",
		borderRadius: 10,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.border,
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

	// Bottom mini window (sheet)
	mapSheet: {
		position: "absolute",
		left: spacing.lg,
		right: spacing.lg,
		bottom: spacing.lg,
		backgroundColor: colors.card,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.border,
		padding: spacing.md,
		...shadows.small,
		zIndex: 50,
	},
	mapSheetHeaderRow: {
		flexDirection: "row-reverse",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: spacing.sm,
	},
	mapSheetTitle: {
		...typography.h4,
		flex: 1,
		textAlign: "right",
		writingDirection: "rtl",
		color: colors.textPrimary,
	},
	mapSheetSubtitle: {
		...typography.caption,
		marginTop: 4,
		textAlign: "right",
		writingDirection: "rtl",
		color: colors.textSecondary,
	},
	mapSheetCloseButton: {
		width: 32,
		height: 32,
		borderRadius: 16,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: colors.background,
		borderWidth: 1,
		borderColor: colors.borderLight || colors.border,
	},
	mapSheetCloseButtonText: {
		color: colors.textPrimary,
		fontSize: 16,
		fontWeight: "700",
	},
	mapSheetPrimaryButton: {
		marginTop: spacing.md,
		backgroundColor: colors.primary,
		paddingVertical: 10,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	mapSheetPrimaryButtonText: {
		color: colors.white,
		fontSize: 14,
		fontWeight: "700",
	},
};
