import React, { useMemo, useState } from "react";
import { Image, Linking, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, Polyline, UrlTile } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
	buildGoogleMapsDirectionsUrl,
	buildGoogleMapsPlaceUrl,
	flattenValidRouteStops,
} from "../utils/routeStops";
import { colors, routeMapStyles as styles } from "../../../styles";

const getInitialRegion = (stops) => {
	if (!stops.length) {
		return {
			latitude: 31.0461,
			longitude: 34.8516,
			latitudeDelta: 6,
			longitudeDelta: 6,
		};
	}

	let minLat = stops[0].coordinates.lat;
	let maxLat = stops[0].coordinates.lat;
	let minLng = stops[0].coordinates.lng;
	let maxLng = stops[0].coordinates.lng;

	stops.forEach((stop) => {
		minLat = Math.min(minLat, stop.coordinates.lat);
		maxLat = Math.max(maxLat, stop.coordinates.lat);
		minLng = Math.min(minLng, stop.coordinates.lng);
		maxLng = Math.max(maxLng, stop.coordinates.lng);
	});

	return {
		latitude: (minLat + maxLat) / 2,
		longitude: (minLng + maxLng) / 2,
		latitudeDelta: Math.max(0.04, (maxLat - minLat) * 1.5),
		longitudeDelta: Math.max(0.04, (maxLng - minLng) * 1.5),
	};
};

export default function RouteMapScreen({ route, navigation }) {
	const { routeData } = route.params || {};
	const stops = useMemo(() => flattenValidRouteStops(routeData), [routeData]);
	const [selectedStop, setSelectedStop] = useState(null);
	const coordinates = useMemo(
		() => stops.map((stop) => ({ latitude: stop.coordinates.lat, longitude: stop.coordinates.lng })),
		[stops]
	);
	const initialRegion = useMemo(() => getInitialRegion(stops), [stops]);
	const routeUrl = buildGoogleMapsDirectionsUrl(stops);

	const openUrl = (url) => {
		if (!url) return;
		Linking.openURL(url).catch(() => {});
	};

	return (
		<SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
			<View style={styles.header}>
				<TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
					<Ionicons name="close" size={22} color={colors.textPrimary} />
				</TouchableOpacity>
				<View style={styles.headerTextWrap}>
					<Text style={styles.headerTitle} numberOfLines={1}>
						{routeData?.Title || "מפת מסלול"}
					</Text>
					<Text style={styles.headerSubtitle}>{stops.length} תחנות עם מיקום</Text>
				</View>
				<TouchableOpacity
					onPress={() => openUrl(routeUrl)}
					disabled={stops.length < 2}
					style={[styles.headerActionButton, stops.length < 2 && styles.headerActionButtonDisabled]}
				>
					<Text style={[styles.headerActionText, stops.length < 2 && styles.headerActionTextDisabled]}>
						פתח הכל
					</Text>
				</TouchableOpacity>
			</View>

			{stops.length === 0 ? (
				<View style={styles.emptyState}>
					<Ionicons name="map-outline" size={54} color={colors.textMuted} />
					<Text style={styles.emptyTitle}>אין תחנות להצגה במפה</Text>
					<Text style={styles.emptyText}>הוסף תחנות עם מיקום מדויק בתוך ימי המסלול.</Text>
				</View>
			) : (
				<MapView
					style={styles.map}
					initialRegion={initialRegion}
					mapType="none"
				>
					<UrlTile
						urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
						tileSize={256}
						maximumZ={19}
						zIndex={0}
					/>

					{coordinates.length > 1 && (
						<Polyline coordinates={coordinates} strokeColor={colors.primary} strokeWidth={4} />
					)}

					{stops.map((stop) => (
						<Marker
							key={stop.id || `${stop.dayIndex}:${stop.stopIndex}`}
							coordinate={{
								latitude: stop.coordinates.lat,
								longitude: stop.coordinates.lng,
							}}
							onPress={() => setSelectedStop(stop)}
						>
							<View style={styles.markerWrap}>
								<View style={styles.marker}>
									{stop.image ? (
										<>
											<Image source={{ uri: stop.image }} style={styles.markerImage} />
											<View style={styles.markerNumberBadge}>
												<Text style={styles.markerNumberText}>{stop.globalIndex + 1}</Text>
											</View>
										</>
									) : (
										<Text style={styles.markerText}>{stop.globalIndex + 1}</Text>
									)}
								</View>
							</View>
						</Marker>
					))}
				</MapView>
			)}

			{!!selectedStop && (
				<View style={styles.sheet}>
					<View style={styles.sheetHeader}>
						<TouchableOpacity onPress={() => setSelectedStop(null)} style={styles.sheetCloseButton}>
							<Ionicons name="close" size={18} color={colors.textPrimary} />
						</TouchableOpacity>
						<View style={styles.sheetTitleWrap}>
							<Text style={styles.sheetKicker}>יום {selectedStop.dayIndex + 1} · תחנה {selectedStop.stopIndex + 1}</Text>
							<Text style={styles.sheetTitle} numberOfLines={2}>
								{selectedStop.title}
							</Text>
						</View>
						{selectedStop.image ? (
							<Image source={{ uri: selectedStop.image }} style={styles.sheetImage} />
						) : (
							<View style={styles.sheetImageFallback}>
								<Text style={styles.sheetImageFallbackText}>{selectedStop.globalIndex + 1}</Text>
							</View>
						)}
					</View>

					<Text style={styles.sheetAddress} numberOfLines={2}>
						{selectedStop.place?.address || selectedStop.location || selectedStop.place?.name}
					</Text>
					{!!selectedStop.description && (
						<Text style={styles.sheetDescription} numberOfLines={3}>
							{selectedStop.description}
						</Text>
					)}

					<TouchableOpacity
						style={styles.primaryButton}
						onPress={() => openUrl(buildGoogleMapsPlaceUrl(selectedStop))}
					>
						<Ionicons name="map-outline" size={18} color={colors.white} />
						<Text style={styles.primaryButtonText}>פתח בגוגל מפות</Text>
					</TouchableOpacity>
				</View>
			)}
		</SafeAreaView>
	);
}
