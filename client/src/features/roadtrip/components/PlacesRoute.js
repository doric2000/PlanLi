import React from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { placesRouteStyles as styles } from '../../../styles';


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
								name='arrow-back'
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
