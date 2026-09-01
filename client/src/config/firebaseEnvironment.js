const REQUIRED_FIELDS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

export function resolveFirebaseEnvironment(values, platform) {
  const normalized = Object.fromEntries(
    REQUIRED_FIELDS.map((field) => [field, String(values?.[field] || '').trim()])
  );
  const missing = REQUIRED_FIELDS.filter((field) => !normalized[field]);
  const placeholders = [
    !/^AIza[0-9A-Za-z_-]{35}$/u.test(normalized.apiKey) ? 'apiKey' : null,
    /(?:^|[-.])dummy(?:[-.]|$)/iu.test(normalized.authDomain) ? 'authDomain' : null,
    /(?:^|-)dummy(?:-|$)/iu.test(normalized.projectId) ? 'projectId' : null,
    /(?:^|[-.])dummy(?:[-.]|$)/iu.test(normalized.storageBucket) ? 'storageBucket' : null,
    /dummy/iu.test(normalized.appId) ? 'appId' : null,
  ].filter(Boolean);
  if (missing.length || placeholders.length) {
    const invalid = [...new Set([...missing, ...placeholders])];
    throw new Error(`Firebase configuration is unavailable for: ${invalid.join(', ')}.`);
  }

  const appSenderId = normalized.appId.match(/^1:(\d+):(web|ios|android):[a-z0-9]+$/i)?.[1] || '';
  if (!appSenderId || appSenderId !== normalized.messagingSenderId) {
    throw new Error('Firebase App ID and messaging sender ID belong to different projects.');
  }

  return {
    ...normalized,
    authDomain: platform === 'web'
      ? normalized.authDomain
      : `${normalized.projectId}.firebaseapp.com`,
  };
}
