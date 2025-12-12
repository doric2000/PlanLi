export const common = {
	// Screen container
	container: {
		flex: 1,
		backgroundColor: "#F9FAFB",
	},

	containerCentered: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		backgroundColor: "#F9FAFB",
	},

	// Header styles
	header: {
		backgroundColor: "#49bc8e",
		padding: 20,
		paddingBottom: 4,
		width: "100%",
	},

	headerTitle: {
		fontSize: 22,
		fontWeight: "bold",
		color: "#FFFFFF",
		textAlign: "center",
	},

	headerSubTitle: {
		fontSize: 16,
		fontWeight: "400",
		color: "#FFFFFF",
		textAlign: "center",
		marginBottom: 20,
	},

	// Gradient header container
	staticHeaderContainer: {
		zIndex: 100,
		position: "relative",
		backgroundColor: "#F9FAFB",
		marginBottom: 30,
	},

	gradientHeader: {
		paddingBottom: 45,
		borderBottomLeftRadius: 30,
		borderBottomRightRadius: 30,
		paddingHorizontal: 20,
		paddingTop: 8,
	},

	// Top bar navigation
	topBar: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 20,
	},

	topButton: {
		flexDirection: "row",
		alignItems: "center",
	},

	backText: {
		color: "#FFFFFF",
		fontSize: 16,
		marginLeft: 5,
		fontWeight: "600",
	},

	iconButton: {
		backgroundColor: "rgba(255,255,255,0.2)",
		padding: 8,
		borderRadius: 20,
	},

	// Hero section (detail screens)
	heroContainer: {
		height: 300,
		width: "100%",
	},

	heroImage: {
		width: "100%",
		height: "100%",
	},

	heroGradient: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		justifyContent: "space-between",
		padding: 16,
		paddingTop: 50,
	},

	noImageHeader: {
		paddingTop: 50,
		paddingHorizontal: 16,
		paddingBottom: 16,
		backgroundColor: "#F9FAFB",
	},

	detailContent: {
		padding: 20,
		backgroundColor: "#FFFFFF",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		marginTop: -24,
		minHeight: 400,
	},

	// Main content area
	mainContent: {
		paddingHorizontal: 20,
		paddingTop: 20,
	},

	scrollContent: {
		paddingBottom: 40,
	},

	// Row/Flex utilities
	row: {
		flexDirection: "row",
		alignItems: "center",
	},

	rowBetween: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},

	rowCenter: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
	},

	// Avatar styles
	avatar: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: "#E5E7EB",
	},

	avatarSmall: {
		width: 24,
		height: 24,
		borderRadius: 12,
		backgroundColor: "#E5E7EB",
	},

	avatarPlaceholder: {
		backgroundColor: "#E0E7FF",
		justifyContent: "center",
		alignItems: "center",
	},

	// Divider
	divider: {
		height: 1,
		backgroundColor: "#E5E7EB",
		marginVertical: 12,
	},

	// Loading
	loadingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},

	// Empty state
	emptyState: {
		alignItems: "center",
		padding: 20,
		marginTop: 12,
	},

	emptyText: {
		textAlign: "center",
		marginTop: 20,
		color: "#9CA3AF",
		fontSize: 16,
	},

	emptySubText: {
		color: "#2EC4B6",
		fontWeight: "bold",
		marginTop: 4,
	},

	// Feed section
	feedSection: {
		marginTop: 32,
		marginBottom: 20,
	},

	feedTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#111827",
		textAlign: "right",
		marginBottom: 4,
	},

	feedSubtitle: {
		fontSize: 14,
		color: "#4B5563",
		textAlign: "right",
		marginBottom: 16,
	},

	// Modal styles
	modalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0,0,0,0.5)",
		justifyContent: "flex-end",
	},

	modalContent: {
		backgroundColor: "#FFFFFF",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 24,
	},

	modalContentTall: {
		backgroundColor: "#FFFFFF",
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		height: "75%",
		padding: 20,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -2 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
		elevation: 5,
	},

	modalHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#F3F4F6",
		paddingBottom: 8,
	},

	modalTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: "#111827",
	},

	modalLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: "#111827",
		marginBottom: 6,
		textAlign: "right",
	},

	modalInput: {
		borderWidth: 1,
		borderColor: "#E5E7EB",
		borderRadius: 10,
		paddingHorizontal: 10,
		paddingVertical: 8,
		backgroundColor: "#F9FAFB",
		fontSize: 14,
	},

	modalActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginTop: 20,
	},

	// Screen header (community style)
	screenHeader: {
		padding: 20,
		backgroundColor: "#FFFFFF",
		borderBottomWidth: 1,
		borderBottomColor: "#F3F4F6",
		alignItems: "center",
		position: "relative",
	},

	screenHeaderTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#1E3A5F",
	},

	screenHeaderSubtitle: {
		fontSize: 14,
		fontWeight: "500",
		color: "#4B5563",
		marginTop: 4,
	},

	// List styles
	listContent: {
		padding: 16,
		paddingBottom: 80,
	},

	// Handle bar for bottom sheets
	handleBar: {
		width: 40,
		height: 4,
		backgroundColor: "#D1D5DB",
		borderRadius: 2,
		alignSelf: "center",
		marginTop: 12,
	},

	// Center utility
	center: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},

	// Loading container
	loadingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
	},

	loadingText: {
		marginTop: 12,
		color: "#6B7280",
		fontSize: 14,
	},

	// Empty state
	emptyContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		paddingVertical: 40,
	},

	emptyListContainer: {
		flex: 1,
	},

	emptyText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#6B7280",
		marginTop: 16,
	},

	emptySubtext: {
		fontSize: 14,
		color: "#9CA3AF",
		marginTop: 4,
	},

	// Comment section styles
	commentSection: {
		marginTop: 20,
		backgroundColor: "#fff",
		padding: 15,
		borderRadius: 12,
	},

	commentHeaderContainer: {
		flexDirection: "row-reverse",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 15,
	},

	commentHeaderTitle: {
		fontSize: 18,
		fontWeight: "bold",
		color: "#333",
	},

	commentSortText: {
		fontSize: 14,
		color: "#2EC4B6",
		fontWeight: "600",
	},

	commentList: {
		maxHeight: 300,
	},

	commentItem: {
		flexDirection: "row-reverse",
		marginBottom: 15,
	},

	commentAvatar: {
		width: 40,
		height: 40,
		borderRadius: 20,
		marginLeft: 10,
		backgroundColor: "#eee",
	},

	commentContent: {
		flex: 1,
		backgroundColor: "#f5f7fa",
		borderRadius: 12,
		padding: 10,
		borderTopRightRadius: 2,
	},

	commentUserName: {
		fontWeight: "bold",
		fontSize: 13,
		color: "#333",
		textAlign: "right",
	},

	commentText: {
		fontSize: 14,
		color: "#444",
		textAlign: "right",
		marginTop: 2,
	},

	// Comment input styles
	commentInputContainer: {
		flexDirection: "row-reverse",
		alignItems: "center",
		marginTop: 10,
		borderTopWidth: 1,
		borderTopColor: "#eee",
		paddingTop: 15,
	},

	commentInputAvatar: {
		width: 32,
		height: 32,
		borderRadius: 16,
		marginLeft: 10,
	},

	commentInput: {
		flex: 1,
		backgroundColor: "#f0f2f5",
		borderRadius: 20,
		paddingHorizontal: 15,
		paddingVertical: 8,
		fontSize: 14,
		textAlign: "right",
		maxHeight: 80,
		marginLeft: 10,
	},

	commentSendButton: {
		backgroundColor: "#2EC4B6",
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: "center",
		alignItems: "center",
	},

	commentSendDisabled: {
		backgroundColor: "#ccc",
	},

	// Inline action bar (detail screens)
	actionBar: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		paddingVertical: 16,
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: "#E5E7EB",
		backgroundColor: "#FFFFFF",
	},

	actionBarItem: {
		flexDirection: "column",
		alignItems: "center",
		gap: 4,
	},

	actionBarText: {
		fontSize: 12,
		color: "#6B7280",
	},

	// Fixed bottom input bar
	bottomInputBar: {
		position: "absolute",
		bottom: 0,
		left: 0,
		right: 0,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#FFFFFF",
		paddingHorizontal: 16,
		paddingVertical: 12,
		paddingBottom: 28,
		borderTopWidth: 1,
		borderTopColor: "#E5E7EB",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: -2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 5,
	},

	bottomInputContainer: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#F3F4F6",
		borderRadius: 24,
		paddingHorizontal: 16,
		paddingVertical: 8,
		marginLeft: 12,
	},

	bottomInput: {
		flex: 1,
		fontSize: 14,
		color: "#111827",
		maxHeight: 60,
	},

	// Rating display
	ratingContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 4,
	},

	ratingStar: {
		color: "#FBBF24",
	},

	ratingText: {
		fontSize: 14,
		fontWeight: "600",
		color: "#374151",
	},

	// Likes modal styles
	likesModalContainer: {
		backgroundColor: "#fff",
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		maxHeight: "70%",
		minHeight: "40%",
	},

	likesHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		paddingVertical: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#F3F4F6",
		position: "relative",
	},

	likesTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: "#1F2937",
	},

	likesCloseButton: {
		position: "absolute",
		right: 16,
		padding: 4,
	},

	likesContent: {
		flex: 1,
		padding: 16,
	},

	// User item for likes list
	userItem: {
		flexDirection: "row",
		alignItems: "center",
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: "#F9FAFB",
	},

	userAvatar: {
		width: 44,
		height: 44,
		borderRadius: 22,
		marginRight: 12,
	},

	avatarPlaceholder: {
		backgroundColor: "#E0E7FF",
		justifyContent: "center",
		alignItems: "center",
	},

	avatarInitial: {
		color: "#4F46E5",
		fontWeight: "bold",
		fontSize: 16,
	},

	userNameText: {
		flex: 1,
		fontSize: 15,
		fontWeight: "600",
		color: "#1F2937",
	},

	// Overlay touchable
	overlayTouchable: {
		flex: 1,
	},

	// Avatar component styles
	avatar: {
		backgroundColor: "#E2E8F0",
		marginRight: 10,
	},

	avatarWithPlaceholder: {
		backgroundColor: "#E0E7FF",
		justifyContent: "center",
		alignItems: "center",
		marginRight: 10,
	},

	// Timeline item styles
	timelineItem: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginBottom: 20,
		position: "relative",
	},

	timelineConnector: {
		position: "absolute",
		left: 15,
		top: 40,
		zIndex: -1,
	},

	timelinePin: {
		alignItems: "center",
		marginRight: 16,
		position: "relative",
	},

	timelineDayNumber: {
		position: "absolute",
		top: 6,
		fontSize: 12,
		fontWeight: "700",
		color: "#FFFFFF",
		backgroundColor: "#3B82F6",
		borderRadius: 10,
		width: 20,
		height: 20,
		textAlign: "center",
		lineHeight: 20,
	},

	timelinePreview: {
		flex: 1,
		backgroundColor: "#F9FAFB",
		padding: 12,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E5E7EB",
	},

	// HomeScreen specific
	homeHeader: {
		backgroundColor: "#1E3A5F",
		padding: 20,
		paddingBottom: 30,
		borderBottomLeftRadius: 20,
		borderBottomRightRadius: 20,
	},

	homeHeaderTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#FFFFFF",
		textAlign: "center",
		marginBottom: 16,
	},

	homeSearchBar: {
		backgroundColor: "#FFFFFF",
		borderRadius: 25,
		flexDirection: "row",
		alignItems: "center",
		paddingHorizontal: 16,
		height: 50,
	},

	homeSearchIcon: {
		marginRight: 8,
	},

	homeSearchInput: {
		flex: 1,
		height: "100%",
		fontSize: 16,
	},

	homeSection: {
		marginTop: 16,
		paddingHorizontal: 20,
	},

	homeSectionHeaderRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},

	homeSectionTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: "#111827",
		marginBottom: 12,
	},

	homeSeeAllText: {
		color: "#2EC4B6",
		fontWeight: "600",
	},

	homeHorizontalScroll: {
		flexDirection: "row",
	},

	homeGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		justifyContent: "space-between",
	},

	// Menu button (ActionMenu)
	menuButton: {
		padding: 4,
	},

	// ===== Profile Screen Layout Styles =====
	profileScrollContent: {
		paddingBottom: 40,
	},

	profileHeader: {
		alignItems: "center",
		paddingVertical: 32,
		backgroundColor: "#FFFFFF",
		borderBottomLeftRadius: 30,
		borderBottomRightRadius: 30,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
	},

	profileAvatarContainer: {
		position: "relative",
		marginBottom: 16,
	},

	profileAvatar: {
		width: 100,
		height: 100,
		borderRadius: 50,
	},

	profileAvatarPlaceholder: {
		backgroundColor: "#E0E7FF",
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 2,
		borderColor: "#FFFFFF",
	},

	profileAvatarText: {
		fontSize: 36,
		fontWeight: "bold",
		color: "#4F46E5",
	},
};
