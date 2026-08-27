import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import RecommendationPublishBanner from '../src/features/community/publishing/RecommendationPublishBanner';

const mockRetry = jest.fn();
const mockDiscard = jest.fn();
const mockBeginReview = jest.fn();
const mockSelectRegion = jest.fn();
let mockPublishState;

jest.mock('../src/features/community/publishing/RecommendationPublishContext', () => ({
  useContentPublish: () => mockPublishState,
}));
jest.mock('../src/features/region/context/RegionSelectionState', () => ({
  useOptionalRegionSelection: () => ({ selectedRegionId: 'europe', selectRegion: mockSelectRegion }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 10, left: 0 }),
}));
jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => ReactModule.createElement(Text, null, name) };
});

describe('RecommendationPublishBanner', () => {
  const originalRegionFlag = process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublishState = {
      activeJob: { id: 'job-1', status: 'uploading', stage: 'uploading', progress: 0.42 },
      bannerJobCount: 1,
      beginReview: mockBeginReview,
      jobs: [{ id: 'job-1' }],
      retry: mockRetry,
      discard: mockDiscard,
    };
  });

  afterEach(() => {
    if (originalRegionFlag === undefined) delete process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;
    else process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED = originalRegionFlag;
  });

  it('offers view and explicit switch when published outside the selected region', () => {
    process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED = 'true';
    const onView = jest.fn();
    mockPublishState = {
      ...mockPublishState,
      activeJob: {
        id: 'job-1', contentType: 'recommendation', status: 'success', progress: 1,
        result: { recommendationId: 'rec-1', publicationStatus: 'active', discoveryRegionId: 'israel' },
      },
    };
    const screen = render(<RecommendationPublishBanner onView={onView} />);
    fireEvent.press(screen.getByTestId('publish-view-content'));
    fireEvent.press(screen.getByTestId('publish-switch-region'));
    expect(onView).toHaveBeenCalledWith(mockPublishState.activeJob);
    expect(mockSelectRegion).toHaveBeenCalledWith('israel');
  });

  it('reports a failed region switch instead of leaking a rejected promise', async () => {
    process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED = 'true';
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockSelectRegion.mockRejectedValueOnce(new Error('storage unavailable'));
    mockPublishState = {
      ...mockPublishState,
      activeJob: {
        id: 'job-1', contentType: 'recommendation', status: 'success', progress: 1,
        result: { recommendationId: 'rec-1', publicationStatus: 'active', discoveryRegionId: 'israel' },
      },
    };
    const screen = render(<RecommendationPublishBanner />);
    fireEvent.press(screen.getByTestId('publish-switch-region'));

    await waitFor(() => expect(alert).toHaveBeenCalledWith(
      'לא הצלחנו להחליף אזור',
      'הבחירה לא נשמרה. אפשר לנסות שוב בעוד רגע.',
    ));
    alert.mockRestore();
  });

  it('shows app-wide upload progress', () => {
    const screen = render(<RecommendationPublishBanner />);
    expect(screen.getByTestId('content-publish-banner')).toBeTruthy();
    expect(screen.getByTestId('publish-progress').props.accessibilityValue.now).toBe(42);
  });

  it('shows retry, review, and confirmed discard actions after failure', () => {
    const onReview = jest.fn();
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, actions) => {
      actions.find((action) => action.style === 'destructive').onPress();
    });
    mockPublishState = {
      ...mockPublishState,
      activeJob: {
        id: 'job-1', status: 'failed', stage: 'failed', progress: 0.7,
        error: { message: 'Network unavailable' },
      },
    };
    const screen = render(<RecommendationPublishBanner onReview={onReview} />);

    fireEvent.press(screen.getByTestId('publish-retry'));
    fireEvent.press(screen.getByTestId('publish-review'));
    fireEvent.press(screen.getByTestId('publish-discard'));

    expect(mockRetry).toHaveBeenCalledWith('job-1');
    expect(mockBeginReview).toHaveBeenCalledWith('job-1');
    expect(onReview).toHaveBeenCalledWith('job-1', undefined);
    expect(mockDiscard).toHaveBeenCalledWith('job-1');
    Alert.alert.mockRestore();
  });

  it('localizes Google quota failures instead of exposing Firebase text', () => {
    mockPublishState = {
      ...mockPublishState,
      activeJob: {
        id: 'job-1', status: 'failed', stage: 'failed', progress: 0.7,
        error: {
          code: 'functions/resource-exhausted',
          message: 'Google request limit reached. Please try again shortly.',
        },
      },
    };

    const screen = render(<RecommendationPublishBanner />);

    expect(screen.getByText('מגבלת החיפוש הזמנית הושגה. נסו שוב בעוד זמן קצר.')).toBeTruthy();
    expect(screen.queryByText(/Google request limit reached/)).toBeNull();
  });

  it('explains that stalled upload media remains saved for retry', () => {
    mockPublishState = {
      ...mockPublishState,
      activeJob: {
        id: 'job-1', status: 'failed', stage: 'failed', progress: 0.2,
        error: {
          code: 'media/upload-stalled',
          details: { publishStage: 'uploading', retryable: true },
        },
      },
    };

    const screen = render(<RecommendationPublishBanner />);

    expect(screen.getByText(
      'החיבור נקטע בזמן העלאת התמונות. הפרסום והתמונות נשמרו, ואפשר לנסות שוב.'
    )).toBeTruthy();
    expect(screen.getByTestId('publish-retry')).toBeTruthy();
  });

  it('explains a genuinely invalid external link without exposing server text', () => {
    mockPublishState = {
      ...mockPublishState,
      activeJob: {
        id: 'job-1', status: 'failed', stage: 'failed', progress: 0.9,
        error: {
          code: 'functions/invalid-argument',
          message: 'externalUrl is invalid.',
          details: { reason: 'invalid_external_url', retryable: false, publishStage: 'saving' },
        },
      },
    };

    const screen = render(<RecommendationPublishBanner />);

    expect(screen.getByText(
      'הקישור שצורף אינו תקין. פתחו עריכה, תקנו או הסירו אותו ופרסמו מחדש.'
    )).toBeTruthy();
    expect(screen.queryByText(/externalUrl/)).toBeNull();
    expect(screen.queryByTestId('publish-retry')).toBeNull();
  });

  it('does not call held content published and explains where it can be found', () => {
    mockPublishState = {
      ...mockPublishState,
      activeJob: {
        id: 'job-1', contentType: 'recommendation', status: 'success', stage: 'success', progress: 1,
        result: { publicationStatus: 'moderation_hold', publiclyVisible: false },
      },
    };
    const screen = render(<RecommendationPublishBanner />);
    expect(screen.getByText('ההמלצה נשלחה לבדיקה')).toBeTruthy();
    expect(screen.getByText(/עדיין לא מוצג לציבור/)).toBeTruthy();
    expect(screen.queryByText(/פורסמה בהצלחה/)).toBeNull();
  });

  it('does not guess public visibility when an older server omits the outcome', () => {
    mockPublishState = {
      ...mockPublishState,
      activeJob: {
        id: 'job-1', contentType: 'route', status: 'success', stage: 'success', progress: 1,
        result: { routeId: 'route-1' },
      },
    };
    const screen = render(<RecommendationPublishBanner />);
    expect(screen.getByText('המסלול נשמר, סטטוס הפרסום בבדיקה')).toBeTruthy();
    expect(screen.queryByText(/פורסם בהצלחה/)).toBeNull();
  });
});
