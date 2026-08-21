const app = require('../app.json').expo;
const packageJson = require('../package.json');

const pluginName = (plugin) => Array.isArray(plugin) ? plugin[0] : plugin;

describe('native notification release configuration', () => {
  it('pins the SDK 54 notification module and config plugin', () => {
    expect(packageJson.dependencies['expo-notifications']).toBe('~0.32.17');
    expect((app.plugins || []).map(pluginName)).toContain('expo-notifications');
  });

  it('uses a new app-version runtime for the native push binary', () => {
    expect(app.version).toBe('1.1.0');
    expect(app.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(app.extra.eas.projectId).toBe('04731493-708f-4c82-b417-6ea815ea912e');
  });
});
