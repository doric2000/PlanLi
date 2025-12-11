export const buttons = {
	primary: {
		backgroundColor: "#2EC4B6",
		paddingVertical: 12,
		paddingHorizontal: 20,
		borderRadius: 12,
		alignItems: "center",
		justifyContent: "center",
	},
	primaryText: {
		color: "#FFFFFF",
		fontSize: 16,
		fontWeight: "600",
	},

	secondary: {
		backgroundColor: "#FFFFFF",
		paddingVertical: 12,
		paddingHorizontal: 20,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#E5E7EB",
		alignItems: "center",
		justifyContent: "center",
	},
	secondaryText: {
		color: "#111827",
		fontSize: 16,
		fontWeight: "600",
	},

	submit: {
		backgroundColor: "#1E3A5F",
		padding: 16,
		borderRadius: 12,
		alignItems: "center",
		marginTop: 8,
		marginBottom: 20,
	},
	submitText: {
		color: "#FFFFFF",
		fontSize: 18,
		fontWeight: "bold",
	},

	fab: {
		position: 'absolute',
		bottom: 20,
		right: 20,
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: '#1E3A5F',
		justifyContent: 'center',
		alignItems: 'center',
		shadowColor: "#000000ff",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 4.65,
		elevation: 8,
	},

	// Floating plan button (for landing pages)
	floatingPlan: {
		position: 'absolute',
		bottom: -25,
		alignSelf: 'center',
		backgroundColor: '#FF9F1C',
		paddingVertical: 15,
		paddingHorizontal: 40,
		borderRadius: 12,
		alignItems: 'center',
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		elevation: 5,
	},
	floatingPlanText: {
		color: '#FFFFFF',
		fontSize: 16,
		fontWeight: 'bold',
	},

	disabled: {
		opacity: 0.6,
	},

	// Clear button (outline style)
	clear: {
		paddingVertical: 10,
		paddingHorizontal: 18,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: "#9CA3AF",
		backgroundColor: "#F9FAFB",
	},

	clearText: {
		fontSize: 14,
		color: "#111827",
		fontWeight: "500",
	},

	// Apply button
	apply: {
		paddingVertical: 10,
		paddingHorizontal: 18,
		borderRadius: 10,
		backgroundColor: "#1E3A5F",
	},

	applyText: {
		fontSize: 14,
		color: "#FFFFFF",
		fontWeight: "600",
	},

	// Filter button
	filterIcon: {
		position: "absolute",
		right: 20,
		top: 25,
		padding: 5,
	},

	// Send button (circular)
	send: {
		backgroundColor: "#2EC4B6",
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: "center",
		alignItems: "center",
	},

	sendDisabled: {
		backgroundColor: "#D1D5DB",
	},
};
