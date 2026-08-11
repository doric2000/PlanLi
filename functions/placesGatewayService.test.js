const test = require('node:test');
const assert = require('node:assert/strict');
const { legacyAutocomplete } = require('./placesGatewayService');

test('legacy gateway autocomplete returns only bounded, client-safe prediction fields', async () => {
  const results = await legacyAutocomplete({
    query: 'Paris', mapsKey: 'key', mode: 'destinations',
    fetchImpl: async (url) => {
      const request = new URL(url);
      assert.equal(request.searchParams.get('types'), '(cities)');
      assert.equal(request.searchParams.get('language'), 'he');
      return { ok: true, json: async () => ({ status: 'OK', predictions: [{
        place_id: 'place-1', description: 'Paris, France', types: ['locality'],
        structured_formatting: { main_text: 'Paris', secondary_text: 'France' },
      }] }) };
    },
  });
  assert.deepEqual(results, [{ selectionId: results[0].selectionId, placeId: 'place-1', text: 'Paris', secondaryText: 'France', types: ['locality'] }]);
  assert.match(results[0].selectionId, /^sel_/);
});
