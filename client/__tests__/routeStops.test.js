import {
	buildGoogleMapsDirectionsUrl,
	buildGoogleMapsDirectionsUrls,
	buildGoogleMapsDaySegments,
	buildGoogleMapsPlaceUrl,
	buildRouteMapSegments,
	buildWazePlaceUrl,
	derivePlacesFromStops,
	flattenRouteStops,
	flattenValidRouteStops,
	formatRouteDuration,
	formatRouteLegEstimate,
	hasValidStopLocation,
	markUnchangedRouteLocations,
} from "../src/features/roadtrip/utils/routeStops";

const route = {
	days: [
		{
			description: "day one",
			stops: [
				{
					id: "a",
					title: "First",
					location: "Paris",
					place: {
						placeId: "place-a",
						name: "Eiffel Tower",
						coordinates: { lat: 48.8584, lng: 2.2945 },
					},
				},
				{
					id: "b",
					title: "Broken",
					location: "No coords",
					place: { name: "No coords" },
				},
			],
		},
		{
			description: "day two",
			stops: [
				{
					id: "c",
					title: "Second",
					location: "Lyon",
					place: {
						name: "Old Lyon",
						coordinates: { lat: 45.764, lng: 4.8357 },
					},
				},
			],
		},
	],
};

describe("roadtrip route stop helpers", () => {
	it("flattens stops in day and stop order", () => {
		const stops = flattenRouteStops(route);

		expect(stops.map((stop) => stop.id)).toEqual(["a", "b", "c"]);
		expect(stops.map((stop) => [stop.dayIndex, stop.stopIndex, stop.globalIndex])).toEqual([
			[0, 0, 0],
			[0, 1, 1],
			[1, 0, 2],
		]);
	});

	it("filters invalid stop locations", () => {
		expect(hasValidStopLocation(route.days[0].stops[0])).toBe(true);
		expect(hasValidStopLocation(route.days[0].stops[1])).toBe(false);
		expect(flattenValidRouteStops(route).map((stop) => stop.id)).toEqual(["a", "c"]);
	});

	it("never treats a general destination as an exact map point", () => {
		const general = {
			locationPrecision: "general",
			place: { placeId: "legacy-place", coordinates: { lat: 32.1, lng: 34.8 } },
		};
		expect(hasValidStopLocation(general)).toBe(false);
		expect(buildGoogleMapsPlaceUrl(general)).toBeNull();
		expect(buildWazePlaceUrl(general)).toBeNull();
	});

	it("derives route places from stop locations", () => {
		expect(derivePlacesFromStops(route)).toEqual(["Paris", "No coords", "Lyon"]);
	});

	it("builds single stop Google Maps URL", () => {
		const url = buildGoogleMapsPlaceUrl(route.days[0].stops[0]);

		expect(url).toContain("https://www.google.com/maps/search/?api=1");
		expect(url).toContain("48.8584%2C2.2945");
		expect(url).toContain("query_place_id=place-a");
	});

	it("builds a Waze navigation URL from exact coordinates", () => {
		expect(buildWazePlaceUrl(route.days[0].stops[0])).toBe(
			"https://waze.com/ul?ll=48.8584%2C2.2945&navigate=yes&utm_source=planli"
		);
	});

	it("marks only trusted unchanged edit locations for server reuse", () => {
		const edited = [{ stops: [
			{ id: "a", title: "Renamed", place: { placeId: "place-a", coordinates: { lat: 1, lng: 2 } } },
			{ id: "b", place: { placeId: "new-place", coordinates: { lat: 3, lng: 4 } } },
			{ id: "c", place: { placeId: "place-c", resolvedPlaceToken: "new-token", coordinates: { lat: 5, lng: 6 } } },
		] }];
		const original = [{ stops: [
			{ id: "a", place: { placeId: "place-a" } },
			{ id: "b", place: { placeId: "place-b" } },
			{ id: "c", place: { placeId: "place-c" } },
		] }];

		const [day] = markUnchangedRouteLocations(edited, original);
		expect(day.stops[0].reuseSavedLocation).toBe(true);
		expect(day.stops[1].reuseSavedLocation).toBeUndefined();
		expect(day.stops[2].reuseSavedLocation).toBeUndefined();
	});

	it("matches unchanged locations by day ID after route days are reordered", () => {
		const original = [
			{ id: "day-a", stops: [{ id: "stop-a", place: { placeId: "place-a" } }] },
			{ id: "day-b", stops: [{ id: "stop-b", place: { placeId: "place-b" } }] },
		];
		const edited = [
			{ id: "day-b", stops: [{ id: "stop-b", place: { placeId: "place-b" } }] },
			{ id: "day-a", stops: [{ id: "stop-a", place: { placeId: "place-a" } }] },
		];

		const result = markUnchangedRouteLocations(edited, original);
		expect(result[0].stops[0].reuseSavedLocation).toBe(true);
		expect(result[1].stops[0].reuseSavedLocation).toBe(true);
	});

	it("builds whole trip Google Maps directions URL", () => {
		const url = buildGoogleMapsDirectionsUrl(route);

		expect(url).toContain("https://www.google.com/maps/dir/?api=1");
		expect(url).toContain("travelmode=driving");
		expect(url).toContain("origin=48.8584%2C2.2945");
		expect(url).toContain("destination=45.764%2C4.8357");
		expect(url).not.toContain("No%20coords");
	});

	it("uses permanent Place IDs and splits long routes into portable Google Maps segments", () => {
		const stops = Array.from({ length: 6 }, (_, index) => ({
			id: String(index),
			place: { placeId: `place-${index}`, coordinates: { lat: 32 + index / 10, lng: 34 + index / 10 } },
		}));
		const urls = buildGoogleMapsDirectionsUrls(stops);
		expect(urls).toHaveLength(2);
		expect(urls[0]).toContain("origin_place_id=place-0");
		expect(urls[0]).toContain("destination_place_id=place-4");
		expect(urls[1]).toContain("origin_place_id=place-4");
		expect(urls[1]).toContain("destination_place_id=place-5");
	});

	it("breaks map and Google directions segments at general stops and day boundaries", () => {
		const segmentedRoute = { days: [{ stops: [
			{ id: "a", locationPrecision: "exact", place: { placeId: "a", coordinates: { lat: 1, lng: 1 } } },
			{ id: "b", locationPrecision: "general", destination: { cityId: "city" } },
			{ id: "c", locationPrecision: "pin", coordinates: { lat: 2, lng: 2 } },
			{ id: "d", locationPrecision: "exact", place: { placeId: "d", coordinates: { lat: 3, lng: 3 } } },
		] }, { stops: [
			{ id: "e", locationPrecision: "exact", place: { placeId: "e", coordinates: { lat: 4, lng: 4 } } },
		] }] };

		const segments = buildRouteMapSegments(segmentedRoute);
		expect(segments.map((segment) => segment.stops.map((stop) => stop.id))).toEqual([["a"], ["c", "d"], ["e"]]);
		const dayUrls = buildGoogleMapsDaySegments(segmentedRoute, 0);
		expect(dayUrls).toHaveLength(2);
		expect(dayUrls[0].startStopIndex).toBe(0);
		expect(dayUrls[0].endStopIndex).toBe(0);
		expect(dayUrls[1].startStopIndex).toBe(2);
		expect(dayUrls[1].endStopIndex).toBe(3);
	});

	it("breaks drawn map lines at a stop that has a Place ID but no coordinates", () => {
		const routeWithMissingCoordinates = { days: [{ stops: [
			{ id: "a", locationPrecision: "exact", place: { placeId: "a", coordinates: { lat: 1, lng: 1 } } },
			{ id: "missing", locationPrecision: "exact", place: { placeId: "missing" } },
			{ id: "c", locationPrecision: "exact", place: { placeId: "c", coordinates: { lat: 3, lng: 3 } } },
		] }] };

		const segments = buildRouteMapSegments(routeWithMissingCoordinates);
		expect(segments.map((segment) => segment.stops.map((stop) => stop.id))).toEqual([["a"], ["c"]]);
		expect(buildGoogleMapsDaySegments(routeWithMissingCoordinates, 0)).toHaveLength(1);
	});

	it("formats visit durations and explicitly labels rough leg estimates", () => {
		expect(formatRouteDuration(30)).toBe("30 דק׳");
		expect(formatRouteDuration(60)).toBe("שעה");
		expect(formatRouteDuration(90)).toBe("שעה וחצי");
		expect(formatRouteDuration(135)).toBe("שעתיים ו־15 דק׳");
		expect(formatRouteLegEstimate({ travelFromPrevious: { distanceKm: 4.1, estimatedDurationMinutes: 12 } }))
			.toBe("כ־4.1 ק״מ בקו אווירי · הערכת זמן גסה כ־12 דק׳");
	});
});

