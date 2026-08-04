import { useEffect, useState } from 'react';
import { collection, collectionGroup, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';

export function useDestinationFilterOptions(enabled = true) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || options.length) return undefined;
    let active = true;
    setLoading(true);
    Promise.all([
      getDocs(query(collection(db, 'countries'), where('status', '==', 'active'), limit(100))),
      getDocs(query(collectionGroup(db, 'cities'), where('status', '==', 'active'), limit(500))),
    ]).then(([countriesSnapshot, citiesSnapshot]) => {
      if (!active) return;
      const countries = countriesSnapshot.docs.map((document) => ({
        key: `country:${document.id}`,
        countryId: document.id,
        cityId: '',
        label: `מדינה · ${document.data()?.name || document.id}`,
      }));
      const countryNames = Object.fromEntries(countriesSnapshot.docs.map((document) => [
        document.id,
        document.data()?.name || document.id,
      ]));
      const cities = citiesSnapshot.docs.map((document) => {
        const countryId = document.ref.parent.parent?.id || '';
        return {
          key: `city:${countryId}:${document.id}`,
          countryId,
          cityId: document.id,
          label: `${document.data()?.name || document.id} · ${countryNames[countryId] || countryId}`,
        };
      }).filter((item) => item.countryId);
      setOptions([...countries, ...cities].sort((a, b) => a.label.localeCompare(b.label, 'he')));
    }).catch((error) => {
      console.error('Failed to load destination filter options', error);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [enabled, options.length]);

  return { options, loading };
}
