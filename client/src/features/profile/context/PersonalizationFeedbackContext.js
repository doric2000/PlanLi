import { randomUUID } from 'expo-crypto';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { setPersonalizationFeedback } from '../../../services/PersonalizationService';
import { colors } from '../../../styles/colors';
import { fontFamilies } from '../../../styles/typography';
import { useAuth } from '../../auth/AuthContext';

const PersonalizationFeedbackContext = createContext(null);

function pathForTarget(target) {
  if (!target?.id) return '';
  return `${target.type === 'route' ? 'routes' : 'recommendations'}/${target.id}`;
}

export function PersonalizationFeedbackProvider({ children }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const principal = user?.uid || 'guest';
  const [hiddenPaths, setHiddenPaths] = useState(() => new Set());
  const [notice, setNotice] = useState(null);
  const timerRef = useRef(null);
  const principalRef = useRef(principal);

  useEffect(() => {
    if (principalRef.current === principal) return;
    principalRef.current = principal;
    clearTimeout(timerRef.current);
    setHiddenPaths(new Set());
    setNotice(null);
  }, [principal]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const hide = useCallback(async ({ target, item }) => {
    const path = pathForTarget(target);
    if (!path) return false;
    const operationPrincipal = principal;
    const requestId = randomUUID();
    clearTimeout(timerRef.current);
    setHiddenPaths((current) => new Set([...current, path]));
    const operation = setPersonalizationFeedback({ target, item, value: 'less', requestId });
    setNotice({ path, target, item, requestId, operation, kind: 'undo' });
    timerRef.current = setTimeout(() => setNotice(null), 6000);
    try {
      await operation;
      return true;
    } catch {
      if (principalRef.current !== operationPrincipal) return false;
      clearTimeout(timerRef.current);
      setHiddenPaths((current) => {
        const next = new Set(current);
        next.delete(path);
        return next;
      });
      setNotice({ kind: 'error' });
      timerRef.current = setTimeout(() => setNotice(null), 4500);
      return false;
    }
  }, [principal]);

  const undo = useCallback(async () => {
    if (notice?.kind !== 'undo') return;
    const previous = notice;
    clearTimeout(timerRef.current);
    setNotice(null);
    setHiddenPaths((current) => {
      const next = new Set(current);
      next.delete(previous.path);
      return next;
    });
    try {
      await previous.operation;
    } catch {
      if (principalRef.current !== principal) return;
      setNotice({ kind: 'error' });
      timerRef.current = setTimeout(() => setNotice(null), 4500);
      return;
    }
    try {
      await setPersonalizationFeedback({
        target: previous.target,
        item: previous.item,
        value: 'undo',
        requestId: previous.requestId,
      });
    } catch {
      if (principalRef.current !== principal) return;
      setHiddenPaths((current) => new Set([...current, previous.path]));
      setNotice({ kind: 'error' });
      timerRef.current = setTimeout(() => setNotice(null), 4500);
    }
  }, [notice, principal]);

  const value = useMemo(() => ({
    hide,
    isHidden: (target) => hiddenPaths.has(pathForTarget(target)),
  }), [hide, hiddenPaths]);

  return (
    <PersonalizationFeedbackContext.Provider value={value}>
      {children}
      {notice ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.notice, { bottom: Math.max(24, insets.bottom + 82) }]}
        >
          <AppText style={styles.noticeText}>
            {notice.kind === 'undo' ? 'הפריט הוסר מבשבילך' : 'לא הצלחנו לעדכן. כדאי לנסות שוב.'}
          </AppText>
          {notice.kind === 'undo' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ביטול הסרת הפריט"
              hitSlop={10}
              onPress={undo}
              style={styles.undoButton}
            >
              <AppText style={styles.undoText}>ביטול</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </PersonalizationFeedbackContext.Provider>
  );
}

export function usePersonalizationFeedback() {
  const context = useContext(PersonalizationFeedbackContext);
  if (!context) return { hide: async () => false, isHidden: () => false };
  return context;
}

const styles = StyleSheet.create({
  notice: {
    position: 'absolute',
    zIndex: 2000,
    elevation: 20,
    left: 18,
    right: 18,
    minHeight: 54,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  noticeText: {
    flex: 1,
    color: colors.white,
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  undoButton: {
    minWidth: 52,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoText: {
    color: colors.brandOrange,
    fontFamily: fontFamilies.bold,
    fontSize: 15,
  },
});
