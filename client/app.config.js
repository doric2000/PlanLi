const { expo } = require('./app.json');

module.exports = () => {
  const iosKey = String(process.env.GOOGLE_MAPS_IOS_KEY || '').trim();
  const androidKey = String(process.env.GOOGLE_MAPS_ANDROID_KEY || '').trim();
  if (process.env.EAS_BUILD && (!iosKey || !androidKey)) {
    throw new Error('GOOGLE_MAPS_IOS_KEY and GOOGLE_MAPS_ANDROID_KEY are required for native builds.');
  }

  return {
    ...expo,
    ios: {
      ...expo.ios,
      ...(iosKey ? { config: { ...(expo.ios?.config || {}), googleMapsApiKey: iosKey } } : {}),
    },
    android: {
      ...expo.android,
      ...(androidKey
        ? { config: { ...(expo.android?.config || {}), googleMaps: { apiKey: androidKey } } }
        : {}),
    },
  };
};
