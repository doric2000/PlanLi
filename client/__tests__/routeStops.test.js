import {
	buildGoogleMapsDirectionsUrl,
	buildGoogleMapsDirectionsUrls,
	buildGoogleMapsPlaceUrl,
	buildWazePlaceUrl,
	derivePlacesFromStops,
	flattenRouteStops,
	flattenValidRouteStops,
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
});

