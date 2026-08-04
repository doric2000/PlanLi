/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'shared', 'travelTaxonomy.json');
const targetPaths = [
  path.join(root, 'client', 'src', 'constants', 'travelTaxonomy.generated.json'),
  path.join(root, 'functions', 'travelTaxonomy.generated.json'),
];

function canonicalText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function run({ check = false } = {}) {
  const taxonomy = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const expected = canonicalText(taxonomy);
  const drifted = targetPaths.filter((targetPath) => (
    !fs.existsSync(targetPath) || fs.readFileSync(targetPath, 'utf8') !== expected
  ));

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
  console.log(`Updated ${targetPaths.length} generated travel taxonomy copies.`);
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
