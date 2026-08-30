const path = require('node:path');

function isAdminAppRequest({ env, moduleName, originModulePath, projectRoot }) {
  if (env.PLANLI_ADMIN_WEB !== 'true' || moduleName !== './App') return false;
  return path.resolve(originModulePath) === path.resolve(projectRoot, 'index.js');
}

function withAdminWebEntry(config, {
  env = process.env,
  projectRoot = path.resolve(__dirname, '..'),
} = {}) {
  const resolver = config.resolver || {};
  const fallback = resolver.resolveRequest;
  return {
    ...config,
    resolver: {
      ...resolver,
      resolveRequest(context, moduleName, platform) {
        if (isAdminAppRequest({
          env,
          moduleName,
          originModulePath: context.originModulePath,
          projectRoot,
        })) {
          return {
            filePath: path.resolve(projectRoot, 'AdminWebApp.js'),
            type: 'sourceFile',
          };
        }
        if (fallback) return fallback(context, moduleName, platform);
        return context.resolveRequest(context, moduleName, platform);
      },
    },
  };
}

module.exports = { isAdminAppRequest, withAdminWebEntry };
