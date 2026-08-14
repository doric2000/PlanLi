const AUTH_FLOW_PATH = (screen) => ({
  screen: 'Tabs',
  params: {
    screen: 'Auth',
    params: { screen },
  },
});

const MAIN_TAB_PATH = (screen) => ({
  screen: 'Tabs',
  params: { screen },
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

export function openAuthFlow(navigation, screen = 'AuthEntry') {
  getRootNavigation(navigation)?.navigate?.('Main', AUTH_FLOW_PATH(screen));
}

export function openMainTab(navigation, screen = 'Home') {
  getRootNavigation(navigation)?.navigate?.('Main', MAIN_TAB_PATH(screen));
}

export function resetToRootRoute(navigation, name, params) {
  getRootNavigation(navigation)?.reset?.({
    index: 0,
    routes: [{ name, ...(params ? { params } : {}) }],
  });
}

export function resetToMain(navigation, params) {
  resetToRootRoute(navigation, 'Main', params);
}
