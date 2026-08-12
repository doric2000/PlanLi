const test = require('node:test');
const assert = require('node:assert/strict');

const { attachRouteDestinationPreviews } = require('./routeDestinationPreviewService');

test('route destination previews reuse active catalog images and stay compact', async () => {
  const catalogs = new Map([
    ['destinationCatalog/TH_chiang-mai', {
      status: 'active', names: { he: 'צ׳יאנג מאי', en: 'Chiang Mai' },
      destinationImage: { urls: { thumb: 'https://img.example/chiang-mai.jpg' } },
    }],
  ]);
  const db = {
    doc: (path) => ({ id: path.split('/').at(-1), path, get: async () => ({
      id: path.split('/').at(-1), exists: catalogs.has(path), data: () => catalogs.get(path),
    }) }),
  };
  const [route] = await attachRouteDestinationPreviews(db, [{
    id: 'route-1',
    destinations: [
      { countryId: 'TH', cityId: 'chiang-mai', cityName: 'Chiang Mai' },
      { countryId: 'TH', cityId: 'pai', cityName: 'Pai' },
    ],
  }]);

  assert.deepEqual(route.destinationPreviews, [
    {
      countryId: 'TH', cityId: 'chiang-mai', name: 'צ׳יאנג מאי',
      destinationImage: { urls: { thumb: 'https://img.example/chiang-mai.jpg' } },
    },
    { countryId: 'TH', cityId: 'pai', name: 'Pai', destinationImage: null },
  ]);
});
