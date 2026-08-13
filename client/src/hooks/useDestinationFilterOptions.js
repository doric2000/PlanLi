import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { db } from '../config/firebase';
import { searchDestinations } from '../services/DestinationService';
import { compactDestinationText } from '../utils/destinationSearch';

let cachedOptions = null;
let pendingOptions = null;

function catalogItemToOption(data, countryNameFallbacks = {}) {
  const countryId = data?.countryId || '';
  const cityId = data?.cityId || '';
  const names = data?.names || {};
  const countryNames = data?.countryNames || {};
  const name = names.he || names.en || cityId;
  const countryName = countryNames.he || countryNames.en || countryNameFallbacks[countryId] || countryId;
  return {
    key: `city:${countryId}:${cityId}`,
    kind: 'city',
    countryId,
    cityId,
    name,
    names,
    countryName,
    countryNames,
    label: `${name} · ${countryName}`,
    popularity: Number(data?.recommendationCount || 0),
  };
}

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
      const option = catalogItemToOption(data, countryNames);
      const { countryId, popularity } = option;
      popularityByCountry[countryId] = Number(popularityByCountry[countryId] || 0) + popularity;
      return option;
    }).filter((item) => item.countryId && item.cityId);
    const countries = countriesSnapshot.docs.map((document) => {
      const names = document.data()?.names || {};
      const name = names.he || names.en || document.data()?.name || document.id;
      return {
        key: `country:${document.id}`,
        kind: 'country',
        countryId: document.id,
        cityId: '',
        name,
        names,
        countryName: name,
        countryNames: names,
        label: `מדינה · ${name}`,
        popularity: Number(popularityByCountry[document.id] || 0),
      };
    });
    cachedOptions = [...countries, ...cities].sort((a, b) => a.label.localeCompare(b.label, 'he'));
    return cachedOptions;
  }).finally(() => { pendingOptions = null; });
  return pendingOptions;
}

export function useDestinationFilterOptions(enabled = true, searchQuery = '') {
  const [options, setOptions] = useState(cachedOptions || []);
  const [loading, setLoading] = useState(false);
  const [remoteOptions, setRemoteOptions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
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
  useEffect(() => {
    const queryKey = compactDestinationText(searchQuery);
    if (!enabled || queryKey.length < 2) {
      setRemoteOptions([]);
      setSearchLoading(false);
      return undefined;
    }
    let active = true;
    setSearchLoading(true);
    searchDestinations({ query: searchQuery, sort: 'popular', limit: 30 })
      .then((catalog) => {
        if (!active) return;
        setRemoteOptions((catalog?.items || [])
          .map((data) => catalogItemToOption(data))
          .filter((item) => item.countryId && item.cityId));
      })
      .catch((error) => {
        if (active) {
          setRemoteOptions([]);
          console.error('Failed to search destination filter options', error);
        }
      })
      .finally(() => active && setSearchLoading(false));
    return () => { active = false; };
  }, [enabled, searchQuery]);
  const mergedOptions = [...new Map([...options, ...remoteOptions]
    .map((option) => [option.key, option])).values()];
  const popularOptions = [...options].filter((option) => option.kind === 'city')
    .sort((a, b) => b.popularity - a.popularity || a.label.localeCompare(b.label, 'he')).slice(0, 6);
  return {
    options: mergedOptions,
    popularOptions,
    loading: loading || searchLoading,
    searchLoading,
  };
}
