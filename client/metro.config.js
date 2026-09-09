const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withAdminWebEntry } = require('./scripts/adminWebMetroResolver');

const { withLocalAndroidValidation } = require('./scripts/localAndroidMetroConfig');

module.exports = withLocalAndroidValidation(withAdminWebEntry(getSentryExpoConfig(__dirname)));
