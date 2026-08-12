import React from "react";
import { View } from "react-native";
import AppText from "../../../components/AppText";
import { Ionicons } from "@expo/vector-icons";
import CachedImage from "../../../components/CachedImage";
import { getDestinationImageUrl } from "../../../utils/destinationImages";
import { placesRouteStyles as styles } from '../../../styles';


/**
 * Component to display a visual route of places connected by arrows.
 *
 * @param {Object} props
 * @param {string[]} props.places - Array of place names.
 * @param {Object} props.style - Additional styles for the container.
 */
export default function PlacesRoute({ places, style, compact = false, maximum = 4 }) {
	if (!places || places.length === 0) return null;

	const placesArray = (Array.isArray(places) ? places : []).slice(0, maximum);
	const hiddenCount = Math.max(0, places.length - placesArray.length);

	return (
		<View style={[styles.container, compact && styles.containerCompact, style]}>
			{placesArray.map((place, index) => {
				const value = typeof place === "object" ? place : { name: place };
				const placeName = value.name;
				const imageUrl = value.imageUrl || getDestinationImageUrl(value, "thumb");

				return (
					<View key={value.cityId || `${placeName}:${index}`} style={styles.routeItem}>
						<View style={[styles.placeBox, compact && styles.placeBoxCompact]}>
							{imageUrl ? (
								<CachedImage source={{ uri: imageUrl }} style={styles.placeImage} contentFit="cover" priority="low" />
							) : (
								<View style={styles.placeImageFallback}>
									<Ionicons name="location" size={compact ? 14 : 16} color="#FFFFFF" />
								</View>
							)}
							<AppText style={[styles.placeText, compact && styles.placeTextCompact]} numberOfLines={1}>
								{placeName}
							</AppText>
						</View>
						{index < placesArray.length - 1 && (
							<View style={styles.connector} />
						)}
					</View>
				);
			})}
			{hiddenCount > 0 ? (
				<View style={styles.moreBadge}>
					<AppText style={styles.moreText}>+{hiddenCount}</AppText>
				</View>
			) : null}
		</View>
	);
}
