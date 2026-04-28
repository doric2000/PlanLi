import React from "react";
import { Modal, View, Text, Image, TouchableOpacity, ScrollView, SafeAreaView } from "react-native";
import { dayViewModalStyles as styles } from '../../../styles';


/**
 * Modal to view details of a specific day in a trip.
 * Displays the day's image and description.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Controls visibility of the modal.
 * @param {Function} props.onClose - Callback to close the modal.
 * @param {Object} props.dayData - Data object for the day (image, description).
 * @param {number} props.dayIndex - Index of the day.
 */
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
