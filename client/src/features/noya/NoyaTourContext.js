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
  NOYA_MAIN_TARGETS,
} from './NoyaTourDefinitions';
import {
  NOYA_TOUR_IDS,
  NOYA_TOUR_STATUSES,
  emptyNoyaProductTourState,
  loadNoyaProductTourState,
  saveNoyaProductTourProgress,
} from './services/NoyaProductTourStorage';

const ROOT_SCOPE = 'root';
const noop = () => {};
const NOOP_CONTEXT = Object.freeze({
  acknowledgeCreatorStep: noop,
  activeDefinition: null,
  activeStep: null,
  advanceMainTour: noop,
  backMainTour: noop,
  dismissActiveTour: noop,
  getTargetNode: () => null,
  isSuspended: false,
  loaded: false,
  notifyTargetLayout: noop,
  registerMainTabNavigation: () => noop,
  registerTarget: () => noop,
  requestCreatorStep: () => false,
  restartMainTour: () => Promise.resolve(),
  runActiveCreatorAction: noop,
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

export function NoyaTourProvider({
  children,
  currentRouteName = '',
  navigationReady = false,
  navigationRef,
}) {
  const [tourState, setTourState] = useState(emptyNoyaProductTourState);
  const [loaded, setLoaded] = useState(false);
  const [activeStep, setActiveStep] = useState(null);
  const [targetRevision, setTargetRevision] = useState(0);
  const [suspendedRevision, setSuspendedRevision] = useState(0);
  const targetRefs = useRef(new Map());
  const suspendedReasons = useRef(new Set());
  const tabNavigationRef = useRef(null);

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

  const mainProgress = tourState[NOYA_TOUR_IDS.main];
  const homeTargetReady = targetRefs.current.has(`${ROOT_SCOPE}:${NOYA_MAIN_TARGETS.Home}`);

  useEffect(() => {
    if (!loaded || !navigationReady || currentRouteName !== 'Home' || !homeTargetReady || activeStep) return;
    if (mainProgress.status === NOYA_TOUR_STATUSES.unseen) {
      const next = { tourId: NOYA_TOUR_IDS.main, stepIndex: 0, scope: ROOT_SCOPE };
      setActiveStep(next);
      updateProgress(NOYA_TOUR_IDS.main, {
        status: NOYA_TOUR_STATUSES.active,
        stepIndex: 0,
      }).catch(() => {});
      return;
    }
    if (mainProgress.status === NOYA_TOUR_STATUSES.active) {
      const stepIndex = Math.min(mainProgress.stepIndex, MAIN_TOUR_STEPS.length - 1);
      const step = MAIN_TOUR_STEPS[stepIndex];
      if (step?.tabName) navigateToMainTab(step.tabName);
      setActiveStep({ tourId: NOYA_TOUR_IDS.main, stepIndex, scope: ROOT_SCOPE });
    }
  }, [
    activeStep,
    currentRouteName,
    homeTargetReady,
    loaded,
    mainProgress.status,
    mainProgress.stepIndex,
    navigateToMainTab,
    navigationReady,
    updateProgress,
  ]);

  const advanceMainTour = useCallback(() => {
    if (activeStep?.tourId !== NOYA_TOUR_IDS.main) return;
    const currentIndex = activeStep.stepIndex;
    if (currentIndex >= MAIN_TOUR_STEPS.length - 1) {
      setActiveStep(null);
      updateProgress(NOYA_TOUR_IDS.main, {
        status: NOYA_TOUR_STATUSES.completed,
        stepIndex: MAIN_TOUR_STEPS.length - 1,
      }).catch(() => {});
      navigateToMainTab('Home');
      return;
    }
    const stepIndex = currentIndex + 1;
    const step = MAIN_TOUR_STEPS[stepIndex];
    if (step?.tabName) navigateToMainTab(step.tabName);
    setActiveStep({ tourId: NOYA_TOUR_IDS.main, stepIndex, scope: ROOT_SCOPE });
    updateProgress(NOYA_TOUR_IDS.main, {
      status: NOYA_TOUR_STATUSES.active,
      stepIndex,
    }).catch(() => {});
  }, [activeStep, navigateToMainTab, updateProgress]);

  const backMainTour = useCallback(() => {
    if (activeStep?.tourId !== NOYA_TOUR_IDS.main || activeStep.stepIndex <= 0) return;
    const stepIndex = activeStep.stepIndex - 1;
    const step = MAIN_TOUR_STEPS[stepIndex];
    if (step?.tabName) navigateToMainTab(step.tabName);
    setActiveStep({ tourId: NOYA_TOUR_IDS.main, stepIndex, scope: ROOT_SCOPE });
    updateProgress(NOYA_TOUR_IDS.main, {
      status: NOYA_TOUR_STATUSES.active,
      stepIndex,
    }).catch(() => {});
  }, [activeStep, navigateToMainTab, updateProgress]);

  const dismissActiveTour = useCallback(() => {
    if (!activeStep?.tourId) return;
    const tourId = activeStep.tourId;
    setActiveStep(null);
    updateProgress(tourId, {
      status: NOYA_TOUR_STATUSES.dismissed,
      stepIndex: activeStep.stepIndex,
    }).catch(() => {});
    if (tourId === NOYA_TOUR_IDS.main) navigateToMainTab('Home');
  }, [activeStep, navigateToMainTab, updateProgress]);

  const restartMainTour = useCallback(() => {
    navigateToMainTab('Home');
    setActiveStep({ tourId: NOYA_TOUR_IDS.main, stepIndex: 0, scope: ROOT_SCOPE });
    return updateProgress(NOYA_TOUR_IDS.main, {
      status: NOYA_TOUR_STATUSES.active,
      stepIndex: 0,
    });
  }, [navigateToMainTab, updateProgress]);

  const requestCreatorStep = useCallback((requestedTourId, requestedStepIndex, options = {}) => {
    const tourId = storageIdFor(requestedTourId);
    const definitions = CREATOR_GUIDE_STEPS[tourId];
    const stepIndex = Number(requestedStepIndex);
    if (!definitions || !Number.isSafeInteger(stepIndex) || !definitions[stepIndex] || !loaded) return false;
    const progress = tourState[tourId];
    if ([NOYA_TOUR_STATUSES.completed, NOYA_TOUR_STATUSES.dismissed].includes(progress.status)) return false;
    if (progress.status === NOYA_TOUR_STATUSES.active && progress.stepIndex > stepIndex) return false;
    if (activeStep?.tourId === NOYA_TOUR_IDS.main) return false;
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
  }, [activeStep, loaded, tourState, updateProgress]);

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

  const value = useMemo(() => ({
    acknowledgeCreatorStep,
    activeDefinition,
    activeStep,
    advanceMainTour,
    backMainTour,
    dismissActiveTour,
    getTargetNode,
    isSuspended: suspendedReasons.current.size > 0,
    loaded,
    notifyTargetLayout,
    registerMainTabNavigation,
    registerTarget,
    requestCreatorStep,
    restartMainTour,
    runActiveCreatorAction,
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
    registerMainTabNavigation,
    registerTarget,
    requestCreatorStep,
    restartMainTour,
    runActiveCreatorAction,
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
  useEffect(() => {
    registerMainTabNavigation(navigation);
  }, [navigation, registerMainTabNavigation]);
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
