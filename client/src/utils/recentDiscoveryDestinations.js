import AsyncStorage from '@react-native-async-storage/async-storage';
import { destinationKey } from './progressiveDiscoveryFilters';

const STORAGE_KEY = '@planli/discovery/recent-destinations-v1';
const MAXIMUM_RECENT_DESTINATIONS = 5;

function cleanDestination(destination) {
  if (!destination?.countryId || !destination?.label) return null;
  return {
    countryId: String(destination.countryId),
    cityId: destination.cityId ? String(destination.cityId) : '',
    label: String(destination.label).slice(0, 160),
    ...(destination.name ? { name: String(destination.name).slice(0, 100) } : {}),
    ...(destination.countryName ? { countryName: String(destination.countryName).slice(0, 100) } : {}),
  };
}

export function mergeRecentDiscoveryDestinations(selected, existing) {
  const selectedItems = (Array.isArray(selected) ? selected : [])
    .map(cleanDestination)
    .filter(Boolean);
  const existingItems = (Array.isArray(existing) ? existing : [])
    .map(cleanDestination)
    .filter(Boolean);
  const merged = [...selectedItems.reverse(), ...existingItems];
  const unique = [];
  const seen = new Set();
  for (const entry of merged) {
    const key = destinationKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
    if (unique.length >= MAXIMUM_RECENT_DESTINATIONS) break;
  }
  return unique;
}

export function reconcileRecentDiscoveryDestinations(recent, catalog) {
  const canonical = new Map((Array.isArray(catalog) ? catalog : [])
    .filter((item) => item?.countryId && item?.cityId)
    .map((item) => [destinationKey(item), item]));
  return (Array.isArray(recent) ? recent : []).map(cleanDestination).filter(Boolean)
    .map((item) => {
      const match = canonical.get(destinationKey(item));
      if (!match) return item;
      const name = String(match.name || match.names?.he || match.label || item.name || item.label).slice(0, 100);
      const countryName = String(match.countryName || match.countryNames?.he || item.countryName || '').slice(0, 100);
      return cleanDestination({
        ...item,
        name,
        countryName,
        label: [name, countryName].filter(Boolean).join(' · '),
      });
    });
}

export async function reconcileStoredRecentDiscoveryDestinations(catalog) {
  const current = await loadRecentDiscoveryDestinations();
  const reconciled = reconcileRecentDiscoveryDestinations(current, catalog);
  if (JSON.stringify(reconciled) !== JSON.stringify(current)) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reconciled));
    } catch {
      // Canonical labels still render for this session even if local persistence fails.
    }
  }
  return reconciled;
}

export async function loadRecentDiscoveryDestinations() {
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = value ? JSON.parse(value) : [];
    return (Array.isArray(parsed) ? parsed : []).map(cleanDestination).filter(Boolean)
      .slice(0, MAXIMUM_RECENT_DESTINATIONS);
  } catch {
    return [];
  }
}

export async function rememberDiscoveryDestinations(destinations) {
  const selected = (Array.isArray(destinations) ? destinations : [])
    .map(cleanDestination)
    .filter(Boolean);
  if (!selected.length) return loadRecentDiscoveryDestinations();
  const existing = await loadRecentDiscoveryDestinations();
  const unique = mergeRecentDiscoveryDestinations(selected, existing);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  } catch {
    // Recent destinations are a convenience only; filtering must still work if local storage is unavailable.
  }
  return unique;
}
