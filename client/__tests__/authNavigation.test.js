import {
  openAuthFlow,
  openMainTab,
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
});
