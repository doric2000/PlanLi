export const REGION_SELECTION_STORAGE_KEY = '@planli/discovery/region-selection-v1';
export const REGION_SELECTION_SCHEMA_VERSION = 2;

export const REGION_SELECTOR_SOURCE_SIZE = Object.freeze({
  width: 853,
  height: 1844,
});

export const REGION_SELECTOR_REFERENCE = require('../../../assets/regions/region-selector-reference-clean.png');

export const REGIONS = Object.freeze([
  Object.freeze({
    id: 'north_america',
    label: 'ארה״ב וקנדה',
    image: require('../../../assets/regions/region-north-america.png'),
    selectionOutline: require('../../../assets/regions/region-north-america-selection-outline.png'),
    selectionOutlinePadding: 8,
    crop: Object.freeze({ x: 20, y: 315, width: 372, height: 549 }),
  }),
  Object.freeze({
    id: 'europe',
    label: 'אירופה',
    image: require('../../../assets/regions/region-europe.png'),
    selectionOutline: require('../../../assets/regions/region-europe-selection-outline.png'),
    selectionOutlinePadding: 8,
    crop: Object.freeze({ x: 374, y: 304, width: 418, height: 376 }),
  }),
  Object.freeze({
    id: 'israel',
    label: 'ישראל',
    image: require('../../../assets/regions/region-israel.png'),
    selectionOutline: require('../../../assets/regions/region-israel-selection-outline.png'),
    selectionOutlinePadding: 8,
    crop: Object.freeze({ x: 296, y: 674, width: 190, height: 354 }),
    zIndex: 3,
  }),
  Object.freeze({
    id: 'east_southeast_asia',
    label: 'המזרח הרחוק',
    image: require('../../../assets/regions/region-far-east.png'),
    selectionOutline: require('../../../assets/regions/region-far-east-selection-outline.png'),
    selectionOutlinePadding: 8,
    crop: Object.freeze({ x: 506, y: 590, width: 347, height: 407 }),
    zIndex: 2,
  }),
  Object.freeze({
    id: 'latin_america',
    label: 'אמריקה הלטינית',
    image: require('../../../assets/regions/region-latin-america.png'),
    selectionOutline: require('../../../assets/regions/region-latin-america-selection-outline.png'),
    selectionOutlinePadding: 8,
    crop: Object.freeze({ x: 4, y: 854, width: 318, height: 581 }),
  }),
  Object.freeze({
    id: 'south_central_asia',
    label: 'דרום ומרכז אסיה',
    image: require('../../../assets/regions/region-south-central-asia.png'),
    selectionOutline: require('../../../assets/regions/region-south-central-asia-selection-outline.png'),
    selectionOutlinePadding: 8,
    crop: Object.freeze({ x: 371, y: 878, width: 482, height: 442 }),
    zIndex: 1,
  }),
  Object.freeze({
    id: 'africa',
    label: 'אפריקה',
    image: require('../../../assets/regions/region-africa.png'),
    selectionOutline: require('../../../assets/regions/region-africa-selection-outline.png'),
    selectionOutlinePadding: 8,
    crop: Object.freeze({ x: 152, y: 1174, width: 396, height: 520 }),
  }),
  Object.freeze({
    id: 'oceania',
    label: 'אוסטרליה וניו זילנד',
    image: require('../../../assets/regions/region-oceania.png'),
    selectionOutline: require('../../../assets/regions/region-oceania-selection-outline.png'),
    selectionOutlinePadding: 8,
    crop: Object.freeze({ x: 506, y: 1274, width: 347, height: 475 }),
  }),
]);

export const REGION_IDS = Object.freeze(REGIONS.map((region) => region.id));

export function isSupportedRegionId(regionId) {
  return REGION_IDS.includes(regionId);
}

export function getRegionById(regionId) {
  return REGIONS.find((region) => region.id === regionId) || null;
}

export function isRegionSelectorPreviewEnabled() {
  return process.env.EXPO_PUBLIC_REGION_SELECTOR_PREVIEW === 'true';
}

export function isRegionDiscoveryEnabled() {
  return process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED === 'true';
}
