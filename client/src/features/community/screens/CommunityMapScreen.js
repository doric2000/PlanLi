import React, { useEffect, useMemo, useRef, useState } from "react";

import { Platform, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, UrlTile } from "react-native-maps";

import ScreenHeader from "../../../components/ScreenHeader";
import { colors, common, community } from "../../../styles";
import { useRecommendationById } from "../../../hooks/useRecommendationById";
import { useUserLocation } from "../../../hooks/useUserLocation";

export default function CommunityMapScreen({ navigation, route }) {
	const pins = Array.isArray(route?.params?.pins) ? route.params.pins : [];
	const mapRef = useRef(null);
	const [mapReady, setMapReady] = useState(false);
	const [selectedPostId, setSelectedPostId] = useState(null);
	const { location: userLocation, requestLocation } = useUserLocation();

	const { data: selectedRec } = useRecommendationById(selectedPostId);

	const coordinates = useMemo(
		() =>
			pins
				.map((p) => p?.coordinates)
				.filter(
					(c) =>
						c &&
						typeof c.lat === "number" &&
						typeof c.lng === "number" &&
						Number.isFinite(c.lat) &&
						Number.isFinite(c.lng)
				)
				.map((c) => ({ latitude: c.lat, longitude: c.lng })),
			[pins]
	);

	useEffect(() => {
		if (!mapReady) return;
		if (!coordinates.length) return;
		if (userLocation) return;
		try {
			mapRef.current?.fitToCoordinates?.(coordinates, {
				edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
				animated: true,
			});
		} catch {
			// ignore
		}
	}, [coordinates, mapReady, userLocation]);

	useEffect(() => {
		// Request user location on mount (centers map to user for a city-wide view).
		requestLocation?.();
	}, [requestLocation]);

	useEffect(() => {
		if (!mapReady) return;
		if (!userLocation) return;
		try {
			mapRef.current?.animateToRegion?.(
				{
					latitude: userLocation.lat,
					longitude: userLocation.lng,
					...community.cityWideMapDelta,
				},
				600
			);
		} catch {
			// ignore
		}
	}, [mapReady, userLocation]);

	// NOTE: Web uses CommunityMapScreen.web.js
	if (Platform.OS === "web") return null;

	return (
		<View style={community.mapScreen}>
			<ScreenHeader
				title="מפת המלצות"
				subtitle={pins.length ? `${pins.length} המלצות` : "אין המלצות עם מיקום"}
				compact
				renderLeft={() => (
					<TouchableOpacity
						style={community.headerIconButton}
						onPress={() => navigation.goBack()}
					>
						<Text style={community.headerIconButtonText}>חזרה</Text>
					</TouchableOpacity>
				)}
			/>

			{pins.length === 0 ? (
				<View style={common.emptyState}>
					<Text style={common.emptyText}>אין כרגע המלצות עם קואורדינטות במסננים.</Text>
				</View>
			) : (
				<View style={community.mapContainer}>
					<MapView
					ref={mapRef}
					style={community.mapView}
					onMapReady={() => setMapReady(true)}
					initialRegion={
						userLocation
							? {
								latitude: userLocation.lat,
								longitude: userLocation.lng,
								...community.cityWideMapDelta,
							}
							: community.defaultMapRegion
					}
					mapType={Platform.OS === "android" ? "none" : "standard"}
				>
					<UrlTile
						urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
						tileSize={256}
						maximumZ={19}
						zIndex={0}
					/>
					{pins.map((pin) => (
						<Marker
							key={pin.id}
							coordinate={{ latitude: pin.coordinates.lat, longitude: pin.coordinates.lng }}
							onPress={() => setSelectedPostId(pin.id)}
						>
						</Marker>
					))}
					</MapView>

					<View style={community.mapAttributionWrap} pointerEvents="none">
						<Text style={community.mapAttributionText}>
							© OpenStreetMap contributors
						</Text>
					</View>
				</View>
			)}

			{!!selectedPostId && (
				<View style={community.mapSheet}>
					<View style={community.mapSheetHeaderRow}>
						<Text style={community.mapSheetTitle} numberOfLines={2}>
							{selectedRec?.title || "המלצה"}
						</Text>
						<TouchableOpacity
							style={community.mapSheetCloseButton}
							onPress={() => setSelectedPostId(null)}
							accessibilityRole="button"
							accessibilityLabel="סגור"
						>
							<Text style={community.mapSheetCloseButtonText}>✕</Text>
						</TouchableOpacity>
					</View>

					{!!(selectedRec?.location || selectedRec?.country) && (
						<Text style={community.mapSheetSubtitle} numberOfLines={1}>
							{selectedRec?.location}
							{selectedRec?.country ? `, ${selectedRec.country}` : ""}
						</Text>
					)}

					<TouchableOpacity
						style={community.mapSheetPrimaryButton}
						onPress={() =>
							navigation.navigate("RecommendationDetail", { postId: selectedPostId })
						}
						accessibilityRole="button"
						accessibilityLabel="פתח המלצה"
					>
						<Text style={community.mapSheetPrimaryButtonText}>פתח המלצה</Text>
					</TouchableOpacity>
				</View>
			)}
		</View>
	);
}
