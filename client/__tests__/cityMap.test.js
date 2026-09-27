import { cityCoordinate, cityMapItems, cityMapRegion, cityMapViewport } from '../src/features/destination/utils/cityMap';

test('only mapped recommendations with finite actual coordinates appear', () => {
  expect(cityCoordinate({ lat: null, lng: null })).toBeNull();
  expect(cityCoordinate({ lat: 91, lng: 0 })).toBeNull();
  expect(cityMapItems([{ id: 'bad', place: { coordinates: { lat: null, lng: null } } },
    { id: 'ok', place: { coordinates: { lat: 6.8, lng: 81.8 } } }]).map((item) => item.id)).toEqual(['ok']);
  expect(cityMapItems([{ id: 'fallback', place: { coordinates: { lat: null, lng: null } }, mapLocation: { lat: 6.8, lng: 81.8 } }])[0].coordinates).toEqual({ lat: 6.8, lng: 81.8 });
});
test('centers on the city rather than the user and includes its recommendation points', () => {
  const region = cityMapRegion({ identity: { coordinates: { lat: 6.8, lng: 81.8 } } }, [
    { id: 'one', place: { coordinates: { lat: 6.81, lng: 81.82 } } },
  ]);
  const viewport = cityMapViewport(region);
  expect(viewport.north).toBeGreaterThan(6.81); expect(viewport.south).toBeLessThan(6.8);
  expect(viewport.east).toBeGreaterThan(81.82); expect(viewport.west).toBeLessThan(81.8);
  expect(cityMapRegion({}, [])).toBeNull();
  expect(cityMapViewport(null)).toBeNull();
  expect(cityMapViewport({ ...region, longitudeDelta: Infinity })).toBeNull();
});
