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
	emptyText: {
		textAlign: "center",
		marginTop: 20,
		color: "#9CA3AF",
		fontSize: 16,
	},
};
