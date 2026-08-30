import {
  getAuthFallbackTab,
  leaveAuthFlow,
  openAuthFlow,
  openMainTab,
  resetToAuthFlow,
  resetToMain,
} from '../src/navigation/authNavigation';

describe('authentication navigation helpers', () => {
  it('opens authentication inside the Auth tab instead of a root screen', () => {
    const rootNavigation = { navigate: jest.fn() };
    const nestedNavigation = { getParent: jest.fn(() => rootNavigation) };

    openAuthFlow(nestedNavigation, 'Login');

    expect(rootNavigation.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Tabs',
      params: {
        screen: 'Auth',
        params: { screen: 'Login' },
      },
    });
  });

  it('passes a safe public fallback into a directly opened auth screen', () => {
    const rootNavigation = { navigate: jest.fn() };
    const nestedNavigation = { getParent: jest.fn(() => rootNavigation) };

    openAuthFlow(nestedNavigation, 'Register', { fallbackTab: 'Community' });

    expect(rootNavigation.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Tabs',
      params: {
        screen: 'Auth',
        params: { screen: 'Register', params: { fallbackTab: 'Community' } },
      },
    });
  });

  it('uses stack history when available and otherwise returns to a safe public tab', () => {
    const withHistory = { canGoBack: jest.fn(() => true), goBack: jest.fn() };
    leaveAuthFlow(withHistory, 'Community');
    expect(withHistory.goBack).toHaveBeenCalled();

    const rootNavigation = { navigate: jest.fn() };
    const withoutHistory = {
      canGoBack: jest.fn(() => false),
      getParent: jest.fn(() => rootNavigation),
    };
    leaveAuthFlow(withoutHistory, 'Register');
    expect(rootNavigation.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Tabs',
      params: { screen: getAuthFallbackTab('Register') },
    });
  });

  it('opens public tabs and resets successful login through the root navigator', () => {
    const rootNavigation = { navigate: jest.fn(), reset: jest.fn() };
    const tabNavigation = { getParent: jest.fn(() => rootNavigation) };
    const authNavigation = { getParent: jest.fn(() => tabNavigation) };

    openMainTab(authNavigation, 'Home');
    resetToMain(authNavigation);

    expect(rootNavigation.navigate).toHaveBeenCalledWith('Main', {
      screen: 'Tabs',
      params: { screen: 'Home' },
    });
    expect(rootNavigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Main' }],
    });
  });

  it('resets enrollment completion to a clean nested login flow', () => {
    const rootNavigation = { reset: jest.fn() };
    const navigation = { getParent: jest.fn(() => rootNavigation) };

    resetToAuthFlow(navigation, 'Login');

    expect(rootNavigation.reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{
        name: 'Main',
        params: {
          screen: 'Tabs',
          params: {
            screen: 'Auth',
            params: { screen: 'Login' },
          },
        },
      }],
    });
  });

  it('keeps Admin Web authentication outside the consumer Main navigator', () => {
    const previous = process.env.EXPO_PUBLIC_ADMIN_WEB;
    process.env.EXPO_PUBLIC_ADMIN_WEB = 'true';
    try {
      const rootNavigation = { navigate: jest.fn(), reset: jest.fn() };
      const navigation = { getParent: jest.fn(() => rootNavigation) };

      openAuthFlow(navigation, 'Login');
      resetToMain(navigation);
      resetToAuthFlow(navigation, 'Login');

      expect(rootNavigation.navigate).toHaveBeenCalledWith('AdminAuth', { screen: 'Login' });
      expect(rootNavigation.reset).toHaveBeenNthCalledWith(1, {
        index: 0,
        routes: [{ name: 'AdminPanel' }],
      });
      expect(rootNavigation.reset).toHaveBeenNthCalledWith(2, {
        index: 0,
        routes: [{ name: 'AdminAuth', params: { screen: 'Login' } }],
      });
    } finally {
      if (previous === undefined) delete process.env.EXPO_PUBLIC_ADMIN_WEB;
      else process.env.EXPO_PUBLIC_ADMIN_WEB = previous;
    }
  });
});
