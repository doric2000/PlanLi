import { useEffect, useState } from 'react';
import { collection, collectionGroup, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

let cachedOptions = null;
let pendingOptions = null;

async function loadDestinationOptions() {
  if (cachedOptions) return cachedOptions;
  if (pendingOptions) return pendingOptions;
  pendingOptions = Promise.all([
    getDocs(query(collection(db, 'countries'), where('status', '==', 'active'), limit(100))),
    getDocs(query(collectionGroup(db, 'cities'), where('status', '==', 'active'), limit(500))),
  ]).then(([countriesSnapshot, citiesSnapshot]) => {
    const countryNames = Object.fromEntries(countriesSnapshot.docs.map((document) => [
      document.id,
      document.data()?.name || document.id,
    ]));
    const popularityByCountry = {};
    const cities = citiesSnapshot.docs.map((document) => {
      const countryId = document.ref.parent.parent?.id || '';
      const data = document.data() || {};
      const popularity = Number(data?.stats?.recommendationCount || 0);
      popularityByCountry[countryId] = Number(popularityByCountry[countryId] || 0) + popularity;
      return {
        key: `city:${countryId}:${document.id}`,
        kind: 'city',
        countryId,
        cityId: document.id,
        name: data.name || document.id,
        countryName: countryNames[countryId] || data.countryName || countryId,
        label: `${data.name || document.id} · ${countryNames[countryId] || data.countryName || countryId}`,
        popularity,
      };
    }).filter((item) => item.countryId);
    const countries = countriesSnapshot.docs.map((document) => ({
      key: `country:${document.id}`,
      kind: 'country',
      countryId: document.id,
      cityId: '',
      name: document.data()?.name || document.id,
      countryName: document.data()?.name || document.id,
      label: `מדינה · ${document.data()?.name || document.id}`,
      popularity: Number(popularityByCountry[document.id] || 0),
    }));
    cachedOptions = [...countries, ...cities].sort((a, b) => a.label.localeCompare(b.label, 'he'));
    return cachedOptions;
  }).finally(() => {
    pendingOptions = null;
  });
  return pendingOptions;
}

export function useDestinationFilterOptions(enabled = true) {
  const [options, setOptions] = useState(cachedOptions || []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || cachedOptions) {
      if (cachedOptions && options !== cachedOptions) setOptions(cachedOptions);
      return undefined;
    }
    let active = true;
    setLoading(true);
    loadDestinationOptions().then((next) => {
      if (active) setOptions(next);
    }).catch((error) => {
      console.error('Failed to load destination filter options', error);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [enabled]);

  const popularOptions = [...options]
    .filter((option) => option.kind === 'city')
    .sort((a, b) => b.popularity - a.popularity || a.label.localeCompare(b.label, 'he'))
    .slice(0, 6);
  return { options, popularOptions, loading };
}
