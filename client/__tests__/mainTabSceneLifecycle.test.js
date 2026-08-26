import { shouldDetachInactiveMainTabScreens } from '../src/navigation/mainTabSceneLifecycle';

describe('main tab scene lifecycle', () => {
  it('keeps visited Android tab scenes attached', () => {
    expect(shouldDetachInactiveMainTabScreens('android')).toBe(false);
  });

  it('preserves inactive-screen detachment on other platforms', () => {
    expect(shouldDetachInactiveMainTabScreens('ios')).toBe(true);
    expect(shouldDetachInactiveMainTabScreens('web')).toBe(true);
  });
});
