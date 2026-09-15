import {
  applyOperationsLocally, decodePolyline, regionForStops, routeSummary, viewportForRegion,
} from './tripPlannerModel';

test('polyline decoding and route summary are deterministic', () => {
  expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
    { latitude: 38.5, longitude: -120.2 },
    { latitude: 40.7, longitude: -120.95 },
    { latitude: 43.252, longitude: -126.453 },
  ]);
  expect(routeSummary({ totals: { distanceMeters: 12500, durationSeconds: 5400 } })).toBe('13 ק״מ · 1 ש׳ 30 דק׳');
});
test('viewport covers every stop and has a usable zoom', () => {
  const region = regionForStops([
    { coordinates: { lat: 32, lng: 34 } },
    { coordinates: { lat: 33, lng: 35 } },
  ]);
  const viewport = viewportForRegion(region);
  expect(viewport.north).toBeGreaterThanOrEqual(33);
  expect(viewport.south).toBeLessThanOrEqual(32);
  expect(viewport.zoom).toBeGreaterThan(4);
});

test('optimistic operations keep stop counts and day ownership consistent', () => {
  const trip = {
    id: 'trip', title: 'טיול', revision: 1, dayCount: 1, stopCount: 1,
    days: [
      { id: 'ideas', kind: 'ideas', order: 0, stopCount: 1, stops: [{ id: 'stop', title: 'רעיון', order: 0 }] },
      { id: 'day', kind: 'day', order: 1, stopCount: 0, stops: [] },
    ],
  };
  const next = applyOperationsLocally(trip, [{ type: 'move_stop', dayId: 'ideas', targetDayId: 'day', stopId: 'stop' }]);
  expect(next.revision).toBe(2);
  expect(next.days[0].stops).toHaveLength(0);
  expect(next.days[1].stops[0].id).toBe('stop');
  expect(next.stopCount).toBe(1);
});
