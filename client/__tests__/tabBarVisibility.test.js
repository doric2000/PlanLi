import { shouldHideMainTabBar } from '../src/navigation/tabBarVisibility';

describe('main tab bar visibility', () => {
  it.each([
    'AuthEntry',
    'Login',
    'Register',
    'ForgotPassword',
    'ResetEmailSent',
    'Terms',
    'Privacy',
  ])('hides the tab bar on the %s auth route', (routeName) => {
    expect(shouldHideMainTabBar('Auth', routeName)).toBe(true);
  });

  it('keeps the tab bar on non-auth tabs only', () => {
    expect(shouldHideMainTabBar('Home', 'Login')).toBe(false);
    expect(shouldHideMainTabBar('Community', 'AuthEntry')).toBe(false);
  });
});
