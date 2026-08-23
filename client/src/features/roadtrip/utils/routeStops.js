import { getPlaceCoordinates } from "../../../utils/distance";
import { buildGoogleMapsUrl, buildWazeUrl } from "../../../utils/placeNavigation";
import { getMediaVariantUrl } from "../../../utils/mediaAssets";

const encode = (value) => encodeURIComponent(String(value || "").trim());

export const getStopCoordinates = (stop) => {
	const coords = getPlaceCoordinates(stop?.place) || stop?.coordinates;
	const lat = Number(coords?.lat);
	const lng = Number(coords?.lng);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return { lat, lng };
};

export const hasValidStopLocation = (stop) => !!getStopCoordinates(stop);

export const hasRoutableStopLocation = (stop) =>
	!!stop?.place?.placeId || hasValidStopLocation(stop);

export const getStopMediaAssets = (stop) => {
	const assets = [stop?.media, ...(Array.isArray(stop?.additionalMedia) ? stop.additionalMedia : [])]
		.filter((asset) => asset && typeof asset === "object");
	const seen = new Set();
	return assets.filter((asset) => {
		const key = asset.assetId || asset.feed?.url || asset.large?.url;
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	}).slice(0, 3);
};

export const getStopMediaUrls = (stop, variant = "feed") => {
	const urls = getStopMediaAssets(stop)
		.map((asset) => getMediaVariantUrl(asset, variant))
		.filter(Boolean);
	if (!urls.length && stop?.image) urls.push(stop.image);
	return Array.from(new Set(urls)).slice(0, 3);
};

export const flattenRouteStops = (routeOrDays) => {
	const days = Array.isArray(routeOrDays)
		? routeOrDays
		: Array.isArray(routeOrDays?.days)
			? routeOrDays.days
			: [];

	return days.flatMap((day, dayIndex) => {
		const stops = Array.isArray(day?.stops) ? day.stops : [];
		return stops.map((stop, stopIndex) => ({
			...stop,
			dayIndex,
			stopIndex,
			sequence: stopIndex + 1,
			globalIndex: null,
			coordinates: getStopCoordinates(stop),
		}));
	}).map((stop, globalIndex) => ({ ...stop, globalIndex }));
};

export const flattenValidRouteStops = (routeOrDays) =>
	flattenRouteStops(routeOrDays).filter(hasValidStopLocation);

export const getRouteInitialRegion = (stops = []) => {
	if (!stops.length) {
		return { latitude: 31.0461, longitude: 34.8516, latitudeDelta: 6, longitudeDelta: 6 };
	}
	const latitudes = stops.map((stop) => stop.coordinates.lat);
	const longitudes = stops.map((stop) => stop.coordinates.lng);
	const minLat = Math.min(...latitudes);
	const maxLat = Math.max(...latitudes);
	const minLng = Math.min(...longitudes);
	const maxLng = Math.max(...longitudes);
	return {
		latitude: (minLat + maxLat) / 2,
		longitude: (minLng + maxLng) / 2,
		latitudeDelta: Math.max(0.04, (maxLat - minLat) * 1.5),
		longitudeDelta: Math.max(0.04, (maxLng - minLng) * 1.5),
	};
};

export const derivePlacesFromStops = (routeOrDays) => {
	const names = flattenRouteStops(routeOrDays)
		.map((stop) => stop.location || stop.place?.name || stop.place?.address || stop.title)
		.map((name) => (typeof name === "string" ? name.trim() : ""))
		.filter(Boolean);

	return Array.from(new Set(names));
};

export const buildGoogleMapsPlaceUrl = (stop) => {
	const place = stop?.place || {};
	return buildGoogleMapsUrl({
		place,
		fallback: [place.name, place.address, stop?.location, stop?.country, stop?.title, place.placeId]
			.filter(Boolean)
			.join(" "),
	});
};

export const markUnchangedRouteLocations = (days = [], originalDays = []) => {
	const originalDaysById = new Map((originalDays || []).map((day) => [day?.id, day]));
	return (days || []).map((day, dayIndex) => {
		const originalDay = originalDaysById.get(day?.id) || originalDays?.[dayIndex];
		const originalStops = originalDay?.stops || [];
		const originalById = new Map(originalStops.map((stop) => [stop?.id, stop]));
		return {
			...day,
			stops: (day?.stops || []).map((stop) => {
				const original = originalById.get(stop?.id);
				const unchanged = Boolean(
					original &&
					!stop?.place?.resolvedPlaceToken &&
					original?.place?.placeId &&
					original.place.placeId === stop?.place?.placeId
				);
				return unchanged ? { ...stop, reuseSavedLocation: true } : stop;
			}),
		};
	});
};

export const buildWazePlaceUrl = (stop) => buildWazeUrl({
	...(stop?.place || {}),
	coordinates: getStopCoordinates(stop),
});

const stopDirectionsToken = (stop) => {
	const coords = getStopCoordinates(stop);
	if (coords) return `${coords.lat},${coords.lng}`;
	return [stop?.place?.name, stop?.place?.address, stop?.location, stop?.country, stop?.title, stop?.place?.placeId]
		.filter(Boolean)
		.join(" ");
};

export const buildGoogleMapsDirectionsUrl = (routeOrStops) => {
	return buildGoogleMapsDirectionsUrls(routeOrStops)[0] || null;
};

const GOOGLE_MAPS_MAX_STOPS_PER_SEGMENT = 5;

const buildGoogleMapsDirectionsSegmentUrl = (stops) => {
	if (stops.length === 0) return null;
	if (stops.length === 1) return buildGoogleMapsPlaceUrl(stops[0]);

	const originStop = stops[0];
	const destinationStop = stops[stops.length - 1];
	const origin = stopDirectionsToken(originStop);
	const destination = stopDirectionsToken(destinationStop);
	const waypoints = stops.slice(1, -1).map(stopDirectionsToken).filter(Boolean);
	if (!origin || !destination) return null;

	let url = "https://www.google.com/maps/dir/?api=1&travelmode=driving";
	url += `&origin=${encode(origin)}`;
	url += `&destination=${encode(destination)}`;
	if (originStop?.place?.placeId) url += `&origin_place_id=${encode(originStop.place.placeId)}`;
	if (destinationStop?.place?.placeId) url += `&destination_place_id=${encode(destinationStop.place.placeId)}`;
	const waypointPlaceIds = stops.slice(1, -1).map((stop) => stop?.place?.placeId).filter(Boolean);
	if (waypoints.length > 0) url += `&waypoints=${encode(waypoints.join("|"))}`;
	if (waypointPlaceIds.length === waypoints.length && waypointPlaceIds.length > 0) {
		url += `&waypoint_place_ids=${encode(waypointPlaceIds.join("|"))}`;
	}
	return url;
};

export const buildGoogleMapsDirectionsUrls = (routeOrStops) => {
	const stops = Array.isArray(routeOrStops)
		? routeOrStops.filter(hasRoutableStopLocation)
		: flattenRouteStops(routeOrStops).filter(hasRoutableStopLocation);
	if (stops.length <= GOOGLE_MAPS_MAX_STOPS_PER_SEGMENT) {
		return [buildGoogleMapsDirectionsSegmentUrl(stops)].filter(Boolean);
	}
	const urls = [];
	for (let start = 0; start < stops.length - 1; start += GOOGLE_MAPS_MAX_STOPS_PER_SEGMENT - 1) {
		const segment = stops.slice(start, start + GOOGLE_MAPS_MAX_STOPS_PER_SEGMENT);
		const url = buildGoogleMapsDirectionsSegmentUrl(segment);
		if (url) urls.push(url);
	}
	return urls;
};

