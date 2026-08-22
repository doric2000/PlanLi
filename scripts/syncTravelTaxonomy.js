/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'shared', 'travelTaxonomy.json');
const targetPaths = [
  path.join(root, 'client', 'src', 'constants', 'travelTaxonomy.generated.json'),
  path.join(root, 'functions', 'travelTaxonomy.generated.json'),
];
const documentationPath = path.join(root, 'docs', 'travel-taxonomy-map.md');

function canonicalText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function documentationText(taxonomy) {
  const labelByAxis = (items) => Object.fromEntries((items || []).map((item) => [item.id, item.label]));
  const axisLabels = {
    interests: labelByAxis(taxonomy.interests),
    audiences: labelByAxis(taxonomy.travelParties),
    vibes: labelByAxis(taxonomy.vibes),
    travelerStyles: labelByAxis(taxonomy.travelerStyles),
    needs: labelByAxis(taxonomy.needs),
    seasons: labelByAxis(taxonomy.seasons),
    environments: labelByAxis(taxonomy.environments),
  };
  const axisNames = {
    interests: 'תחומי עניין',
    audiences: 'קהל',
    vibes: 'אווירה',
    travelerStyles: 'סגנון',
    needs: 'צרכים',
    seasons: 'עונה',
    environments: 'סביבה',
  };
  const formatRelations = (item) => Object.keys(axisLabels).flatMap((field) => {
    const values = item[field] || [];
    if (!values.length) return [];
    return `${axisNames[field]}: ${values.map((id) => `${axisLabels[field][id] || id} (\`${id}\`)`).join(', ')}`;
  }).join(' · ');
  const lines = [
    '# מפת ה־Travel Taxonomy',
    '',
    `> נוצר אוטומטית מ־\`shared/travelTaxonomy.json\` (גרסה ${taxonomy.version}). אין לערוך ידנית.`,
    '',
    'הקטגוריות ותתי־הקטגוריות יוצרות עץ. תחומי עניין, אווירה, קהלים ושאר ה־facets הם צירים רוחביים, ולכן תת־קטגוריה יכולה להתחבר ליותר מתחום עניין אחד.',
    '',
    '## קטגוריות ותתי־קטגוריות',
    '',
  ];
  for (const category of taxonomy.categories) {
    lines.push(`- **${category.label}** (\`${category.id}\`)`);
    const tags = taxonomy.tags.filter((tag) => tag.categoryId === category.id);
    if (category.id !== 'services') {
      for (const tag of tags) {
        lines.push(`  - ${tag.label} (\`${tag.id}\`) → ${formatRelations(tag) || 'ללא נגזרת אוטומטית'}`);
      }
      continue;
    }
    for (const group of taxonomy.serviceGroups || []) {
      lines.push(`  - **${group.label}** (\`${group.id}\`)`);
      for (const tag of tags.filter((item) => item.groupId === group.id)) {
        lines.push(`    - ${tag.label} (\`${tag.id}\`) → ${formatRelations(tag) || 'ללא נגזרת אוטומטית'}`);
      }
    }
  }
  const recommendationCatalog = taxonomy.recommendationCatalog;
  if (recommendationCatalog) {
    const recommendationInterestLabels = labelByAxis(recommendationCatalog.interests);
    const recommendationSubcategories = recommendationCatalog.subcategories || [];
    const recommendationServiceGroups = recommendationCatalog.serviceGroups || [];
    lines.push(
      '',
      '## קטלוג ההמלצות',
      '',
      `> גרסת סכימה ${recommendationCatalog.schemaVersion}; הפעלה בזמן ריצה: \`${recommendationCatalog.runtimeEnabled}\`. הקטלוג מחובר לזרימת יצירת ההמלצות הקצרה.`,
      '',
    );
    for (const category of recommendationCatalog.categories || []) {
      const popularIds = new Set(category.popularSubcategoryIds || []);
      lines.push(`- **${category.label}** (\`${category.id}\`)`);
      const categoryItems = recommendationSubcategories.filter((item) => item.categoryId === category.id);
      if (category.id !== 'services') {
        for (const item of categoryItems) {
          const interests = (item.interestIds || []).map((id) => recommendationInterestLabels[id] || id);
          lines.push(`  - ${item.label} (\`${item.id}\`)${popularIds.has(item.id) ? ' — נפוץ' : ''}${interests.length ? ` → ${interests.join(', ')}` : ''}`);
        }
        continue;
      }
      for (const group of recommendationServiceGroups) {
        lines.push(`  - **${group.label}** (\`${group.id}\`)`);
        for (const item of categoryItems.filter((entry) => entry.groupId === group.id)) {
          lines.push(`    - ${item.label} (\`${item.id}\`)${popularIds.has(item.id) ? ' — נפוץ' : ''}`);
        }
      }
    }
    const migrationCounts = Object.values(recommendationCatalog.legacyTagMappings || {}).reduce((counts, mapping) => {
      counts[mapping.strategy] = (counts[mapping.strategy] || 0) + 1;
      return counts;
    }, {});
    lines.push(
      '',
      '### מעבר מהקטלוג הפעיל',
      '',
      `- מיפוי ישיר: ${migrationCounts.direct || 0}`,
      `- בדיקה ידנית: ${migrationCounts.review || 0}`,
      `- מעבר למאפיין: ${migrationCounts.attribute || 0}`,
    );
  }
  const axisSections = [
    ['תחומי עניין', taxonomy.interests],
    ['אווירה', taxonomy.vibes],
    ['סגנון טיול', taxonomy.travelerStyles],
    ['הרכב מטיילים', taxonomy.travelParties],
    ['תקציב', taxonomy.budgets],
    ['קצב', taxonomy.paces],
    ['צרכים מעשיים', taxonomy.needs],
    ['עונות', taxonomy.seasons],
    ['סביבה', taxonomy.environments],
    ['קושי במסלול', taxonomy.routeDifficulties],
    ['ניסיון במסלול', taxonomy.routeExperienceLevels],
    ['אמצעי התניידות', taxonomy.transportModes],
  ];
  for (const [title, items] of axisSections) {
    lines.push('', `## ${title}`, '');
    lines.push(items.map((item) => {
      const related = (item.relatedInterests || []).map((id) =>
        `${axisLabels.interests[id] || id} (\`${id}\`)`
      );
      return `- ${item.label} (\`${item.id}\`)${related.length ? ` — קשור ל: ${related.join(', ')}` : ''}`;
    }).join('\n'));
  }
  lines.push('', '## כללי התאמה', '',
    '- המלצה שומרת קטגוריה אחת וכמה תתי־קטגוריות.',
    '- מסלול יכול לשמור כמה קטגוריות ותתי־קטגוריות.',
	'- תחומי העניין נגזרים מהקטגוריות ומתתי־הקטגוריות ואינם שדה עריכה או מסנן ידני נוסף.',
	'- בהמלצה נשמרים כמאפייני תוכן מפורשים רק קהל, מחיר, אווירה וסביבה כאשר הם רלוונטיים לסוג המקום.',
	'- סגנון טיול, עונה, קצב, קושי, ניסיון ואמצעי התניידות הם מאפייני מסלול ולא מאפייני המלצה נקודתית.',
	'- קהל יכול להיות רשימה מפורשת או `audienceScope: all`; אין להסיק קהל חסר.',
	'- צרכים מעשיים מתווספים רק כעובדות מפורשות. במסלול הם תקפים רק עם `needsScope: entire_route`; מידע חסר אינו נחשב להתאמה.',
    '- בתוך ממד סינון פועל OR, ובין ממדים שונים פועל AND.',
    '',
  );
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

function run({ check = false } = {}) {
  const taxonomy = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const expected = canonicalText(taxonomy);
  const expectedDocumentation = documentationText(taxonomy);
  const drifted = targetPaths.filter((targetPath) => (
    !fs.existsSync(targetPath) || fs.readFileSync(targetPath, 'utf8') !== expected
  ));
  if (!fs.existsSync(documentationPath) || fs.readFileSync(documentationPath, 'utf8') !== expectedDocumentation) {
    drifted.push(documentationPath);
  }

  if (check) {
    if (drifted.length) {
      throw new Error(`Generated travel taxonomy is stale: ${drifted.map((item) => path.relative(root, item)).join(', ')}`);
    }
    console.log('Travel taxonomy generated copies are current.');
    return;
  }

  for (const targetPath of targetPaths) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, expected, 'utf8');
  }
  fs.mkdirSync(path.dirname(documentationPath), { recursive: true });
  fs.writeFileSync(documentationPath, expectedDocumentation, 'utf8');
  console.log(`Updated ${targetPaths.length} generated travel taxonomy copies and documentation.`);
}

if (require.main === module) {
  try {
    run({ check: process.argv.includes('--check') });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { run };
