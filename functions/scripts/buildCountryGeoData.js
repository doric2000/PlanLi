const fs = require('node:fs/promises');
const path = require('node:path');

const NATURAL_EARTH_VERSION = '5.1.1';
const NATURAL_EARTH_BASE_URL =
  `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v${NATURAL_EARTH_VERSION}/geojson`;
const OUTPUT_PATH = path.join(
  __dirname,
  '..',
  'geo',
  `countryBoundaries.v${NATURAL_EARTH_VERSION}.json`
);

const COUNTRY_URL =
  `${NATURAL_EARTH_BASE_URL}/ne_110m_admin_0_countries.geojson`;
const TINY_COUNTRY_URL =
  `${NATURAL_EARTH_BASE_URL}/ne_110m_admin_0_tiny_countries.geojson`;
const DISPUTED_AREAS_URL =
  `${NATURAL_EARTH_BASE_URL}/ne_10m_admin_0_disputed_areas.geojson`;

const SPECIAL_COUNTRY_CODES = {
  'Northern Cyprus': 'CY',
  Somaliland: 'SO',
};
const SPECIAL_COUNTRY_NAMES_HE = {
  'Northern Cyprus': 'קפריסין',
  Somaliland: 'סומליה',
};

const ISRAEL_POLICY_AREAS = new Set([
  'West Bank',
  'East Jerusalem',
  'Golan Heights',
  'Mount Scopus',
  "No Man's Land (Jerusalem)",
  "No Man's Land (Fort Latrun)",
]);

function isCountryCode(value) {
  return /^[A-Z]{2}$/.test(String(value || ''));
}

function resolveCountryCode(properties = {}) {
  const direct = [
    properties.ISO_A2_EH,
    properties.ISO_A2,
    properties.WB_A2,
  ].find(isCountryCode);
  return direct || SPECIAL_COUNTRY_CODES[properties.ADMIN] || null;
}

async function fetchGeoJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

function compactCountryFeature(feature) {
  const code = resolveCountryCode(feature.properties);
  if (!code) {
    throw new Error(
      `Natural Earth country has no supported ISO code: ${feature.properties?.ADMIN}`
    );
  }
  return {
    code,
    nameHe:
      SPECIAL_COUNTRY_NAMES_HE[feature.properties?.ADMIN] ||
      feature.properties?.NAME_HE ||
      feature.properties?.NAME ||
      feature.properties?.ADMIN ||
      code,
    geometry: feature.geometry,
  };
}

function compactTinyCountry(feature) {
  const code = resolveCountryCode(feature.properties);
  if (!code) {
    throw new Error(
      `Natural Earth tiny country has no supported ISO code: ${feature.properties?.ADMIN}`
    );
  }
  if (feature.geometry?.type !== 'Point') {
    throw new Error(`Tiny country ${code} is not represented by a Point.`);
  }
  return {
    code,
    nameHe:
      feature.properties?.NAME_HE ||
      feature.properties?.NAME ||
      feature.properties?.ADMIN ||
      code,
    coordinates: feature.geometry.coordinates,
  };
}

async function main() {
  const [countries, tinyCountries, disputedAreas] = await Promise.all([
    fetchGeoJson(COUNTRY_URL),
    fetchGeoJson(TINY_COUNTRY_URL),
    fetchGeoJson(DISPUTED_AREAS_URL),
  ]);

  const countryFeatures = countries.features.map(compactCountryFeature);
  const tinyCountryPoints = tinyCountries.features.map(compactTinyCountry);
  const israelPolicyFeatures = disputedAreas.features
    .filter((feature) => ISRAEL_POLICY_AREAS.has(feature.properties?.NAME))
    .map((feature) => ({
      name: feature.properties.NAME,
      geometry: feature.geometry,
    }));

  const foundPolicyAreas = new Set(
    israelPolicyFeatures.map((feature) => feature.name)
  );
  const missingPolicyAreas = [...ISRAEL_POLICY_AREAS].filter(
    (name) => !foundPolicyAreas.has(name)
  );
  if (missingPolicyAreas.length > 0) {
    throw new Error(
      `Natural Earth is missing Israel policy areas: ${missingPolicyAreas.join(', ')}`
    );
  }

  const payload = {
    source: 'Natural Earth',
    version: NATURAL_EARTH_VERSION,
    generatedFrom: {
      countries: COUNTRY_URL,
      tinyCountries: TINY_COUNTRY_URL,
      disputedAreas: DISPUTED_AREAS_URL,
    },
    countries: countryFeatures,
    tinyCountries: tinyCountryPoints,
    israelPolicyAreas: israelPolicyFeatures,
  };

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log('Country geography data generated.', {
    output: OUTPUT_PATH,
    countries: countryFeatures.length,
    tinyCountries: tinyCountryPoints.length,
    israelPolicyAreas: israelPolicyFeatures.length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
