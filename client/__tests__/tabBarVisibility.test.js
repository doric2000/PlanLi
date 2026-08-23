import { shouldHideMainTabBar } from '../src/navigation/tabBarVisibility';

describe('main tab bar visibility', () => {
  it.each([
    'Login',
    'Register',
    'ForgotPassword',
    'ResetEmailSent',
    'Terms',
    'Privacy',
  ])('hides the tab bar on the %s auth detail route', (routeName) => {
    expect(shouldHideMainTabBar('Auth', routeName)).toBe(true);
  });

  it('keeps the tab bar on the auth landing page and non-auth tabs', () => {
    expect(shouldHideMainTabBar('Auth', 'AuthEntry')).toBe(false);
    expect(shouldHideMainTabBar('Home', 'Login')).toBe(false);
    expect(shouldHideMainTabBar('Auth')).toBe(false);
  });
});
