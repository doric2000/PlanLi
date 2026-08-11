import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { db } from '../config/firebase';
import { searchDestinations } from '../services/DestinationService';

let cachedOptions = null;
let pendingOptions = null;

async function loadDestinationOptions() {
  if (cachedOptions) return cachedOptions;
  if (pendingOptions) return pendingOptions;
  pendingOptions = Promise.all([
    getDocs(query(collection(db, 'countries'), where('status', '==', 'active'), limit(100))),
    searchDestinations({ sort: 'popular', limit: 30 }),
  ]).then(([countriesSnapshot, catalog]) => {
    const countryNames = Object.fromEntries(countriesSnapshot.docs.map((document) => [
      document.id,
      document.data()?.names?.he || document.data()?.name || document.id,
    ]));
    const popularityByCountry = {};
    const cities = (catalog?.items || []).map((data) => {
      const countryId = data.countryId || '';
      const popularity = Number(data?.recommendationCount || 0);
      popularityByCountry[countryId] = Number(popularityByCountry[countryId] || 0) + popularity;
      const name = data.names?.he || data.cityId;
      const countryName = data.countryNames?.he || countryNames[countryId] || countryId;
      return {
        key: `city:${countryId}:${data.cityId}`,
        kind: 'city',
        countryId,
        cityId: data.cityId,
        name,
        countryName,
        label: `${name} · ${countryName}`,
        popularity,
      };
    }).filter((item) => item.countryId && item.cityId);
    const countries = countriesSnapshot.docs.map((document) => {
      const name = document.data()?.names?.he || document.data()?.name || document.id;
      return {
        key: `country:${document.id}`,
        kind: 'country',
        countryId: document.id,
        cityId: '',
        name,
        countryName: name,
        label: `מדינה · ${name}`,
        popularity: Number(popularityByCountry[document.id] || 0),
      };
    });
    cachedOptions = [...countries, ...cities].sort((a, b) => a.label.localeCompare(b.label, 'he'));
    return cachedOptions;
  }).finally(() => { pendingOptions = null; });
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
    loadDestinationOptions().then((next) => active && setOptions(next))
      .catch((error) => console.error('Failed to load destination filter options', error))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [enabled]);
  const popularOptions = [...options].filter((option) => option.kind === 'city')
    .sort((a, b) => b.popularity - a.popularity || a.label.localeCompare(b.label, 'he')).slice(0, 6);
  return { options, popularOptions, loading };
}
