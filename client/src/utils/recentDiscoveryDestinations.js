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
  };
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
  const selected = (Array.isArray(destinations) ? destinations : []).map(cleanDestination).filter(Boolean);
  if (!selected.length) return;
  const existing = await loadRecentDiscoveryDestinations();
  const merged = [...selected.reverse(), ...existing];
  const unique = Array.from(new Map(merged.map((entry) => [destinationKey(entry), entry])).values())
    .slice(0, MAXIMUM_RECENT_DESTINATIONS);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
  } catch {
    // Recent destinations are a convenience only; filtering must still work if local storage is unavailable.
  }
}
