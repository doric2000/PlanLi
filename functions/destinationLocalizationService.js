const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const COMBINING_MARKS = /[\u0300-\u036f]/g;
const DESTINATION_NAMING_POLICY_VERSION = 2;

const HEBREW_DESTINATION_OVERRIDES = Object.freeze({
  'AL:vlore': 'ולורה',
  'AL:vlora': 'ולורה',
  'TH:chiangrai': "צ'יאנג ראי",
  'VN:sapa': 'סאפה',
});

const DIGRAPHS = Object.freeze([
  ['sch', 'ש'],
  ['sh', 'ש'],
  ['ch', "צ׳"],
  ['zh', "ז׳"],
  ['th', 'ת'],
  ['ph', 'פ'],
  ['kh', 'כ'],
  ['ck', 'ק'],
  ['qu', 'קוו'],
  ['ts', 'צ'],
  ['tz', 'צ'],
  ['ng', 'נג'],
]);

const LETTERS = Object.freeze({
  a: 'א', b: 'ב', c: 'ק', d: 'ד', e: 'ה', f: 'פ', g: 'ג', h: 'ה',
  i: 'י', j: "ג׳", k: 'ק', l: 'ל', m: 'מ', n: 'נ', o: 'ו', p: 'פ',
  q: 'ק', r: 'ר', s: 'ס', t: 'ט', u: 'ו', v: 'ו', w: 'ו', x: 'קס',
  y: 'י', z: 'ז',
});

function hasHebrewName(value) {
  return HEBREW_LETTER.test(String(value || ''));
}

function overrideKey(countryCode, value) {
  const folded = String(value || '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
  return `${String(countryCode || '').trim().toUpperCase()}:${folded}`;
}

function transliterateToken(token) {
  let remaining = String(token || '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase();
  let output = '';
  while (remaining) {
    const digraph = DIGRAPHS.find(([latin]) => remaining.startsWith(latin));
    if (digraph) {
      output += digraph[1];
      remaining = remaining.slice(digraph[0].length);
      continue;
    }
    const character = remaining[0];
    output += LETTERS[character] || (/\d/.test(character) ? character : '');
    remaining = remaining.slice(1);
  }
  return output
    .replace(/אא+/g, 'א')
    .replace(/הה+/g, 'ה')
    .replace(/יי+/g, 'י')
    .replace(/וו+/g, 'ו');
}

function transliterateDestinationName(value) {
  return String(value || '')
    .trim()
    .split(/([\s\-/]+)/)
    .map((part) => /^[\s\-/]+$/.test(part) ? part : transliterateToken(part))
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/כ(?=$|[\s\-/])/g, 'ך')
    .replace(/מ(?=$|[\s\-/])/g, 'ם')
    .replace(/נ(?=$|[\s\-/])/g, 'ן')
    .replace(/פ(?=$|[\s\-/])/g, 'ף')
    .replace(/צ(?=$|[\s\-/])/g, 'ץ')
    .trim();
}

function resolveHebrewDestinationName({
  countryCode,
  googleHebrewName,
  englishName,
  existingHebrewName,
  existingSource,
  existingAdminName,
}) {
  const admin = String(existingAdminName || '').trim();
  if (hasHebrewName(admin)) return { name: admin, source: 'admin' };
  const existing = String(existingHebrewName || '').trim();
  if (existingSource === 'admin' && hasHebrewName(existing)) {
    return { name: existing, source: 'admin' };
  }
  const google = String(googleHebrewName || '').trim();
  const english = String(englishName || google || '').trim();
  const override = HEBREW_DESTINATION_OVERRIDES[
    overrideKey(countryCode, english)
  ];
  if (override) return { name: override, source: 'override' };
  if (hasHebrewName(google)) return { name: google, source: 'google' };
  if (hasHebrewName(existing)) {
    return { name: existing, source: existingSource || 'existing' };
  }
  const transliterated = transliterateDestinationName(english);
  if (hasHebrewName(transliterated)) {
    return { name: transliterated, source: 'transliteration_fallback' };
  }
  return { name: '', source: 'unavailable' };
}

function destinationEnglishName(destination) {
  return String(
    destination?.googleCache?.names?.en ||
    destination?.identity?.names?.en ||
    destination?.names?.en ||
    destination?.name ||
    ''
  ).trim();
}

function destinationHebrewName(destination) {
  const candidates = [
    destination?.googleCache?.names?.he,
    destination?.identity?.names?.he,
    destination?.names?.he,
    destination?.name,
  ];
  return String(candidates.find(hasHebrewName) || '').trim();
}

function normalizeDestinationHebrewData(destination, options = {}) {
  const source = destination && typeof destination === 'object' ? destination : {};
  const googleCache = source.googleCache || {};
  const names = googleCache.names || {};
  const existingSource = String(googleCache.nameSources?.he || '').trim();
  const localized = resolveHebrewDestinationName({
    countryCode: options.countryCode || googleCache.countryCode || source.countryId,
    googleHebrewName: names.he,
    englishName: destinationEnglishName(source),
    existingHebrewName: names.he || source.identity?.names?.he || source.names?.he,
    existingSource,
    existingAdminName: existingSource === 'admin' ? names.he : '',
  });
  if (!hasHebrewName(localized.name)) {
    return { destination: source, name: '', source: 'unavailable', changed: false };
  }
  const changed = names.he !== localized.name || existingSource !== localized.source ||
    Number(source.namingPolicyVersion || 0) !== DESTINATION_NAMING_POLICY_VERSION;
  return {
    destination: {
      ...source,
      namingPolicyVersion: DESTINATION_NAMING_POLICY_VERSION,
      googleCache: {
        ...googleCache,
        names: { ...names, he: localized.name },
        nameSources: {
          ...(googleCache.nameSources || {}),
          he: localized.source,
          ...(destinationEnglishName(source) ? { en: googleCache.nameSources?.en || 'google' } : {}),
        },
      },
    },
    name: localized.name,
    source: localized.source,
    changed,
  };
}

module.exports = {
  DESTINATION_NAMING_POLICY_VERSION,
  HEBREW_DESTINATION_OVERRIDES,
  destinationEnglishName,
  destinationHebrewName,
  hasHebrewName,
  normalizeDestinationHebrewData,
  overrideKey,
  resolveHebrewDestinationName,
  transliterateDestinationName,
};
