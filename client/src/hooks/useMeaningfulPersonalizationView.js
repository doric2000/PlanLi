import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

const MEANINGFUL_VIEW_MS = 8_000;

export function useMeaningfulPersonalizationView({ item, navigation, record, enabled = true }) {
  const [isFocused, setIsFocused] = useState(() => navigation?.isFocused?.() ?? true);
  const stateRef = useRef({ key: '', elapsedMs: 0, startedAtMs: 0, recorded: false });
  const itemKey = item?.id || item?.routeId || item?.postId || '';

  useEffect(() => {
    stateRef.current = { key: itemKey, elapsedMs: 0, startedAtMs: 0, recorded: false };
  }, [itemKey]);

  useEffect(() => {
    if (typeof navigation?.addListener !== 'function') return undefined;
    setIsFocused(navigation.isFocused?.() ?? true);
    const removeFocus = navigation.addListener('focus', () => setIsFocused(true));
    const removeBlur = navigation.addListener('blur', () => setIsFocused(false));
    return () => {
      removeFocus?.();
      removeBlur?.();
    };
  }, [navigation]);

  useEffect(() => {
    if (!enabled || !itemKey || !isFocused) return undefined;
    let timer = null;
    let appState = AppState.currentState;

    const pause = () => {
      clearTimeout(timer);
      timer = null;
      const state = stateRef.current;
      if (state.startedAtMs) {
        state.elapsedMs += Date.now() - state.startedAtMs;
        state.startedAtMs = 0;
      }
    };

    const start = () => {
      const state = stateRef.current;
      if (state.recorded || state.startedAtMs || ['background', 'inactive'].includes(appState)) return;
      state.startedAtMs = Date.now();
      const remaining = Math.max(0, MEANINGFUL_VIEW_MS - state.elapsedMs);
      timer = setTimeout(() => {
        pause();
        if (stateRef.current.recorded) return;
        stateRef.current.recorded = true;
        Promise.resolve(record(item)).catch(() => {});
      }, remaining);
    };

    const subscription = AppState.addEventListener('change', (nextState) => {
      appState = nextState;
      if (nextState === 'active') start();
      else pause();
    });
    start();
    return () => {
      pause();
      subscription.remove();
    };
  }, [enabled, isFocused, item, itemKey, record]);
}

export { MEANINGFUL_VIEW_MS };
