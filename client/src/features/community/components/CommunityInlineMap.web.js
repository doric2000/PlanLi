import React, { useEffect, useMemo, useState } from "react";

import { Text, TouchableOpacity, View } from "react-native";

import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

import "../../../styles/leaflet.css";

import { community } from "../../../styles";
import { useRecommendationById } from "../../../hooks/useRecommendationById";

const planliMarkerIcon = L.divIcon({
	className: "planli-marker",
	html: '<div class="planli-marker-dot"></div>',
	iconSize: [20, 20],
	iconAnchor: [10, 10],
});

function FitBounds({ coordinates, enabled }) {
	const map = useMap();

	useEffect(() => {
		if (!enabled) return;
		if (!coordinates?.length) return;
		try {
			const bounds = L.latLngBounds(coordinates);
			map.fitBounds(bounds, { padding: [40, 40] });
		} catch {
			// ignore
		}
	}, [coordinates, enabled, map]);

	return null;
}

function CenterOnPoint({ center, zoom, enabled }) {
	const map = useMap();
	useEffect(() => {
		if (!enabled) return;
		if (!center) return;
		try {
			map.setView(center, zoom, { animate: true });
		} catch {
			// ignore
		}
	}, [center, enabled, zoom, map]);
	return null;
}

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
	const [selectedPostId, setSelectedPostId] = useState(null);
	const [userCenter, setUserCenter] = useState(null);

	const { data: selectedRec } = useRecommendationById(selectedPostId);

	useEffect(() => {
		if (!selectedPostId) return;
		if (validPins.some((p) => p?.id === selectedPostId)) return;
		setSelectedPostId(null);
	}, [validPins, selectedPostId]);

	const markerPositions = useMemo(
		() =>
			validPins
				.map((p) => p?.coordinates)
				.map((c) => [c.lat, c.lng]),
		[validPins]
	);

	useEffect(() => {
		let cancelled = false;
		if (typeof navigator === "undefined" || !navigator.geolocation) return () => {};

		navigator.geolocation.getCurrentPosition(
			(pos) => {
				if (cancelled) return;
				const lat = pos?.coords?.latitude;
				const lng = pos?.coords?.longitude;
				if (Number.isFinite(lat) && Number.isFinite(lng)) {
					setUserCenter([lat, lng]);
				}
			},
			() => {
				// ignore
			},
			{ enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }
		);

		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<View style={community.inlineMapWrap}>
			{validPins.length === 0 ? (
				<View style={community.inlineMapEmpty}>
					<Text style={community.inlineMapEmptyText}>
						אין כרגע המלצות עם קואורדינטות במסננים.
					</Text>
				</View>
			) : (
				<View style={community.inlineLeafletMapWrap}>
					<MapContainer
						center={
							userCenter || [community.defaultMapRegion.latitude, community.defaultMapRegion.longitude]
						}
						zoom={userCenter ? 12 : 10}
						style={community.leafletMap}
					>
						<TileLayer
							attribution='&copy; OpenStreetMap contributors'
							url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
						/>
						<CenterOnPoint center={userCenter} zoom={12} enabled={!focusOnPins} />
						<FitBounds coordinates={markerPositions} enabled={focusOnPins || !userCenter} />

						{validPins.map((pin) => (
							<Marker
								key={pin.id}
								position={[pin.coordinates.lat, pin.coordinates.lng]}
								icon={planliMarkerIcon}
								eventHandlers={{
									click: () => setSelectedPostId(pin.id),
								}}
							/>
						))}
					</MapContainer>
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
