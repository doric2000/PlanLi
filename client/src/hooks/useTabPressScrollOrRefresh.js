import { useCallback, useContext, useEffect, useRef } from "react";
import { NavigationContext } from "@react-navigation/native";

const TOP_THRESHOLD = 2;

/**
 * Bottom-tab re-press: scroll main vertical scrollable to top if not at top;
 * otherwise call onRefresh (same as pull-to-refresh).
 *
 * @param {object} options
 * @param {'scrollview'|'flatlist'} options.variant
 * @param {import('react').RefObject} [options.scrollRef]
 * @param {() => import('react').RefObject['current']} [options.getScrollRef] Use instead of scrollRef when the target changes (e.g. Favorites sub-tabs).
 * @param {() => void} [options.onRefresh]
 * @param {boolean} [options.enabled=true]
 * @param {unknown} [options.scrollYResetKey] When this value changes, internal scroll offset resets to 0 (e.g. tab or map mode switch).
 */
export function useTabPressScrollOrRefresh({
  variant,
  scrollRef,
  getScrollRef,
  onRefresh,
  enabled = true,
  scrollYResetKey,
}) {
  const navigation = useContext(NavigationContext);
  const scrollY = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    scrollY.current = 0;
  }, [scrollYResetKey]);

  const scrollToTop = useCallback(() => {
    const r = getScrollRef ? getScrollRef() : scrollRef?.current;
    if (!r) return;
    if (variant === "flatlist") {
      r.scrollToOffset?.({ offset: 0, animated: true });
    } else {
      r.scrollTo?.({ y: 0, animated: true });
    }
  }, [scrollRef, getScrollRef, variant]);

  useEffect(() => {
    if (!enabled || !navigation?.addListener) return undefined;
    return navigation.addListener("tabPress", () => {
      if (scrollY.current > TOP_THRESHOLD) {
        scrollToTop();
      } else {
        onRefreshRef.current?.();
      }
    });
  }, [navigation, scrollToTop, enabled]);

  const onScroll = useCallback((e) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  }, []);

  return { onScroll };
}
