// Physical left-to-right destinations. The integrated Create action is inserted by MainTabBar.
export const MAIN_TAB_ORDER = ['Profile', 'Auth', 'Favorites', 'Community', 'Home'];

export function getVisibleMainTabNames(isAuthenticated) {
  return MAIN_TAB_ORDER.filter((name) => isAuthenticated ? name !== 'Auth' : name !== 'Profile');
}
