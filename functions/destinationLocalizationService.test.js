const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasHebrewName,
  resolveHebrewDestinationName,
  transliterateDestinationName,
} = require('./destinationLocalizationService');

test('Hebrew destination localization keeps a genuine Google Hebrew name', () => {
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'FR', googleHebrewName: 'פריז', englishName: 'Paris',
  }), { name: 'פריז', source: 'google' });
});

test('Vlorë receives the vetted Hebrew destination name when Google returns Latin text', () => {
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'AL', googleHebrewName: 'Vlorë', englishName: 'Vlorë',
  }), { name: 'ולורה', source: 'override' });
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'AL', googleHebrewName: 'Vlora', englishName: 'Vlora',
  }), { name: 'ולורה', source: 'override' });
});

test('Chiang Rai uses the canonical PlanLi label without the administrative prefix', () => {
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'TH',
    googleHebrewName: "מחוז צ'יאנג ראי",
    englishName: 'Chiang Rai',
  }), { name: "צ'יאנג ראי", source: 'override' });
});

test('Latin-only destinations receive a deterministic local transliteration', () => {
  const name = transliterateDestinationName('Bergen');
  assert.equal(hasHebrewName(name), true);
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'NO', googleHebrewName: 'Bergen', englishName: 'Bergen',
  }), { name, source: 'transliteration_fallback' });
});

test('an admin Hebrew name remains authoritative during refresh', () => {
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'DE',
    googleHebrewName: 'Munich',
    englishName: 'Munich',
    existingHebrewName: 'מינכן',
    existingSource: 'admin',
  }), { name: 'מינכן', source: 'admin' });
});
