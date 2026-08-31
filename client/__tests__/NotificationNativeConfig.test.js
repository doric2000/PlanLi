const app = require('../app.json').expo;
const packageJson = require('../package.json');

const pluginName = (plugin) => Array.isArray(plugin) ? plugin[0] : plugin;

describe('native notification release configuration', () => {
  it('pins the SDK 57 notification module and config plugin', () => {
    expect(packageJson.dependencies['expo-notifications']).toBe('~57.0.15');
    expect((app.plugins || []).map(pluginName)).toContain('expo-notifications');
  });

  it('keeps the beta marketing version while isolating the SDK 57 runtime', () => {
    expect(app.version).toBe('1.1.0');
    expect(app.runtimeVersion).toBe('1.2.0');
    expect(app.extra.eas.projectId).toBe('04731493-708f-4c82-b417-6ea815ea912e');
  });
});
