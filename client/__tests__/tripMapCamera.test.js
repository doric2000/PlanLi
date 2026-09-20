import { tripMapCamera } from '../src/features/tripPlanner/utils/tripMapCamera';

const region = { latitude: 32.8, longitude: 35, latitudeDelta: 0.06, longitudeDelta: 0.06 };

test.each([{ width: 340, height: 0 }, { width: NaN, height: 200 }, { width: -1, height: 200 }])('rejects unusable view dimensions %j', (size) => {
  expect(tripMapCamera(region, size)).toBeNull();
});

test('uses a wider view in the short inline card than in full screen', () => {
  const inline = tripMapCamera(region, { width: 340, height: 142 });
  const full = tripMapCamera(region, { width: 390, height: 700 });
  expect(inline.center).toEqual({ latitude: 32.8, longitude: 35 });
  expect(inline.zoom).toBeLessThan(full.zoom);
  expect(inline.zoom).toBeGreaterThan(0);
  expect(full.zoom).toBeLessThanOrEqual(16);
});

test('keeps a polar camera finite within Google Mercator limits', () => {
  const camera = tripMapCamera({ ...region, latitude: 90 }, { width: 340, height: 142 });
  expect(Number.isFinite(camera.zoom)).toBe(true);
  expect(camera.center.latitude).toBeLessThan(86);
});

test('both latitude edges of a wide trip fit around its midpoint', () => {
  const wideRegion = { latitude: 50, longitude: 20, latitudeDelta: 40, longitudeDelta: 10 };
  const camera = tripMapCamera(wideRegion, { width: 340, height: 142 });
  const y = (latitude) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360));
  const pixels = 256 * (2 ** camera.zoom) / (2 * Math.PI);
  for (const latitude of [30, 70]) {
    expect(Math.abs(y(latitude) - y(camera.center.latitude)) * pixels).toBeLessThanOrEqual(47.000001);
  }
});
