import {
	buildGoogleMapsDirectionsUrl,
	buildGoogleMapsPlaceUrl,
	derivePlacesFromStops,
	flattenRouteStops,
	flattenValidRouteStops,
	hasValidStopLocation,
} from "../src/features/roadtrip/utils/routeStops";

const route = {
	tripDaysData: [
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
		expect(hasValidStopLocation(route.tripDaysData[0].stops[0])).toBe(true);
		expect(hasValidStopLocation(route.tripDaysData[0].stops[1])).toBe(false);
		expect(flattenValidRouteStops(route).map((stop) => stop.id)).toEqual(["a", "c"]);
	});

	it("derives route places from stop locations", () => {
		expect(derivePlacesFromStops(route)).toEqual(["Paris", "No coords", "Lyon"]);
	});

	it("builds single stop Google Maps URL", () => {
		const url = buildGoogleMapsPlaceUrl(route.tripDaysData[0].stops[0]);

		expect(url).toContain("https://www.google.com/maps/search/?api=1");
		expect(url).toContain("48.8584%2C2.2945");
		expect(url).toContain("query_place_id=place-a");
	});

	it("builds whole trip Google Maps directions URL", () => {
		const url = buildGoogleMapsDirectionsUrl(route);

		expect(url).toContain("https://www.google.com/maps/dir/?api=1");
		expect(url).toContain("travelmode=driving");
		expect(url).toContain("origin=48.8584%2C2.2945");
		expect(url).toContain("destination=45.764%2C4.8357");
		expect(url).not.toContain("No%20coords");
	});
});

