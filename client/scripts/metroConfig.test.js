const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

for (const local of [false, true]) {
  test(`Metro composes the admin resolver with ${local ? 'local Android limits' : 'normal build settings'}`, (t) => {
    const previous = { local: process.env.PLANLI_LOCAL_E2E, admin: process.env.PLANLI_ADMIN_WEB };
    const configPath = require.resolve('../metro.config');
    const originalLoad = Module._load;
    const originalBlock = /vendor-cache/;
    const resolved = { type: 'sourceFile', filePath: '/vendor/resolved.js' };
    t.after(() => {
      for (const [key, value] of Object.entries({ PLANLI_LOCAL_E2E: previous.local, PLANLI_ADMIN_WEB: previous.admin })) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
      delete require.cache[configPath];
    });
    t.mock.method(Module, '_load', function (request, ...args) {
      if (request === '@sentry/react-native/metro') return {
        getSentryExpoConfig: () => ({ maxWorkers: 7, resolver: { blockList: originalBlock, resolveRequest: () => resolved } }),
      };
      return originalLoad.call(this, request, ...args);
    });
    if (local) process.env.PLANLI_LOCAL_E2E = 'true'; else delete process.env.PLANLI_LOCAL_E2E;
    process.env.PLANLI_ADMIN_WEB = 'true';
    delete require.cache[configPath];
    const config = require('../metro.config');
    const context = { originModulePath: path.resolve(__dirname, '../index.js') };
    assert.equal(config.maxWorkers, local ? 1 : 7);
    assert.deepEqual(config.resolver.resolveRequest(context, './App', 'web'), {
      filePath: path.resolve(__dirname, '../AdminWebApp.js'), type: 'sourceFile',
    });
    assert.equal(config.resolver.resolveRequest(context, 'another-module', 'android'), resolved);
    if (local) {
      assert.equal(config.resolver.blockList[0], originalBlock);
      assert.ok(config.resolver.blockList.some((rule) => rule.test('C:/repo/.codex_tmp/android/sdk/tool')));
    } else assert.equal(config.resolver.blockList, originalBlock);
  });
}
