import React from "react";
import {
	Modal,
	View,
	Text,
	Image,
	StyleSheet,
	TouchableOpacity,
	ScrollView,
	SafeAreaView,
} from "react-native";

export default function DayViewModal({ visible, onClose, dayData, dayIndex }) {
	if (!dayData) return null;

	return (
		<Modal
			visible={visible}
			animationType='slide'
			presentationStyle='pageSheet'
		>
			<SafeAreaView style={styles.container}>
				<View style={styles.header}>
					<TouchableOpacity onPress={onClose}>
						<Text style={styles.closeBtn}>✕</Text>
					</TouchableOpacity>
					<Text style={styles.headerTitle}>Day {dayIndex + 1}</Text>
					<View style={{ width: 30 }} />
				</View>

				<ScrollView style={styles.content}>
					{dayData.image && (
						<Image
							source={{ uri: dayData.image }}
							style={styles.image}
							resizeMode='cover'
						/>
					)}

					<View style={styles.descriptionContainer}>
						<Text style={styles.label}>Story of the Day</Text>
						<Text style={styles.description}>
							{dayData.description || "No description available."}
						</Text>
					</View>
				</ScrollView>
			</SafeAreaView>
		</Modal>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#fff",
	},
	header: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 16,
		borderBottomWidth: 1,
		borderBottomColor: "#E2E8F0",
	},
	closeBtn: {
		fontSize: 24,
		color: "#64748B",
		fontWeight: "300",
	},
	headerTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: "#0F172A",
	},
	content: {
		flex: 1,
	},
	image: {
		width: "100%",
		height: 300,
		backgroundColor: "#F1F5F9",
	},
	descriptionContainer: {
		padding: 20,
	},
	label: {
		fontSize: 14,
		fontWeight: "700",
		color: "#64748B",
		marginBottom: 8,
		textTransform: "uppercase",
		letterSpacing: 0.5,
	},
	description: {
		fontSize: 16,
		lineHeight: 24,
		color: "#334155",
	},
});
