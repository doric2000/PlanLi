const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withAdminWebEntry } = require('./scripts/adminWebMetroResolver');

module.exports = withAdminWebEntry(getSentryExpoConfig(__dirname));
