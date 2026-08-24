import AsyncStorage from '@react-native-async-storage/async-storage';

export const NOYA_ONBOARDING_VERSION = 2;
const STORAGE_KEY = '@planli/noya-onboarding-v2';
const VISIT_GAP_MS = 30 * 60 * 1000;

let memoryState = null;
const handledAccountIds = new Set();

const EMPTY_STATE = Object.freeze({
  version: NOYA_ONBOARDING_VERSION,
  guestProfile: null,
  guestStatus: '',
  visitCount: 0,
  lastVisitAtMs: 0,
  hasViewedContent: false,
});

function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const current = { ...source };
  delete current.tipsSeen;
  delete current.tipsDisabled;
  return {
    ...EMPTY_STATE,
    ...current,
    version: NOYA_ONBOARDING_VERSION,
  };
}

async function readState() {
  if (memoryState) return memoryState;
  try {
    const serialized = await AsyncStorage.getItem(STORAGE_KEY);
    memoryState = normalizeState(serialized ? JSON.parse(serialized) : null);
  } catch {
    memoryState = normalizeState(null);
  }
  return memoryState;
}

async function writeState(patch) {
  const current = await readState();
  memoryState = normalizeState({ ...current, ...patch });
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memoryState));
  return memoryState;
}

export async function beginNoyaVisit(nowMs = Date.now()) {
  const current = await readState();
  const isNewVisit = nowMs - Number(current.lastVisitAtMs || 0) >= VISIT_GAP_MS;
  if (!isNewVisit) return current;
  return writeState({
    visitCount: Number(current.visitCount || 0) + 1,
    lastVisitAtMs: nowMs,
  });
}

export async function markNoyaContentViewed() {
  const current = await readState();
  if (current.hasViewedContent) return current;
  return writeState({ hasViewedContent: true });
}

export async function shouldInviteGuestToNoya() {
  const current = await readState();
  return current.guestStatus !== 'completed'
    && current.guestStatus !== 'dismissed'
    && (current.hasViewedContent || Number(current.visitCount || 0) >= 2);
}

export async function loadGuestNoyaProfile() {
  const current = await readState();
  return current.guestProfile && typeof current.guestProfile === 'object'
    ? current.guestProfile
    : null;
}

export async function saveGuestNoyaProfile(profile) {
  return writeState({
    guestProfile: {
      interests: Array.isArray(profile?.interests) ? profile.interests : [],
      budget: profile?.budget || '',
      travelParties: Array.isArray(profile?.travelParties) ? profile.travelParties : [],
      needs: Array.isArray(profile?.needs) ? profile.needs : [],
      onboardingVersion: NOYA_ONBOARDING_VERSION,
      completedAt: new Date().toISOString(),
    },
    guestStatus: 'completed',
  });
}

export async function dismissGuestNoya() {
  return writeState({ guestStatus: 'dismissed' });
}

export async function clearGuestNoyaProfile() {
  return writeState({ guestProfile: null, guestStatus: '' });
}

export function markNoyaAccountHandled(uid) {
  if (uid) handledAccountIds.add(uid);
}

export function wasNoyaAccountHandled(uid) {
  return Boolean(uid && handledAccountIds.has(uid));
}

export async function resetNoyaExperience() {
  return writeState({
    guestStatus: '',
    hasViewedContent: false,
  });
}

export function __resetNoyaStorageForTests() {
  memoryState = null;
  handledAccountIds.clear();
}
