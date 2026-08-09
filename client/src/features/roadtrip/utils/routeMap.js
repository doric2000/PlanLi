import { featureCollection, lineFeature, pointFeature } from '../../../utils/mapGeoJson';

export function routeStopsToGeoJson(stops = []) {
  return featureCollection(stops.map((stop) => pointFeature(stop.coordinates, {
    id: stop.id || `${stop.dayIndex}:${stop.stopIndex}`,
    stopNumber: String(stop.globalIndex + 1),
    globalIndex: stop.globalIndex,
  }, stop.id || `${stop.dayIndex}:${stop.stopIndex}`)));
}

export function routeLineGeoJson(stops = []) {
  return featureCollection([
    lineFeature(stops.map((stop) => stop.coordinates), { kind: 'route' }),
  ]);
}

export function routeBounds(stops = []) {
  if (!stops.length) return null;
  let west = stops[0].coordinates.lng;
  let east = west;
  let south = stops[0].coordinates.lat;
  let north = south;
  stops.forEach(({ coordinates }) => {
    west = Math.min(west, coordinates.lng);
    east = Math.max(east, coordinates.lng);
    south = Math.min(south, coordinates.lat);
    north = Math.max(north, coordinates.lat);
  });
  if (west === east) {
    west -= 0.01;
    east += 0.01;
  }
  if (south === north) {
    south -= 0.01;
    north += 0.01;
  }
  return [west, south, east, north];
}
