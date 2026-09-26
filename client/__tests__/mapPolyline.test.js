import { getMapDashPolicy, MAP_DASH_SPAN_BUDGET } from '../src/utils/mapPolyline';

const point = (latitude, longitude = 0) => ({ latitude, longitude });
const short = [point(0), point(0.03)];
const long = [point(0), point(4), point(8)];
// Independent upper bound using a slightly larger Earth radius than the helper.
const meridianMeters = (degrees) => degrees * Math.PI / 180 * 6378137;
const spans = (meters, pattern) => Math.ceil(meters / Math.min(...pattern));

test('preserves short routes and bounds a roughly 900 km fallback route', () => {
  expect(getMapDashPolicy([short], [7, 7], 'ios').lineDashPattern).toEqual([7, 7]);
  const pattern = getMapDashPolicy([long], [7, 7], 'ios').lineDashPattern;
  expect(pattern[0]).toBeGreaterThan(7);
  expect(spans(meridianMeters(8), pattern)).toBeLessThanOrEqual(MAP_DASH_SPAN_BUDGET);
  expect(pattern[0]).toBe(pattern[1]);
});

test.each([2, 20, 100, 511])('shares the budget across %i disconnected lines', (count) => {
  const paths = Array.from({ length: count }, () => long);
  const pattern = getMapDashPolicy(paths, [8, 7], 'ios').lineDashPattern;
  expect(count * spans(meridianMeters(8), pattern)).toBeLessThanOrEqual(MAP_DASH_SPAN_BUDGET);
  expect(pattern[0] / pattern[1]).toBeCloseTo(8 / 7);
});

test('uses solid lines when there are too many individual paths to budget', () => {
  expect(getMapDashPolicy(Array.from({ length: 512 }, () => short), [7, 7], 'ios'))
    .toEqual({ lineDashPattern: undefined, key: 'solid' });
});

test('uses the short rhumb crossing at the antimeridian', () => {
  const pattern = getMapDashPolicy([[point(0, 179.9), point(0, -179.9)]], [7, 7], 'ios').lineDashPattern;
  expect(spans(meridianMeters(0.2), pattern)).toBeLessThanOrEqual(512);
  expect(pattern[0]).toBeLessThan(100); // Not a nearly globe-length detour.
});

test('measures east-west and diagonal lines instead of latitude distance alone', () => {
  const equator = getMapDashPolicy([[point(0, 0), point(0, 8)]], [7, 7], 'ios').lineDashPattern;
  expect(spans(meridianMeters(8), equator)).toBeLessThanOrEqual(512);
  const diagonal = getMapDashPolicy([[point(0, 0), point(8, 8)]], [7, 7], 'ios').lineDashPattern;
  expect(spans(meridianMeters(8) * 1.41, diagonal)).toBeLessThanOrEqual(512);
});

test('allows repeated points without inflating the distance', () => {
  expect(getMapDashPolicy([[short[0], short[0], short[1], short[1]]], [7, 7], 'ios'))
    .toEqual(getMapDashPolicy([short], [7, 7], 'ios'));
});

test.each([
  [], [[]], [[point(0)]], [[point(0), point(0)]],
  [[point(0), point(NaN)]], [[point(0), point(Infinity)]],
  [[point(0), point(91)]], [[point(0), point(90)]],
  [[point(0), point(0, 181)]], [[point(0), null]], [null],
].map((paths) => [paths]))('falls back to solid for empty, degenerate, or invalid paths (%j)', (paths) => {
  expect(getMapDashPolicy(paths, [7, 7], 'ios').lineDashPattern).toBeUndefined();
});

test.each([[], [0, 7], [-1, 7], [Infinity, 7], [NaN, 7], [7]].map((pattern) => [pattern]))('rejects unsafe dash lengths (%j)', (pattern) => {
  expect(getMapDashPolicy([long], pattern, 'ios').lineDashPattern).toBeUndefined();
});

test.each(['android', 'web'])('leaves the original %s pattern untouched', (platform) => {
  const pattern = Object.freeze([8, 7]);
  expect(getMapDashPolicy([long], pattern, platform).lineDashPattern).toBe(pattern);
});

test('preserves a computed solid route and provides distinct native identities for changed styles', () => {
  const original = Object.freeze([7, 7]);
  const small = getMapDashPolicy([short], original, 'ios');
  const large = getMapDashPolicy([long], original, 'ios');
  const solid = getMapDashPolicy([long], undefined, 'ios');
  expect(new Set([small.key, large.key, solid.key]).size).toBe(3);
  expect(solid.lineDashPattern).toBeUndefined();
  expect(original).toEqual([7, 7]);
});
