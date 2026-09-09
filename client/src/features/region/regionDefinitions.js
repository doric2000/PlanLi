import atlasRegions from './atlasRegions.json';

export const REGION_SELECTION_STORAGE_KEY = '@planli/discovery/region-selection-v1';
export const REGION_SELECTION_SCHEMA_VERSION = 3;
export const REGIONS = Object.freeze(atlasRegions.map(({ id, label }) => Object.freeze({ id, label })));

export const REGION_IDS = Object.freeze(REGIONS.map((region) => region.id));

export function isSupportedRegionId(regionId) {
  return REGION_IDS.includes(regionId);
}

export function getRegionById(regionId) {
  return REGIONS.find((region) => region.id === regionId) || null;
}

// A global preference is a browsing scope, never a geographic region ID.
export function normalizeDiscoveryScope(value) {
  if (value?.mode === 'global' && value.regionId == null) return { mode: 'global', regionId: null };
  if ((value?.mode == null || value.mode === 'region') && isSupportedRegionId(value?.regionId)) {
    return { mode: 'region', regionId: value.regionId };
  }
  return { mode: null, regionId: null };
}

export function getDiscoveryScopeLabel({ mode, regionId } = {}) {
  return mode === 'global' ? 'כל העולם' : getRegionById(regionId)?.label || '';
}

export function isRegionSelectorPreviewEnabled() {
  return process.env.EXPO_PUBLIC_REGION_SELECTOR_PREVIEW === 'true';
}

export function isRegionDiscoveryEnabled() {
  return process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED === 'true';
}
