/* eslint-disable no-await-in-loop, no-console */
const admin = require('firebase-admin');

const { recommendationPracticalAllowed } = require('../travelTaxonomy');
const { initializeAdmin } = require('./localCredentials');

const PAGE_SIZE = 250;

const RULES = Object.freeze([
  { kind: 'need', id: 'kosher', patterns: [/\bkosher\b/u, /כשר(?:ה|ות|ים)?/u], negativePatterns: [/לא כשר/u, /not kosher/u] },
  { kind: 'need', id: 'vegetarian', patterns: [/\bvegetarian\b/u, /צמחוני(?:ת|ות)?/u], negativePatterns: [/אין (?:מנות|אפשרות) צמחוני/u, /not vegetarian/u] },
  { kind: 'need', id: 'vegan', patterns: [/\bvegan\b/u, /טבעוני(?:ת|ות)?/u], negativePatterns: [/אין (?:מנות|אפשרות) טבעוני/u, /not vegan/u] },
  { kind: 'need', id: 'gluten_free', patterns: [/gluten[- ]free/u, /ללא גלוטן/u] },
  { kind: 'need', id: 'halal', patterns: [/\bhalal\b/u, /חלאל/u] },
  { kind: 'fact', id: 'step_free_access', patterns: [/ללא מדרגות/u, /step[- ]free/u], negativePatterns: [/אין כניסה ללא מדרגות/u, /not step[- ]free/u] },
  { kind: 'fact', id: 'elevator_available', patterns: [/(?:יש|קיימת|זמינה) מעלית/u, /elevator available/u], negativePatterns: [/אין מעלית/u, /no elevator/u] },
  { kind: 'fact', id: 'accessible_restroom', patterns: [/שירותים נגישים/u, /accessible (?:toilet|restroom)/u] },
  { kind: 'fact', id: 'accessible_parking', patterns: [/חני?ה נגישה/u, /accessible parking/u] },
  { kind: 'fact', id: 'accessible_seating', patterns: [/ישיבה נגישה/u, /accessible seating/u] },
  { kind: 'fact', id: 'wheelchair_boarding', patterns: [/עלייה נגישה/u, /wheelchair boarding/u] },
  { kind: 'fact', id: 'stairs', patterns: [/(?:יש|כולל|דרך) מדרגות/u, /\bstairs\b/u] },
  { kind: 'fact', id: 'demanding_walk', patterns: [/הליכה מאומצת/u, /טיפוס (?:קשה|מאתגר)/u, /strenuous (?:walk|hike)/u] },
  { kind: 'fact', id: 'long_walk', patterns: [/(?:מעל|יותר מ) ?30 דקות הליכה/u, /הליכה של (?:חצי שעה|שעה)/u, /long walk/u] },
  { kind: 'fact', id: 'uneven_terrain', patterns: [/שטח לא אחיד/u, /דרך סלעית/u, /uneven terrain/u] },
  { kind: 'fact', id: 'vehicle_required', patterns: [/(?:חובה|נדרש|צריך) רכב/u, /car required/u] },
  { kind: 'fact', id: 'ride_recommended', patterns: [/מומל(?:ץ|צת) (?:רכב|להגיע ברכב|הסעה)/u, /ride recommended/u] },
  { kind: 'fact', id: 'rough_road', patterns: [/דרך משובשת/u, /כביש משובש/u, /rough road/u] },
  { kind: 'fact', id: 'high_clearance_recommended', patterns: [/רכב גבוה/u, /\b4x4\b/u, /high clearance/u] },
  { kind: 'fact', id: 'seasonal_access', patterns: [/גישה עונתית/u, /סגור בחורף/u, /seasonal access/u] },
  { kind: 'fact', id: 'high_altitude', patterns: [/גובה רב/u, /high altitude/u] },
  { kind: 'fact', id: 'motion_sickness', patterns: [/מחלת ים/u, /\bseasick/u, /motion sickness/u] },
  { kind: 'fact', id: 'free_parking', patterns: [/חני?ה חינמית/u, /חני?ה חינם/u, /free parking/u], negativePatterns: [/חני?ה (?:אינה חינם|בתשלום)/u, /no free parking/u] },
  { kind: 'fact', id: 'parking_available', patterns: [/(?:יש|קיימת|זמינה) חני?ה/u, /parking available/u], negativePatterns: [/אין חני?ה/u, /no parking/u] },
  { kind: 'fact', id: 'shabbat_entry', patterns: [/כניסה (?:מותאמת|אפשרית) בשבת/u, /shabbat entry/u] },
  { kind: 'fact', id: 'shabbat_meals', patterns: [/ארוחות שבת/u, /shabbat meals/u] },
  { kind: 'fact', id: 'chabad_nearby', patterns: [/(?:קרוב|ליד) (?:לבית כנסת|לחב[״"]?ד)/u, /chabad nearby/u] },
  { kind: 'fact', id: 'advance_booking', patterns: [/(?:חובה|נדרש(?:ת)?|צריך) להזמין מראש/u, /advance booking required/u] },
]);

function valueAfter(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : null;
}

function parseArgs(argv) {
  if (argv.includes('--apply')) throw new Error('This audit is read-only and does not support --apply.');
  const parsedLimit = Number.parseInt(valueAfter(argv, '--limit'), 10);
  return {
    project: valueAfter(argv, '--project'),
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : Number.POSITIVE_INFINITY,
  };
}

function normalizedText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .toLocaleLowerCase('he');
}

function evidenceFields(data) {
  return [
    ['title', data?.title],
    ['description', data?.description],
    ['details.accessibilityNote', data?.details?.accessibilityNote],
  ].map(([field, value]) => [field, normalizedText(value)]).filter(([, value]) => value);
}

function inspectRecommendation(document) {
  const data = document.data() || {};
  const applicable = recommendationPracticalAllowed(data.categoryId, data.subcategoryIds);
  const existingNeeds = new Set(data.facets?.needs || []);
  const existingFacts = new Set(data.facets?.practicalFacts || []);
  const fields = evidenceFields(data);
  const proposals = [];

  for (const rule of RULES) {
    const allowed = rule.kind === 'need' ? applicable.needs : applicable.practicalFacts;
    const existing = rule.kind === 'need' ? existingNeeds : existingFacts;
    if (!allowed.includes(rule.id) || existing.has(rule.id)) continue;
    const matchedFields = fields
      .filter(([, text]) => rule.patterns.some((pattern) => pattern.test(text)) &&
        !(rule.negativePatterns || []).some((pattern) => pattern.test(text)))
      .map(([field]) => field);
    if (matchedFields.length) proposals.push({ kind: rule.kind, id: rule.id, evidenceFields: matchedFields });
  }

  return {
    path: document.ref.path,
    status: proposals.length ? 'candidate' : 'no-explicit-evidence',
    proposals,
  };
}

async function auditRecommendationPracticalInfo({
  firestore,
  limit = Number.POSITIVE_INFINITY,
  log = console,
}) {
  const summary = { mode: 'dry-run', scanned: 0, candidates: 0, proposedValues: 0 };
  let lastDocument = null;
  while (summary.scanned < limit) {
    const remaining = Math.min(PAGE_SIZE, limit - summary.scanned);
    let query = firestore.collection('recommendations')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(remaining);
    if (lastDocument) query = query.startAfter(lastDocument);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    for (const document of snapshot.docs) {
      const result = inspectRecommendation(document);
      summary.scanned += 1;
      if (result.status === 'candidate') {
        summary.candidates += 1;
        summary.proposedValues += result.proposals.length;
        log.info('Practical-info candidate (no data changed).', result);
      }
    }
    lastDocument = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.docs.length < remaining) break;
  }
  return summary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  initializeAdmin(admin);
  const activeProject = admin.app().options.projectId;
  if (!options.project || options.project !== activeProject) {
    throw new Error(`Pass --project ${activeProject} to confirm the read-only audit target.`);
  }
  const summary = await auditRecommendationPracticalInfo({ firestore: admin.firestore(), limit: options.limit });
  console.log('Recommendation practical-info audit complete.', summary);
  console.log('No data changed. Review every candidate before implementing a separately authorized migration.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Recommendation practical-info audit failed.', error);
    process.exitCode = 1;
  });
}

module.exports = {
  auditRecommendationPracticalInfo,
  inspectRecommendation,
  parseArgs,
};
