const mockStorage = new Map();
jest.setTimeout(30000);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => Promise.resolve(mockStorage.get(key) || null)),
  setItem: jest.fn((key, value) => { mockStorage.set(key, value); return Promise.resolve(); }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Rect } from 'react-native-svg';

import {
  MAIN_TOUR_LOADING_TIMEOUT_MS,
  NoyaTourProvider,
  useNoyaMainTabRegistration,
  useNoyaMainTabSceneReady,
  useNoyaTourTargetRegistration,
  useNoyaTour,
} from '../src/features/noya/NoyaTourContext';
import {
  CREATOR_GUIDE_STEPS,
  MAIN_TOUR_STEPS,
  NOYA_CREATOR_TARGETS,
  NOYA_MAIN_TAB_TARGETS,
  NOYA_MAIN_TARGETS,
} from '../src/features/noya/NoyaTourDefinitions';
import NoyaTourOverlayHost, {
  bubbleTopForTarget,
  rectInOverlay,
  safeInsetsInOverlay,
  spotlightForTarget,
} from '../src/features/noya/NoyaTourOverlay';
import {
  __resetNoyaProductTourStorageForTests,
  NOYA_PRODUCT_TOUR_STORAGE_KEY,
  NOYA_TOUR_IDS,
} from '../src/features/noya/services/NoyaProductTourStorage';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

let mockOverlayWindowRect = { x: 0, y: 0, width: 390, height: 844 };
const measureMockOverlay = () => mockOverlayWindowRect;

const MAIN_TARGET_RECTS = Object.freeze({
  [NOYA_MAIN_TAB_TARGETS.Home]: { x: 310, y: 760, width: 50, height: 50 },
  [NOYA_MAIN_TAB_TARGETS.Community]: { x: 220, y: 760, width: 50, height: 50 },
  [NOYA_MAIN_TARGETS.homeSearch]: { x: 24, y: 118, width: 286, height: 48 },
  [NOYA_MAIN_TARGETS.communitySearch]: { x: 24, y: 118, width: 286, height: 48 },
});

function TourFrame({ children }) {
  return <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{children}</SafeAreaProvider>;
}

function DirectTourTarget({ children, rect, scope, targetId }) {
  const target = useNoyaTourTargetRegistration(targetId, scope);
  const measuredRect = rect || { x: 24, y: 120, width: 180, height: 48 };
  useEffect(() => {
    const node = {
      measureInWindow: (callback) => callback(
        measuredRect.x,
        measuredRect.y,
        measuredRect.width,
        measuredRect.height,
      ),
    };
    target.ref.current = node;
    target.onLayout();
    return () => {
      if (target.ref.current === node) target.ref.current = null;
    };
  }, [
    measuredRect.height,
    measuredRect.width,
    measuredRect.x,
    measuredRect.y,
    target.onLayout,
    target.ref,
  ]);
  return <View>{children}</View>;
}

function MainTourHarness({ readiness, tabNavigation }) {
  useNoyaMainTabRegistration(tabNavigation);
  useNoyaMainTabSceneReady('Home', readiness.Home);
  useNoyaMainTabSceneReady('Community', readiness.Community);
  const { pendingMainDefinition } = useNoyaTour();
  return (
    <>
      <Text testID="pending-main-definition">{pendingMainDefinition?.id || ''}</Text>
      {Object.entries(MAIN_TARGET_RECTS).map(([targetId, rect]) => (
        <DirectTourTarget key={targetId} rect={rect} targetId={targetId}>
          <Text>{targetId}</Text>
        </DirectTourTarget>
      ))}
      <NoyaTourOverlayHost measureOverlayRect={measureMockOverlay} />
    </>
  );
}

function MainTourApp({ communityReady = true, navigationRef, onTabNavigate }) {
  const [currentRouteName, setCurrentRouteName] = useState('Home');
  const readiness = useMemo(() => ({
    Home: true,
    Community: communityReady,
  }), [communityReady]);
  const tabNavigation = useMemo(() => ({
    navigate: (tabName) => {
      onTabNavigate?.(tabName);
      setCurrentRouteName(tabName);
    },
  }), [onTabNavigate]);
  return (
    <NoyaTourProvider
      currentRouteName={currentRouteName}
      navigationReady
      navigationRef={navigationRef}
    >
      <MainTourHarness readiness={readiness} tabNavigation={tabNavigation} />
    </NoyaTourProvider>
  );
}

function CreatorHarness({ stage = 0, suspended = false }) {
  const { requestCreatorStep, setTourSuspended } = useNoyaTour();
  useEffect(() => {
    requestCreatorStep('recommendation', stage);
  }, [requestCreatorStep, stage]);
  useEffect(() => {
    setTourSuspended('test-media', suspended);
    return () => setTourSuspended('test-media', false);
  }, [setTourSuspended, suspended]);
  const targetId = stage === 0
    ? NOYA_CREATOR_TARGETS.recommendationPhotos
    : stage === 1
      ? NOYA_CREATOR_TARGETS.recommendationLocation
      : NOYA_CREATOR_TARGETS.recommendationTaxonomy;
  return (
    <>
      <DirectTourTarget targetId={targetId}><Text>שדה</Text></DirectTourTarget>
      <NoyaTourOverlayHost measureOverlayRect={measureMockOverlay} />
    </>
  );
}

function RouteStopHarness() {
  const { requestCreatorStep } = useNoyaTour();
  useEffect(() => {
    requestCreatorStep('route', 1, { scope: 'route-stop-editor' });
  }, [requestCreatorStep]);
  return (
    <>
      <DirectTourTarget scope="route-stop-editor" targetId={NOYA_CREATOR_TARGETS.routeStop}>
        <Text>שם העצירה וסוג המיקום</Text>
      </DirectTourTarget>
      <NoyaTourOverlayHost measureOverlayRect={measureMockOverlay} scope="route-stop-editor" />
    </>
  );
}

function CreatorMediaHarness() {
  const [mediaOpen, setMediaOpen] = useState(false);
  const { requestCreatorStep, setTourSuspended } = useNoyaTour();
  const openMedia = useCallback(() => setMediaOpen(true), []);
  useEffect(() => {
    requestCreatorStep('recommendation', 0, {
      primaryAction: openMedia,
      primaryLabel: 'בחירת תמונות',
      suspendReason: 'test-media-action',
    });
  }, [openMedia, requestCreatorStep]);
  useEffect(() => {
    setTourSuspended('test-media-action', mediaOpen);
    return () => setTourSuspended('test-media-action', false);
  }, [mediaOpen, setTourSuspended]);
  return (
    <>
      <DirectTourTarget targetId={NOYA_CREATOR_TARGETS.recommendationPhotos}>
        <Text>תמונות</Text>
      </DirectTourTarget>
      {mediaOpen ? (
        <TouchableOpacity onPress={() => setMediaOpen(false)} testID="test-close-media">
          <Text>קומפוזר פתוח</Text>
        </TouchableOpacity>
      ) : null}
      <NoyaTourOverlayHost measureOverlayRect={measureMockOverlay} />
    </>
  );
}

describe('NoyaTourProvider', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockStorage.clear();
    mockOverlayWindowRect = { x: 0, y: 0, width: 390, height: 844 };
    __resetNoyaProductTourStorageForTests();
  });

  it('defines one concise recommendation composer guide for the single-page flow', () => {
    const guide = CREATOR_GUIDE_STEPS[NOYA_TOUR_IDS.recommendation];
    expect(guide).toHaveLength(1);
    expect(guide[0]).toEqual(expect.objectContaining({
      targetId: NOYA_CREATOR_TARGETS.recommendationPhotos,
      title: 'הכול בעמוד אחד',
    }));
    expect(guide[0].message).toContain('הטיוטה נשמרת ברקע');
  });

  it('defines the complete 11-step overview with tab and exact-control targets', () => {
    const contentSteps = MAIN_TOUR_STEPS.filter((step) => step.progress);
    expect(contentSteps).toHaveLength(11);
    expect(contentSteps.map((step) => step.id)).toEqual([
      'home-search',
      'community-search',
      'community-filter',
      'community-sort',
      'community-map',
      'community-add',
      'routes-search',
      'routes-filter',
      'routes-sort',
      'routes-add',
      'favorites',
    ]);
    expect(contentSteps.map((step) => step.progress)).toEqual(
      contentSteps.map((_, index) => ({ current: index + 1, total: 11 })),
    );
    expect(contentSteps[0].targets.map((target) => target.id)).toEqual([
      NOYA_MAIN_TAB_TARGETS.Home,
      NOYA_MAIN_TARGETS.homeSearch,
    ]);
    expect(contentSteps[1].targets.map((target) => target.id)).toEqual([
      NOYA_MAIN_TAB_TARGETS.Community,
      NOYA_MAIN_TARGETS.communitySearch,
    ]);
    expect(contentSteps[5].message).toContain('כפתור הפלוס');
    expect(contentSteps[9].message).toContain('נועה תלווה');
  });

  it('removes the overlay during navigation, then spotlights the tab and exact control', async () => {
    const onTabNavigate = jest.fn();
    const navigationRef = { isReady: () => true, navigate: jest.fn() };
    const screen = render(
      <TourFrame>
        <MainTourApp navigationRef={navigationRef} onTabNavigate={onTabNavigate} />
      </TourFrame>,
    );

    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(screen.getByText('מתחילים מהיעד')).toBeTruthy());
    expect(screen.getByTestId('noya-tour-progress').props.children).toBe('1 מתוך 11');
    expect(screen.UNSAFE_getAllByType(Rect).filter((node) => node.props.stroke === '#F5961D')).toHaveLength(2);

    fireEvent.press(screen.getByTestId('noya-tour-next'));
    expect(screen.queryByTestId('noya-tour-bubble')).toBeNull();
    expect(screen.getByTestId('pending-main-definition').props.children).toBe('community-search');
    await waitFor(() => expect(onTabNavigate).toHaveBeenCalledWith('Community'));
    await waitFor(() => expect(screen.getByText('המלצות מהקהילה')).toBeTruthy());
    expect(screen.getByTestId('noya-tour-progress').props.children).toBe('2 מתוך 11');
    expect(screen.UNSAFE_getAllByType(Rect).filter((node) => node.props.stroke === '#F5961D')).toHaveLength(2);
  });

  it('waits for the destination scene to settle before showing its copy', async () => {
    const onTabNavigate = jest.fn();
    const screen = render(
      <TourFrame>
        <MainTourApp communityReady={false} onTabNavigate={onTabNavigate} />
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(screen.getByText('מתחילים מהיעד')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(onTabNavigate).toHaveBeenCalledWith('Community'));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 420)));
    expect(screen.queryByTestId('noya-tour-bubble')).toBeNull();

    screen.rerender(
      <TourFrame>
        <MainTourApp communityReady onTabNavigate={onTabNavigate} />
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('המלצות מהקהילה')).toBeTruthy());
  });

  it('uses the bounded eight-second fallback when loading never settles', async () => {
    const onTabNavigate = jest.fn();
    const screen = render(
      <TourFrame>
        <MainTourApp communityReady={false} onTabNavigate={onTabNavigate} />
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(screen.getByText('מתחילים מהיעד')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(onTabNavigate).toHaveBeenCalledWith('Community'));
    await waitFor(
      () => expect(screen.getByText('המלצות מהקהילה')).toBeTruthy(),
      { timeout: MAIN_TOUR_LOADING_TIMEOUT_MS + 2000 },
    );
  });

  it('keeps creator guides independent when the main tour is skipped', async () => {
    const screen = render(
      <TourFrame>
        <MainTourApp />
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-skip'));
    await waitFor(() => expect(screen.queryByTestId('noya-tour-bubble')).toBeNull());
    const state = JSON.parse(mockStorage.get(NOYA_PRODUCT_TOUR_STORAGE_KEY));
    expect(state.mainTour.status).toBe('dismissed');
    expect(state.recommendationGuide.status).toBe('unseen');
    expect(state.routeGuide.status).toBe('unseen');
  });

  it('hides a creator spotlight while media is open and restores it afterwards', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_STORAGE_KEY, JSON.stringify({
      mainTour: { status: 'completed', stepIndex: MAIN_TOUR_STEPS.length - 1 },
    }));
    __resetNoyaProductTourStorageForTests();
    const screen = render(
      <TourFrame>
        <NoyaTourProvider navigationReady>
          <CreatorHarness />
        </NoyaTourProvider>
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('הכול בעמוד אחד')).toBeTruthy());
    screen.rerender(
      <TourFrame>
        <NoyaTourProvider navigationReady>
          <CreatorHarness suspended />
        </NoyaTourProvider>
      </TourFrame>,
    );
    await waitFor(() => expect(screen.queryByTestId('noya-tour-bubble')).toBeNull());
    screen.rerender(
      <TourFrame>
        <NoyaTourProvider navigationReady>
          <CreatorHarness />
        </NoyaTourProvider>
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('הכול בעמוד אחד')).toBeTruthy());
    await act(async () => {});
  });

  it('waits until Home is focused before offering the main tour', async () => {
    const tabNavigation = { navigate: jest.fn() };
    const readiness = { Home: true, Community: true };
    const screen = render(
      <TourFrame>
        <NoyaTourProvider currentRouteName="PreferenceSetup" navigationReady>
          <MainTourHarness readiness={readiness} tabNavigation={tabNavigation} />
        </NoyaTourProvider>
      </TourFrame>,
    );
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(screen.queryByText('סיור קצר עם נועה')).toBeNull();
    expect(mockStorage.has(NOYA_PRODUCT_TOUR_STORAGE_KEY)).toBe(false);

    screen.rerender(
      <TourFrame>
        <NoyaTourProvider currentRouteName="Home" navigationReady>
          <MainTourHarness readiness={readiness} tabNavigation={tabNavigation} />
        </NoyaTourProvider>
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
  });

  it('opens media from the creator guide, suspends the overlay, and restores the same step', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_STORAGE_KEY, JSON.stringify({
      mainTour: { status: 'completed', stepIndex: MAIN_TOUR_STEPS.length - 1 },
    }));
    __resetNoyaProductTourStorageForTests();
    const screen = render(
      <TourFrame>
        <NoyaTourProvider currentRouteName="Home" navigationReady>
          <CreatorMediaHarness />
        </NoyaTourProvider>
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('הכול בעמוד אחד')).toBeTruthy());
    expect(screen.getByText('בחירת תמונות')).toBeTruthy();
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(screen.getByText('קומפוזר פתוח')).toBeTruthy());
    expect(screen.queryByTestId('noya-tour-bubble')).toBeNull();
    fireEvent.press(screen.getByTestId('test-close-media'));
    await waitFor(() => expect(screen.getByText('הכול בעמוד אחד')).toBeTruthy());
    expect(screen.queryByText('בחירת תמונות')).toBeNull();
    expect(screen.getByText('הבנתי')).toBeTruthy();
    expect(screen.getByTestId('noya-tour-next').props.accessibilityRole).toBe('button');
  });

  it('renders the first stop guide inside the modal scoped host', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_STORAGE_KEY, JSON.stringify({
      mainTour: { status: 'completed', stepIndex: MAIN_TOUR_STEPS.length - 1 },
      routeGuide: { status: 'active', stepIndex: 1 },
    }));
    __resetNoyaProductTourStorageForTests();
    const screen = render(
      <TourFrame>
        <NoyaTourProvider navigationReady>
          <RouteStopHarness />
        </NoyaTourProvider>
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('העצירה הראשונה')).toBeTruthy());
    expect(screen.getByTestId('noya-tour-overlay-route-stop-editor')).toBeTruthy();
  });

  it('uses exact padding and clips spotlights without forced minimum sizing', () => {
    expect(spotlightForTarget(
      { x: 1, y: 2, width: 20, height: 18 },
      390,
      844,
      { id: 'small', padding: 3, radius: 7 },
    )).toEqual({
      id: 'small',
      x: 0,
      y: 0,
      width: 24,
      height: 23,
      radius: 7,
    });
  });

  it('converts component window measurements into a non-zero overlay coordinate space', () => {
    expect(rectInOverlay(
      { x: 42, y: 150, width: 120, height: 48 },
      { x: 10, y: 80, width: 370, height: 720 },
      { x: 0, y: 0, width: 370, height: 720 },
    )).toEqual({ x: 32, y: 70, width: 120, height: 48 });
  });

  it('normalizes Web-scaled component measurements into overlay layout units', () => {
    expect(rectInOverlay(
      { x: 70, y: 160, width: 200, height: 80 },
      { x: 20, y: 40, width: 780, height: 1688 },
      { x: 0, y: 0, width: 390, height: 844 },
    )).toEqual({ x: 25, y: 60, width: 100, height: 40 });
  });

  it('converts window safe areas to modal-local insets', () => {
    expect(safeInsetsInOverlay({
      insets: SAFE_AREA_METRICS.insets,
      overlayLayoutRect: { x: 0, y: 0, width: 350, height: 640 },
      overlayWindowRect: { x: 20, y: 204, width: 350, height: 640 },
      windowHeight: 844,
      windowWidth: 390,
    })).toEqual({ left: 0, top: 0, right: 0, bottom: 34 });
  });

  it('draws spotlights from component refs relative to an offset overlay host', async () => {
    mockOverlayWindowRect = { x: 12, y: 40, width: 366, height: 780 };
    const screen = render(
      <TourFrame>
        <MainTourApp />
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(screen.getByText('מתחילים מהיעד')).toBeTruthy());
    const outlines = screen.UNSAFE_getAllByType(Rect)
      .filter((node) => node.props.stroke === '#F5961D');
    expect(outlines).toHaveLength(2);
    expect(outlines[0].props).toEqual(expect.objectContaining({ x: 295, y: 717 }));
    expect(outlines[1].props).toEqual(expect.objectContaining({ x: 9, y: 75 }));
  });

  it('remeasures component spotlights when the overlay host layout changes', async () => {
    const screen = render(
      <TourFrame>
        <MainTourApp />
      </TourFrame>,
    );
    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(screen.getByText('מתחילים מהיעד')).toBeTruthy());
    let outlines = screen.UNSAFE_getAllByType(Rect)
      .filter((node) => node.props.stroke === '#F5961D');
    expect(outlines[0].props).toEqual(expect.objectContaining({ x: 307, y: 757 }));

    mockOverlayWindowRect = { x: 12, y: 40, width: 366, height: 780 };
    fireEvent(screen.getByTestId('noya-tour-overlay-root'), 'layout', {
      nativeEvent: { layout: { width: 366, height: 780 } },
    });
    await waitFor(() => {
      outlines = screen.UNSAFE_getAllByType(Rect)
        .filter((node) => node.props.stroke === '#F5961D');
      expect(outlines[0].props).toEqual(expect.objectContaining({ x: 295, y: 717 }));
    });
  });

  it('keeps a centered bubble inside the safe area when the target leaves no room', () => {
    const top = bubbleTopForTarget({
      bubbleHeight: 380,
      height: SAFE_AREA_METRICS.frame.height,
      insets: SAFE_AREA_METRICS.insets,
      target: { x: 8, y: 100, width: 374, height: 650 },
    });
    expect(top).toBeGreaterThanOrEqual(SAFE_AREA_METRICS.insets.top + 12);
    expect(top + 380).toBeLessThanOrEqual(
      SAFE_AREA_METRICS.frame.height - SAFE_AREA_METRICS.insets.bottom - 12,
    );
  });
});
