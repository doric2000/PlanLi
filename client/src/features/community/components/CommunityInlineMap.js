import React, { useEffect, useMemo, useRef, useState } from "react";

import { Platform, Text, TouchableOpacity, View } from "react-native";
import MapView, { Marker, UrlTile } from "react-native-maps";

import { community } from "../../../styles";
import { useRecommendationById } from "../../../hooks/useRecommendationById";
import { useUserLocation } from "../../../hooks/useUserLocation";

const MAX_MARKERS_RENDER = 200;

export default function CommunityInlineMap({ pins, focusOnPins = false, onOpenPost }) {
	const safePins = Array.isArray(pins) ? pins : [];
	const validPins = useMemo(
		() =>
			safePins.filter((p) => {
				const c = p?.coordinates;
				return (
					c &&
					typeof c.lat === "number" &&
					typeof c.lng === "number" &&
					Number.isFinite(c.lat) &&
					Number.isFinite(c.lng)
				);
			}),
		[safePins]
	);
	const renderPins = useMemo(
		() => (validPins.length > MAX_MARKERS_RENDER ? validPins.slice(0, MAX_MARKERS_RENDER) : validPins),
		[validPins]
	);
	const mapRef = useRef(null);
	const [selectedPostId, setSelectedPostId] = useState(null);
	const { location: userLocation, requestLocation } = useUserLocation();

	const { data: selectedRec } = useRecommendationById(selectedPostId);

	useEffect(() => {
		// Web has a dedicated implementation.
		if (Platform.OS === "web") return;
		requestLocation?.();
	}, [requestLocation]);

	useEffect(() => {
		if (!selectedPostId) return;
		if (validPins.some((p) => p?.id === selectedPostId)) return;
		setSelectedPostId(null);
	}, [validPins, selectedPostId]);

	const coordinates = useMemo(
		() =>
			renderPins
				.map((p) => p?.coordinates)
				.map((c) => ({ latitude: c.lat, longitude: c.lng })),
		[renderPins]
	);

	const boundsRegion = useMemo(() => {
		if (!coordinates.length) return null;
		let minLat = coordinates[0].latitude;
		let maxLat = coordinates[0].latitude;
		let minLng = coordinates[0].longitude;
		let maxLng = coordinates[0].longitude;
		for (let i = 1; i < coordinates.length; i += 1) {
			const { latitude, longitude } = coordinates[i];
			if (latitude < minLat) minLat = latitude;
			if (latitude > maxLat) maxLat = latitude;
			if (longitude < minLng) minLng = longitude;
			if (longitude > maxLng) maxLng = longitude;
		}
		const centerLat = (minLat + maxLat) / 2;
		const centerLng = (minLng + maxLng) / 2;
		// Add padding so pins aren't on the edge
		const latDelta = Math.max(0.02, (maxLat - minLat) * 1.4);
		const lngDelta = Math.max(0.02, (maxLng - minLng) * 1.4);
		return {
			latitude: centerLat,
			longitude: centerLng,
			latitudeDelta: latDelta,
			longitudeDelta: lngDelta,
		};
	}, [coordinates]);

	// NOTE: Imperative region changes (fitToCoordinates/animateToRegion) can crash
	// react-native-maps on some devices. Instead, remount with a computed initialRegion.
	const mapKey = useMemo(() => {
		if (focusOnPins) {
			return `pins:${renderPins.length}:${renderPins[0]?.id || ""}:${renderPins[renderPins.length - 1]?.id || ""}`;
		}
		if (userLocation) {
			return `user:${userLocation.lat.toFixed(3)},${userLocation.lng.toFixed(3)}`;
		}
		return "default";
	}, [focusOnPins, renderPins, userLocation]);

	const initialRegion = useMemo(() => {
		if (focusOnPins && boundsRegion) return boundsRegion;
		if (userLocation) {
			return {
				latitude: userLocation.lat,
				longitude: userLocation.lng,
				...community.cityWideMapDelta,
			};
		}
		if (boundsRegion) return boundsRegion;
		return community.defaultMapRegion;
	}, [boundsRegion, focusOnPins, userLocation]);

	// NOTE: Web uses CommunityInlineMap.web.js
	if (Platform.OS === "web") return null;

	return (
		<View style={community.inlineMapWrap}>
			{renderPins.length === 0 ? (
				<View style={community.inlineMapEmpty}>
					<Text style={community.inlineMapEmptyText}>
						אין כרגע המלצות עם קואורדינטות במסננים.
					</Text>
				</View>
			) : (
				<View style={community.inlineMapContainer}>
					<MapView
						key={mapKey}
						ref={mapRef}
						style={community.inlineMapView}
						initialRegion={initialRegion}
						mapType={Platform.OS === "android" ? "none" : "standard"}
					>
						<UrlTile
							urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
							tileSize={256}
							maximumZ={19}
							zIndex={0}
						/>

						{renderPins.map((pin) => (
							<Marker
								key={pin.id}
								coordinate={{
									latitude: pin.coordinates.lat,
									longitude: pin.coordinates.lng,
								}}
								onPress={() => setSelectedPostId(pin.id)}
							/>
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
						onPress={() => {
							onOpenPost?.(selectedPostId);
						}}
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
