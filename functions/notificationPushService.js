const { createHash, randomBytes } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const PUSH_SCHEMA_VERSION = 1;
const NOTIFICATION_STATE_SCHEMA_VERSION = 2;
const PLANLI_EAS_PROJECT_ID = '04731493-708f-4c82-b417-6ea815ea912e';
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;
const DISPATCH_LEASE_MS = 5 * 60 * 1000;
const RECEIPT_SEND_LEASE_MS = 5 * 60 * 1000;
const DISPATCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SEND_ATTEMPTS = 3;
const MAX_OUTCOME_PERSIST_ATTEMPTS = 3;
const MAX_RECEIPT_DELIVERY_ATTEMPTS = 3;
const MAX_DISPATCH_ATTEMPTS = 8;
const MAX_ACTIVE_DEVICES_PER_USER = 5;
const MAX_DEVICE_REGISTRATIONS_PER_WINDOW = 10;
const DEVICE_REGISTRATION_WINDOW_MS = 60 * 60 * 1000;

const PUSH_CATEGORIES = Object.freeze({
  LIKES: 'likes',
  COMMENTS: 'comments',
  SYSTEM: 'system',
  ADMIN_REPORTS: 'adminReports',
  ADMIN_DESTINATIONS: 'adminDestinations',
});
const PUSH_CATEGORY_VALUES = Object.freeze(Object.values(PUSH_CATEGORIES));
const NOTIFICATION_INBOX_CHANNELS = Object.freeze({
  PERSONAL: 'personal',
  ADMIN: 'admin',
});
const NOTIFICATION_INBOX_CHANNEL_VALUES = Object.freeze(
  Object.values(NOTIFICATION_INBOX_CHANNELS)
);

const DEFAULT_PUSH_PREFERENCES = Object.freeze({
  pushEnabled: false,
  likes: true,
  comments: true,
  system: true,
  adminReports: true,
  adminDestinations: true,
});
const PUSH_PREFERENCE_FIELDS = Object.freeze(Object.keys(DEFAULT_PUSH_PREFERENCES));

const CHANNEL_CONFIG = Object.freeze({
  [PUSH_CATEGORIES.LIKES]: Object.freeze({
    androidChannelId: 'planli-likes',
    title: 'פעילות חדשה ב-PlanLi',
    body: 'מישהו אהב תוכן שפרסמת.',
  }),
  [PUSH_CATEGORIES.COMMENTS]: Object.freeze({
    androidChannelId: 'planli-comments',
    title: 'תגובה חדשה ב-PlanLi',
    body: 'נוספה תגובה חדשה לתוכן שפרסמת.',
  }),
  [PUSH_CATEGORIES.SYSTEM]: Object.freeze({
    androidChannelId: 'planli-system',
    title: 'עדכון חדש מ-PlanLi',
    body: 'יש לך עדכון חדש באפליקציה.',
  }),
  [PUSH_CATEGORIES.ADMIN_REPORTS]: Object.freeze({
    androidChannelId: 'planli-admin-reports',
    title: 'עדכון ניהול חדש',
    body: 'ממתין לך עדכון חדש בדיווחי הניהול.',
  }),
  [PUSH_CATEGORIES.ADMIN_DESTINATIONS]: Object.freeze({
    androidChannelId: 'planli-admin-destinations',
    title: 'עדכון ניהול חדש',
    body: 'ממתין לך עדכון חדש בניהול היעדים.',
  }),
});

const EXPO_TOKEN_PATTERN = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/;
const EXPO_UUID_TOKEN_PATTERN = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
const RETRYABLE_RECEIPT_ERRORS = new Set([
  'MessageRateExceeded',
  'ProviderError',
  'ExpoError',
]);

function fail(code, message, reason) {
  throw new HttpsError(code, message, { reason });
}

function assertSignedIn(auth) {
  if (!auth?.uid) fail('unauthenticated', 'Authentication is required.', 'SIGN_IN_REQUIRED');
  return auth.uid;
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function isExpoPushToken(token) {
  return typeof token === 'string'
    && token.length <= 512
    && (EXPO_TOKEN_PATTERN.test(token) || EXPO_UUID_TOKEN_PATTERN.test(token));
}

function cleanToken(token) {
  const value = typeof token === 'string' ? token.trim() : '';
  if (!isExpoPushToken(value)) {
    fail('invalid-argument', 'A valid Expo push token is required.', 'INVALID_PUSH_TOKEN');
  }
  return value;
}

function cleanPlatform(platform) {
  if (platform !== 'ios' && platform !== 'android') {
    fail('invalid-argument', 'platform must be ios or android.', 'INVALID_PUSH_PLATFORM');
  }
  return platform;
}

function cleanTimeZone(timeZone) {
  const value = typeof timeZone === 'string' ? timeZone.trim() : '';
  if (!value || value.length > 80) return 'UTC';
  try {
    Intl.DateTimeFormat('en', { timeZone: value }).format();
    return value;
  } catch (_error) {
    return 'UTC';
  }
}

function cleanOptionalVersion(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9._+-]{1,40}$/.test(trimmed) ? trimmed : null;
}

function cleanId(value, field) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 180
    || value.trim().length < 1
    || value.includes('/')
    || /[\u0000-\u001F\u007F]/u.test(value)
  ) {
    throw new Error(`${field} is invalid.`);
  }
  return value;
}

function cleanDispatchVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000_000) {
    throw new Error('push.version is invalid.');
  }
  return value;
}

function cleanDispatchGeneration(value) {
  if (value === undefined || value === null || value === '') return null;
  return cleanId(value, 'notification.generation');
}

function cleanPushCategory(value) {
  if (!PUSH_CATEGORY_VALUES.includes(value)) throw new Error('Push category is invalid.');
  return value;
}

function cleanInboxChannel(value) {
  if (!NOTIFICATION_INBOX_CHANNEL_VALUES.includes(value)) {
    throw new Error('Notification channel is invalid.');
  }
  return value;
}

function derivePushCategory(notificationData) {
  const channel = notificationData?.channel;
  const type = notificationData?.type;
  const subtype = notificationData?.subtype;
  if (channel === NOTIFICATION_INBOX_CHANNELS.PERSONAL) {
    if (type === 'like') return PUSH_CATEGORIES.LIKES;
    if (type === 'comment') return PUSH_CATEGORIES.COMMENTS;
    if (type === 'system') return PUSH_CATEGORIES.SYSTEM;
    return null;
  }
  if (channel === NOTIFICATION_INBOX_CHANNELS.ADMIN && type === 'moderation') {
    return subtype === 'destination_review_discovered'
      ? PUSH_CATEGORIES.ADMIN_DESTINATIONS
      : PUSH_CATEGORIES.ADMIN_REPORTS;
  }
  return null;
}

function sanitizePushPreferencePatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return PUSH_PREFERENCE_FIELDS.reduce((result, field) => {
    if (typeof value[field] === 'boolean') result[field] = value[field];
    return result;
  }, {});
}

function normalizePushPreferences(value) {
  return {
    ...DEFAULT_PUSH_PREFERENCES,
    ...sanitizePushPreferencePatch(value),
  };
}

function serverTimestamp(admin) {
  return admin.firestore.FieldValue.serverTimestamp();
}

function millis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}

function dateFrom(now, offsetMs) {
  const base = now instanceof Date ? now.getTime() : Number(now);
  return new Date(base + offsetMs);
}

function deviceDocumentId(token) {
  return sha256(token);
}

function notificationStateRef(db, uid) {
  return db.doc(`users/${uid}/notificationState/state`);
}

function notificationDeviceRef(db, token) {
  return db.doc(`notificationDevices/${deviceDocumentId(token)}`);
}

function assertDeviceRegistrationUserEligible(snapshot) {
  const user = snapshot?.exists ? snapshot.data() || {} : null;
  if (
    !user
    || ['suspended', 'deleting'].includes(user.moderation?.status)
    || user.status === 'deleting'
  ) {
    fail(
      'failed-precondition',
      'This account cannot register notification devices.',
      'PUSH_ACCOUNT_INELIGIBLE'
    );
  }
}

function dispatchDocumentId(uid, notificationId, version, generation = null) {
  return sha256(`${uid}:${notificationId}:${generation || 'stable'}:${version}`);
}

function dispatchRef(db, dispatchId) {
  return db.doc(`system/runtime/notificationPushDispatches/${dispatchId}`);
}

function receiptRef(db, receiptId) {
  return db.doc(`system/runtime/notificationPushReceipts/${sha256(receiptId)}`);
}

async function registerNotificationDevice({ admin, auth, data, now = new Date() }) {
  const uid = assertSignedIn(auth);
  const token = cleanToken(data?.token);
  const platform = cleanPlatform(data?.platform);
  if (data?.schemaVersion !== PUSH_SCHEMA_VERSION) {
    fail('failed-precondition', 'Unsupported push schema version.', 'PUSH_SCHEMA_OUTDATED');
  }
  if (data?.projectId !== PLANLI_EAS_PROJECT_ID) {
    fail(
      'failed-precondition',
      'The push token belongs to a different Expo project.',
      'PUSH_PROJECT_MISMATCH'
    );
  }
  const db = admin.firestore();
  const ref = notificationDeviceRef(db, token);
  const userRef = db.doc(`users/${uid}`);
  const stateRef = notificationStateRef(db, uid);
  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    assertDeviceRegistrationUserEligible(userSnapshot);
    const snapshot = await transaction.get(ref);
    const previous = snapshot.exists ? snapshot.data() : null;
    const consumesDeviceSlot = previous?.uid !== uid || previous?.enabled === false;
    let registrationRate = null;
    if (consumesDeviceSlot) {
      const stateSnapshot = await transaction.get(stateRef);
      const previousRate = stateSnapshot.exists
        ? stateSnapshot.data()?.deviceRegistrationRate || {}
        : {};
      const windowStartedAtMs = millis(previousRate.windowStartedAt);
      const nowMs = now.getTime();
      const withinCurrentWindow = windowStartedAtMs > 0
        && windowStartedAtMs <= nowMs
        && nowMs - windowStartedAtMs < DEVICE_REGISTRATION_WINDOW_MS;
      const registrations = withinCurrentWindow
        ? Math.max(0, Math.trunc(Number(previousRate.registrations) || 0))
        : 0;
      if (registrations >= MAX_DEVICE_REGISTRATIONS_PER_WINDOW) {
        fail(
          'resource-exhausted',
          'Too many notification devices were registered recently.',
          'PUSH_DEVICE_REGISTRATION_RATE_LIMITED'
        );
      }
      const activeDevices = await transaction.get(
        db.collection('notificationDevices')
          .where('uid', '==', uid)
          .where('enabled', '==', true)
          .limit(MAX_ACTIVE_DEVICES_PER_USER)
      );
      if (activeDevices.size >= MAX_ACTIVE_DEVICES_PER_USER) {
        fail(
          'resource-exhausted',
          'The active notification device limit has been reached.',
          'PUSH_DEVICE_LIMIT_REACHED'
        );
      }
      registrationRate = {
        windowStartedAt: withinCurrentWindow ? previousRate.windowStartedAt : now,
        registrations: registrations + 1,
        lastRegisteredAt: serverTimestamp(admin),
      };
    }
    const timestamp = serverTimestamp(admin);
    if (registrationRate) {
      transaction.set(stateRef, {
        schemaVersion: NOTIFICATION_STATE_SCHEMA_VERSION,
        deviceRegistrationRate: registrationRate,
        updatedAt: timestamp,
      }, { merge: true });
    }
    transaction.set(ref, {
      uid,
      token,
      tokenHash: ref.id,
      provider: 'expo',
      platform,
      timeZone: cleanTimeZone(data?.timeZone),
      projectId: PLANLI_EAS_PROJECT_ID,
      appVersion: cleanOptionalVersion(data?.appVersion),
      schemaVersion: PUSH_SCHEMA_VERSION,
      enabled: true,
      disabledAt: null,
      disabledReason: null,
      registeredAt: timestamp,
      updatedAt: timestamp,
      ...(!snapshot.exists ? { createdAt: timestamp } : {}),
      ...(previous?.uid !== uid ? { assignedAt: timestamp } : {}),
    }, { merge: true });
  });
  return { registered: true };
}

async function unregisterNotificationDevice({ admin, auth, data }) {
  const uid = assertSignedIn(auth);
  const token = cleanToken(data?.token);
  const db = admin.firestore();
  const ref = notificationDeviceRef(db, token);
  let removed = false;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.uid !== uid) return;
    transaction.delete(ref);
    removed = true;
  });
  return { unregistered: removed };
}

async function getPushPreferences({ admin, auth }) {
  const uid = assertSignedIn(auth);
  const snapshot = await notificationStateRef(admin.firestore(), uid).get();
  return {
    preferences: normalizePushPreferences(snapshot.exists ? snapshot.data()?.pushPreferences : null),
  };
}

async function updateNotificationPreferences({ admin, auth, data }) {
  const uid = assertSignedIn(auth);
  const patch = sanitizePushPreferencePatch(data?.preferences);
  if (!Object.keys(patch).length) {
    fail('invalid-argument', 'At least one push preference is required.', 'INVALID_PUSH_PREFERENCES');
  }
  const ref = notificationStateRef(admin.firestore(), uid);
  const userRef = admin.firestore().doc(`users/${uid}`);
  let preferences;
  await admin.firestore().runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    assertDeviceRegistrationUserEligible(userSnapshot);
    const snapshot = await transaction.get(ref);
    preferences = {
      ...normalizePushPreferences(snapshot.exists ? snapshot.data()?.pushPreferences : null),
      ...patch,
    };
    transaction.set(ref, {
      schemaVersion: NOTIFICATION_STATE_SCHEMA_VERSION,
      pushPreferences: preferences,
      pushPreferencesUpdatedAt: serverTimestamp(admin),
    }, { merge: true });
  });
  return { preferences };
}

function buildExpoMessage({
  token,
  notificationId,
  channel,
  category,
  version,
  subtype = null,
  milestone = null,
}) {
  cleanToken(token);
  cleanId(notificationId, 'notificationId');
  cleanDispatchVersion(version);
  const inboxChannel = cleanInboxChannel(channel);
  const pushCategory = cleanPushCategory(category);
  if (
    (inboxChannel === NOTIFICATION_INBOX_CHANNELS.ADMIN)
    !== [PUSH_CATEGORIES.ADMIN_REPORTS, PUSH_CATEGORIES.ADMIN_DESTINATIONS]
      .includes(pushCategory)
  ) {
    throw new Error('Push category does not match the notification channel.');
  }
  const config = CHANNEL_CONFIG[pushCategory];
  const reply = pushCategory === PUSH_CATEGORIES.COMMENTS && subtype === 'new_reply';
  const likeMilestone = pushCategory === PUSH_CATEGORIES.LIKES && subtype === 'like_milestone';
  const safeMilestone = Math.max(1, Math.trunc(Number(milestone) || 1));
  return {
    to: token,
    title: likeMilestone
      ? 'אבן דרך חדשה ב-PlanLi'
      : (reply ? 'תשובה חדשה ב-PlanLi' : config.title),
    body: likeMilestone
      ? `התוכן שלך הגיע ל-${safeMilestone} לייקים.`
      : (reply ? 'מישהו השיב לתגובה שלך.' : config.body),
    sound: 'default',
    priority: 'high',
    channelId: config.androidChannelId,
    threadId: inboxChannel,
    data: { notificationId, channel: inboxChannel },
  };
}

function safeErrorCode(error) {
  const status = Number(error?.statusCode || error?.status);
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'PROVIDER_UNAVAILABLE';
  if (typeof error?.code === 'string' && error.code.length <= 60) return error.code;
  return 'PUSH_SEND_FAILED';
}

function retryableTransportError(error) {
  const status = Number(error?.statusCode || error?.status);
  if (status === 429 || status >= 500) return true;
  return ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']
    .includes(error?.code);
}

function retryableDispatchError(error) {
  return retryableTransportError(error) || [
    'aborted',
    'deadline-exceeded',
    'internal',
    'resource-exhausted',
    'unavailable',
    'unknown',
  ].includes(error?.code);
}

function retryableTicket(ticket) {
  return ticket?.status === 'error'
    && RETRYABLE_RECEIPT_ERRORS.has(ticket?.details?.error);
}

function backoffMs(attempt, baseMs = 500, maxMs = 15 * 60 * 1000) {
  return Math.min(maxMs, baseMs * (2 ** Math.max(0, attempt - 1)));
}

const defaultSleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs));

async function sendChunkWithRetry(expoClient, messages, {
  maxAttempts = MAX_SEND_ATTEMPTS,
  sleep = defaultSleep,
  baseDelayMs = 500,
} = {}) {
  const results = new Array(messages.length);
  let pending = messages.map((message, index) => ({ message, index }));
  let attempt = 0;
  while (pending.length && attempt < maxAttempts) {
    attempt += 1;
    let tickets;
    try {
      tickets = await expoClient.sendPushNotificationsAsync(
        pending.map((entry) => entry.message)
      );
    } catch (error) {
      if (!retryableTransportError(error) || attempt >= maxAttempts) throw error;
      await sleep(backoffMs(attempt, baseDelayMs));
      continue;
    }
    const retry = [];
    pending.forEach((entry, index) => {
      const ticket = tickets[index] || {
        status: 'error',
        message: 'Missing push ticket.',
        details: { error: 'ExpoError' },
      };
      if (retryableTicket(ticket) && attempt < maxAttempts) retry.push(entry);
      else results[entry.index] = ticket;
    });
    pending = retry;
    if (pending.length) await sleep(backoffMs(attempt, baseDelayMs));
  }
  pending.forEach((entry) => {
    results[entry.index] = {
      status: 'error',
      message: 'Push retry limit reached.',
      details: { error: 'MessageRateExceeded' },
    };
  });
  return results;
}

async function sendMessagesWithRetry(expoClient, messages, options = {}) {
  const chunks = typeof expoClient.chunkPushNotifications === 'function'
    ? expoClient.chunkPushNotifications(messages)
    : Array.from({ length: Math.ceil(messages.length / 100) }, (_, index) => (
      messages.slice(index * 100, (index + 1) * 100)
    ));
  const tickets = [];
  for (const chunk of chunks) {
    tickets.push(...await sendChunkWithRetry(expoClient, chunk, options));
  }
  return tickets;
}

async function createExpoClient(accessToken) {
  const { Expo } = await import('expo-server-sdk');
  return new Expo(accessToken ? { accessToken } : undefined);
}

async function claimNotificationDispatch({
  admin,
  uid,
  notificationId,
  version,
  generation = null,
  channel,
  category,
  notificationPath,
  now = new Date(),
  leaseMs = DISPATCH_LEASE_MS,
}) {
  const db = admin.firestore();
  const id = dispatchDocumentId(uid, notificationId, version, generation);
  const ref = dispatchRef(db, id);
  const claimToken = randomBytes(16).toString('hex');
  let claimed = false;
  let attempt = 0;
  let terminalReason = null;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const current = snapshot.exists ? snapshot.data() : null;
    if (['complete', 'sent', 'skipped'].includes(current?.status)) return;
    if (current?.status === 'processing' && millis(current.leaseUntil) > now.getTime()) return;
    if (current?.status === 'retry' && millis(current.nextAttemptAt) > now.getTime()) return;
    if (
      current
      && (
        Number(current.attempts || 0) >= MAX_DISPATCH_ATTEMPTS
        || (millis(current.expireAt) > 0 && millis(current.expireAt) <= now.getTime())
      )
    ) {
      terminalReason = 'retry_exhausted';
      transaction.set(ref, {
        status: 'skipped',
        outcome: terminalReason,
        leaseUntil: null,
        nextAttemptAt: null,
        completedAt: serverTimestamp(admin),
        updatedAt: serverTimestamp(admin),
      }, { merge: true });
      return;
    }
    attempt = Number(current?.attempts || 0) + 1;
    transaction.set(ref, {
      uid,
      notificationId,
      notificationPath,
      version,
      generation,
      pushSchemaVersion: PUSH_SCHEMA_VERSION,
      channel,
      category,
      status: 'processing',
      claimToken,
      attempts: attempt,
      leaseUntil: dateFrom(now, leaseMs),
      nextAttemptAt: null,
      lastErrorCode: null,
      updatedAt: serverTimestamp(admin),
      expireAt: current?.expireAt || dateFrom(now, DISPATCH_TTL_MS),
      ...(!snapshot.exists ? { createdAt: serverTimestamp(admin) } : {}),
    }, { merge: true });
    claimed = true;
  });
  return { claimed, id, ref, claimToken, attempt, terminalReason };
}

async function updateClaim({ admin, claim, fields, allowedStatuses = null }) {
  let updated = false;
  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(claim.ref);
    if (!snapshot.exists || snapshot.data()?.claimToken !== claim.claimToken) return;
    if (allowedStatuses && !allowedStatuses.includes(snapshot.data()?.status)) return;
    transaction.set(claim.ref, {
      ...fields,
      leaseUntil: null,
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    updated = true;
  });
  return updated;
}

async function completeClaim({ admin, claim, outcome, counts = {} }) {
  return updateClaim({
    admin,
    claim,
    fields: {
      status: outcome === 'sent' ? 'complete' : 'skipped',
      outcome,
      counts,
      completedAt: serverTimestamp(admin),
      nextAttemptAt: null,
    },
    allowedStatuses: ['processing', 'sent'],
  });
}

async function retryClaim({ admin, claim, error, now = new Date() }) {
  return updateClaim({
    admin,
    claim,
    fields: {
      status: 'retry',
      lastErrorCode: safeErrorCode(error),
      nextAttemptAt: dateFrom(now, backoffMs(claim.attempt, 60 * 1000)),
    },
    allowedStatuses: ['processing'],
  });
}

async function markClaimProviderAccepted({ admin, claim }) {
  return updateClaim({
    admin,
    claim,
    fields: {
      status: 'sent',
      outcome: 'provider_accepted',
      providerAcceptedAt: serverTimestamp(admin),
      nextAttemptAt: null,
    },
    allowedStatuses: ['processing'],
  });
}

async function disableNotificationDevice({
  admin,
  deviceId,
  uid,
  reason = 'DeviceNotRegistered',
}) {
  const ref = admin.firestore().doc(`notificationDevices/${deviceId}`);
  let disabled = false;
  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.data()?.uid !== uid) return;
    transaction.set(ref, {
      enabled: false,
      disabledReason: String(reason).slice(0, 60),
      disabledAt: serverTimestamp(admin),
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    disabled = true;
  });
  return disabled;
}

async function eligibleNotificationDevices({ admin, uid }) {
  const snapshot = await admin.firestore()
    .collection('notificationDevices')
    .where('uid', '==', uid)
    .where('enabled', '==', true)
    .limit(100)
    .get();
  return snapshot.docs
    .map((entry) => ({ ...entry.data(), id: entry.id, ref: entry.ref }))
    .filter((device) => isExpoPushToken(device.token));
}

async function hasActiveAdminPushAccess({ admin, uid }) {
  let user;
  let registry;
  try {
    [user, registry] = await Promise.all([
      admin.auth().getUser(uid),
      admin.firestore().doc(`system/moderation/admins/${uid}`).get(),
    ]);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return false;
    throw error;
  }
  return user?.customClaims?.admin === true
    && registry.exists
    && registry.data()?.active === true;
}

async function pushDeliveryEligibility({ admin, uid, channel, category }) {
  const state = await notificationStateRef(admin.firestore(), uid).get();
  const preferences = normalizePushPreferences(
    state.exists ? state.data()?.pushPreferences : null
  );
  if (!preferences.pushEnabled) return { eligible: false, reason: 'push_disabled' };
  if (!preferences[category]) return { eligible: false, reason: 'channel_disabled' };
  if (
    channel === NOTIFICATION_INBOX_CHANNELS.ADMIN
    && !await hasActiveAdminPushAccess({ admin, uid })
  ) {
    return { eligible: false, reason: 'admin_ineligible' };
  }
  return { eligible: true, reason: null };
}

async function persistReceiptJob({
  admin,
  receiptId,
  dispatchId,
  uid,
  notificationId,
  version,
  generation = null,
  channel,
  category,
  deviceId,
  now,
  attempts = 0,
}) {
  await receiptRef(admin.firestore(), receiptId).set(buildReceiptJobDocument({
    admin,
    receiptId,
    dispatchId,
    uid,
    notificationId,
    version,
    generation,
    channel,
    category,
    deviceId,
    attempts,
    now,
  }));
}

function buildReceiptJobDocument({
  admin,
  receiptId,
  dispatchId,
  uid,
  notificationId,
  version,
  generation = null,
  channel,
  category,
  deviceId,
  now,
  attempts = 0,
}) {
  return {
    receiptId,
    dispatchId,
    uid,
    notificationId,
    version,
    generation,
    channel,
    category,
    deviceId,
    mode: 'receipt',
    attempts,
    receiptChecks: 0,
    checkAfter: dateFrom(now, RECEIPT_DELAY_MS),
    expireAt: dateFrom(now, RECEIPT_TTL_MS),
    createdAt: serverTimestamp(admin),
    updatedAt: serverTimestamp(admin),
  };
}

async function persistRetryJob({
  admin,
  dispatchId,
  uid,
  notificationId,
  version,
  generation = null,
  channel,
  category,
  deviceId,
  errorCode,
  now,
  attempts = 1,
}) {
  const id = `retry:${dispatchId}:${deviceId}`;
  await receiptRef(admin.firestore(), id).set({
    receiptId: null,
    dispatchId,
    uid,
    notificationId,
    version,
    generation,
    channel,
    category,
    deviceId,
    mode: 'retry_send',
    retryState: 'pending',
    retryClaimToken: null,
    retryLeaseUntil: null,
    attempts,
    receiptChecks: 0,
    lastErrorCode: errorCode,
    checkAfter: dateFrom(now, backoffMs(attempts, 60 * 1000)),
    expireAt: dateFrom(now, RECEIPT_TTL_MS),
    createdAt: serverTimestamp(admin),
    updatedAt: serverTimestamp(admin),
  }, { merge: true });
}

async function persistTicketOutcomes({
  admin,
  tickets,
  devices,
  dispatchId,
  uid,
  notificationId,
  version,
  generation,
  channel,
  category,
  now,
  sleep = defaultSleep,
}) {
  const counts = { tickets: tickets.length, receipts: 0, errors: 0, disabled: 0, retries: 0 };
  const errorCodes = new Set();
  for (let index = 0; index < tickets.length; index += 1) {
    const ticket = tickets[index];
    const device = devices[index];
    try {
      if (ticket?.status === 'ok' && ticket.id) {
        await persistPushOutcomeWithRetry(() => persistReceiptJob({
          admin,
          receiptId: ticket.id,
          dispatchId,
          uid,
          notificationId,
          version,
          generation,
          channel,
          category,
          deviceId: device.id,
          now,
        }), { sleep });
        counts.receipts += 1;
        continue;
      }
      counts.errors += 1;
      const errorCode = ticket?.details?.error || 'ExpoError';
      errorCodes.add(String(errorCode).slice(0, 60));
      if (errorCode === 'DeviceNotRegistered') {
        if (await persistPushOutcomeWithRetry(
          () => disableNotificationDevice({ admin, deviceId: device.id, uid }),
          { sleep }
        )) {
          counts.disabled += 1;
        }
      } else if (RETRYABLE_RECEIPT_ERRORS.has(errorCode)) {
        await persistPushOutcomeWithRetry(() => persistRetryJob({
          admin,
          dispatchId,
          uid,
          notificationId,
          version,
          generation,
          channel,
          category,
          deviceId: device.id,
          errorCode,
          now,
        }), { sleep });
        counts.retries += 1;
      }
    } catch (error) {
      if (ticket?.status === 'ok') counts.errors += 1;
      counts.persistenceErrors = Number(counts.persistenceErrors || 0) + 1;
      errorCodes.add(`persistence:${safeErrorCode(error)}`.slice(0, 60));
    }
  }
  if (errorCodes.size) counts.errorCodes = [...errorCodes];
  return counts;
}

async function persistPushOutcomeWithRetry(operation, {
  sleep = defaultSleep,
  maxAttempts = MAX_OUTCOME_PERSIST_ATTEMPTS,
} = {}) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await operation();
    } catch (error) {
      if (!retryableDispatchError(error) || attempt >= maxAttempts) throw error;
      await sleep(backoffMs(attempt, 200, 2_000));
    }
  }
  return null;
}

async function dispatchExpectedNotificationVersion({
  admin,
  uid,
  notificationId,
  version,
  generation = null,
  channel,
  category,
  notificationPath = `users/${uid}/notifications/${notificationId}`,
  expoClient = null,
  accessToken = null,
  now = new Date(),
  sleep = defaultSleep,
}) {
  cleanId(notificationId, 'notificationId');
  const expectedVersion = cleanDispatchVersion(version);
  const expectedGeneration = cleanDispatchGeneration(generation);
  const expectedChannel = cleanInboxChannel(channel);
  const expectedCategory = cleanPushCategory(category);
  const expectedPath = `users/${uid}/notifications/${notificationId}`;
  if (notificationPath !== expectedPath) throw new Error('Notification path does not match recipient.');
  const claim = await claimNotificationDispatch({
    admin,
    uid,
    notificationId,
    version: expectedVersion,
    generation: expectedGeneration,
    channel: expectedChannel,
    category: expectedCategory,
    notificationPath,
    now,
  });
  if (!claim.claimed) {
    return claim.terminalReason
      ? { status: 'skipped', reason: claim.terminalReason, dispatchId: claim.id }
      : { status: 'already_claimed', dispatchId: claim.id };
  }

  let providerAccepted = false;
  try {
    const authoritativeSnapshot = await admin.firestore().doc(notificationPath).get();
    const authoritative = authoritativeSnapshot.exists
      ? authoritativeSnapshot.data() || {}
      : null;
    let authoritativeGeneration = null;
    try {
      authoritativeGeneration = authoritative
        ? cleanDispatchGeneration(authoritative.generation)
        : null;
    } catch (_error) {
      authoritativeGeneration = Symbol('invalid_generation');
    }
    if (
      !authoritative
      || authoritative.push?.version !== expectedVersion
      || authoritativeGeneration !== expectedGeneration
      || authoritative.channel !== expectedChannel
      || derivePushCategory(authoritative) !== expectedCategory
    ) {
      const reason = authoritative ? 'superseded' : 'notification_deleted';
      await completeClaim({ admin, claim, outcome: reason });
      return { status: 'skipped', reason, dispatchId: claim.id };
    }

    const eligibility = await pushDeliveryEligibility({
      admin,
      uid,
      channel: expectedChannel,
      category: expectedCategory,
    });
    if (!eligibility.eligible) {
      await completeClaim({ admin, claim, outcome: eligibility.reason });
      return { status: 'skipped', reason: eligibility.reason, dispatchId: claim.id };
    }

    const devices = await eligibleNotificationDevices({ admin, uid });
    if (!devices.length) {
      await completeClaim({ admin, claim, outcome: 'no_devices' });
      return { status: 'skipped', reason: 'no_devices', dispatchId: claim.id };
    }

    const client = expoClient || await createExpoClient(accessToken);
    const messages = devices.map((device) => buildExpoMessage({
      token: device.token,
      notificationId,
      channel: expectedChannel,
      category: expectedCategory,
      version: expectedVersion,
      subtype: authoritative.subtype,
      milestone: authoritative.milestone,
    }));
    const tickets = await sendMessagesWithRetry(client, messages, { sleep });
    providerAccepted = true;
    await markClaimProviderAccepted({ admin, claim });
    const counts = await persistTicketOutcomes({
      admin,
      tickets,
      devices,
      dispatchId: claim.id,
      uid,
      notificationId,
      version: expectedVersion,
      generation: expectedGeneration,
      channel: expectedChannel,
      category: expectedCategory,
      now,
      sleep,
    });
    await completeClaim({ admin, claim, outcome: 'sent', counts });
    return { status: 'sent', dispatchId: claim.id, counts };
  } catch (error) {
    if (providerAccepted) {
      await completeClaim({
        admin,
        claim,
        outcome: 'sent',
        counts: { errors: 1, errorCodes: [`post_send:${safeErrorCode(error)}`.slice(0, 60)] },
      }).catch(() => false);
      return {
        status: 'sent',
        dispatchId: claim.id,
        reason: 'post_send_persistence_failed',
      };
    }
    if (!retryableDispatchError(error)) {
      await completeClaim({
        admin,
        claim,
        outcome: 'permanent_failure',
        counts: { errors: 1, errorCodes: [safeErrorCode(error)] },
      });
      return {
        status: 'failed',
        dispatchId: claim.id,
        reason: safeErrorCode(error),
      };
    }
    await retryClaim({ admin, claim, error, now });
    return {
      status: 'retry',
      dispatchId: claim.id,
      reason: safeErrorCode(error),
    };
  }
}

async function dispatchNotificationVersion({
  notificationData,
  ...options
}) {
  const category = derivePushCategory(notificationData);
  if (!category) throw new Error('Notification is not eligible for push delivery.');
  return dispatchExpectedNotificationVersion({
    ...options,
    version: notificationData?.push?.version,
    generation: notificationData?.generation,
    channel: notificationData?.channel,
    category,
  });
}

function snapshotExists(snapshot) {
  return Boolean(snapshot && snapshot.exists !== false && typeof snapshot.data === 'function');
}

async function dispatchNotificationWrite({
  admin,
  before,
  after,
  uid,
  notificationId,
  ...options
}) {
  if (!snapshotExists(after)) return { status: 'ignored', reason: 'deleted' };
  const next = after.data();
  const nextVersion = next?.push?.version;
  const previousVersion = snapshotExists(before) ? before.data()?.push?.version : 0;
  if (!Number.isSafeInteger(nextVersion) || nextVersion < 1) {
    return { status: 'ignored', reason: 'missing_version' };
  }
  if (Number.isSafeInteger(previousVersion) && nextVersion <= previousVersion) {
    return { status: 'ignored', reason: 'version_unchanged' };
  }
  if (!derivePushCategory(next)) {
    return { status: 'ignored', reason: 'unsupported_notification' };
  }
  return dispatchNotificationVersion({
    admin,
    uid,
    notificationId,
    notificationData: next,
    notificationPath: after.ref?.path || `users/${uid}/notifications/${notificationId}`,
    ...options,
  });
}

async function handleNotificationPushWriteEvent({ admin, event, ...options }) {
  const uid = event?.params?.userId;
  const notificationId = event?.params?.notificationId;
  if (!uid || !notificationId) {
    throw new Error('Notification write event parameters are missing.');
  }
  return dispatchNotificationWrite({
    admin,
    before: event.data?.before,
    after: event.data?.after,
    uid,
    notificationId,
    ...options,
  });
}

async function recordReceiptFailure({ admin, job, errorCode }) {
  await dispatchRef(admin.firestore(), job.dispatchId).set({
    lastReceiptErrorCode: String(errorCode || 'ExpoError').slice(0, 60),
    receiptErrorAt: serverTimestamp(admin),
    updatedAt: serverTimestamp(admin),
  }, { merge: true });
}

async function settleReceiptJob({ admin, entry, job, fields = null, deleteJob = false }) {
  let settled = false;
  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(entry.ref);
    const current = snapshot.exists ? snapshot.data() || {} : null;
    if (
      !current
      || current.mode !== 'receipt'
      || current.receiptId !== job.receiptId
    ) return;
    if (deleteJob) transaction.delete(entry.ref);
    else transaction.set(entry.ref, {
      ...fields,
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    settled = true;
  });
  return settled;
}

async function rescheduleMissingReceipt({ admin, entry, job, now }) {
  if (millis(job.expireAt) <= now.getTime()) {
    return await settleReceiptJob({ admin, entry, job, deleteJob: true })
      ? 'expired'
      : 'ignored';
  }
  const checks = Number(job.receiptChecks || 0) + 1;
  return await settleReceiptJob({
    admin,
    entry,
    job,
    fields: {
      receiptChecks: checks,
      checkAfter: dateFrom(now, backoffMs(checks, 5 * 60 * 1000)),
    },
  }) ? 'rescheduled' : 'ignored';
}

async function claimRetrySendJob({
  admin,
  ref,
  now,
  leaseMs = RECEIPT_SEND_LEASE_MS,
}) {
  const claimToken = randomBytes(16).toString('hex');
  let job = null;
  let terminalReason = null;
  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const current = snapshot.data() || {};
    if (current.mode !== 'retry_send') return;
    if (
      current.retryState === 'processing'
      && millis(current.retryLeaseUntil) > now.getTime()
    ) return;
    if (millis(current.expireAt) <= now.getTime()) {
      transaction.delete(ref);
      terminalReason = 'expired';
      return;
    }
    if (millis(current.checkAfter) > now.getTime()) return;
    transaction.set(ref, {
      retryState: 'processing',
      retryClaimToken: claimToken,
      retryLeaseUntil: dateFrom(now, leaseMs),
      updatedAt: serverTimestamp(admin),
    }, { merge: true });
    job = current;
  });
  return { claimed: Boolean(job), claimToken, job, ref, terminalReason };
}

async function settleRetrySendClaim({
  admin,
  claim,
  fields = null,
  deleteJob = false,
  receiptJob = null,
}) {
  let settled = false;
  await admin.firestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(claim.ref);
    const current = snapshot.exists ? snapshot.data() || {} : null;
    if (
      !current
      || current.mode !== 'retry_send'
      || current.retryState !== 'processing'
      || current.retryClaimToken !== claim.claimToken
    ) return;
    if (receiptJob) {
      transaction.set(receiptRef(admin.firestore(), receiptJob.receiptId), receiptJob.data);
      transaction.delete(claim.ref);
    } else if (deleteJob) {
      transaction.delete(claim.ref);
    } else {
      transaction.set(claim.ref, {
        ...fields,
        retryState: 'pending',
        retryClaimToken: null,
        retryLeaseUntil: null,
        updatedAt: serverTimestamp(admin),
      }, { merge: true });
    }
    settled = true;
  });
  return settled;
}

async function processRetrySendJob({
  admin,
  claim,
  expoClient,
  now,
  sleep,
}) {
  const { job } = claim;
  if (millis(job.expireAt) <= now.getTime()) {
    await settleRetrySendClaim({ admin, claim, deleteJob: true });
    return 'expired';
  }
  const notificationPath = `users/${job.uid}/notifications/${job.notificationId}`;
  const notificationSnapshot = await admin.firestore().doc(notificationPath).get();
  const notification = notificationSnapshot.exists ? notificationSnapshot.data() || {} : null;
  const currentGeneration = notification
    ? cleanDispatchGeneration(notification.generation)
    : null;
  const expectedGeneration = cleanDispatchGeneration(job.generation);
  if (
    !notification
    || notification.push?.version !== job.version
    || currentGeneration !== expectedGeneration
    || notification.channel !== job.channel
    || derivePushCategory(notification) !== job.category
  ) {
    await settleRetrySendClaim({ admin, claim, deleteJob: true });
    return notification ? 'superseded' : 'notification_deleted';
  }
  const eligibility = await pushDeliveryEligibility({
    admin,
    uid: job.uid,
    channel: job.channel,
    category: job.category,
  });
  if (!eligibility.eligible) {
    await settleRetrySendClaim({ admin, claim, deleteJob: true });
    return 'suppressed';
  }
  const deviceSnapshot = await admin.firestore().doc(`notificationDevices/${job.deviceId}`).get();
  const device = deviceSnapshot.exists ? deviceSnapshot.data() : null;
  if (!device || device.uid !== job.uid || device.enabled === false || !isExpoPushToken(device.token)) {
    await settleRetrySendClaim({ admin, claim, deleteJob: true });
    return 'device_unavailable';
  }
  const message = buildExpoMessage({
    token: device.token,
    notificationId: job.notificationId,
    channel: job.channel,
    category: job.category,
    version: job.version,
    subtype: notification.subtype,
    milestone: notification.milestone,
  });
  let ticket;
  try {
    [ticket] = await sendMessagesWithRetry(expoClient, [message], { sleep });
  } catch (error) {
    const attempts = Number(job.attempts || 0) + 1;
    if (!retryableDispatchError(error) || attempts >= MAX_RECEIPT_DELIVERY_ATTEMPTS) {
      await settleRetrySendClaim({ admin, claim, deleteJob: true });
      await recordReceiptFailure({ admin, job, errorCode: safeErrorCode(error) }).catch(() => {});
      return 'failed';
    }
    await settleRetrySendClaim({
      admin,
      claim,
      fields: {
        attempts,
        lastErrorCode: safeErrorCode(error),
        checkAfter: dateFrom(now, backoffMs(attempts, 60 * 1000)),
      },
    });
    return 'rescheduled';
  }
  if (ticket?.status === 'ok' && ticket.id) {
    await settleRetrySendClaim({
      admin,
      claim,
      receiptJob: {
        receiptId: ticket.id,
        data: buildReceiptJobDocument({
          admin,
          receiptId: ticket.id,
          dispatchId: job.dispatchId,
          uid: job.uid,
          notificationId: job.notificationId,
          version: job.version,
          generation: expectedGeneration,
          channel: job.channel,
          category: job.category,
          deviceId: job.deviceId,
          now,
          attempts: Number(job.attempts || 0) + 1,
        }),
      },
    });
    return 'resent';
  }
  const errorCode = ticket?.details?.error || 'ExpoError';
  if (errorCode === 'DeviceNotRegistered') {
    await disableNotificationDevice({
      admin,
      deviceId: job.deviceId,
      uid: job.uid,
    });
    await settleRetrySendClaim({ admin, claim, deleteJob: true });
    return 'disabled';
  }
  const attempts = Number(job.attempts || 0) + 1;
  if (RETRYABLE_RECEIPT_ERRORS.has(errorCode) && attempts < MAX_RECEIPT_DELIVERY_ATTEMPTS) {
    await settleRetrySendClaim({
      admin,
      claim,
      fields: {
        attempts,
        lastErrorCode: errorCode,
        checkAfter: dateFrom(now, backoffMs(attempts, 60 * 1000)),
      },
    });
    return 'rescheduled';
  }
  await settleRetrySendClaim({ admin, claim, deleteJob: true });
  await recordReceiptFailure({ admin, job, errorCode }).catch(() => {});
  return 'failed';
}

async function processPendingPushReceipts({
  admin,
  expoClient = null,
  accessToken = null,
  now = new Date(),
  limit = 500,
  sleep = defaultSleep,
}) {
  const db = admin.firestore();
  const snapshot = await db.collection('system/runtime/notificationPushReceipts')
    .where('mode', 'in', ['receipt', 'retry_send'])
    .where('checkAfter', '<=', now)
    .orderBy('checkAfter', 'asc')
    .limit(Math.min(500, Math.max(1, Number(limit) || 500)))
    .get();
  if (snapshot.empty) return { scanned: 0, completed: 0, rescheduled: 0, disabled: 0 };
  const client = expoClient || await createExpoClient(accessToken);
  const summary = { scanned: snapshot.size, completed: 0, rescheduled: 0, disabled: 0 };
  const retryEntries = [];
  const receiptEntries = [];
  snapshot.docs.forEach((entry) => {
    const job = entry.data();
    if (job.mode === 'retry_send') retryEntries.push({ entry, job });
    else receiptEntries.push({ entry, job });
  });

  for (const item of retryEntries) {
    const claim = await claimRetrySendJob({
      admin,
      ref: item.entry.ref,
      now,
    });
    if (claim.terminalReason === 'expired') {
      summary.completed += 1;
      continue;
    }
    if (!claim.claimed) continue;
    const outcome = await processRetrySendJob({
      admin,
      claim,
      expoClient: client,
      now,
      sleep,
    });
    if (outcome === 'rescheduled') summary.rescheduled += 1;
    else if (outcome === 'disabled') summary.disabled += 1;
    else summary.completed += 1;
  }

  const receiptIds = receiptEntries
    .map(({ job }) => job.receiptId)
    .filter((value) => typeof value === 'string' && value);
  const chunks = typeof client.chunkPushNotificationReceiptIds === 'function'
    ? client.chunkPushNotificationReceiptIds(receiptIds)
    : Array.from({ length: Math.ceil(receiptIds.length / 1000) }, (_, index) => (
      receiptIds.slice(index * 1000, (index + 1) * 1000)
    ));
  const receipts = {};
  for (const chunk of chunks) {
    Object.assign(receipts, await client.getPushNotificationReceiptsAsync(chunk));
  }

  for (const { entry, job } of receiptEntries) {
    const receipt = receipts[job.receiptId];
    if (!receipt) {
      const outcome = await rescheduleMissingReceipt({ admin, entry, job, now });
      if (outcome === 'rescheduled') summary.rescheduled += 1;
      else if (outcome === 'expired') summary.completed += 1;
      continue;
    }
    if (receipt.status === 'ok') {
      if (await settleReceiptJob({ admin, entry, job, deleteJob: true })) {
        summary.completed += 1;
      }
      continue;
    }
    const errorCode = receipt?.details?.error || 'ExpoError';
    if (errorCode === 'DeviceNotRegistered') {
      if (await disableNotificationDevice({
        admin,
        deviceId: job.deviceId,
        uid: job.uid,
      })) summary.disabled += 1;
      if (await settleReceiptJob({ admin, entry, job, deleteJob: true })) {
        summary.completed += 1;
      }
      continue;
    }
    const attempts = Number(job.attempts || 0);
    if (
      RETRYABLE_RECEIPT_ERRORS.has(errorCode)
      && attempts < MAX_RECEIPT_DELIVERY_ATTEMPTS
      && millis(job.expireAt) > now.getTime()
    ) {
      let converted = false;
      await db.runTransaction(async (transaction) => {
        const currentSnapshot = await transaction.get(entry.ref);
        const current = currentSnapshot.exists ? currentSnapshot.data() || {} : null;
        if (
          !current
          || current.mode !== 'receipt'
          || current.receiptId !== job.receiptId
        ) return;
        transaction.set(entry.ref, {
          mode: 'retry_send',
          receiptId: null,
          attempts: attempts + 1,
          lastErrorCode: errorCode,
          checkAfter: dateFrom(now, backoffMs(attempts + 1, 60 * 1000)),
          retryState: 'pending',
          retryClaimToken: null,
          retryLeaseUntil: null,
          updatedAt: serverTimestamp(admin),
        }, { merge: true });
        converted = true;
      });
      if (converted) summary.rescheduled += 1;
      continue;
    }
    if (await settleReceiptJob({ admin, entry, job, deleteJob: true })) {
      await recordReceiptFailure({ admin, job, errorCode }).catch(() => {});
      summary.completed += 1;
    }
  }
  return summary;
}

async function processPendingPushDispatches({
  admin,
  expoClient = null,
  accessToken = null,
  now = new Date(),
  limit = 100,
  sleep = defaultSleep,
}) {
  const db = admin.firestore();
  const boundedLimit = Math.min(100, Math.max(1, Number(limit) || 100));
  const collection = db.collection('system/runtime/notificationPushDispatches');
  const [retrySnapshot, expiredLeaseSnapshot] = await Promise.all([
    collection
      .where('status', '==', 'retry')
      .where('nextAttemptAt', '<=', now)
      .orderBy('nextAttemptAt', 'asc')
      .limit(boundedLimit)
      .get(),
    collection
      .where('status', '==', 'processing')
      .where('leaseUntil', '<=', now)
      .orderBy('leaseUntil', 'asc')
      .limit(boundedLimit)
      .get(),
  ]);
  const entries = [...new Map(
    [...retrySnapshot.docs, ...expiredLeaseSnapshot.docs]
      .map((entry) => [entry.ref.path, entry])
  ).values()]
    .filter((entry) => {
      const job = entry.data();
      return job.status === 'retry'
        || (job.status === 'processing' && millis(job.leaseUntil) <= now.getTime());
    })
    .sort((left, right) => {
      const leftJob = left.data();
      const rightJob = right.data();
      return millis(leftJob.nextAttemptAt || leftJob.leaseUntil)
        - millis(rightJob.nextAttemptAt || rightJob.leaseUntil);
    })
    .slice(0, boundedLimit);
  const summary = { scanned: entries.length, retried: 0, completed: 0 };
  for (const entry of entries) {
    const job = entry.data();
    const result = await dispatchExpectedNotificationVersion({
      admin,
      uid: job.uid,
      notificationId: job.notificationId,
      version: job.version,
      generation: job.generation,
      channel: job.channel,
      category: job.category,
      notificationPath: job.notificationPath,
      expoClient,
      accessToken,
      now,
      sleep,
    });
    if (result.status === 'skipped') summary.completed += 1;
    else if (result.status !== 'already_claimed') summary.retried += 1;
  }
  return summary;
}

module.exports = {
  CHANNEL_CONFIG,
  DEFAULT_PUSH_PREFERENCES,
  NOTIFICATION_INBOX_CHANNELS,
  PLANLI_EAS_PROJECT_ID,
  PUSH_CATEGORIES,
  PUSH_SCHEMA_VERSION,
  buildExpoMessage,
  claimNotificationDispatch,
  createExpoClient,
  deviceDocumentId,
  disableNotificationDevice,
  derivePushCategory,
  dispatchDocumentId,
  dispatchNotificationVersion,
  dispatchNotificationWrite,
  getPushPreferences,
  hasActiveAdminPushAccess,
  handleNotificationPushWriteEvent,
  isExpoPushToken,
  normalizePushPreferences,
  processPendingPushDispatches,
  processPendingPushReceipts,
  pushDeliveryEligibility,
  registerNotificationDevice,
  sanitizePushPreferencePatch,
  sendMessagesWithRetry,
  updateNotificationPreferences,
  unregisterNotificationDevice,
};
