import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOYA_PRODUCT_TOUR_VERSION = 2;
export const NOYA_PRODUCT_TOUR_STORAGE_KEY = '@planli/noya-product-tour-v2';
export const NOYA_PRODUCT_TOUR_LEGACY_STORAGE_KEY = '@planli/noya-product-tour-v1';

export const NOYA_TOUR_IDS = Object.freeze({
  main: 'mainTour',
  recommendation: 'recommendationGuide',
  route: 'routeGuide',
});

export const NOYA_TOUR_STATUSES = Object.freeze({
  unseen: 'unseen',
  active: 'active',
  completed: 'completed',
  dismissed: 'dismissed',
});

const VALID_STATUSES = new Set(Object.values(NOYA_TOUR_STATUSES));
const EMPTY_PROGRESS = Object.freeze({
  status: NOYA_TOUR_STATUSES.unseen,
  stepIndex: 0,
});

const EMPTY_STATE = Object.freeze({
  version: NOYA_PRODUCT_TOUR_VERSION,
  [NOYA_TOUR_IDS.main]: EMPTY_PROGRESS,
  [NOYA_TOUR_IDS.recommendation]: EMPTY_PROGRESS,
  [NOYA_TOUR_IDS.route]: EMPTY_PROGRESS,
});

let memoryState = null;

function normalizeProgress(value) {
  const stepIndex = Number(value?.stepIndex);
  return {
    status: VALID_STATUSES.has(value?.status) ? value.status : NOYA_TOUR_STATUSES.unseen,
    stepIndex: Number.isSafeInteger(stepIndex) && stepIndex >= 0 ? stepIndex : 0,
  };
}

function parseStoredState(serialized) {
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

export function normalizeNoyaProductTourState(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    version: NOYA_PRODUCT_TOUR_VERSION,
    [NOYA_TOUR_IDS.main]: normalizeProgress(source[NOYA_TOUR_IDS.main]),
    [NOYA_TOUR_IDS.recommendation]: normalizeProgress(source[NOYA_TOUR_IDS.recommendation]),
    [NOYA_TOUR_IDS.route]: normalizeProgress(source[NOYA_TOUR_IDS.route]),
  };
}

function migrateLegacyState(value) {
  return normalizeNoyaProductTourState({
    [NOYA_TOUR_IDS.main]: EMPTY_PROGRESS,
    [NOYA_TOUR_IDS.recommendation]: value?.[NOYA_TOUR_IDS.recommendation],
    [NOYA_TOUR_IDS.route]: value?.[NOYA_TOUR_IDS.route],
  });
}

export async function loadNoyaProductTourState() {
  if (memoryState) return memoryState;
  try {
    const serialized = await AsyncStorage.getItem(NOYA_PRODUCT_TOUR_STORAGE_KEY);
    const stored = parseStoredState(serialized);
    if (stored) {
      memoryState = normalizeNoyaProductTourState(stored);
      return memoryState;
    }

    const legacySerialized = await AsyncStorage.getItem(NOYA_PRODUCT_TOUR_LEGACY_STORAGE_KEY);
    const legacy = parseStoredState(legacySerialized);
    if (legacy) {
      memoryState = migrateLegacyState(legacy);
      try {
        await AsyncStorage.setItem(NOYA_PRODUCT_TOUR_STORAGE_KEY, JSON.stringify(memoryState));
      } catch {}
      return memoryState;
    }
  } catch {}

  memoryState = normalizeNoyaProductTourState(null);
  return memoryState;
}

export async function saveNoyaProductTourProgress(tourId, progress) {
  if (!Object.values(NOYA_TOUR_IDS).includes(tourId)) {
    throw new Error(`Unknown Noya tour: ${tourId}`);
  }
  const current = await loadNoyaProductTourState();
  memoryState = normalizeNoyaProductTourState({
    ...current,
    [tourId]: {
      ...current[tourId],
      ...progress,
    },
  });
  await AsyncStorage.setItem(NOYA_PRODUCT_TOUR_STORAGE_KEY, JSON.stringify(memoryState));
  return memoryState;
}

export async function resetMainNoyaProductTour() {
  return saveNoyaProductTourProgress(NOYA_TOUR_IDS.main, EMPTY_PROGRESS);
}

export function emptyNoyaProductTourState() {
  return normalizeNoyaProductTourState(EMPTY_STATE);
}

export function __resetNoyaProductTourStorageForTests() {
  memoryState = null;
}
