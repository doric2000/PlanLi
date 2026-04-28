import React, { useMemo, useState } from "react";
import { Image, Linking, Text, TouchableOpacity, View } from "react-native";
import { MapContainer, Marker, Polyline, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { Ionicons } from "@expo/vector-icons";

import "../../../styles/leaflet.css";
import {
	buildGoogleMapsDirectionsUrl,
	buildGoogleMapsPlaceUrl,
	flattenValidRouteStops,
} from "../utils/routeStops";
import { colors, routeMapStyles as styles } from "../../../styles";

const escapeAttr = (value) =>
	String(value || "")
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");

const createStopIcon = (stop) => L.divIcon({
	className: "route-stop-marker-wrap",
	html: stop.image
		? `<div class="route-stop-marker"><img src="${escapeAttr(stop.image)}" alt="" /><span>${stop.globalIndex + 1}</span></div>`
		: `<div class="route-stop-marker route-stop-marker-empty"><span>${stop.globalIndex + 1}</span></div>`,
	iconSize: [56, 56],
	iconAnchor: [28, 28],
});

function FitRoute({ positions }) {
	const map = useMap();
	React.useEffect(() => {
		if (!positions.length) return;
		try {
			const bounds = L.latLngBounds(positions);
			map.fitBounds(bounds, { padding: [42, 42] });
		} catch {
			// ignore
		}
	}, [map, positions]);
	return null;
}

export default function RouteMapScreen({ route, navigation }) {
	const { routeData } = route.params || {};
	const stops = useMemo(() => flattenValidRouteStops(routeData), [routeData]);
	const [selectedStop, setSelectedStop] = useState(null);
	const positions = useMemo(
		() => stops.map((stop) => [stop.coordinates.lat, stop.coordinates.lng]),
		[stops]
	);
	const routeUrl = buildGoogleMapsDirectionsUrl(stops);

	const openUrl = (url) => {
		if (!url) return;
		Linking.openURL(url).catch(() => {});
	};

	return (
		<View style={styles.screen}>
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
				<View style={styles.webMapWrap}>
					<MapContainer
						center={positions[0]}
						zoom={11}
						style={styles.webMap}
					>
						<TileLayer
							attribution='&copy; OpenStreetMap contributors'
							url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
						/>
						<FitRoute positions={positions} />
						{positions.length > 1 && (
							<Polyline positions={positions} pathOptions={{ color: colors.primary, weight: 4 }} />
						)}
						{stops.map((stop) => (
							<Marker
								key={stop.id || `${stop.dayIndex}:${stop.stopIndex}`}
								position={[stop.coordinates.lat, stop.coordinates.lng]}
								icon={createStopIcon(stop)}
								eventHandlers={{
									click: () => setSelectedStop(stop),
								}}
							/>
						))}
					</MapContainer>
				</View>
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
		</View>
	);
}
