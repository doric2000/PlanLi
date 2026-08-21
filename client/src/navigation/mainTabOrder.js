export const MAIN_TAB_ORDER = ['Profile', 'Notifications', 'Auth', 'Favorites', 'Routes', 'Community', 'Home'];

export function getVisibleMainTabNames(isAuthenticated) {
  return MAIN_TAB_ORDER.filter((name) => (
    isAuthenticated ? name !== 'Auth' : !['Profile', 'Notifications'].includes(name)
  ));
}
