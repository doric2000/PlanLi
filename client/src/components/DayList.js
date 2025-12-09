import { View, Text, TouchableOpacity, StyleSheet, Image } from "react-native";

export default function DayList({ days, onEdit, onAdd, onDelete }) {
	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<Text style={styles.sectionTitle}>Itinerary</Text>
				<TouchableOpacity onPress={onAdd} style={styles.addBtn}>
					<Text style={styles.addBtnText}>+ Add Day</Text>
				</TouchableOpacity>
			</View>

			{days.map((day, index) => (
				<TouchableOpacity
					key={index}
					style={styles.dayCard}
					onPress={() => onEdit(index)}
				>
					<View style={styles.dayHeader}>
						<Text style={styles.dayTitle}>Day {index + 1}</Text>

						<View style={styles.actionsContainer}>
							{/* Delete Button */}
							<TouchableOpacity
								onPress={(e) => {
									e.stopPropagation(); // Prevent opening the edit modal
									onDelete(index);
								}}
								style={styles.deleteBtn}
							>
								<Text style={styles.deleteIcon}>Delete</Text>
							</TouchableOpacity>

							{/* Edit Hint */}
							<Text style={styles.editHint}>Edit ›</Text>
						</View>
					</View>

					<View style={styles.contentRow}>
						<View style={styles.textContainer}>
							<Text numberOfLines={2} style={styles.description}>
								{day.description ||
									"No description added yet..."}
							</Text>
						</View>
						{day.image && (
							<Image
								source={{ uri: day.image }}
								style={styles.thumbnail}
							/>
						)}
					</View>
				</TouchableOpacity>
			))}

			{days.length === 0 && (
				<Text style={styles.emptyText}>
					No days added yet. Start planning your trip!
				</Text>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { marginBottom: 20 },
	headerRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	sectionTitle: { fontSize: 16, fontWeight: "700", color: "#1f2937" },
	addBtn: {
		backgroundColor: "#E0F2FE",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 16,
	},
	addBtnText: { color: "#0284C7", fontWeight: "600", fontSize: 12 },
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
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	dayTitle: { fontWeight: "700", color: "#0F172A", fontSize: 16 },

	actionsContainer: {
		flexDirection: "row",
		alignItems: "center",
	},
	deleteBtn: {
		padding: 4,
		marginRight: 8,
		backgroundColor: "#FEF2F2",
		borderRadius: 4,
	},
	deleteIcon: {
		fontSize: 14,
		color: "#f57c7cff",
	},
	editHint: { color: "#94A3B8", fontSize: 14 },

	contentRow: { flexDirection: "row" },
	textContainer: { flex: 1, paddingRight: 10 },
	description: { color: "#64748B", fontSize: 14 },
	thumbnail: {
		width: 50,
		height: 50,
		borderRadius: 8,
		backgroundColor: "#F1F5F9",
	},
	emptyText: { color: "#94A3B8", fontStyle: "italic", fontSize: 13 },
});
