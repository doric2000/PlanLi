import { useCallback, useLayoutEffect, useRef } from 'react';
import { getDrawerStatusFromState } from '@react-navigation/drawer';

export default function useDrawerCloseAction(sessionKey) {
  const pending = useRef(null);
  const transitionKey = useRef(null);
  const mounted = useRef(false);
  const session = useRef(sessionKey);

  useLayoutEffect(() => {
    mounted.current = true;
    session.current = sessionKey;
    pending.current = null;
    return () => {
      mounted.current = false;
      pending.current = null;
    };
  }, [sessionKey]);

  const onTransition = useCallback((event) => {
    if (event.type === 'transitionStart') {
      transitionKey.current = event.target;
      // Reopening cancels an interrupted close and its selected destination.
      if (!event.data.closing && pending.current
        && getDrawerStatusFromState(pending.current.navigation.getState()) === 'open') {
        pending.current = null;
      }
      return;
    }
    if (event.type !== 'transitionEnd') return;
    if (transitionKey.current === event.target) transitionKey.current = null;
    const request = pending.current;
    if (!request || request.drawerKey !== event.target) return;
    const isClosed = getDrawerStatusFromState(request.navigation.getState()) === 'closed';
    // A queued opening-completion event can arrive after a tap requested close.
    if (!event.data.closing && isClosed) return;
    pending.current = null;
    if (event.data.closing && isClosed && mounted.current && request.sessionKey === session.current) {
      request.action();
    }
  }, []);

  const runAfterClose = useCallback((navigation, action) => {
    if (!mounted.current || pending.current) return;
    const state = navigation.getState();
    if (getDrawerStatusFromState(state) === 'closed' && transitionKey.current !== state.key) {
      action();
      return;
    }
    pending.current = { action, navigation, drawerKey: state.key, sessionKey: session.current };
    navigation.closeDrawer();
  }, []);

  return { runAfterClose, onTransition };
}
