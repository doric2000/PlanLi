import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFavorites } from './useFavorites';

export function favoriteCityPreviewIsCurrent(favorite, now = Date.now()) {
  const expiresAt = favorite?.preview?.cacheExpiresAt;
  const expiresAtMs = typeof expiresAt?.toMillis === 'function'
    ? expiresAt.toMillis()
    : expiresAt instanceof Date
      ? expiresAt.getTime()
    : Date.parse(expiresAt || '');
  return Number.isFinite(expiresAtMs) && expiresAtMs > now;
}

let countryNameCache = null;
let countryNameLoadPromise = null;

function getCountryNameFromCache(countryId) {
  return countryNameCache?.[countryId];
}

function isCountryCode(value) {
  return typeof value === 'string' && /^[A-Z]{2}$/i.test(value.trim());
}

async function loadCountryNames() {
  if (countryNameCache) return countryNameCache;
  if (countryNameLoadPromise) return countryNameLoadPromise;
  const { collection, getDocs } = await import('firebase/firestore');
  const { db } = await import('../config/firebase');

  countryNameLoadPromise = getDocs(collection(db, 'countries'))
    .then((snapshot) => {
      countryNameCache = Object.fromEntries(snapshot.docs.map((entry) => [
        entry.id,
        entry.data()?.names?.he || entry.data()?.name || entry.id,
      ]));
      return countryNameCache;
    })
    .catch((error) => {
      console.error('Failed to load country names for favorites', error);
      countryNameCache = {};
      return countryNameCache;
    })
    .finally(() => {
      countryNameLoadPromise = null;
    });

  return countryNameLoadPromise;
}

export function useFavoriteCityIds({ enabled = true } = {}) {
  const result = useFavorites('city', { enabled });
  const [countryNames, setCountryNames] = useState(countryNameCache || {});

  const needsCountryNames = useMemo(() => result.favorites.some((favorite) => (
    favorite?.target?.countryId
      && !getCountryNameFromCache(favorite.target.countryId)
      && (!favorite.preview?.countryName || isCountryCode(favorite.preview?.countryName))
  )), [result.favorites]);

  useEffect(() => {
    if (!enabled || !needsCountryNames || countryNameCache) {
      return undefined;
    }
    let active = true;
    loadCountryNames()
      .then((loaded) => { if (active) setCountryNames(loaded); })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [enabled, needsCountryNames]);

  const now = Date.now();
  const favorites = result.favorites.filter((favorite) =>
    favoriteCityPreviewIsCurrent(favorite, now)
  ).map((favorite) => ({
    id: favorite.target.id,
    countryId: favorite.target.countryId,
    name: favorite.preview?.title || '',
    countryName:
      countryNames[favorite.target.countryId]
      || (!isCountryCode(favorite.preview?.countryName) ? favorite.preview?.countryName : '')
      || favorite.preview?.subtitle
      || '',
    imageUrl: favorite.preview?.thumbUrl || null,
    destinationImage: favorite.preview?.destinationImage || null,
    placeholderColor: favorite.preview?.placeholderColor,
    travelers: favorite.preview?.metrics?.travelers ?? 0,
    favoriteKey: favorite.favoriteKey,
  }));
  const favoriteKeys = useMemo(
    () => new Set(favorites.map((favorite) => `${favorite.countryId}:${favorite.id}`)),
    [favorites]
  );
  const toggleFavorite = useCallback(async (city) => {
    if (!city?.id || !city?.countryId) return;
    const { setFavorite } = await import('../services/SocialService');
    const target = { type: 'city', id: city.id, countryId: city.countryId };
    await setFavorite(target, !favoriteKeys.has(`${city.countryId}:${city.id}`));
  }, [favoriteKeys]);
  return {
    favorites,
    ids: favorites.map((favorite) => favorite.id),
    loading: result.loading,
    status: result.status,
    error: result.error,
    lastServerSyncAt: result.lastServerSyncAt,
    reload: result.reload,
    toggleFavorite,
  };
}
