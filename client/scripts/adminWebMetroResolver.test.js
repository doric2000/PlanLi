const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { isAdminAppRequest, withAdminWebEntry } = require('./adminWebMetroResolver');

const projectRoot = path.resolve(__dirname, '..');

test('admin export replaces only the root App import with the isolated entry', () => {
  assert.equal(isAdminAppRequest({
    env: { PLANLI_ADMIN_WEB: 'true' },
    moduleName: './App',
    originModulePath: path.join(projectRoot, 'index.js'),
    projectRoot,
  }), true);
  assert.equal(isAdminAppRequest({
    env: { PLANLI_ADMIN_WEB: 'false' },
    moduleName: './App',
    originModulePath: path.join(projectRoot, 'index.js'),
    projectRoot,
  }), false);
  assert.equal(isAdminAppRequest({
    env: { PLANLI_ADMIN_WEB: 'true' },
    moduleName: './App',
    originModulePath: path.join(projectRoot, 'src', 'other.js'),
    projectRoot,
  }), false);
});

test('admin resolver preserves the existing Metro resolver for every other import', () => {
  const fallback = (_context, moduleName, platform) => ({ moduleName, platform });
  const config = withAdminWebEntry({ resolver: { resolveRequest: fallback } }, {
    env: { PLANLI_ADMIN_WEB: 'true' },
    projectRoot,
  });
  const context = { originModulePath: path.join(projectRoot, 'index.js') };

  assert.deepEqual(config.resolver.resolveRequest(context, './App', 'web'), {
    filePath: path.join(projectRoot, 'AdminWebApp.js'),
    type: 'sourceFile',
  });
  assert.deepEqual(config.resolver.resolveRequest(context, './config', 'web'), {
    moduleName: './config',
    platform: 'web',
  });
});
