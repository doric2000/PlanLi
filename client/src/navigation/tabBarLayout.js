/**
 * Must match TabNavigator tabBarStyle.bottom offset and tabNavigatorStyles.tabBar.height.
 * @see client/src/navigation/TabNavigator.js
 * @see tabNavigatorStyles.tabBar in client/src/styles/appStyles.js
 */
export const TAB_BAR_HEIGHT = 70;

const TAB_BAR_BOTTOM_MIN = 10;
const FAB_GAP_ABOVE_TAB_BAR = 12;

/** buttons.fab height (width) */
export const FAB_SIZE = 60;

/** Extra scroll padding below FAB */
export const FAB_LIST_TAIL_PADDING = 16;

/**
 * Distance from screen bottom to FAB's bottom edge so it sits above the floating tab pill.
 * @param {{ bottom?: number }} insets - useSafeAreaInsets()
 */
export function getFabBottomInset(insets) {
  const bottom = Math.max(insets?.bottom ?? 0, TAB_BAR_BOTTOM_MIN);
  return bottom + TAB_BAR_HEIGHT + FAB_GAP_ABOVE_TAB_BAR;
}

/**
 * FlatList / ScrollView paddingBottom so last items clear FAB + gutter.
 */
export function getTabSceneListPaddingBottom(insets) {
  return getFabBottomInset(insets) + FAB_SIZE + FAB_LIST_TAIL_PADDING;
}
