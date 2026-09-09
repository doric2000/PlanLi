const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNewLocalizedPlace } = require('./placesProviderAdapter');
const { BUILTIN_POLICIES, matchCanonicalEntry } = require('./canonicalDestinationRegistry');
const { compactDestinationSearchText } = require('./destinationCatalogService');

const hoiAn = BUILTIN_POLICIES.find((entry) => entry.id === 'vn-hoi-an');
const point = { lat: 15.8863324, lng: 108.3341622 };
const details = {
  id: 'test-hoi-an-venue', displayName: { text: 'HealthFit Gym & Yoga Center Hoi An' },
  types: ['gym', 'point_of_interest', 'establishment'],
  location: { latitude: point.lat, longitude: point.lng },
  addressComponents: [
    { longText: '120', types: ['street_number'] },
    { longText: 'Lý Thái Tổ', types: ['route'] },
    { longText: 'Hội An Đông', types: ['administrative_area_level_2', 'political'] },
    { longText: 'Đà Nẵng', types: ['administrative_area_level_1', 'political'] },
    { longText: 'Vietnam', shortText: 'VN', types: ['country', 'political'] },
  ],
};
const resolve = (parsed, entries = BUILTIN_POLICIES) => matchCanonicalEntry(entries, {
  countryCode: parsed.countryCode, providerPlaceId: parsed.placeId,
  aliases: parsed.localityCandidates, localityEvidence: parsed.localityEvidence,
  coordinates: parsed.coordinates, exactOnlyKinds: ['natural_feature'], requireAliasForKinds: ['city_hub'],
});

test('Hoi An ward addresses resolve to Hoi An without treating the business name as evidence', () => {
  for (const name of ['Hội An Đông', 'Hoi An Dong', 'Hội An Tây', 'Hoi An Tay', 'Hội An']) {
    const parsed = parseNewLocalizedPlace({ ...details, displayName: { text: 'Unnamed gym' },
      addressComponents: details.addressComponents.map((entry) =>
        entry.longText === 'Hội An Đông' ? { ...entry, longText: name } : entry),
    });
    assert.equal(resolve(parsed)?.entry?.id, 'vn-hoi-an');
  }
});

test('provider normalization retains typed sublocalities and excludes street and business names', () => {
  const parsed = parseNewLocalizedPlace({ ...details, addressComponents: [
    ...details.addressComponents,
    { longText: 'Hội An', types: ['political', 'sublocality', 'sublocality_level_1'] },
  ] });
  assert.deepEqual(parsed.localityEvidence, [
    { name: 'Hội An Đông', type: 'administrative_area_level_2' },
    { name: 'Đà Nẵng', type: 'administrative_area_level_1' },
    { name: 'Hội An', type: 'sublocality_level_1' },
  ]);
  assert.equal(compactDestinationSearchText('Đà Nẵng'), compactDestinationSearchText('Da Nang'));
});

test('specific locality outranks a containing administrative city even when both bounds match', () => {
  // Synthetic overlapping centers deliberately prevent distance from deciding.
  const parent = { ...hoiAn, id: 'vn-parent', names: { he: 'דה נאנג', en: 'Da Nang' },
    aliases: ['Da Nang'], providerRefs: { googlePlaceId: 'test-parent' } };
  assert.equal(resolve(parseNewLocalizedPlace(details), [parent, hoiAn])?.entry?.id, 'vn-hoi-an');
  const city = { ...hoiAn, id: 'vn-peer', names: { he: 'עיר אחרת', en: 'Other City' },
    aliases: ['Other City'], providerRefs: { googlePlaceId: 'test-peer' } };
  const parsed = parseNewLocalizedPlace(details);
  parsed.localityEvidence.push({ name: 'Other City', type: 'administrative_area_level_2' });
  assert.equal(resolve(parsed, [hoiAn, city])?.ambiguity?.length, 2);
});

test('country, distance and exact provider identity remain authoritative', () => {
  const parsed = parseNewLocalizedPlace(details);
  assert.equal(resolve({ ...parsed, countryCode: 'TH' }), null);
  assert.equal(resolve({ ...parsed, coordinates: { lat: 16.07, lng: 108.22 } }), null);
  assert.equal(resolve({ ...parsed, localityEvidence: [], localityCandidates: [] }), null);
  const exact = { ...hoiAn, id: 'vn-exact', names: { he: 'יעד', en: 'Exact' }, aliases: ['Exact'],
    providerRefs: { googlePlaceId: parsed.placeId } };
  assert.equal(resolve(parsed, [hoiAn, exact])?.entry?.id, 'vn-exact');
});

test('an inactive or exact-only destination cannot be selected by locality evidence', () => {
  const parsed = parseNewLocalizedPlace(details);
  assert.equal(resolve(parsed, [{ ...hoiAn, status: 'inactive' }]), null);
  assert.equal(resolve(parsed, [{ ...hoiAn, kind: 'natural_feature' }]), null);
});

test('an unrecognized Hoi An-looking ward is not accepted through substring matching', () => {
  const parsed = parseNewLocalizedPlace({ ...details, addressComponents: [
    { longText: 'New Hoi An Resort District', types: ['administrative_area_level_2'] },
    { longText: 'Vietnam', shortText: 'VN', types: ['country'] },
  ] });
  assert.equal(resolve(parsed), null);
});
