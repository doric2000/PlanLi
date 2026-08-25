import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';

import {
  CREATOR_GUIDE_STEPS,
  MAIN_TOUR_STEPS,
} from './NoyaTourDefinitions';
import {
  NOYA_TOUR_IDS,
  NOYA_TOUR_STATUSES,
  emptyNoyaProductTourState,
  loadNoyaProductTourState,
  saveNoyaProductTourProgress,
} from './services/NoyaProductTourStorage';

const ROOT_SCOPE = 'root';
export const MAIN_TOUR_LOADING_TIMEOUT_MS = 8000;
export const MAIN_TOUR_TAB_REVEAL_DELAY_MS = 300;

const noop = () => {};
const NOOP_CONTEXT = Object.freeze({
  acknowledgeCreatorStep: noop,
  activeDefinition: null,
  activeStep: null,
  advanceMainTour: noop,
  backMainTour: noop,
  dismissActiveTour: noop,
  getTargetNode: () => null,
  isMainTransitionPending: false,
  isSuspended: false,
  loaded: false,
  notifyTargetLayout: noop,
  pendingMainDefinition: null,
  registerMainTabNavigation: () => noop,
  registerTarget: () => noop,
  requestCreatorStep: () => false,
  restartMainTour: () => Promise.resolve(),
  runActiveCreatorAction: noop,
  setMainTabSceneReady: noop,
  setTourSuspended: noop,
  suspendedRevision: 0,
  targetRevision: 0,
  tourState: emptyNoyaProductTourState(),
});
const NoyaTourContext = createContext(NOOP_CONTEXT);

const storageIdFor = (tourId) => {
  if (tourId === 'recommendation') return NOYA_TOUR_IDS.recommendation;
  if (tourId === 'route') return NOYA_TOUR_IDS.route;
  return tourId;
};

function definitionTargetIds(definition) {
  if (!Array.isArray(definition?.targets)) return [];
  return definition.targets.map((target) => target?.id).filter(Boolean);
}

export function NoyaTourProvider({
  children,
  currentRouteName = '',
  navigationReady = false,
  navigationRef,
}) {
  const [tourState, setTourState] = useState(emptyNoyaProductTourState);
  const [loaded, setLoaded] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [pendingStep, setPendingStep] = useState(null);
  const [targetRevision, setTargetRevision] = useState(0);
  const [sceneRevision, setSceneRevision] = useState(0);
  const [transitionRevision, setTransitionRevision] = useState(0);
  const [suspendedRevision, setSuspendedRevision] = useState(0);
  const targetRefs = useRef(new Map());
  const mainTabSceneReadiness = useRef(new Map());
  const suspendedReasons = useRef(new Set());
  const tabNavigationRef = useRef(null);
  const navigationScheduleRef = useRef(null);
  const transitionIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    loadNoyaProductTourState().then((state) => {
      if (!active) return;
      setTourState(state);
      setLoaded(true);
    });
    return () => { active = false; };
  }, []);

  const updateProgress = useCallback((tourId, patch) => {
    setTourState((current) => ({
      ...current,
      [tourId]: {
        ...current[tourId],
        ...patch,
      },
    }));
    return saveNoyaProductTourProgress(tourId, patch).then((state) => {
      setTourState(state);
      return state;
    });
  }, []);

  const registerTarget = useCallback((targetId, ref, scope = ROOT_SCOPE) => {
    if (!targetId || !ref) return () => {};
    const key = `${scope}:${targetId}`;
    targetRefs.current.set(key, ref);
    setTargetRevision((value) => value + 1);
    return () => {
      if (targetRefs.current.get(key) === ref) {
        targetRefs.current.delete(key);
        setTargetRevision((value) => value + 1);
      }
    };
  }, []);

  const notifyTargetLayout = useCallback(() => {
    setTargetRevision((value) => value + 1);
  }, []);

  const getTargetNode = useCallback((targetId, scope = ROOT_SCOPE) => (
    targetRefs.current.get(`${scope}:${targetId}`)?.current || null
  ), []);

  const setMainTabSceneReady = useCallback((tabName, ready) => {
    if (!tabName) return;
    if (ready == null) mainTabSceneReadiness.current.delete(tabName);
    else mainTabSceneReadiness.current.set(tabName, Boolean(ready));
    setSceneRevision((value) => value + 1);
  }, []);

  const registerMainTabNavigation = useCallback((navigation) => {
    if (navigation) tabNavigationRef.current = navigation;
    return () => {
      if (tabNavigationRef.current === navigation) tabNavigationRef.current = null;
    };
  }, []);

  const navigateToMainTab = useCallback((tabName) => {
    if (!tabName) return;
    try {
      if (navigationRef?.isReady?.()) navigationRef.navigate('Main');
    } catch {}
    const navigate = () => {
      try { tabNavigationRef.current?.navigate?.(tabName); } catch {}
    };
    navigate();
    setTimeout(navigate, 40);
  }, [navigationRef]);

  const cancelScheduledNavigation = useCallback(() => {
    const scheduled = navigationScheduleRef.current;
    if (!scheduled) return;
    if (scheduled.kind === 'frame' && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(scheduled.id);
    } else {
      clearTimeout(scheduled.id);
    }
    navigationScheduleRef.current = null;
  }, []);

  useEffect(() => cancelScheduledNavigation, [cancelScheduledNavigation]);

  const scheduleMainTabNavigation = useCallback((tabName) => {
    cancelScheduledNavigation();
    const navigate = () => {
      navigationScheduleRef.current = null;
      navigateToMainTab(tabName);
    };
    if (typeof requestAnimationFrame === 'function') {
      navigationScheduleRef.current = { kind: 'frame', id: requestAnimationFrame(navigate) };
    } else {
      navigationScheduleRef.current = { kind: 'timeout', id: setTimeout(navigate, 0) };
    }
  }, [cancelScheduledNavigation, navigateToMainTab]);

  const queueMainStep = useCallback((stepIndex) => {
    const boundedIndex = Math.max(0, Math.min(stepIndex, MAIN_TOUR_STEPS.length - 1));
    const definition = MAIN_TOUR_STEPS[boundedIndex];
    const requestedAt = Date.now();
    const requiresNavigation = Boolean(
      definition?.tabName && currentRouteName !== definition.tabName,
    );
    const next = {
      tourId: NOYA_TOUR_IDS.main,
      stepIndex: boundedIndex,
      scope: ROOT_SCOPE,
      transitionId: transitionIdRef.current + 1,
      requestedAt,
      routeReadyAt: requiresNavigation ? 0 : requestedAt,
      requiresNavigation,
    };
    transitionIdRef.current = next.transitionId;
    setActiveStep(null);
    setPendingStep(next);
    if (requiresNavigation) scheduleMainTabNavigation(definition.tabName);
    return updateProgress(NOYA_TOUR_IDS.main, {
      status: NOYA_TOUR_STATUSES.active,
      stepIndex: boundedIndex,
    });
  }, [currentRouteName, scheduleMainTabNavigation, updateProgress]);

  const mainProgress = tourState[NOYA_TOUR_IDS.main];

  useEffect(() => {
    if (
      !loaded
      || !navigationReady
      || currentRouteName !== 'Home'
      || activeStep
      || pendingStep
    ) return;
    if (mainProgress.status === NOYA_TOUR_STATUSES.unseen) {
      queueMainStep(0).catch(() => {});
      return;
    }
    if (mainProgress.status === NOYA_TOUR_STATUSES.active) {
      queueMainStep(Math.min(mainProgress.stepIndex, MAIN_TOUR_STEPS.length - 1)).catch(() => {});
    }
  }, [
    activeStep,
    currentRouteName,
    loaded,
    mainProgress.status,
    mainProgress.stepIndex,
    navigationReady,
    pendingStep,
    queueMainStep,
  ]);

  useEffect(() => {
    if (!pendingStep || pendingStep.tourId !== NOYA_TOUR_IDS.main) return undefined;
    const definition = MAIN_TOUR_STEPS[pendingStep.stepIndex];
    if (!definition) return undefined;

    if (definition.tabName && currentRouteName !== definition.tabName) return undefined;
    if (!pendingStep.routeReadyAt) {
      setPendingStep((current) => (
        current?.transitionId === pendingStep.transitionId
          ? { ...current, routeReadyAt: Date.now() }
          : current
      ));
      return undefined;
    }

    const now = Date.now();
    if (pendingStep.requiresNavigation) {
      const revealDelay = pendingStep.routeReadyAt + MAIN_TOUR_TAB_REVEAL_DELAY_MS - now;
      if (revealDelay > 0) {
        const timer = setTimeout(() => setTransitionRevision((value) => value + 1), revealDelay);
        return () => clearTimeout(timer);
      }
    }

    const sceneReady = !definition.tabName
      || mainTabSceneReadiness.current.get(definition.tabName) === true;
    const loadingElapsed = now - pendingStep.routeReadyAt;
    if (!sceneReady && loadingElapsed < MAIN_TOUR_LOADING_TIMEOUT_MS) {
      const timer = setTimeout(
        () => setTransitionRevision((value) => value + 1),
        MAIN_TOUR_LOADING_TIMEOUT_MS - loadingElapsed,
      );
      return () => clearTimeout(timer);
    }

    const targetsRegistered = definitionTargetIds(definition).every((targetId) => (
      Boolean(targetRefs.current.get(`${ROOT_SCOPE}:${targetId}`)?.current)
    ));
    if (!targetsRegistered) return undefined;

    setActiveStep({
      tourId: NOYA_TOUR_IDS.main,
      stepIndex: pendingStep.stepIndex,
      scope: ROOT_SCOPE,
    });
    setPendingStep(null);
    return undefined;
  }, [
    currentRouteName,
    pendingStep,
    sceneRevision,
    targetRevision,
    transitionRevision,
  ]);

  const advanceMainTour = useCallback(() => {
    if (activeStep?.tourId !== NOYA_TOUR_IDS.main) return;
    const currentIndex = activeStep.stepIndex;
    if (currentIndex >= MAIN_TOUR_STEPS.length - 1) {
      setActiveStep(null);
      setPendingStep(null);
      updateProgress(NOYA_TOUR_IDS.main, {
        status: NOYA_TOUR_STATUSES.completed,
        stepIndex: MAIN_TOUR_STEPS.length - 1,
      }).catch(() => {});
      navigateToMainTab('Home');
      return;
    }
    queueMainStep(currentIndex + 1).catch(() => {});
  }, [activeStep, navigateToMainTab, queueMainStep, updateProgress]);

  const backMainTour = useCallback(() => {
    if (activeStep?.tourId !== NOYA_TOUR_IDS.main || activeStep.stepIndex <= 0) return;
    queueMainStep(activeStep.stepIndex - 1).catch(() => {});
  }, [activeStep, queueMainStep]);

  const dismissActiveTour = useCallback(() => {
    if (!activeStep?.tourId) return;
    const tourId = activeStep.tourId;
    setActiveStep(null);
    setPendingStep(null);
    updateProgress(tourId, {
      status: NOYA_TOUR_STATUSES.dismissed,
      stepIndex: activeStep.stepIndex,
    }).catch(() => {});
    if (tourId === NOYA_TOUR_IDS.main) navigateToMainTab('Home');
  }, [activeStep, navigateToMainTab, updateProgress]);

  const restartMainTour = useCallback(() => {
    setActiveStep(null);
    setPendingStep(null);
    return queueMainStep(0);
  }, [queueMainStep]);

  const requestCreatorStep = useCallback((requestedTourId, requestedStepIndex, options = {}) => {
    const tourId = storageIdFor(requestedTourId);
    const definitions = CREATOR_GUIDE_STEPS[tourId];
    const stepIndex = Number(requestedStepIndex);
    if (!definitions || !Number.isSafeInteger(stepIndex) || !definitions[stepIndex] || !loaded) return false;
    const progress = tourState[tourId];
    if ([NOYA_TOUR_STATUSES.completed, NOYA_TOUR_STATUSES.dismissed].includes(progress.status)) return false;
    if (progress.status === NOYA_TOUR_STATUSES.active && progress.stepIndex > stepIndex) return false;
    if (activeStep?.tourId === NOYA_TOUR_IDS.main || pendingStep?.tourId === NOYA_TOUR_IDS.main) return false;
    if (activeStep?.tourId === tourId && activeStep.stepIndex === stepIndex) return true;
    if (activeStep && activeStep.tourId !== tourId) return false;
    const definition = definitions[stepIndex];
    const next = {
      tourId,
      stepIndex,
      scope: options.scope || definition.scope || ROOT_SCOPE,
      targetId: options.targetId || definition.targetId,
      primaryAction: typeof options.primaryAction === 'function' ? options.primaryAction : null,
      primaryLabel: String(options.primaryLabel || ''),
      suspendReason: String(options.suspendReason || ''),
    };
    setActiveStep(next);
    updateProgress(tourId, {
      status: NOYA_TOUR_STATUSES.active,
      stepIndex,
    }).catch(() => {});
    return true;
  }, [activeStep, loaded, pendingStep, tourState, updateProgress]);

  const runActiveCreatorAction = useCallback(() => {
    if (typeof activeStep?.primaryAction !== 'function') return;
    const action = activeStep.primaryAction;
    const suspendReason = activeStep.suspendReason;
    setActiveStep((current) => (current ? {
      ...current,
      primaryAction: null,
      primaryLabel: '',
      suspendReason: '',
    } : current));
    if (suspendReason) {
      suspendedReasons.current.add(suspendReason);
      setSuspendedRevision((value) => value + 1);
    }
    action();
  }, [activeStep]);

  const acknowledgeCreatorStep = useCallback(() => {
    const tourId = activeStep?.tourId;
    const definitions = CREATOR_GUIDE_STEPS[tourId];
    if (!definitions) return;
    const isLast = activeStep.stepIndex >= definitions.length - 1;
    const nextStepIndex = isLast ? activeStep.stepIndex : activeStep.stepIndex + 1;
    setActiveStep(null);
    updateProgress(tourId, {
      status: isLast ? NOYA_TOUR_STATUSES.completed : NOYA_TOUR_STATUSES.active,
      stepIndex: nextStepIndex,
    }).catch(() => {});
  }, [activeStep, updateProgress]);

  const setTourSuspended = useCallback((reason, suspended) => {
    if (!reason) return;
    if (suspended) suspendedReasons.current.add(reason);
    else suspendedReasons.current.delete(reason);
    setSuspendedRevision((value) => value + 1);
  }, []);

  const activeDefinition = useMemo(() => {
    if (!activeStep) return null;
    if (activeStep.tourId === NOYA_TOUR_IDS.main) {
      return MAIN_TOUR_STEPS[activeStep.stepIndex] || null;
    }
    return CREATOR_GUIDE_STEPS[activeStep.tourId]?.[activeStep.stepIndex] || null;
  }, [activeStep]);

  const pendingMainDefinition = useMemo(() => (
    pendingStep?.tourId === NOYA_TOUR_IDS.main
      ? MAIN_TOUR_STEPS[pendingStep.stepIndex] || null
      : null
  ), [pendingStep]);

  const value = useMemo(() => ({
    acknowledgeCreatorStep,
    activeDefinition,
    activeStep,
    advanceMainTour,
    backMainTour,
    dismissActiveTour,
    getTargetNode,
    isMainTransitionPending: Boolean(pendingStep?.tourId === NOYA_TOUR_IDS.main),
    isSuspended: suspendedReasons.current.size > 0,
    loaded,
    notifyTargetLayout,
    pendingMainDefinition,
    registerMainTabNavigation,
    registerTarget,
    requestCreatorStep,
    restartMainTour,
    runActiveCreatorAction,
    setMainTabSceneReady,
    setTourSuspended,
    suspendedRevision,
    targetRevision,
    tourState,
  }), [
    acknowledgeCreatorStep,
    activeDefinition,
    activeStep,
    advanceMainTour,
    backMainTour,
    dismissActiveTour,
    getTargetNode,
    loaded,
    notifyTargetLayout,
    pendingMainDefinition,
    pendingStep,
    registerMainTabNavigation,
    registerTarget,
    requestCreatorStep,
    restartMainTour,
    runActiveCreatorAction,
    setMainTabSceneReady,
    setTourSuspended,
    suspendedRevision,
    targetRevision,
    tourState,
  ]);

  return <NoyaTourContext.Provider value={value}>{children}</NoyaTourContext.Provider>;
}

export function useNoyaTour() {
  return useContext(NoyaTourContext);
}

export function useNoyaMainTabRegistration(navigation) {
  const { registerMainTabNavigation } = useNoyaTour();
  useEffect(() => registerMainTabNavigation(navigation), [navigation, registerMainTabNavigation]);
}

export function useNoyaMainTabSceneReady(tabName, ready) {
  const { setMainTabSceneReady } = useNoyaTour();
  useEffect(() => {
    setMainTabSceneReady(tabName, Boolean(ready));
  }, [ready, setMainTabSceneReady, tabName]);
  useEffect(() => () => {
    setMainTabSceneReady(tabName, null);
  }, [setMainTabSceneReady, tabName]);
}

export function useNoyaTourTargetRegistration(targetId, scope = ROOT_SCOPE) {
  const ref = useRef(null);
  const { notifyTargetLayout, registerTarget } = useNoyaTour();
  useEffect(() => registerTarget(targetId, ref, scope), [registerTarget, scope, targetId]);
  const onLayout = useCallback(() => notifyTargetLayout(), [notifyTargetLayout]);
  return useMemo(() => ({ onLayout, ref }), [onLayout]);
}

export function NoyaTourTarget({ children, scope = ROOT_SCOPE, style, targetId, testID }) {
  const { onLayout, ref } = useNoyaTourTargetRegistration(targetId, scope);
  return (
    <View
      collapsable={false}
      onLayout={onLayout}
      pointerEvents="box-none"
      ref={ref}
      style={style}
      testID={testID || `noya-tour-target-${targetId}`}
    >
      {children}
    </View>
  );
}

export { NOYA_TOUR_IDS, ROOT_SCOPE };
