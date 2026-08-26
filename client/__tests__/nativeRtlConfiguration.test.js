import appConfig from '../app.json';

describe('native RTL configuration', () => {
  it('prevents the operating system from mirroring the explicitly RTL PlanLi layout', () => {
    const localizationPlugin = appConfig.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization'
    );

    expect(localizationPlugin).toEqual([
      'expo-localization',
      { supportsRTL: false },
    ]);
  });
});
