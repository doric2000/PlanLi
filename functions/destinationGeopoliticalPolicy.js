const { normalize } = require('./destinationIdentityService');

// This is deliberately an independent, reviewed registry. It does not infer a
// country from Google coordinates. Add a place ID when one is confirmed; names
// keep known localities stable while a Place ID is being collected.
const ISRAEL_OVERRIDES = Object.freeze({
  placeIds: new Set(),
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

function resolveDestinationCountryPolicy({ placeId, names = {} } = {}) {
  const normalizedNames = [names.he, names.en]
    .map(normalize)
    .filter(Boolean);
  if (ISRAEL_OVERRIDES.placeIds.has(String(placeId || '').trim()) ||
      normalizedNames.some((name) => ISRAEL_OVERRIDES.names.has(name))) {
    return { countryCode: 'IL', resolutionSource: 'independent-policy-registry' };
  }
  return null;
}

module.exports = { ISRAEL_OVERRIDES, resolveDestinationCountryPolicy };
