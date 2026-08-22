import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import StopEditorModal from '../src/features/roadtrip/components/StopEditorModal';

const mockGetPersonalizedRecommendations = jest.fn();
const mockSetImage = jest.fn();

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => <Text>{name}</Text> };
});

jest.mock('../src/services/PersonalizationService', () => ({
  getPersonalizedRecommendations: (...args) => mockGetPersonalizedRecommendations(...args),
}));
jest.mock('../src/components/ExactLocationPicker', () => {
  const { View } = require('react-native');
  return () => <View testID="exact-location-picker" />;
});
jest.mock('../src/features/community/components/SingleDestinationPicker', () => {
  const { Pressable, Text } = require('react-native');
  return ({ onChange }) => (
    <Pressable
      testID="route-stop-select-destination"
      onPress={() => onChange({
        countryId: 'HU', cityId: 'budapest', countryName: 'הונגריה', name: 'בודפשט',
      })}
    >
      <Text>בחירת בודפשט</Text>
    </Pressable>
  );
});
jest.mock('../src/features/community/components/ManualMapPinPicker', () => {
  const { View } = require('react-native');
  return () => <View testID="manual-pin-picker" />;
});
jest.mock('../src/hooks/useReviewedImagePicker', () => ({
  __esModule: true,
  default: () => ({
    imageUri: null,
    setImageUri: mockSetImage,
    pickOneForReview: jest.fn(),
    clearImage: jest.fn(),
    cancelReview: jest.fn(),
    completeReview: jest.fn(),
    reviewUris: [],
    uploading: false,
  }),
}));

describe('StopEditorModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPersonalizedRecommendations.mockResolvedValue({ items: [] });
  });

  it('saves a useful general-area stop without requiring a map point', () => {
    const onSave = jest.fn();
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        onSave={onSave}
        onClose={jest.fn()}
        allowImages={false}
      />
    );
    fireEvent.changeText(screen.getByTestId('route-stop-title-input'), 'הרובע היהודי');
    fireEvent.press(screen.getByTestId('route-stop-mode-general'));
    fireEvent.press(screen.getByTestId('route-stop-select-destination'));
    fireEvent.press(screen.getByText('שמירה'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'הרובע היהודי',
      locationPrecision: 'general',
      destination: expect.objectContaining({ countryId: 'HU', cityId: 'budapest' }),
    }), 0);
  });

  it('removes stale precise data when an existing stop is changed to a general area', async () => {
    const onSave = jest.fn();
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        initialData={{
          id: 'existing-stop',
          title: 'נקודה מדויקת',
          locationPrecision: 'exact',
          place: {
            placeId: 'exact-place',
            name: 'נקודה מדויקת',
            coordinates: { lat: 47.5, lng: 19.1 },
          },
          coordinates: { lat: 47.5, lng: 19.1 },
          source: { type: 'recommendation', recommendationId: 'recommendation-1' },
          categoryId: 'food',
          subcategoryIds: ['restaurant'],
        }}
        onSave={onSave}
        onClose={jest.fn()}
        allowImages={false}
      />
    );
    await waitFor(() => expect(screen.getByText('עדיין אין המלצות זמינות לבחירה.')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-stop-mode-general'));
    fireEvent.press(screen.getByTestId('route-stop-select-destination'));
    fireEvent.press(screen.getByText('שמירה'));

    const saved = onSave.mock.calls[0][0];
    expect(saved.locationPrecision).toBe('general');
    expect(saved.destination).toEqual(expect.objectContaining({ countryId: 'HU', cityId: 'budapest' }));
    expect(saved).not.toHaveProperty('place');
    expect(saved).not.toHaveProperty('coordinates');
    expect(saved).not.toHaveProperty('source');
    expect(saved).not.toHaveProperty('categoryId');
    expect(saved).not.toHaveProperty('subcategoryIds');
  });

  it('shows a retry state when PlanLi recommendations fail and loads them on retry', async () => {
    mockGetPersonalizedRecommendations
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ items: [{
        id: 'recommendation-1', title: 'בית קפה מקומי',
        destination: { countryId: 'HU', cityId: 'budapest', cityName: 'בודפשט' },
      }] });
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        onSave={jest.fn()}
        onClose={jest.fn()}
        allowImages={false}
      />
    );
    fireEvent.press(screen.getByTestId('route-stop-mode-planli'));
    await waitFor(() => expect(screen.getByTestId('route-stop-recommendations-retry')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-stop-recommendations-retry'));
    await waitFor(() => expect(screen.getByTestId('route-stop-recommendation-recommendation-1')).toBeTruthy());
    expect(mockGetPersonalizedRecommendations).toHaveBeenCalledTimes(2);
  });
});
