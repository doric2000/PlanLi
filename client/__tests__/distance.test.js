import { getPlaceCoordinates, haversineDistanceKm } from '../src/utils/distance';

describe('distance utils', () => {
  test('haversineDistanceKm returns 0 for identical points', () => {
    expect(haversineDistanceKm({ lat: 10, lng: 20 }, { lat: 10, lng: 20 })).toBeCloseTo(0, 6);
  });

  test('haversineDistanceKm returns a reasonable distance for Tel Aviv ↔ Jerusalem', () => {
    const telAviv = { lat: 32.0853, lng: 34.7818 };
    const jerusalem = { lat: 31.7683, lng: 35.2137 };

    const km = haversineDistanceKm(telAviv, jerusalem);
    expect(km).toBeGreaterThan(40);
    expect(km).toBeLessThan(80);
  });

  test('getPlaceCoordinates reads place.coordinates', () => {
    const place = { coordinates: { lat: 1.23, lng: 4.56 } };
    expect(getPlaceCoordinates(place)).toEqual({ lat: 1.23, lng: 4.56 });
  });

  test('getPlaceCoordinates reads place.geometry.location (legacy/test shape)', () => {
    const place = { geometry: { location: { lat: 7.89, lng: 0.12 } } };
    expect(getPlaceCoordinates(place)).toEqual({ lat: 7.89, lng: 0.12 });
  });

  test('getPlaceCoordinates returns null when missing', () => {
    expect(getPlaceCoordinates(null)).toBeNull();
    expect(getPlaceCoordinates({})).toBeNull();
  });
});
