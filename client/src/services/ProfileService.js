import { doc, getDocFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, cloudFunctions, db } from '../config/firebase';
import {
  PRIVACY_VERSION,
  PROFILE_DETAILS_VERSION,
  TERMS_VERSION,
} from '../constants/authPolicy';
import { TRAVEL_TAXONOMY_VERSION } from '../constants/travelTaxonomy';
import {
  normalizeProfileBio,
  validateProfileBio,
} from '../features/profile/utils/profileBio';
import {
  addDiagnosticBreadcrumb,
  captureDiagnosticException,
} from './ErrorReporting';

let updateProfileCallable;
let registerUserCallable;
let completeAccountSetupCallable;

const PROFILE_ARRAY_FIELDS = ['interests', 'travelParties', 'vibe', 'needs'];
const PROFILE_SCALAR_FIELDS = ['budget'];
const PROFILE_UPDATE_FIELDS = ['displayName', 'bio', 'smartProfile', 'completeSmartProfile', 'photoMedia'];

async function runProfileOperation(operation, callback) {
  const startedAt = Date.now();
  addDiagnosticBreadcrumb({
    category: 'callable',
    message: 'Profile operation started',
    data: { operation, outcome: 'started' },
  });
  try {
    const result = await callback();
    addDiagnosticBreadcrumb({
      category: 'callable',
      message: 'Profile operation completed',
      data: { operation, outcome: 'success', durationMs: Date.now() - startedAt },
    });
    return result;
  } catch (error) {
    addDiagnosticBreadcrumb({
      category: 'callable',
      message: 'Profile operation failed',
      level: 'error',
      data: {
        operation,
        outcome: 'error',
        code: error?.code || 'unknown',
        reason: error?.details?.reason || 'unknown',
        durationMs: Date.now() - startedAt,
      },
    });
    captureDiagnosticException(error, { operation, code: error?.code || 'unknown' });
    throw error;
  }
}

const sortedUnique = (values) => Array.from(new Set(Array.isArray(values) ? values : [])).sort();

export function formatProfileUpdateError(error, fallback = 'לא הצלחנו לעדכן את הפרופיל.') {
  const reason = error?.details?.reason;
  if (reason === 'EMAIL_VERIFICATION_REQUIRED') {
    return 'כדי לשנות את השם צריך לאמת קודם את כתובת האימייל.';
  }
  if (reason === 'DISPLAY_NAME_CHANGE_ALREADY_USED') {
    return 'כבר השתמשת באפשרות שינוי השם החד־פעמית.';
  }
  if (reason === 'ACCOUNT_SETUP_REQUIRED') {
    return 'צריך להשלים קודם את פרטי החשבון.';
  }
  return fallback;
}

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

export function verifyPersistedAccountSetup(userDocument) {
  return Boolean(
    userDocument?.onboarding?.profileDetailsVersion === PROFILE_DETAILS_VERSION
    && userDocument?.onboarding?.profileDetailsCompletedAt
    && userDocument?.legal?.termsVersion === TERMS_VERSION
    && userDocument?.legal?.privacyVersion === PRIVACY_VERSION
    && userDocument?.legal?.acceptedAt
  );
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
) => runProfileOperation('update_profile', async () => {
  updateProfileCallable ||= httpsCallable(cloudFunctions, 'updateProfile');
  const payload = Object.fromEntries(
    PROFILE_UPDATE_FIELDS
      .filter((field) => field === 'completeSmartProfile'
        ? completeSmartProfile !== undefined
        : Object.prototype.hasOwnProperty.call(fields || {}, field))
      .map((field) => [field, field === 'completeSmartProfile' ? completeSmartProfile : fields[field]])
  );
  if (Object.prototype.hasOwnProperty.call(fields || {}, 'bio')) {
    const bio = normalizeProfileBio(fields.bio);
    const error = validateProfileBio(fields.bio);
    if (error) throw new Error(error);
    payload.bio = bio;
  }
  if (fields?.smartProfile && Object.prototype.hasOwnProperty.call(fields.smartProfile, 'budget')) {
    payload.taxonomyVersion = TRAVEL_TAXONOMY_VERSION;
  }
  let response;
  try {
    response = await updateProfileCallable(payload);
  } catch (error) {
    if (/unsupported field|שדה שאינו נתמך/i.test(String(error?.message || ''))) {
      const translated = new Error('שירות הפרופיל אינו מעודכן לעדכון Bio. יש לפרוס את Functions החדשים ולנסות שוב.');
      translated.code = error?.code || 'functions/invalid-argument';
      throw translated;
    }
    throw error;
  }
  if (!fields?.smartProfile || !verifySmartProfile) return response.data;
  const smartProfile = await readBackSmartProfile(fields.smartProfile, {
    complete: completeSmartProfile,
  });
  return { ...(response.data || {}), smartProfile };
});

export const registerUserDocument = async (fields = {}) => runProfileOperation('register_user', async () => {
  registerUserCallable ||= httpsCallable(cloudFunctions, 'registerUser');
  const response = await registerUserCallable(fields);
  return response.data;
});

export const completeAccountSetup = async ({ displayName, acceptedLegal }) => runProfileOperation(
  'complete_account_setup',
  async () => {
  completeAccountSetupCallable ||= httpsCallable(cloudFunctions, 'completeAccountSetup');
  const response = await completeAccountSetupCallable({ displayName, acceptedLegal });
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('לא נמצא משתמש מחובר. התחברו מחדש ונסו שוב.');
  const snapshot = await getDocFromServer(doc(db, 'users', uid));
  if (!verifyPersistedAccountSetup(snapshot.data())) {
    const error = new Error('שירות החשבון אינו מעודכן לגרסאות ההסכמה הנוכחיות.');
    error.code = 'profile/account-setup-persistence-mismatch';
    throw error;
  }
  await auth.currentUser?.reload?.();
  return response.data;
  }
);
