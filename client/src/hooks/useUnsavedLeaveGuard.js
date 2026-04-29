import { useCallback, useEffect, useRef } from 'react';

/**
 * Header back + beforeRemove guard when the form may have unsaved edits.
 * Uses refs for hasUnsavedChanges/submitting so listeners always see current values.
 *
 * @param {Object} options
 * @param {Object} options.navigation - React Navigation object with goBack, dispatch, addListener
 * @param {boolean} options.guardActive - e.g. edit mode with a loaded entity
 * @param {string|number|null|undefined} options.sessionKey - when this changes, allowLeave is reset
 * @param {boolean} options.hasUnsavedChanges
 * @param {boolean} options.submitting
 * @param {(onConfirmLeave: () => void) => void} options.openUnsavedPrompt - show UI; call onConfirmLeave if user discards
 */
export function useUnsavedLeaveGuard({
  navigation,
  guardActive,
  sessionKey,
  hasUnsavedChanges,
  submitting,
  openUnsavedPrompt,
}) {
  const allowLeaveRef = useRef(false);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;
  const submittingRef = useRef(submitting);
  submittingRef.current = submitting;

  useEffect(() => {
    allowLeaveRef.current = false;
  }, [sessionKey, guardActive]);

  const handleHeaderBackPress = useCallback(() => {
    if (submittingRef.current) return;
    if (!guardActive || !hasUnsavedChangesRef.current) {
      navigation.goBack();
      return;
    }
    openUnsavedPrompt(() => {
      allowLeaveRef.current = true;
      navigation.goBack();
    });
  }, [navigation, guardActive, openUnsavedPrompt]);

  useEffect(() => {
    if (!guardActive) {
      return undefined;
    }
    const sub = navigation.addListener('beforeRemove', (e) => {
      if (allowLeaveRef.current) return;
      if (submittingRef.current) {
        e.preventDefault();
        return;
      }
      if (!hasUnsavedChangesRef.current) return;
      e.preventDefault();
      openUnsavedPrompt(() => {
        allowLeaveRef.current = true;
        navigation.dispatch(e.data.action);
      });
    });
    return sub;
  }, [navigation, guardActive, sessionKey, openUnsavedPrompt]);

  return { allowLeaveRef, handleHeaderBackPress };
}
