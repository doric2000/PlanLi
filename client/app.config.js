module.exports = ({ config }) => {
  const iosKey = String(process.env.GOOGLE_MAPS_IOS_KEY || '').trim();
  const androidKey = String(process.env.GOOGLE_MAPS_ANDROID_KEY || '').trim();
  if (process.env.EAS_BUILD && (!iosKey || !androidKey)) {
    throw new Error('GOOGLE_MAPS_IOS_KEY and GOOGLE_MAPS_ANDROID_KEY are required for native builds.');
  }

  return {
    ...config,
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
