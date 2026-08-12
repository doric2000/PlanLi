import { getPlaceCoordinates } from "../../../utils/distance";

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

export const derivePlacesFromStops = (routeOrDays) => {
	const names = flattenRouteStops(routeOrDays)
		.map((stop) => stop.location || stop.place?.name || stop.place?.address || stop.title)
		.map((name) => (typeof name === "string" ? name.trim() : ""))
		.filter(Boolean);

	return Array.from(new Set(names));
};

export const buildGoogleMapsPlaceUrl = (stop) => {
	const place = stop?.place || {};
	const coords = getStopCoordinates(stop);

	if (place.url) return place.url;

	const fallbackQuery = coords
		? `${coords.lat},${coords.lng}`
		: [place.name, place.address, stop?.location, stop?.country, stop?.title]
			.filter(Boolean)
			.join(" ") || place.placeId;

	if (!fallbackQuery) return null;

	let url = `https://www.google.com/maps/search/?api=1&query=${encode(fallbackQuery)}`;
	if (place.placeId) {
		url += `&query_place_id=${encode(place.placeId)}`;
	}
	return url;
};

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

