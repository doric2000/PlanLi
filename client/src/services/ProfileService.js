import { doc, getDocFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, cloudFunctions, db } from '../config/firebase';

let updateProfileCallable;
let registerUserCallable;

const PROFILE_ARRAY_FIELDS = ['interests', 'travelParties', 'vibe', 'needs'];
const PROFILE_SCALAR_FIELDS = ['budget'];

const sortedUnique = (values) => Array.from(new Set(Array.isArray(values) ? values : [])).sort();

export function verifyPersistedSmartProfile(requested, persisted, { complete = false } = {}) {
  if (!persisted || typeof persisted !== 'object') return false;
  for (const field of PROFILE_ARRAY_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(requested, field)) continue;
    if (JSON.stringify(sortedUnique(requested[field])) !== JSON.stringify(sortedUnique(persisted[field]))) {
      return false;
    }
  }
  for (const field of PROFILE_SCALAR_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(requested, field)) continue;
    if ((requested[field] || '') !== (persisted[field] || '')) return false;
  }
  if (complete) {
    if (persisted.setupRequired === true || !persisted.completedAt) return false;
    if (!Array.isArray(persisted.interests) || persisted.interests.length < 3) return false;
    if (!persisted.budget) return false;
    if (!Array.isArray(persisted.travelParties) || persisted.travelParties.length < 1) return false;
  }
  return true;
}

async function readBackSmartProfile(requested, { complete }) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('לא נמצא משתמש מחובר. התחברו מחדש ונסו שוב.');
  const snapshot = await getDocFromServer(doc(db, 'users', uid));
  const persisted = snapshot.data()?.smartProfile;
  if (!verifyPersistedSmartProfile(requested, persisted, { complete })) {
    const error = new Error('השרת לא שמר את כל ההעדפות. נסו שוב לאחר עדכון השירות.');
    error.code = 'profile/persistence-mismatch';
    throw error;
  }
  return persisted;
}

export const saveProfile = async (
  fields,
  { completeSmartProfile = false, verifySmartProfile = true } = {}
) => {
  updateProfileCallable ||= httpsCallable(cloudFunctions, 'updateProfile');
  const response = await updateProfileCallable({ ...fields, completeSmartProfile });
  if (!fields?.smartProfile || !verifySmartProfile) return response.data;
  const smartProfile = await readBackSmartProfile(fields.smartProfile, {
    complete: completeSmartProfile,
  });
  return { ...(response.data || {}), smartProfile };
};

export const registerUserDocument = async (fields = {}) => {
  registerUserCallable ||= httpsCallable(cloudFunctions, 'registerUser');
  const response = await registerUserCallable(fields);
  return response.data;
};
