import { useEffect, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';

import { db } from '../config/firebase';
import { searchDestinations } from '../services/DestinationService';
import { compactDestinationText } from '../utils/destinationSearch';
import { useOptionalRegionSelection } from '../features/region/context/RegionSelectionState';
import { isRegionDiscoveryEnabled } from '../features/region/regionDefinitions';

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
    coordinates: data?.coordinates || null,
    viewport: data?.viewport || null,
    popularity: Number(data?.recommendationCount || 0),
  };
}

async function loadDestinationOptions(regionId = null) {
  if (cachedOptions?.regionId === regionId) return cachedOptions.items;
  if (pendingOptions?.regionId === regionId) return pendingOptions.promise;
  let countriesQuery = query(collection(db, 'countries'), where('status', '==', 'active'), limit(100));
  if (regionId) countriesQuery = query(collection(db, 'countries'), where('status', '==', 'active'), where('discoveryRegionId', '==', regionId), limit(100));
  const promise = Promise.all([
    getDocs(countriesQuery),
    searchDestinations({ sort: 'popular', limit: 30, ...(regionId ? { regionId } : {}) }),
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
    const items = [...countries, ...cities].sort((a, b) => a.label.localeCompare(b.label, 'he'));
    cachedOptions = { regionId, items };
    return items;
  }).finally(() => { pendingOptions = null; });
  pendingOptions = { regionId, promise };
  return promise;
}

export function useDestinationFilterOptions(enabled = true, searchQuery = '') {
  const { selectedRegionId } = useOptionalRegionSelection();
  const activeRegionId = isRegionDiscoveryEnabled() ? selectedRegionId : null;
  const [optionsState, setOptionsState] = useState(() => ({
    regionId: activeRegionId,
    items: cachedOptions?.regionId === activeRegionId ? cachedOptions.items : [],
  }));
  const [loading, setLoading] = useState(false);
  const [remoteOptionsState, setRemoteOptionsState] = useState({ regionId: activeRegionId, items: [] });
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searchRetryKey, setSearchRetryKey] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    if (cachedOptions?.regionId === activeRegionId) {
      setOptionsState({ regionId: activeRegionId, items: cachedOptions.items });
      return undefined;
    }
    let active = true;
    setOptionsState({ regionId: activeRegionId, items: [] });
    setLoading(true);
    loadDestinationOptions(activeRegionId).then((next) => {
      if (active) setOptionsState({ regionId: activeRegionId, items: next });
    })
      .catch((error) => console.error('Failed to load destination filter options', error))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [activeRegionId, enabled]);
  useEffect(() => {
    const queryKey = compactDestinationText(searchQuery);
    if (!enabled || queryKey.length < 2) {
      setRemoteOptionsState({ regionId: activeRegionId, items: [] });
      setSearchLoading(false);
      setSearchError('');
      return undefined;
    }
    let active = true;
    setRemoteOptionsState({ regionId: activeRegionId, items: [] });
    setSearchLoading(true);
    setSearchError('');
    searchDestinations({ query: searchQuery, sort: 'popular', limit: 30, ...(activeRegionId ? { regionId: activeRegionId } : {}) })
      .then((catalog) => {
        if (!active) return;
        setRemoteOptionsState({
          regionId: activeRegionId,
          items: (catalog?.items || [])
            .map((data) => catalogItemToOption(data))
            .filter((item) => item.countryId && item.cityId),
        });
      })
      .catch((error) => {
        if (active) {
          setRemoteOptionsState({ regionId: activeRegionId, items: [] });
          setSearchError('לא הצלחנו לחפש יעדים כרגע.');
          console.error('Failed to search destination filter options', error);
        }
      })
      .finally(() => active && setSearchLoading(false));
    return () => { active = false; };
  }, [activeRegionId, enabled, searchQuery, searchRetryKey]);
  const options = optionsState.regionId === activeRegionId ? optionsState.items : [];
  const remoteOptions = remoteOptionsState.regionId === activeRegionId ? remoteOptionsState.items : [];
  const mergedOptions = [...new Map([...options, ...remoteOptions]
    .map((option) => [option.key, option])).values()];
  const popularOptions = [...options].filter((option) => option.kind === 'city')
    .sort((a, b) => b.popularity - a.popularity || a.label.localeCompare(b.label, 'he')).slice(0, 6);
  return {
    options: mergedOptions,
    popularOptions,
    loading: loading || searchLoading,
    searchLoading,
    searchError,
    retrySearch: () => setSearchRetryKey((value) => value + 1),
  };
}
