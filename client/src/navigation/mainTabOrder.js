export const MAIN_TAB_ORDER = ['Profile', 'Auth', 'Favorites', 'Routes', 'Community', 'Home'];

export function getVisibleMainTabNames(isAuthenticated) {
  return MAIN_TAB_ORDER.filter((name) => (
    isAuthenticated ? name !== 'Auth' : name !== 'Profile'
  ));
}
