const fs = require('node:fs');
const path = require('node:path');

const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json']);
const LOCAL_ASSET = /(?:\/admin\/)?assets\/(?:assets|node_modules)\/[A-Za-z0-9_@./+~-]+\.[A-Za-z0-9]+/g;
const HTML_REFERENCE = /(?:src|href)=["']([^"']+)["']/g;
const CSS_REFERENCE = /url\(\s*["']?([^"')]+)["']?\s*\)/g;

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

function verifyAdminExport(root = path.resolve(__dirname, '..', '..', 'hosting', 'admin')) {
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error(`Admin export is missing index.html at ${root}`);
  const missing = [];
  const checked = new Set();
  for (const sourceFile of filesUnder(root)) {
    if (!TEXT_EXTENSIONS.has(path.extname(sourceFile).toLowerCase())) continue;
    const text = fs.readFileSync(sourceFile, 'utf8');
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
  console.log(`Admin export verified: ${checked.size} local references resolve to files.`);
  return { checked: checked.size };
}

if (require.main === module) verifyAdminExport();

module.exports = { extractReferences, verifyAdminExport };
