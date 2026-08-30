const fs = require('node:fs');
const path = require('node:path');

const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json']);
const LOCAL_ASSET = /(?:\/admin\/)?assets\/(?:assets|node_modules)\/[A-Za-z0-9_@./+~-]+\.[A-Za-z0-9]+/g;
const HTML_REFERENCE = /(?:src|href)=["']([^"']+)["']/g;
const CSS_REFERENCE = /url\(\s*["']?([^"')]+)["']?\s*\)/g;
const REQUIRED_ADMIN_BUNDLE_MARKERS = [
  'planli-admin-web-root',
  'admin-totp-enrollment-required',
  'admin-totp-signin-required',
];
const FORBIDDEN_CONSUMER_BUNDLE_MARKERS = [
  'main-tab-',
  'home-search-input',
  'add-rec-guided-header',
  'add-rec-submit',
  'route-builder-guided-header',
  'auth-gate-register',
  'noya-tour-',
];

function filesUnder(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name);
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

function localPath(root, sourceFile, reference) {
  const clean = String(reference || '').split(/[?#]/, 1)[0];
  if (!clean || /^(?:data:|https?:|blob:|#)/i.test(clean)) return null;
  if (clean.startsWith('/admin/')) return path.join(root, clean.slice('/admin/'.length));
  if (clean.startsWith('/')) return null;
  if (clean.startsWith('assets/')) return path.join(root, clean);
  return path.resolve(path.dirname(sourceFile), clean);
}

function extractReferences(sourceFile, text) {
  const references = new Set();
  const extension = path.extname(sourceFile).toLowerCase();
  const patterns = [LOCAL_ASSET];
  if (extension === '.html') patterns.push(HTML_REFERENCE);
  if (extension === '.css') patterns.push(CSS_REFERENCE);
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text))) references.add(match[1] || match[0]);
  }
  return references;
}

function verifyAdminExport(
  root = path.resolve(__dirname, '..', '..', 'hosting', 'admin'),
  { expectedRecaptchaSiteKey = '' } = {},
) {
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`Admin export is missing index.html at ${root}`);
  const missing = [];
  const forbiddenSourceMaps = [];
  const checked = new Set();
  const sourceFiles = filesUnder(root);
  for (const sourceFile of sourceFiles) {
    if (path.extname(sourceFile).toLowerCase() === '.map') forbiddenSourceMaps.push(sourceFile);
    if (!TEXT_EXTENSIONS.has(path.extname(sourceFile).toLowerCase())) continue;
    const text = fs.readFileSync(sourceFile, 'utf8');
    if (/sourceMappingURL\s*=/i.test(text)) forbiddenSourceMaps.push(sourceFile);
    for (const reference of extractReferences(sourceFile, text)) {
      const target = localPath(root, sourceFile, reference);
      if (!target || checked.has(target)) continue;
      checked.add(target);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) missing.push({ sourceFile, reference, target });
    }
  }
  if (missing.length) {
    const details = missing.slice(0, 20).map(({ sourceFile, reference }) => `${path.relative(root, sourceFile)} -> ${reference}`).join('\n');
    throw new Error(`Admin export contains ${missing.length} missing local asset reference(s):\n${details}`);
  }
  if (forbiddenSourceMaps.length) {
    const details = [...new Set(forbiddenSourceMaps)]
      .slice(0, 20)
      .map((file) => path.relative(root, file))
      .join('\n');
    throw new Error(`Admin export contains source-map artifacts:\n${details}`);
  }
  const webBundles = sourceFiles.filter((sourceFile) => (
    path.extname(sourceFile).toLowerCase() === '.js'
      && sourceFile.includes(`${path.sep}_expo${path.sep}static${path.sep}js${path.sep}web${path.sep}`)
  ));
  if (webBundles.length) {
    const bundleText = webBundles.map((sourceFile) => fs.readFileSync(sourceFile, 'utf8')).join('\n');
    for (const marker of REQUIRED_ADMIN_BUNDLE_MARKERS) {
      if (!bundleText.includes(marker)) throw new Error(`Admin export is missing required security marker: ${marker}.`);
    }
    for (const marker of FORBIDDEN_CONSUMER_BUNDLE_MARKERS) {
      if (bundleText.includes(marker)) {
        throw new Error(`Admin export contains forbidden consumer application marker: ${marker}.`);
      }
    }
    if (bundleText.includes('ExpoMediaLibraryNext')) {
      throw new Error('Admin export contains a native-only ExpoMediaLibraryNext dependency.');
    }
    if (expectedRecaptchaSiteKey && !bundleText.includes(expectedRecaptchaSiteKey)) {
      throw new Error('Admin export does not contain the configured reCAPTCHA Enterprise site key.');
    }
  }
  console.log(`Admin export verified: ${checked.size} local references resolve to files.`);
  return { checked: checked.size };
}

if (require.main === module) verifyAdminExport();

module.exports = { extractReferences, verifyAdminExport };
