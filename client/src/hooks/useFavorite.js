import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import * as Crypto from 'expo-crypto';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { setFavorite } from '../services/SocialService';
import { getUserTier } from '../utils/userTier';
import { getFavoriteErrorAlert } from '../utils/favoriteErrors';

const TYPE_ALIASES = {
  recommendations: 'recommendation',
  recommendation: 'recommendation',
  routes: 'route',
  route: 'route',
  trips: 'trip',
  trip: 'trip',
  cities: 'city',
  city: 'city',
};

const toBase64Url = (value) => value
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

export const buildFavoriteTarget = (type, id, countryId) => {
  const normalizedType = TYPE_ALIASES[String(type || '').toLowerCase()];
  if (!normalizedType || !id) return null;
  if (normalizedType === 'city' && !countryId) return null;
  return {
    type: normalizedType,
    id,
    ...(normalizedType === 'city' ? { countryId } : {}),
  };
};

export const favoriteTargetPath = (target) => {
  if (!target) return null;
  return target.type === 'city'
    ? `countries/${target.countryId}/cities/${target.id}`
    : `${target.type === 'recommendation' ? 'recommendations' : `${target.type}s`}/${target.id}`;
};

export async function buildFavoriteKey(target) {
  const path = favoriteTargetPath(target);
  if (!path) return null;
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    path,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );
  return toBase64Url(digest);
}

export function useFavorite(type, id, snapshotData = {}) {
  const user = auth.currentUser;
  const target = useMemo(
    () => buildFavoriteTarget(type, id, snapshotData?.countryId),
    [type, id, snapshotData?.countryId]
  );
  const [favoriteKey, setFavoriteKey] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    setFavoriteKey(null);
    if (!target) return () => { active = false; };
    buildFavoriteKey(target).then((key) => {
      if (active) setFavoriteKey(key);
    }).catch((error) => console.error('Failed to build favorite key:', error));
    return () => { active = false; };
  }, [target]);

  useEffect(() => {
    if (!user || !favoriteKey) {
      setIsFavorite(false);
      return undefined;
    }
    return onSnapshot(
      doc(db, 'users', user.uid, 'favorites', favoriteKey),
      (snapshot) => setIsFavorite(snapshot.exists()),
      (error) => {
        console.error('Error checking favorite status:', error);
        setIsFavorite(false);
      }
    );
  }, [user, favoriteKey]);

  const toggleFavorite = useCallback(async () => {
    if (!user) {
      Alert.alert('שגיאה', 'יש להתחבר כדי לשמור למועדפים.');
      return;
    }
    if (getUserTier(user) !== 'verified') {
      Alert.alert('נדרש אימות', 'כדי לשמור למועדפים צריך לאמת את האימייל.');
      return;
    }
    if (!target || !favoriteKey) {
      Alert.alert('שגיאה', 'לא ניתן לזהות את הפריט שנבחר.');
      return;
    }

    const nextSaved = !isFavorite;
    setLoading(true);
    setIsFavorite(nextSaved);
    try {
      await setFavorite(target, nextSaved);
    } catch (error) {
      setIsFavorite(!nextSaved);
      console.error('Error toggling favorite:', error);
      const alert = getFavoriteErrorAlert(error, nextSaved ? 'add' : 'remove');
      Alert.alert(alert.title, alert.message);
    } finally {
      setLoading(false);
    }
  }, [favoriteKey, isFavorite, target, user]);

  return { isFavorite, toggleFavorite, loading };
}
