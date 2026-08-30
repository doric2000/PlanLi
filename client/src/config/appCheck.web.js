import {
  ReCaptchaEnterpriseProvider,
  initializeAppCheck,
} from 'firebase/app-check';

let appCheckInstance;

export function initializePlanLiAppCheck(app, { projectId } = {}) {
  if (appCheckInstance) return appCheckInstance;
  if (!projectId || projectId === 'planli-dummy') return null;

  const siteKey = String(process.env.EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY || '').trim();
  const development = process.env.NODE_ENV !== 'production';
  if (!siteKey && !development) {
    throw new Error('EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY is required for production Web builds.');
  }
  if (development && typeof self !== 'undefined') {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = self.FIREBASE_APPCHECK_DEBUG_TOKEN || true;
  }
  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey || 'planli-local-debug'),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}
