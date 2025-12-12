import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * Component to display a visual route of places connected by arrows.
 *
 * @param {Object} props
 * @param {string[]} props.places - Array of place names.
 * @param {Object} props.style - Additional styles for the container.
 */
export default function PlacesRoute({ places, style }) {
	if (!places || places.length === 0) return null;

	// Ensure places is an array
	const placesArray = Array.isArray(places) ? places : [];

	return (
		<View style={[styles.container, style]}>
			{placesArray.map((place, index) => {
				const placeName =
					typeof place === "object" ? place.name : place;

				return (
					<View key={index} style={styles.routeItem}>
						<View style={styles.placeBox}>
							<Text style={styles.placeText} numberOfLines={1}>
								{placeName}
							</Text>
						</View>
						{index < placesArray.length - 1 && (
							<Ionicons
								name='arrow-forward'
								size={14}
								color='#64748B'
								style={styles.arrow}
							/>
						)}
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: "row",
		flexWrap: "wrap",
		alignItems: "center",
		marginVertical: 8,
	},
	routeItem: {
		flexDirection: "row",
		alignItems: "center",
		marginRight: 4,
	},
	placeBox: {
		backgroundColor: "#E0F2FE", // Light blue background
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#BAE6FD", // Border color
	},
	placeText: {
		fontSize: 13,
		color: "#4d4d4dff",
		fontWeight: "500",
		maxWidth: 100,
	},
	arrow: {
		marginHorizontal: 4,
	},
});
