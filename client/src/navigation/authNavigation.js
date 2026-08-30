const PUBLIC_MAIN_TABS = new Set(['Home', 'Community', 'Routes', 'Favorites']);

export const isAdminWebRuntime = () => process.env.EXPO_PUBLIC_ADMIN_WEB === 'true';

const normalizeFallbackTab = (screen) => (
  PUBLIC_MAIN_TABS.has(screen) ? screen : 'Home'
);

const AUTH_FLOW_PATH = (screen, screenParams) => ({
  screen: 'Tabs',
  params: {
    screen: 'Auth',
    params: {
      screen,
      ...(screenParams ? { params: screenParams } : {}),
    },
  },
});

const MAIN_TAB_PATH = (screen) => ({
  screen: 'Tabs',
  params: { screen },
});

const ADMIN_AUTH_PATH = (screen, screenParams) => ({
  screen,
  ...(screenParams ? { params: screenParams } : {}),
});

export function getRootNavigation(navigation) {
  let current = navigation;
  let parent = current?.getParent?.();
  while (parent) {
    current = parent;
    parent = current?.getParent?.();
  }
  return current;
}

export function openAuthFlow(navigation, screen = 'AuthEntry', screenParams) {
  if (isAdminWebRuntime()) {
    getRootNavigation(navigation)?.navigate?.('AdminAuth', ADMIN_AUTH_PATH(screen, screenParams));
    return;
  }
  getRootNavigation(navigation)?.navigate?.('Main', AUTH_FLOW_PATH(screen, screenParams));
}

export function openMainTab(navigation, screen = 'Home') {
  if (isAdminWebRuntime()) {
    getRootNavigation(navigation)?.navigate?.('AdminPanel');
    return;
  }
  getRootNavigation(navigation)?.navigate?.('Main', MAIN_TAB_PATH(screen));
}

export function getAuthFallbackTab(routeName) {
  return normalizeFallbackTab(routeName);
}

export function leaveAuthFlow(navigation, fallbackTab = 'Home') {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  openMainTab(navigation, normalizeFallbackTab(fallbackTab));
}

export function resetToRootRoute(navigation, name, params) {
  getRootNavigation(navigation)?.reset?.({
    index: 0,
    routes: [{ name, ...(params ? { params } : {}) }],
  });
}

export function resetToMain(navigation, params) {
  resetToRootRoute(navigation, isAdminWebRuntime() ? 'AdminPanel' : 'Main', params);
}

export function resetToAuthFlow(navigation, screen = 'AuthEntry', screenParams) {
  if (isAdminWebRuntime()) {
    resetToRootRoute(navigation, 'AdminAuth', ADMIN_AUTH_PATH(screen, screenParams));
    return;
  }
  resetToMain(navigation, AUTH_FLOW_PATH(screen, screenParams));
}
