import {
  accuracyCircleFeature,
  lineFeature,
  pointFeature,
  userLocationGeoJson,
  viewportFromBounds,
} from '../src/utils/mapGeoJson';
import { routeBounds, routeLineGeoJson, routeStopsToGeoJson } from '../src/features/roadtrip/utils/routeMap';
import { recommendationsToGeoJson } from '../src/features/community/utils/recommendationMap';

describe('Map GeoJSON helpers', () => {
  it('builds stable point, line, and accuracy geometry', () => {
    expect(pointFeature({ lat: 32, lng: 34 }).geometry.coordinates).toEqual([34, 32]);
    expect(lineFeature([{ lat: 32, lng: 34 }, { lat: 33, lng: 35 }]).geometry.type).toBe('LineString');
    const accuracy = accuracyCircleFeature({ lat: 32, lng: 34, accuracy: 25 }, 12);
    expect(accuracy.geometry.coordinates[0]).toHaveLength(13);
    expect(userLocationGeoJson({ lat: 32, lng: 34, accuracy: 25 }).features).toHaveLength(2);
  });

  it('converts native bounds to the callable viewport contract', () => {
    expect(viewportFromBounds([34, 31, 35, 33], 12)).toEqual({
      west: 34, south: 31, east: 35, north: 33, zoom: 12,
    });
  });

  it('creates recommendation and numbered route sources', () => {
    const recommendations = recommendationsToGeoJson([{
      id: 'one', title: 'One', categoryId: 'food', place: { coordinates: { lat: 32, lng: 34 } },
    }]);
    expect(recommendations.features[0].properties.postId).toBe('one');

    const stops = [
      { id: 'a', globalIndex: 0, dayIndex: 0, stopIndex: 0, coordinates: { lat: 32, lng: 34 } },
      { id: 'b', globalIndex: 1, dayIndex: 0, stopIndex: 1, coordinates: { lat: 33, lng: 35 } },
    ];
    expect(routeStopsToGeoJson(stops).features.map((entry) => entry.properties.stopNumber)).toEqual(['1', '2']);
    expect(routeLineGeoJson(stops).features[0].geometry.type).toBe('LineString');
    expect(routeBounds(stops)).toEqual([34, 32, 35, 33]);
  });
});
