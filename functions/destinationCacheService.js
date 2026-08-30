const {
  hasHebrewName,
} = require('./destinationLocalizationService');

function hasUsableDestinationCache(destination) {
  if (Number(destination?.schemaVersion || 0) < 3) return true;
  return Boolean(
    hasHebrewName(destination?.googleCache?.names?.he) &&
    destination?.googleCache?.names?.en
  );
}

module.exports = {
  hasUsableDestinationCache,
};
