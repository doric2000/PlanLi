const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

const HEBREW_DESTINATION_OVERRIDES = Object.freeze({
  'AL:vlore': 'ולורה',
  'AL:vlora': 'ולורה',
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
  if (hasHebrewName(google)) return { name: google, source: 'google' };

  const english = String(englishName || google || '').trim();
  const override = HEBREW_DESTINATION_OVERRIDES[
    overrideKey(countryCode, english)
  ];
  if (override) return { name: override, source: 'override' };
  if (hasHebrewName(existing)) {
    return { name: existing, source: existingSource || 'existing' };
  }
  const transliterated = transliterateDestinationName(english);
  if (hasHebrewName(transliterated)) {
    return { name: transliterated, source: 'transliteration_fallback' };
  }
  return { name: '', source: 'unavailable' };
}

module.exports = {
  HEBREW_DESTINATION_OVERRIDES,
  hasHebrewName,
  overrideKey,
  resolveHebrewDestinationName,
  transliterateDestinationName,
};
