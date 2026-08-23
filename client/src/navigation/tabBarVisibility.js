const AUTH_DETAIL_ROUTES = new Set([
  'Login',
  'Register',
  'ForgotPassword',
  'ResetEmailSent',
  'Terms',
  'Privacy',
]);

export function shouldHideMainTabBar(routeName, nestedRouteName) {
  return routeName === 'Auth' && AUTH_DETAIL_ROUTES.has(nestedRouteName);
}
