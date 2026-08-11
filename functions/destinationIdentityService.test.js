const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWikidataIdentity } = require('./destinationIdentityService');

function entity({ he, en, countryId, coordinates, countryCode }) {
  return {
    labels: {
      ...(he ? { he: { value: he } } : {}),
      ...(en ? { en: { value: en } } : {}),
    },
    claims: {
      ...(countryId ? { P17: [{ mainsnak: { datavalue: { value: { id: countryId } } } }] } : {}),
      ...(coordinates ? { P625: [{ mainsnak: { datavalue: { value: coordinates } } }] } : {}),
      ...(countryCode ? { P297: [{ mainsnak: { datavalue: { value: countryCode } } }] } : {}),
    },
  };
}

test('Wikidata identity uses an exact nearby name and country match', async () => {
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    if (params.get('action') === 'wbsearchentities') {
      return { ok: true, json: async () => ({ search: [{ id: 'Q90' }, { id: 'Q999' }] }) };
    }
    const ids = params.get('ids');
    if (ids === 'Q90|Q999') {
      return {
        ok: true,
        json: async () => ({ entities: {
          Q90: entity({ he: 'פריז', en: 'Paris', countryId: 'Q142', coordinates: { latitude: 48.8566, longitude: 2.3522 } }),
          Q999: entity({ he: 'פריז', en: 'Paris', countryId: 'Q142', coordinates: { latitude: 49.8, longitude: 2.3 } }),
        } }),
      };
    }
    return { ok: true, json: async () => ({ entities: { Q142: entity({ he: 'צרפת', en: 'France', countryCode: 'FR' }) } }) };
  };
  const identity = await resolveWikidataIdentity({
    city: { name: 'פריז', coordinates: { lat: 48.8567, lng: 2.3523 } },
    country: { code: 'FR', name: 'צרפת' },
    fetchImpl,
  });
  assert.equal(identity.sourceId, 'Q90');
  assert.equal(identity.names.en, 'Paris');
  assert.equal(identity.countryNames.en, 'France');
});

test('Wikidata identity leaves an ambiguous nearby match for review', async () => {
  const fetchImpl = async (url) => {
    const params = new URL(url).searchParams;
    if (params.get('action') === 'wbsearchentities') return { ok: true, json: async () => ({ search: [{ id: 'Q1' }, { id: 'Q2' }] }) };
    if (params.get('ids') === 'Q1|Q2') return {
      ok: true,
      json: async () => ({ entities: {
        Q1: entity({ he: 'אבג', countryId: 'QIL', coordinates: { latitude: 32.0000, longitude: 34.0000 } }),
        Q2: entity({ he: 'אבג', countryId: 'QIL', coordinates: { latitude: 32.0100, longitude: 34.0000 } }),
      } }),
    };
    return { ok: true, json: async () => ({ entities: { QIL: entity({ countryCode: 'IL' }) } }) };
  };
  const identity = await resolveWikidataIdentity({
    city: { name: 'אבג', coordinates: { lat: 32.005, lng: 34 } },
    country: { code: 'IL' },
    fetchImpl,
  });
  assert.equal(identity, null);
});
