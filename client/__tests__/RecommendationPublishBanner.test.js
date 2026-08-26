import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

import RecommendationPublishBanner from '../src/features/community/publishing/RecommendationPublishBanner';

const mockRetry = jest.fn();
const mockDiscard = jest.fn();
const mockBeginReview = jest.fn();
let mockPublishState;

jest.mock('../src/features/community/publishing/RecommendationPublishContext', () => ({
  useContentPublish: () => mockPublishState,
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
});
