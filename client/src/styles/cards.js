import { Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

export const FAVORITE_CARD_WIDTH = 400;

export const cards = {
	// Base card style
	base: {
		backgroundColor: "#FFFFFF",
		borderRadius: 16,
		padding: 16,
		marginBottom: 16,
		shadowColor: "#000000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 5,
	},

	// Route card specific
	route: {
		backgroundColor: "#FFFFFF",
		borderRadius: 20,
		padding: 16,
		marginBottom: 16,
		shadowColor: "#000000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 5,
	},

	// Recommendation card
	recommendation: {
		backgroundColor: "#FFFFFF",
		borderRadius: 16,
		marginBottom: 20,
		shadowColor: "#000000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 3,
		borderWidth: 1,
		borderColor: "#F3F4F6",
		overflow: "hidden",
	},

	// Recommendation image carousel (used by RecommendationCard)
	recCarouselContainer: {
		width: '100%',
		aspectRatio: 1,
		backgroundColor: '#000000',
	},
	recCarouselImage: {
		height: '100%',
	},
	recDotsContainer: {
		position: 'absolute',
		bottom: 10,
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		gap: 6,
	},
	recDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		backgroundColor: 'rgba(255,255,255,0.5)',
	},
	recDotActive: {
		backgroundColor: 'rgba(255,255,255,0.95)',
	},

	// Web-only carousel navigation overlay (click/tap sides)
	recNavOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: 'row',
	},
	recNavOverlayRow: {
		flex: 1,
		flexDirection: 'row',
	},
	recNavZoneLeft: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'flex-start',
		paddingLeft: 8,
	},
	recNavZoneRight: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'flex-end',
		paddingRight: 8,
	},
	recNavButton: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: 'rgba(0,0,0,0.65)',
		justifyContent: 'center',
		alignItems: 'center',
		boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
		borderWidth: 2,
		borderColor: '#fff',
		opacity: 1,
	},

	// Info card (widget style)
	info: {
		width: (width - 50) / 2,
		padding: 15,
		borderRadius: 16,
		marginBottom: 15,
		height: 110,
		justifyContent: "space-between",
	},

	infoHeader: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
	},

	infoContent: {
		alignItems: "flex-end",
	},

	infoGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
	},

	// Section container (e.g., Essential Info)
	sectionContainer: {
		backgroundColor: "#E0F2FE",
		borderRadius: 16,
		padding: 16,
		marginTop: 12,
		borderWidth: 1,
		borderColor: "#B2EBF2",
	},

	sectionHeader: {
		flexDirection: "row-reverse",
		alignItems: "center",
		marginBottom: 15,
		justifyContent: "space-between",
	},

	sectionTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#111827",
		marginRight: 12,
	},

	// Info row (hotel, driver, currency)
	infoRow: {
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		padding: 12,
		flexDirection: "row-reverse",
		alignItems: "center",
		marginBottom: 10,
	},

	iconBox: {
		width: 40,
		height: 40,
		backgroundColor: "#FEF3C7",
		borderRadius: 8,
		justifyContent: "center",
		alignItems: "center",
		marginLeft: 12,
	},

	infoTextContainer: {
		flex: 1,
		alignItems: "flex-end",
	},

	infoTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: "#111827",
		marginBottom: 2,
	},

	infoSubtitle: {
		fontSize: 12,
		fontWeight: "500",
		color: "#6B7280",
		textAlign: "right",
	},

	// Card header
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},

	// Card title
	title: {
		fontSize: 20,
		fontWeight: "700",
		color: "#111827",
		marginBottom: 4,
	},

	// Card description
	description: {
		fontSize: 15,
		color: "#4B5563",
		marginVertical: 12,
		lineHeight: 22,
	},

	// Card meta row (days, distance)
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 16,
		marginBottom: 12,
	},

	metaItem: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},

	metaText: {
		fontSize: 14,
		color: "#9CA3AF",
		fontWeight: "500",
	},

	// User container
	userContainer: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
		gap: 8,
	},

	userText: {
		fontSize: 14,
		color: "#4B5563",
	},

	// Recommendation card detailed styles
	recHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		padding: 12,
	},

	recAuthorInfo: {
		flexDirection: "row",
		alignItems: "center",
	},

	recUsername: {
		fontSize: 14,
		fontWeight: "700",
		color: "#1F2937",
	},

	recDate: {
		fontSize: 11,
		color: "#9CA3AF",
		marginTop: 2,
	},

	recImage: {
		width: "100%",
		aspectRatio: 1,
		backgroundColor: "#000000",
	},

	recContent: {
		padding: 12,
	},

	recTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 6,
	},

	recTitle: {
		fontSize: 16,
		fontWeight: "700",
		color: "#111827",
		flex: 1,
		marginRight: 8,
		textAlign: "left",
	},

	recCategoryChip: {
		backgroundColor: "#EFF6FF",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},

	recCategoryText: {
		color: "#2563EB",
		fontSize: 10,
		fontWeight: "600",
	},

	recLocationRow: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 8,
	},

	recLocationText: {
		fontSize: 13,
		color: "#2EC4B6",
		marginLeft: 4,
		fontWeight: "500",
	},

	recDescription: {
		fontSize: 14,
		color: "#4B5563",
		lineHeight: 20,
		textAlign: "left",
	},

	recFooter: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderTopWidth: 1,
		borderTopColor: "#F9FAFB",
	},

	recActionGroup: {
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},

	recActionButton: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
	},

	recActionText: {
		fontSize: 14,
		color: "#4B5563",
		fontWeight: "500",
	},

	recLikeCount: {
		fontSize: 14,
		color: "#4B5563",
		fontWeight: "500",
	},

	recLikeCountClickable: {
		color: "#1F2937",
		fontWeight: "600",
	},

	// Popular destination cards (HomeScreen)
	popular: {
		width: "48%",
		backgroundColor: "#FFFFFF",
		borderRadius: 12,
		marginBottom: 15,
		overflow: "hidden",
		shadowColor: "#000000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.08,
		shadowRadius: 4,
		elevation: 3,
	},

	popularImageContainer: {
		width: "100%",
		height: 120,
		position: "relative",
	},

	popularImage: {
		width: "100%",
		height: "100%",
		borderTopLeftRadius: 12,
		borderTopRightRadius: 12,
	},

	popularImagePlaceholder: {
		height: 100,
		justifyContent: "flex-end",
		alignItems: "flex-end",
		padding: 8,
	},

	popularRatingBadge: {
		position: "absolute",
		top: 10,
		right: 10,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "rgba(255,255,255,0.9)",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
	},

	popularRatingText: {
		fontSize: 10,
		fontWeight: "bold",
		marginLeft: 3,
	},

	popularInfo: {
		padding: 12,
	},

	popularCity: {
		fontSize: 16,
		fontWeight: "bold",
		color: "#111827",
	},

	popularCountry: {
		fontSize: 12,
		color: "#9CA3AF",
	},

	popularTravelerRow: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 5,
	},

	popularTravelerText: {
		fontSize: 10,
		color: "#6B7280",
		marginLeft: 3,
	},

	// Trending item chip
	trending: {
		backgroundColor: "#2EC4B6",
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 20,
		marginRight: 8,
	},

	trendingText: {
		color: "#FFFFFF",
		fontWeight: "bold",
	},

	// ===== Profile Cards =====
	profileStats: {
		flexDirection: "row",
		backgroundColor: "#FFFFFF",
		marginHorizontal: 16,
		paddingVertical: 20,
		borderRadius: 15,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
		justifyContent: "space-between",
		marginVertical: 20,
	},

	profileStatItem: {
		flex: 1,
		alignItems: "center",
	},

	profileStatDivider: {
		width: 1,
		height: "60%",
		backgroundColor: "#E5E7EB",
		alignSelf: "center",
	},

	profileMenu: {
		backgroundColor: "#FFFFFF",
		borderRadius: 15,
		marginHorizontal: 16,
		paddingVertical: 8,
	},

	profileMenuItem: {
		flexDirection: "row-reverse",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 16,
		paddingHorizontal: 20,
		borderBottomWidth: 1,
		borderBottomColor: "#F3F4F6",
	},

	profileMenuItemLeft: {
		flexDirection: "row-reverse",
		alignItems: "center",
	},
};

