/* eslint-disable no-console */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { validateRegistryEntry } = require('../canonicalDestinationRegistry');
const { destinationIsOperational } = require('../destinationReferencePolicy');
const {
  contentReferences,
  loadLiveRecordsRest,
} = require('./migrateDestinationPublicationGate');
const { gcloudAccessToken } = require('./localCredentials');

const PROJECT_ID = 'planli-f0b12';
const REPORT_PATH = path.resolve(
  __dirname,
  '../../.codex_tmp/security-audit/destination-publication-review.md'
);

function text(value, maximum = 180) {
  return String(value === null || value === undefined ? '' : value)
    .trim().replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').slice(0, maximum);
}

function markdownCell(value) {
  return text(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/\|/gu, '&#124;')
    .replace(/`/gu, '&#96;');
}

function normalizedParent(value) {
  return text(value, 180);
}

function destinationNames(destination) {
  const names = destination?.names || destination?.identity?.names || destination?.googleCache?.names || {};
  return { he: text(names.he, 120), en: text(names.en, 120) };
}

function providerPlaceId(destination) {
  return text(destination?.providerRefs?.googlePlaceId || destination?.googleCache?.placeId, 220);
}

function providerTypes(destination) {
  const rawTypes = destination?.googleCache?.types || destination?.identity?.types || [];
  return [...new Set((Array.isArray(rawTypes) ? rawTypes : [])
    .map((value) => text(value, 80).toLowerCase())
    .filter(Boolean))].sort();
}

function isStandardLocalityCandidate(destination, reasons) {
  const types = new Set(providerTypes(destination));
  return reasons.length === 1 && reasons[0] === 'registry_missing' &&
    Boolean(providerPlaceId(destination)) && types.has('locality') && types.has('political');
}

function exactLegacyBinding({ destination, country, registryRecord, validateRegistry }) {
  const policy = destination?.canonicalPolicy || {};
  const registryData = registryRecord?.data || {};
  if (!registryRecord) return { matches: false, reasons: ['registry_missing'] };
  const prospectiveRegistry = {
    id: registryRecord.id,
    ...registryData,
    status: 'active',
    approval: { ...(registryData.approval || {}), approvedByAdmin: true },
  };
  const validation = validateRegistry(prospectiveRegistry);
  const entry = validation.entry || prospectiveRegistry;
  const reasons = [];
  if (!validation.valid) reasons.push(...(validation.errors || ['registry_invalid']).map((item) => `registry_${item}`));
  if (text(country?.status) !== 'active') reasons.push('country_inactive');
  if (!destinationIsOperational(destination)) reasons.push('destination_not_operational');
  if (text(registryData.status) !== 'active') reasons.push('registry_inactive');
  if (policy.approved !== true) reasons.push('policy_not_preapproved');
  if (text(policy.reviewState) && text(policy.reviewState) !== 'approved') reasons.push('policy_review_state_conflict');
  if (policy.registryAttestation || Number(policy.approvalRevision || 0) > 0) reasons.push('policy_not_legacy');
  if (text(policy.registryId) !== text(registryRecord.id)) reasons.push('registry_id_mismatch');
  if (Number(policy.registryVersion) < 1 ||
      Number(policy.registryVersion) !== Number(entry.registryVersion)) {
    reasons.push('registry_version_mismatch');
  }
  if (text(policy.kind) !== text(entry.kind)) reasons.push('registry_kind_mismatch');
  if (text(policy.groupingPolicy) !== text(entry.groupingPolicy)) reasons.push('registry_grouping_mismatch');
  if (normalizedParent(policy.parentId) !== normalizedParent(entry.parentId)) reasons.push('registry_parent_mismatch');
  if (text(entry.countryCode).toUpperCase() !== text(country?.code).toUpperCase()) reasons.push('registry_country_mismatch');
  const destinationProvider = providerPlaceId(destination);
  const registryProvider = text(entry.providerRefs?.googlePlaceId, 220);
  if (!destinationProvider || destinationProvider !== registryProvider) reasons.push('registry_provider_mismatch');
  if (registryData.destinationPath && text(registryData.destinationPath, 500) !== text(destination.path, 500)) {
    reasons.push('registry_path_mismatch');
  }
  return { matches: reasons.length === 0, reasons };
}

function buildDestinationPublicationReview(records, { validateRegistry = validateRegistryEntry } = {}) {
  const countries = new Map(records.countries.map((entry) => [entry.id, entry.data || {}]));
  const registry = new Map(records.registry.map((entry) => [entry.id, entry]));
  const catalogKeys = new Set(records.catalog.map((entry) => (
    `${text(entry.data?.countryId)}:${text(entry.data?.cityId)}`
  )));
  const contentCounts = new Map();
  records.contents.forEach((entry) => {
    contentReferences(entry.type, entry.data || {}).forEach((reference) => {
      const key = `${reference.countryId}:${reference.cityId}`;
      contentCounts.set(key, (contentCounts.get(key) || 0) + 1);
    });
  });

  const rows = records.destinations.map((record) => {
    const destination = record.data || {};
    const country = countries.get(record.countryId) || {};
    const policy = destination.canonicalPolicy || {};
    const registryRecord = registry.get(policy.registryId);
    const legacyBinding = exactLegacyBinding({
      destination: { ...destination, path: record.path },
      country,
      registryRecord,
      validateRegistry,
    });
    const key = `${record.countryId}:${record.cityId}`;
    const operational = destinationIsOperational(destination) && country.status === 'active';
    const attestationOnlyReasons = legacyBinding.reasons.every((reason) => (
      reason === 'registry_version_mismatch'
    ));
    const category = !operational
      ? 'inactive_not_public'
      : legacyBinding.matches || attestationOnlyReasons
        ? 'legacy_binding_needs_admin_attestation'
        : 'active_pending_manual_review';
    return {
      path: record.path,
      countryId: record.countryId,
      cityId: record.cityId,
      names: destinationNames(destination),
      status: text(destination.status),
      category,
      providerPlaceId: providerPlaceId(destination),
      providerTypes: providerTypes(destination),
      standardLocalityCandidate: operational && isStandardLocalityCandidate(destination, legacyBinding.reasons),
      registryId: text(policy.registryId),
      registryProviderPlaceId: text(registryRecord?.data?.providerRefs?.googlePlaceId, 220),
      contentReferences: contentCounts.get(key) || 0,
      catalogPresent: catalogKeys.has(key),
      reasons: legacyBinding.reasons,
    };
  }).sort((left, right) => (
    left.category.localeCompare(right.category) ||
    left.countryId.localeCompare(right.countryId) ||
    left.names.en.localeCompare(right.names.en) ||
    left.cityId.localeCompare(right.cityId)
  ));
  const counts = Object.fromEntries([...new Set(rows.map((row) => row.category))]
    .sort().map((category) => [category, rows.filter((row) => row.category === category).length]));
  return {
    projectId: PROJECT_ID,
    counts: { total: rows.length, ...counts },
    fingerprint: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    rows,
  };
}

function renderMarkdown(report, generatedAt = new Date().toISOString()) {
  const labels = {
    inactive_not_public: 'לא פעיל — אינו אמור להיות ציבורי',
    legacy_binding_needs_admin_attestation: 'התאמת זהות מלאה — דורש אישור מנהל',
    active_pending_manual_review: 'פעיל — דורש בדיקה ידנית',
  };
  const lines = [
    '# Destination publication review',
    '',
    `Generated: ${markdownCell(generatedAt)}`,
    '',
    `Project: \`${PROJECT_ID}\``,
    '',
    `Fingerprint: \`${report.fingerprint}\``,
    '',
    'This is a read-only classification report. It does not authorize or apply changes.',
    '',
    '## Counts',
    '',
    `- Total: ${report.counts.total}`,
    ...Object.entries(labels).map(([key, label]) => `- ${label}: ${report.counts[key] || 0}`),
    '',
    '## Destinations',
    '',
    '| מדינה | שם בעברית | שם באנגלית | מצב | סיווג | סוגי Google שמורים | מועמד לעיר רגילה | תוכן מקושר | בקטלוג | מזהה Google תואם | סיבות |',
    '|---|---|---|---|---|---|---|---:|---|---|---|',
    ...report.rows.map((row) => [
      row.countryId,
      row.names.he || '—',
      row.names.en || '—',
      row.status || '—',
      labels[row.category] || row.category,
      row.providerTypes.join(', ') || '—',
      row.standardLocalityCandidate ? 'כן — עדיין דורש אישור מנהל' : 'לא',
      row.contentReferences,
      row.catalogPresent ? 'כן' : 'לא',
      row.providerPlaceId && row.providerPlaceId === row.registryProviderPlaceId ? 'כן' : 'לא',
      row.reasons.join(', ') || '—',
    ].map(markdownCell).join(' | ')).map((line) => `| ${line} |`),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const records = await loadLiveRecordsRest({
    projectId: PROJECT_ID,
    accessToken: gcloudAccessToken().access_token,
  });
  const report = buildDestinationPublicationReview(records);
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, renderMarkdown(report), { encoding: 'utf8', flag: 'w' });
  console.log(JSON.stringify({
    ok: true,
    mode: 'read-only',
    reportPath: REPORT_PATH,
    fingerprint: report.fingerprint,
    counts: report.counts,
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildDestinationPublicationReview,
  exactLegacyBinding,
  isStandardLocalityCandidate,
  markdownCell,
  providerTypes,
  renderMarkdown,
};
