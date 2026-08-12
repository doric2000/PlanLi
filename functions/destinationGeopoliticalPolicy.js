const { normalize } = require('./destinationIdentityService');

// Independent, reviewed geopolitical registry. It never infers a disputed
// assignment from Google coordinates. Place IDs are permanent identities;
// localized names keep known destinations stable while provider text changes.
const ISRAEL_OVERRIDES = Object.freeze({
  placeIds: new Set([
    'ChIJ6_6XBwsnHRURrbo12csDrug', // Ariel
  ]),
  names: new Set([
    'ariel', "ari'el", 'אריאל',
    "ma'ale adumim", 'maale adumim',
    "modi'in illit", 'modiin illit',
    'beitar illit', 'beit aryeh-ofarim', 'beit aryeh',
    "givat ze'ev", 'givat zeev',
    'efrat', 'alfei menashe', 'karnei shomron', 'kedumim',
    'kiryat arba', 'oranit', 'elkana', 'har adar',
    "ma'ale efrayim", 'maale efrayim', 'immanuel',
    'geva binyamin', 'adam', 'kokhav yaakov', 'shaarei tikva',
    'east jerusalem', 'מזרח ירושלים',
    'golan heights', 'רמת הגולן',
  ].map(normalize)),
});

const PALESTINIAN_DESTINATIONS = Object.freeze({
  placeIds: new Set([
    'ChIJ0Vgt2kzVAhURdiyLzBdNbb8', // Ramallah
    'ChIJZydUTgV__RQRkmMEE8mN-X8', // Gaza
  ]),
  names: new Set([
    'ramallah', 'رام الله', 'רמאללה',
    'gaza', 'غزة', 'עזה',
  ].map(normalize)),
});

function resolveDestinationCountryPolicy({ placeId, names = {} } = {}) {
  const normalizedPlaceId = String(placeId || '').trim();
  const normalizedNames = [names.he, names.en].map(normalize).filter(Boolean);
  if (ISRAEL_OVERRIDES.placeIds.has(normalizedPlaceId) ||
      normalizedNames.some((name) => ISRAEL_OVERRIDES.names.has(name))) {
    return { countryCode: 'IL', resolutionSource: 'independent-policy-registry' };
  }
  if (PALESTINIAN_DESTINATIONS.placeIds.has(normalizedPlaceId) ||
      normalizedNames.some((name) => PALESTINIAN_DESTINATIONS.names.has(name))) {
    return { countryCode: 'PS', resolutionSource: 'independent-policy-registry' };
  }
  return null;
}

module.exports = {
  ISRAEL_OVERRIDES,
  PALESTINIAN_DESTINATIONS,
  resolveDestinationCountryPolicy,
};
