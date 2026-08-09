export const fontFamilies = {
	regular: "Assistant_400Regular",
	medium: "Assistant_500Medium",
	semiBold: "Assistant_600SemiBold",
};

export const typography = {
	pageTitle: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 28,
		lineHeight: 34,
		color: "#111827",
	},
	sectionTitle: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 20,
		lineHeight: 26,
		color: "#111827",
	},
	cardTitle: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 18,
		lineHeight: 24,
		color: "#111827",
	},
	body: {
		fontFamily: fontFamilies.regular,
		fontSize: 15,
		lineHeight: 22,
		color: "#4B5563",
	},
	bodySmall: {
		fontFamily: fontFamilies.regular,
		fontSize: 14,
		lineHeight: 20,
		color: "#4B5563",
	},
	meta: {
		fontFamily: fontFamilies.regular,
		fontSize: 13,
		lineHeight: 18,
		color: "#6B7280",
	},
	label: {
		fontFamily: fontFamilies.medium,
		fontSize: 14,
		lineHeight: 20,
		color: "#111827",
	},
	button: {
		fontFamily: fontFamilies.medium,
		fontSize: 15,
		lineHeight: 20,
	},
	input: {
		fontFamily: fontFamilies.regular,
		fontSize: 16,
		lineHeight: 22,
		color: "#111827",
	},

	// Backwards-compatible semantic aliases used by existing screens.
	h1: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 28,
		color: "#111827",
	},
	h2: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 24,
		color: "#111827",
	},
	h3: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 20,
		color: "#111827",
	},
	h4: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 18,
		color: "#111827",
	},
	caption: {
		fontFamily: fontFamilies.regular,
		fontSize: 12,
		color: "#9CA3AF",
	},
	labelSmall: {
		fontFamily: fontFamilies.medium,
		fontSize: 12,
		color: "#4B5563",
	},
	link: {
		fontFamily: fontFamilies.medium,
		fontSize: 14,
		color: "#2EC4B6",
	},
	profileName: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 20,
		color: "#111827",
		marginBottom: 4,
	},
	profileEmail: {
		fontFamily: fontFamilies.regular,
		fontSize: 14,
		color: "#6B7280",
	},
	profileStatNumber: {
		fontFamily: fontFamilies.semiBold,
		fontSize: 20,
		color: "#111827",
	},
	profileStatLabel: {
		fontFamily: fontFamilies.medium,
		fontSize: 12,
		color: "#6B7280",
		marginTop: 4,
		textAlign: "center",
		writingDirection: "rtl",
	},
	profileMenuItemText: {
		fontFamily: fontFamilies.medium,
		fontSize: 16,
		marginRight: 16,
		color: "#111827",
		textAlign: "right",
		writingDirection: "rtl",
	},
	profileVersion: {
		fontFamily: fontFamilies.regular,
		textAlign: "center",
		marginTop: 20,
		color: "#9CA3AF",
		fontSize: 12,
	},
};
