import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';

import { mapProfileInterestsToNoya } from '../utils/preferenceSetup';

export const GUEST_PERSONALIZATION_STORAGE_KEY = '@planli/guest-personalization-v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = 90 * DAY_MS;
const MAX_EVENTS = 100;
const MAX_SCORE = 20;

let memoryState = null;
let stateOperationQueue = Promise.resolve();

const EMPTY_STATE = Object.freeze({ events: [], mergeId: '', inFlight: null });

function targetPath(target) {
  if (!target?.id || !['recommendation', 'route'].includes(target.type)) return '';
  return `${target.type === 'route' ? 'routes' : 'recommendations'}/${target.id}`;
}

function destinationsFromItem(item = {}) {
  const values = [item.destination, ...(Array.isArray(item.destinations) ? item.destinations : [])];
  return Array.from(new Map(values.filter((entry) => entry?.countryId && entry?.cityId).map((entry) => [
    `${entry.countryId}:${entry.cityId}`,
    { countryId: entry.countryId, cityId: entry.cityId },
  ])).values()).slice(0, 5);
}

function normalizeEvents(events, nowMs = Date.now()) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => (
      event?.id
      && targetPath(event.target)
      && ['meaningful_view', 'less', 'undo_less'].includes(event.action)
      && nowMs - Number(event.createdAtMs || 0) <= MAX_AGE_MS
    ))
    .slice(-MAX_EVENTS);
}

function normalizeInFlight(value, nowMs = Date.now()) {
  if (!value || typeof value !== 'object' || typeof value.mergeId !== 'string' || !value.mergeId) {
    return null;
  }
  const events = normalizeEvents(value.events, nowMs);
  return events.length ? { mergeId: value.mergeId, events } : null;
}

function normalizeState(value, nowMs = Date.now()) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...EMPTY_STATE,
    ...source,
    events: normalizeEvents(source.events, nowMs),
    mergeId: typeof source.mergeId === 'string' ? source.mergeId : '',
    inFlight: normalizeInFlight(source.inFlight, nowMs),
  };
}

function allStateEvents(state, nowMs = Date.now()) {
  return normalizeEvents([
    ...(state?.inFlight?.events || []),
    ...(state?.events || []),
  ], nowMs);
}

function withStateLock(operation) {
  const result = stateOperationQueue.then(operation, operation);
  stateOperationQueue = result.catch(() => {});
  return result;
}

async function readState() {
  if (memoryState) return memoryState;
  try {
    const serialized = await AsyncStorage.getItem(GUEST_PERSONALIZATION_STORAGE_KEY);
    const parsed = serialized ? JSON.parse(serialized) : null;
    memoryState = normalizeState(parsed);
  } catch {
    memoryState = { ...EMPTY_STATE };
  }
  return memoryState;
}

async function writeState(next) {
  memoryState = normalizeState(next);
  await AsyncStorage.setItem(GUEST_PERSONALIZATION_STORAGE_KEY, JSON.stringify(memoryState));
  return memoryState;
}

function snapshotForItem(item = {}) {
  return {
    interestIds: mapProfileInterestsToNoya(item?.facets?.interests || []),
    destinations: destinationsFromItem(item),
  };
}

export async function recordGuestPersonalizationEvent({ action, target, item, nowMs = Date.now() }) {
  const path = targetPath(target);
  if (!path || !['meaningful_view', 'less', 'undo_less'].includes(action)) return { recorded: false };
  return withStateLock(async () => {
    const current = await readState();
    if (action === 'meaningful_view') {
      const recent = allStateEvents(current, nowMs).find((event) => (
        event.action === 'meaningful_view'
        && targetPath(event.target) === path
        && nowMs - Number(event.createdAtMs || 0) < DAY_MS
      ));
      if (recent) return { recorded: false };
    }
    const event = {
      id: randomUUID(),
      action,
      target: { type: target.type, id: target.id },
      createdAtMs: nowMs,
      ...snapshotForItem(item),
    };
    await writeState({
      ...current,
      events: [...current.events, event],
      mergeId: current.mergeId || randomUUID(),
    });
    return { recorded: true, event };
  });
}

function adjust(map, key, delta) {
  if (!key) return;
  const next = Math.min(MAX_SCORE, Math.max(0, Number(map[key] || 0) + delta));
  const rounded = Number(next.toFixed(4));
  if (rounded < 0.01) delete map[key];
  else map[key] = rounded;
}

export async function loadGuestBehaviorContext(nowMs = Date.now()) {
  await stateOperationQueue;
  const state = await readState();
  const facetScores = {};
  const negativeFacetScores = {};
  const facetEvidence = {};
  const destinations = new Map();
  const suppressed = new Set();
  const events = allStateEvents(state, nowMs);
  for (const event of events) {
    const ageFactor = Math.pow(0.5, Math.max(0, nowMs - event.createdAtMs) / MAX_AGE_MS);
    const positiveDelta = event.action === 'meaningful_view' ? ageFactor : 0;
    const negativeDelta = event.action === 'less' ? 5 * ageFactor : event.action === 'undo_less' ? -5 * ageFactor : 0;
    for (const interestId of event.interestIds || []) {
      if (positiveDelta) adjust(facetScores, interestId, positiveDelta);
      if (negativeDelta) adjust(negativeFacetScores, interestId, negativeDelta);
      const evidence = facetEvidence[interestId] || {
        meaningfulViews: 0, likes: 0, favorites: 0, less: 0,
        lastAction: '', lastActionAtMs: 0,
      };
      if (event.action === 'meaningful_view') evidence.meaningfulViews += 1;
      if (event.action === 'less') evidence.less += 1;
      if (event.action === 'undo_less') evidence.less = Math.max(0, evidence.less - 1);
      evidence.lastAction = event.action;
      evidence.lastActionAtMs = event.createdAtMs;
      facetEvidence[interestId] = evidence;
    }
    for (const destination of event.destinations || []) {
      const key = `${destination.countryId}:${destination.cityId}`;
      const value = destinations.get(key) || { ...destination, score: 0, negativeScore: 0 };
      if (positiveDelta) value.score = Math.min(MAX_SCORE, value.score + positiveDelta);
      if (negativeDelta) value.negativeScore = Math.min(MAX_SCORE, Math.max(0, value.negativeScore + negativeDelta));
      destinations.set(key, value);
    }
    const path = targetPath(event.target);
    if (event.action === 'less') suppressed.add(path);
    if (event.action === 'undo_less') suppressed.delete(path);
  }
  if (!events.length) return null;
  return {
    facetScores: { interests: facetScores },
    negativeFacetScores: { interests: negativeFacetScores },
    facetEvidence: { interests: facetEvidence },
    destinations: [...destinations.values()].slice(0, 20),
    suppressedPaths: [...suppressed].slice(0, 300),
  };
}

export async function loadPendingGuestPersonalizationMerge() {
  return withStateLock(async () => {
    const state = await readState();
    let batch = state.inFlight;
    if (!batch && state.events.length) {
      batch = { mergeId: state.mergeId || randomUUID(), events: state.events };
      await writeState({ ...state, events: [], mergeId: '', inFlight: batch });
    }
    if (!batch) return null;
    return {
      mergeId: batch.mergeId,
      events: batch.events.map(({ id, action, target, createdAtMs }) => ({ id, action, target, createdAtMs })),
    };
  });
}

export async function clearGuestPersonalizationAfterMerge(mergeId) {
  return withStateLock(async () => {
    const state = await readState();
    if (state.inFlight?.mergeId !== mergeId) return false;
    await writeState({ ...state, inFlight: null });
    return true;
  });
}

export async function resetGuestPersonalization() {
  await withStateLock(() => writeState({ ...EMPTY_STATE }));
}

export function __resetGuestPersonalizationStorageForTests() {
  memoryState = null;
  stateOperationQueue = Promise.resolve();
}
