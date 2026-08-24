const mockStorage = new Map();
jest.setTimeout(20000);

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key) => Promise.resolve(mockStorage.get(key) || null)),
  setItem: jest.fn((key, value) => { mockStorage.set(key, value); return Promise.resolve(); }),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  NoyaTourProvider,
  NoyaTourTarget,
  useNoyaMainTabRegistration,
  useNoyaTourTargetRegistration,
  useNoyaTour,
} from '../src/features/noya/NoyaTourContext';
import { NOYA_MAIN_TARGETS, NOYA_CREATOR_TARGETS } from '../src/features/noya/NoyaTourDefinitions';
import NoyaTourOverlayHost, { bubbleTopForTarget } from '../src/features/noya/NoyaTourOverlay';
import {
  __resetNoyaProductTourStorageForTests,
  NOYA_PRODUCT_TOUR_STORAGE_KEY,
} from '../src/features/noya/services/NoyaProductTourStorage';

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function TourFrame({ children }) {
  return <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>{children}</SafeAreaProvider>;
}

function DirectTourTarget({ targetId, children }) {
  const target = useNoyaTourTargetRegistration(targetId);
  return <View ref={target.ref} onLayout={target.onLayout}>{children}</View>;
}

function MainTourHarness({ tabNavigation }) {
  useNoyaMainTabRegistration(tabNavigation);
  return (
    <>
      <DirectTourTarget targetId={NOYA_MAIN_TARGETS.Home}><Text>בית</Text></DirectTourTarget>
      <NoyaTourTarget targetId={NOYA_MAIN_TARGETS.Community}><Text>קהילה</Text></NoyaTourTarget>
      <NoyaTourOverlayHost />
    </>
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
    ? NOYA_CREATOR_TARGETS.recommendationLocation
    : NOYA_CREATOR_TARGETS.recommendationTaxonomy;
  return (
    <>
      <NoyaTourTarget targetId={targetId}><Text>שדה</Text></NoyaTourTarget>
      <NoyaTourOverlayHost />
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
      <NoyaTourTarget scope="route-stop-editor" targetId={NOYA_CREATOR_TARGETS.routeStop}>
        <Text>שם העצירה וסוג המיקום</Text>
      </NoyaTourTarget>
      <NoyaTourOverlayHost scope="route-stop-editor" />
    </>
  );
}

function CreatorMediaHarness() {
  const [mediaOpen, setMediaOpen] = useState(false);
  const { requestCreatorStep, setTourSuspended } = useNoyaTour();
  const openMedia = useCallback(() => setMediaOpen(true), []);
  useEffect(() => {
    requestCreatorStep('recommendation', 2, {
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
      <NoyaTourTarget targetId={NOYA_CREATOR_TARGETS.recommendationStory}>
        <Text>תוכן ותמונות</Text>
      </NoyaTourTarget>
      {mediaOpen ? (
        <TouchableOpacity onPress={() => setMediaOpen(false)} testID="test-close-media">
          <Text>קומפוזר פתוח</Text>
        </TouchableOpacity>
      ) : null}
      <NoyaTourOverlayHost />
    </>
  );
}

describe('NoyaTourProvider', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockStorage.clear();
    __resetNoyaProductTourStorageForTests();
  });

  it('offers the main tour once and navigates automatically between its tabs', async () => {
    const tabNavigation = { navigate: jest.fn() };
    const navigationRef = { isReady: () => true, navigate: jest.fn() };
    const screen = render(
      <TourFrame>
        <NoyaTourProvider currentRouteName="Home" navigationReady navigationRef={navigationRef}>
          <MainTourHarness tabNavigation={tabNavigation} />
        </NoyaTourProvider>
      </TourFrame>
    );

    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(screen.getByText('הבית של הטיול הבא')).toBeTruthy());
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(tabNavigation.navigate).toHaveBeenCalledWith('Community'));
    expect(screen.getByText('המלצות מהקהילה')).toBeTruthy();
  });

  it('keeps creator guides independent when the main tour is skipped', async () => {
    const screen = render(
      <TourFrame>
        <NoyaTourProvider currentRouteName="Home" navigationReady>
          <MainTourHarness tabNavigation={{ navigate: jest.fn() }} />
        </NoyaTourProvider>
      </TourFrame>
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
      mainTour: { status: 'completed', stepIndex: 5 },
    }));
    __resetNoyaProductTourStorageForTests();
    const screen = render(
      <TourFrame>
        <NoyaTourProvider navigationReady>
          <CreatorHarness />
        </NoyaTourProvider>
      </TourFrame>
    );
    await waitFor(() => expect(screen.getByText('מתחילים מהמיקום')).toBeTruthy());
    screen.rerender(
      <TourFrame>
        <NoyaTourProvider navigationReady>
          <CreatorHarness suspended />
        </NoyaTourProvider>
      </TourFrame>
    );
    await waitFor(() => expect(screen.queryByTestId('noya-tour-bubble')).toBeNull());
    screen.rerender(
      <TourFrame>
        <NoyaTourProvider navigationReady>
          <CreatorHarness />
        </NoyaTourProvider>
      </TourFrame>
    );
    await waitFor(() => expect(screen.getByText('מתחילים מהמיקום')).toBeTruthy());
    await act(async () => {});
  });

  it('waits until Home is focused before offering the main tour', async () => {
    const tabNavigation = { navigate: jest.fn() };
    const screen = render(
      <TourFrame>
        <NoyaTourProvider currentRouteName="PreferenceSetup" navigationReady>
          <MainTourHarness tabNavigation={tabNavigation} />
        </NoyaTourProvider>
      </TourFrame>
    );
    await waitFor(() => expect(AsyncStorage.getItem).toHaveBeenCalled());
    expect(screen.queryByText('סיור קצר עם נועה')).toBeNull();
    expect(mockStorage.has(NOYA_PRODUCT_TOUR_STORAGE_KEY)).toBe(false);

    screen.rerender(
      <TourFrame>
        <NoyaTourProvider currentRouteName="Home" navigationReady>
          <MainTourHarness tabNavigation={tabNavigation} />
        </NoyaTourProvider>
      </TourFrame>
    );
    await waitFor(() => expect(screen.getByText('סיור קצר עם נועה')).toBeTruthy());
  });

  it('opens media from the creator guide, suspends the overlay, and restores the same step', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_STORAGE_KEY, JSON.stringify({
      mainTour: { status: 'completed', stepIndex: 5 },
    }));
    __resetNoyaProductTourStorageForTests();
    const screen = render(
      <TourFrame>
        <NoyaTourProvider currentRouteName="Home" navigationReady>
          <CreatorMediaHarness />
        </NoyaTourProvider>
      </TourFrame>
    );
    await waitFor(() => expect(screen.getByText('מספרים למה כדאי להגיע')).toBeTruthy());
    expect(screen.getByText('בחירת תמונות')).toBeTruthy();
    fireEvent.press(screen.getByTestId('noya-tour-next'));
    await waitFor(() => expect(screen.getByText('קומפוזר פתוח')).toBeTruthy());
    expect(screen.queryByTestId('noya-tour-bubble')).toBeNull();
    fireEvent.press(screen.getByTestId('test-close-media'));
    await waitFor(() => expect(screen.getByText('מספרים למה כדאי להגיע')).toBeTruthy());
    expect(screen.queryByText('בחירת תמונות')).toBeNull();
    expect(screen.getByText('הבנתי')).toBeTruthy();
    expect(screen.getByTestId('noya-tour-next').props.accessibilityRole).toBe('button');
  });

  it('renders the first stop guide inside the modal scoped host', async () => {
    mockStorage.set(NOYA_PRODUCT_TOUR_STORAGE_KEY, JSON.stringify({
      mainTour: { status: 'completed', stepIndex: 5 },
      routeGuide: { status: 'active', stepIndex: 1 },
    }));
    __resetNoyaProductTourStorageForTests();
    const screen = render(
      <TourFrame>
        <NoyaTourProvider navigationReady>
          <RouteStopHarness />
        </NoyaTourProvider>
      </TourFrame>
    );
    await waitFor(() => expect(screen.getByText('העצירה הראשונה')).toBeTruthy());
    expect(screen.getByTestId('noya-tour-overlay-route-stop-editor')).toBeTruthy();
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
      SAFE_AREA_METRICS.frame.height - SAFE_AREA_METRICS.insets.bottom - 12
    );
  });
});
