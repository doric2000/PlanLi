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
};
