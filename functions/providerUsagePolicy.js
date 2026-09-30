'use strict';

// Shared account free allowances, verified 2026-09-30, not request ceilings.
const SKU_ALLOWANCES = Object.freeze({
  autocomplete: 10000,
  detailsEssentials: 10000,
  detailsPro: 5000,
  detailsAtmosphere: 1000,
  geocoding: 10000,
  routesEssentials: 10000,
  routesPro: 5000,
});
// Reviewed launch maxima. Monetary validation also runs in the allocation tool;
// a paid request ceiling must never be inferred from the free allowance alone.
const SKU_LIMIT_CEILINGS = Object.freeze({
  autocomplete: 10850, detailsEssentials: 9000, detailsPro: 4500,
  detailsAtmosphere: 1040, geocoding: 9000, routesEssentials: 9000, routesPro: 4500,
});
const POLICY_VERSION = 1;
const COLLECTION = 'system/runtime/providerUsage';
const TIME_ZONE = 'America/Los_Angeles';

function billingMonth(now = Date.now()) {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid billing time.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]));
  const year = Number(parts.year), month = Number(parts.month);
  const midnight = (y, m) => {
    const utcMidnight = Date.UTC(y, m, 1);
    let instant = utcMidnight + 8 * 3600000;
    // Resolve the offset AT midnight, not at noon after a DST transition.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const zone = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE, timeZoneName: 'shortOffset',
      }).formatToParts(instant).find((part) => part.type === 'timeZoneName').value;
      const offsetHours = Number(zone.replace('GMT', ''));
      instant = utcMidnight - offsetHours * 3600000;
    }
    return new Date(instant).toISOString();
  };
  return { period: `${parts.year}-${parts.month}`, startsAt: midnight(year, month - 1), resetsAt: midnight(year, month) };
}

function header(options, key) {
  if (options.headers?.get) return options.headers.get(key) || '';
  const entry = Object.entries(options.headers || {}).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return entry ? String(entry[1]) : '';
}

function classifyProviderRequest(input, options = {}) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Unreviewed provider origin.');
  const method = options.method || 'GET';
  const mask = header(options, 'X-Goog-FieldMask').split(',').map((s) => s.trim()).filter(Boolean);
  const onlyFields = (fields) => mask.length > 0 && mask.every((field) => fields.includes(field));
  if (url.hostname === 'places.googleapis.com') {
    if (url.pathname === '/v1/places:autocomplete' && method === 'POST') {
      // Count abandoned, invalid, and completed sessions alike. Never rely on a
      // future session discount to admit a request today.
      return ['autocomplete'];
    }
    if (/^\/v1\/places\/[^/]+$/.test(url.pathname) && method === 'GET') {
      const essentials = ['id', 'addressComponents', 'formattedAddress', 'location', 'viewport', 'types', 'movedPlaceId', 'addressDescriptor'];
      const pro = ['displayName', 'containingPlaces'];
      if (!onlyFields([...essentials, ...pro])) throw new Error('Unreviewed Places fields.');
      if (!mask.some((field) => pro.includes(field))) return ['detailsEssentials'];
      // A Pro request terminating a valid autocomplete session is Atmosphere;
      // a reused/invalid token can instead bill Pro. Reserve BOTH possible SKUs.
      return url.searchParams.has('sessionToken') ? ['detailsPro', 'detailsAtmosphere'] : ['detailsPro'];
    }
  }
  if (url.hostname === 'geocode.googleapis.com' && /^\/v4\/geocode\/location\/[^/]+$/.test(url.pathname) && method === 'GET'
    && onlyFields(['results.placeId', 'results.addressComponents', 'results.types', 'results.location'])) return ['geocoding'];
  if (url.hostname === 'routes.googleapis.com' && url.pathname === '/directions/v2:computeRoutes' && method === 'POST'
    && onlyFields(['routes.distanceMeters', 'routes.duration', 'routes.polyline.encodedPolyline'])) {
    const body = JSON.parse(options.body);
    if (!['DRIVE', 'WALK', 'BICYCLE'].includes(body.travelMode)
      || (body.routingPreference && body.routingPreference !== 'TRAFFIC_UNAWARE')
      || Object.keys(body).some((key) => !['origin', 'destination', 'intermediates', 'travelMode', 'routingPreference',
        'polylineQuality', 'polylineEncoding', 'languageCode', 'units'].includes(key))
      || !Array.isArray(body.intermediates || [])
      || [body.origin, body.destination, ...(body.intermediates || [])].some((point) => !point?.location?.latLng
        || Object.keys(point).some((key) => key !== 'location')
        || Object.keys(point.location).some((key) => key !== 'latLng')
        || Object.keys(point.location.latLng).some((key) => !['latitude', 'longitude'].includes(key)))) {
      throw new Error('Unreviewed Routes options.');
    }
    return [(body.intermediates || []).length > 10 ? 'routesPro' : 'routesEssentials'];
  }
  throw new Error('Unreviewed provider endpoint.');
}

function validUsageRecord(value, { sku, period, projectId }) {
  return value?.schemaVersion === POLICY_VERSION && value.projectId === projectId && value.sku === sku && value.period === period
    && /^[a-f0-9]{64}$/.test(value.approvalSha256 || '')
    && Number.isSafeInteger(value.limit) && value.limit >= 0 && value.limit <= SKU_LIMIT_CEILINGS[sku]
    && Number.isSafeInteger(value.baselineUsed) && value.baselineUsed >= 0
    && Number.isSafeInteger(value.reserved) && value.reserved >= 0
    && Number.isSafeInteger(value.baselineUsed + value.reserved);
}

module.exports = { SKU_ALLOWANCES, SKU_LIMIT_CEILINGS, POLICY_VERSION, COLLECTION, TIME_ZONE, billingMonth, classifyProviderRequest, validUsageRecord };
