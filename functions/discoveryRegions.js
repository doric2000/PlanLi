const { countries } = require('countries-list');

const DISCOVERY_REGIONS = Object.freeze([
  Object.freeze({ id: 'north_america', label: 'ארה״ב וקנדה' }),
  Object.freeze({ id: 'europe', label: 'אירופה' }),
  Object.freeze({ id: 'israel', label: 'ישראל' }),
  Object.freeze({ id: 'east_southeast_asia', label: 'המזרח הרחוק' }),
  Object.freeze({ id: 'latin_america', label: 'אמריקה הלטינית' }),
  Object.freeze({ id: 'south_central_asia', label: 'דרום ומרכז אסיה' }),
  Object.freeze({ id: 'africa', label: 'אפריקה' }),
  Object.freeze({ id: 'oceania', label: 'אוסטרליה וניו זילנד' }),
]);

const DISCOVERY_REGION_IDS = Object.freeze(DISCOVERY_REGIONS.map(({ id }) => id));
const NORTH_AMERICA = new Set(['BM', 'CA', 'GL', 'PM', 'US']);
const EAST_SOUTHEAST_ASIA = new Set([
  'BN', 'CC', 'CN', 'CX', 'HK', 'ID', 'JP', 'KH', 'KP', 'KR', 'LA',
  'MM', 'MN', 'MO', 'MY', 'PH', 'SG', 'TH', 'TL', 'TW', 'VN',
]);
const AFRICA_EXTRAS = new Set(['BV', 'TF']);
const OCEANIA_EXTRAS = new Set(['AQ', 'HM']);

function normalizeCountryCode(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function isDiscoveryRegionId(value) {
  return DISCOVERY_REGION_IDS.includes(value);
}

function discoveryRegionForCountry(countryCode) {
  const code = normalizeCountryCode(countryCode);
  if (!countries[code]) return null;
  if (code === 'IL') return 'israel';
  if (NORTH_AMERICA.has(code)) return 'north_america';
  if (code === 'RU' || countries[code].continent === 'EU') return 'europe';
  if (EAST_SOUTHEAST_ASIA.has(code)) return 'east_southeast_asia';
  if (countries[code].continent === 'SA' || countries[code].continent === 'NA' || code === 'GS') {
    return 'latin_america';
  }
  if (countries[code].continent === 'AS') return 'south_central_asia';
  if (countries[code].continent === 'AF' || AFRICA_EXTRAS.has(code)) return 'africa';
  if (countries[code].continent === 'OC' || OCEANIA_EXTRAS.has(code)) return 'oceania';
  return null;
}

function cleanDiscoveryRegionId(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!isDiscoveryRegionId(value)) return undefined;
  return value;
}

function routeRegionFields(countryIds = []) {
  const discoveryRegionIds = [];
  countryIds.forEach((countryId) => {
    const regionId = discoveryRegionForCountry(countryId);
    if (regionId && !discoveryRegionIds.includes(regionId)) discoveryRegionIds.push(regionId);
  });
  return {
    discoveryRegionIds,
    discoveryRegionMembership: Object.fromEntries(discoveryRegionIds.map((id) => [id, true])),
  };
}

module.exports = {
  DISCOVERY_REGIONS,
  DISCOVERY_REGION_IDS,
  cleanDiscoveryRegionId,
  discoveryRegionForCountry,
  isDiscoveryRegionId,
  routeRegionFields,
};
