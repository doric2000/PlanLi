module.exports = ({ config }) => {
  const iosKey = String(process.env.GOOGLE_MAPS_IOS_KEY || '').trim();
  const androidKey = String(process.env.GOOGLE_MAPS_ANDROID_KEY || '').trim();
  const releaseBuild = process.env.EAS_BUILD_PROFILE === 'production';
  if (process.env.EAS_BUILD && (!iosKey || !androidKey)) {
    throw new Error('GOOGLE_MAPS_IOS_KEY and GOOGLE_MAPS_ANDROID_KEY are required for native builds.');
  }
  if (process.env.EAS_BUILD && releaseBuild) {
    const requiredSentryValues = [
      'EXPO_PUBLIC_SENTRY_DSN',
      'SENTRY_ORG',
      'SENTRY_PROJECT',
      'SENTRY_AUTH_TOKEN',
    ];
    const missingSentryValues = requiredSentryValues.filter(
      (name) => !String(process.env[name] || '').trim()
    );
    if (missingSentryValues.length) {
      throw new Error(
        `Production builds require Sentry crash-reporting configuration: ${missingSentryValues.join(', ')}.`
      );
    }
  }

  return {
    ...config,
    experiments: {
      ...(config.experiments || {}),
      ...(process.env.PLANLI_ADMIN_WEB === 'true' ? { baseUrl: '/admin' } : {}),
    },
    ios: {
      ...config.ios,
      ...(iosKey ? { config: { ...(config.ios?.config || {}), googleMapsApiKey: iosKey } } : {}),
    },
    android: {
      ...config.android,
      ...(androidKey
        ? { config: { ...(config.android?.config || {}), googleMaps: { apiKey: androidKey } } }
        : {}),
    },
  };
};
