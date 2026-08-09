import { fontFamilies } from "./typography";
export const tags = {
	// Container styles
	wrapper: {
		marginTop: 8,
	},

	container: {
		flexDirection: "row-reverse",
	},

	// Tag item
	item: {
		paddingVertical: 4,
		paddingHorizontal: 12,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: "#E5E7EB",
		backgroundColor: "#F9FAFB",
		marginLeft: 8,
		marginRight: 0,
	},

	itemSelected: {
		backgroundColor: "#E0F2FE",
		borderColor: "#0284C7",
	},

	// Tag text
	text: {
		fontSize: 11,
		color: "#6B7280",
		fontFamily: fontFamilies.medium,
		textAlign: "right",
		writingDirection: "rtl",
	},

	textSelected: {
		color: "#0284C7",
		fontFamily: fontFamilies.medium,
		textAlign: "right",
		writingDirection: "rtl",
	},

	// More button
	moreButton: {
		paddingVertical: 4,
		paddingHorizontal: 12,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: "#0284C7",
		backgroundColor: "#E0F2FE",
		justifyContent: "center",
		alignItems: "center",
	},

	moreText: {
		fontSize: 11,
		color: "#0284C7",
		fontFamily: fontFamilies.medium,
	},

	// Selection Chips (Larger)
	chip: {
		paddingVertical: 8,
		paddingHorizontal: 14,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#E5E7EB",
		backgroundColor: "#FFFFFF",
		marginLeft: 8,
		marginRight: 0,
	},

	chipSelected: {
		backgroundColor: "#E0F2FE",
		borderColor: "#0284C7",
	},

	chipText: {
		color: "#111827",
		fontSize: 14,
		fontFamily: fontFamilies.medium,
	},

	chipTextSelected: {
		color: "#0284C7",
		fontFamily: fontFamilies.medium,
	},

	sectionLabel: {
		fontSize: 14,
		fontFamily: fontFamilies.medium,
		color: "#111827",
		marginBottom: 8,
	},

	// Budget chips
	budgetChip: {
		paddingHorizontal: 14,
		paddingVertical: 6,
		borderRadius: 16,
		backgroundColor: "#F3F4F6",
		marginLeft: 8,
		marginBottom: 8,
	},

	budgetChipSelected: {
		backgroundColor: "#2EC4B6",
	},

	budgetChipText: {
		fontSize: 13,
		color: "#111827",
		fontFamily: fontFamilies.medium,
	},

	budgetChipTextSelected: {
		color: "#FFFFFF",
	},

	// Filter chips (variant)
	filterChip: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
		backgroundColor: "#F3F4F6",
		marginLeft: 8,
		marginBottom: 8,
	},

	filterChipSelected: {
		backgroundColor: "#E0F2FE",
		//borderWidth: 1, -> make it unstable while selected
		borderColor: "#2EC4B6",
	},

	filterChipText: {
		fontSize: 13,
		color: "#4B5563",
		fontFamily: fontFamilies.medium,
	},

	filterChipTextSelected: {
		color: "#2EC4B6",
		fontFamily: fontFamilies.medium,
		fontSize: 13,
	},

	// Chip row container
	chipRow: {
		flexDirection: "row-reverse",
		flexWrap: "wrap",
		justifyContent: "flex-start",
	},
};
