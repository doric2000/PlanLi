const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasHebrewName,
  resolveHebrewDestinationName,
  transliterateDestinationName,
} = require('./destinationLocalizationService');

test('the reviewed catalog takes precedence over a provider translation', () => {
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'FR', googleHebrewName: 'פריז', englishName: 'Paris',
  }), { name: 'פריז', source: 'planli_registry' });
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

test('Sa Pa uses the approved compact Hebrew spelling', () => {
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'VN',
    googleHebrewName: 'Sa Pa',
    englishName: 'Sa Pa',
  }), { name: 'סאפה', source: 'override' });
});

test('Latin-only destinations receive a deterministic local transliteration', () => {
  const name = transliterateDestinationName('Testville');
  assert.equal(hasHebrewName(name), true);
  assert.deepEqual(resolveHebrewDestinationName({
    countryCode: 'NO', googleHebrewName: 'Testville', englishName: 'Testville',
  }), { name, source: 'transliteration_fallback' });
});

test('unrelated non-Latin names never collide with every catalog alias in a country', () => {
  for (const englishName of ['שם שאינו במאגר', 'مدينة مجهولة', '!!!']) {
    assert.deepEqual(resolveHebrewDestinationName({
      countryCode: 'MV', englishName, googleHebrewName: 'שם ספק מאומת',
    }), { name: 'שם ספק מאומת', source: 'google' });
  }
});

test('Hebrew aliases match their own catalog entry', () => {
  assert.deepEqual(resolveHebrewDestinationName({ countryCode: 'LK', englishName: 'אלה' }),
    { name: 'אלה', source: 'planli_registry' });
});

test('a source-verified worldwide name avoids unnecessary user translation', () => {
  assert.deepEqual(resolveHebrewDestinationName({ countryCode: 'NO', englishName: 'Bergen' }),
    { name: 'ברגן', source: 'planli_registry' });
});

test('a catalog name from a distant same-name destination is not reused', () => {
  const resolved = resolveHebrewDestinationName({ countryCode: 'CA', englishName: 'Waterloo',
    coordinates: { lat: 50, lng: -120 } });
  assert.equal(resolved.source, 'transliteration_fallback');
  assert.ok(!resolved.name.includes('אונטריו'));
});

test('fallback transliteration uses Hebrew final letters at word boundaries', () => {
  assert.match(transliterateDestinationName('Bergen'), /ן$/);
  assert.equal(transliterateDestinationName('Naam'), 'נאם');
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
