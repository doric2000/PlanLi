import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Modal } from 'react-native';

import StopEditorModal from '../src/features/roadtrip/components/StopEditorModal';

const mockGetPersonalizedRecommendations = jest.fn();
const mockPickImagesForReview = jest.fn();

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }) => <Text>{name}</Text> };
});

jest.mock('../src/services/PersonalizationService', () => ({
  getPersonalizedRecommendations: (...args) => mockGetPersonalizedRecommendations(...args),
}));
jest.mock('../src/components/ExactLocationPicker', () => {
  const { Pressable } = require('react-native');
  return ({ value, onChange }) => (
    <Pressable
      testID="exact-location-picker"
      accessibilityLabel={`exact-${value?.countryId || 'null'}-${value?.cityId || 'null'}-${value?.place?.placeId || 'null'}`}
      onPress={() => onChange?.({
        location: 'הוד השרון', country: 'ישראל', countryId: 'IL', cityId: 'hod-hasharon',
        destination: {
          countryId: 'IL', cityId: 'hod-hasharon', countryName: 'ישראל', cityName: 'הוד השרון',
          provider: 'google', providerPlaceId: 'google-hod-hasharon',
        },
        place: {
          placeId: 'hod-cafe', resolvedPlaceToken: 'resolved-token', name: 'בית קפה',
          coordinates: { lat: 32.15, lng: 34.88 },
        },
      })}
    />
  );
});
jest.mock('../src/features/community/components/SingleDestinationPicker', () => {
  const { Pressable, Text } = require('react-native');
  return ({ onChange }) => (
    <Pressable
      testID="route-stop-select-destination"
      onPress={() => onChange({
        countryId: 'HU', cityId: 'budapest', countryName: 'הונגריה', name: 'בודפשט',
        provider: 'google', providerPlaceId: 'google-city-1', resolvedPlaceToken: 'resolved-token-1',
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
jest.mock('../src/components/TravelMediaComposer', () => {
  const React = require('react');
  return function MockTravelMediaComposer({ visible, value = [], onChange }) {
    React.useEffect(() => {
      if (!visible) return;
      mockPickImagesForReview({
        onComplete: (uris, { replace = false } = {}) => onChange?.([
          ...(replace ? [] : value),
          ...uris.map((uri) => ({ uri, previewUri: uri, sourceId: uri, type: 'local' })),
        ]),
      });
    }, [visible]);
    return null;
  };
});

describe('StopEditorModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPersonalizedRecommendations.mockResolvedValue({ items: [] });
    mockPickImagesForReview.mockImplementation(({ onComplete }) => onComplete([
      'file:///one.jpg', 'file:///two.jpg', 'file:///three.jpg',
    ]));
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
    expect(onSave.mock.calls[0][0].destination).toEqual(expect.objectContaining({
      provider: 'google', providerPlaceId: 'google-city-1', resolvedPlaceToken: 'resolved-token-1',
    }));
  });

  it('keeps the discard confirmation inside the stop sheet and closes cleanly', () => {
    const onClose = jest.fn();
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        onSave={jest.fn()}
        onClose={onClose}
        allowImages={false}
      />
    );
    const nativeModalCount = screen.UNSAFE_getAllByType(Modal).length;
    fireEvent.changeText(screen.getByTestId('route-stop-title-input'), 'עצירה חדשה');
    fireEvent.press(screen.getByText('ביטול'));

    expect(screen.getByTestId('stop-editor-unsaved-modal')).toBeTruthy();
    expect(screen.UNSAFE_getAllByType(Modal)).toHaveLength(nativeModalCount);

    fireEvent.press(screen.getByTestId('stop-editor-unsaved-confirm'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes an unchanged existing stop without showing a discard prompt', () => {
    const onClose = jest.fn();
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        onSave={jest.fn()}
        onClose={onClose}
        allowImages={false}
        initialData={{
          id: 'saved-stop',
          title: 'המקדש הלבן',
          description: 'עצירה קצרה',
          locationPrecision: 'general',
          destination: { countryId: 'TH', cityId: 'chiang-rai' },
          source: { type: 'recommendation', recommendationId: 'recommendation-1' },
          startTime: '08:30',
          durationMinutes: 90,
        }}
      />
    );

    fireEvent.press(screen.getByText('ביטול'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('stop-editor-unsaved-modal')).toBeNull();
  });

  it('uses safe header indices when a caller has not provided them yet', () => {
    const screen = render(
      <StopEditorModal
        visible
        initialData={{ id: 'saved-stop', title: 'תחנה קיימת' }}
        onSave={jest.fn()}
        onClose={jest.fn()}
        allowImages={false}
      />
    );
    expect(screen.getByText('יום 1 · עצירה 1')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('accepts a one-digit hour and saves it in canonical form', () => {
    const onSave = jest.fn();
    const screen = render(
      <StopEditorModal visible dayIndex={0} stopIndex={0} onSave={onSave} onClose={jest.fn()} allowImages={false} />
    );
    fireEvent.changeText(screen.getByTestId('route-stop-title-input'), 'ארוחת בוקר');
    fireEvent.press(screen.getByTestId('route-stop-mode-general'));
    fireEvent.press(screen.getByTestId('route-stop-select-destination'));
    fireEvent.changeText(screen.getByTestId('route-stop-start-time'), '8:30');
    fireEvent.press(screen.getByText('שמירה'));
    expect(onSave.mock.calls[0][0].startTime).toBe('08:30');
  });

  it('keeps up to three cropped photos locally and defers their upload until route publication', async () => {
    const onSave = jest.fn();
    const onPersistImages = jest.fn(async (uris) => uris);
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        onSave={onSave}
        onClose={jest.fn()}
        onPersistImages={onPersistImages}
        mediaForImage={(uri) => ({
          uri,
          mediaId: `media-${uri}`,
          localReference: { platform: 'native', key: `durable-${uri}` },
        })}
      />
    );
    fireEvent.changeText(screen.getByTestId('route-stop-title-input'), 'השוק');
    fireEvent.press(screen.getByTestId('route-stop-mode-general'));
    fireEvent.press(screen.getByTestId('route-stop-select-destination'));
    fireEvent.press(screen.getByTestId('route-stop-photos'));
    await waitFor(() => expect(screen.getByText('3/3')).toBeTruthy());
    fireEvent.press(screen.getByText('שמירה'));
    const saved = onSave.mock.calls[0][0];
    expect(onPersistImages).toHaveBeenCalledWith([
      expect.objectContaining({ uri: 'file:///one.jpg' }),
      expect.objectContaining({ uri: 'file:///two.jpg' }),
      expect.objectContaining({ uri: 'file:///three.jpg' }),
    ]);
    expect(saved.media).toBeNull();
    expect(saved.additionalMedia).toEqual([]);
    expect(saved.pendingMedia).toHaveLength(3);
    expect(saved.image).toBe('file:///one.jpg');
  });

  it('preserves pending photos when they are selected in multiple batches', async () => {
    const onSave = jest.fn();
    mockPickImagesForReview
      .mockImplementationOnce(({ onComplete }) => onComplete(['file:///one.jpg']))
      .mockImplementationOnce(({ onComplete }) => onComplete(['file:///two.jpg']));
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        onSave={onSave}
        onClose={jest.fn()}
        onPersistImages={jest.fn(async (uris) => uris)}
        mediaForImage={(uri) => ({ uri, mediaId: `media-${uri}` })}
      />
    );
    fireEvent.changeText(screen.getByTestId('route-stop-title-input'), 'השוק');
    fireEvent.press(screen.getByTestId('route-stop-mode-general'));
    fireEvent.press(screen.getByTestId('route-stop-select-destination'));
    fireEvent.press(screen.getByTestId('route-stop-photos'));
    await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-stop-photos'));
    await waitFor(() => expect(screen.getByText('2/3')).toBeTruthy());
    fireEvent.press(screen.getByText('שמירה'));
    expect(onSave.mock.calls[0][0].pendingMedia.map((entry) => entry.uri)).toEqual([
      'file:///one.jpg', 'file:///two.jpg',
    ]);
  });

  it('forgets local stop photos removed inside the completed editor selection', async () => {
    const onForgetImage = jest.fn(async () => {});
    mockPickImagesForReview.mockImplementationOnce(({ onComplete }) => onComplete([
      'file:///one.jpg',
    ], { replace: true }));
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        onSave={jest.fn()}
        onClose={jest.fn()}
        onForgetImage={onForgetImage}
        onPersistImages={jest.fn(async (items) => items)}
        initialData={{
          id: 'existing-stop',
          title: 'השוק',
          locationPrecision: 'general',
          destination: { countryId: 'HU', cityId: 'budapest' },
          pendingMedia: [{ uri: 'file:///one.jpg' }, { uri: 'file:///two.jpg' }],
        }}
      />
    );

    fireEvent.press(screen.getByTestId('route-stop-photos'));
    await waitFor(() => expect(onForgetImage).toHaveBeenCalledWith(expect.objectContaining({
      uri: 'file:///two.jpg',
    })));
    expect(screen.getByText('1/3')).toBeTruthy();
  });

  it('does not block stop saving while untouched source persistence continues', async () => {
    mockPickImagesForReview.mockImplementationOnce(({ onComplete }) => onComplete(['file:///one.jpg']));
    const onSave = jest.fn();
    const onPersistImages = jest.fn(() => new Promise(() => {}));
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={0}
        onSave={onSave}
        onClose={jest.fn()}
        onPersistImages={onPersistImages}
        mediaForImage={(item) => item}
      />
    );
    fireEvent.changeText(screen.getByTestId('route-stop-title-input'), 'השוק');
    fireEvent.press(screen.getByTestId('route-stop-mode-general'));
    fireEvent.press(screen.getByTestId('route-stop-select-destination'));
    fireEvent.press(screen.getByTestId('route-stop-photos'));
    await waitFor(() => expect(screen.getByText('1/3')).toBeTruthy());
    fireEvent.press(screen.getByText('שמירה'));
    expect(onPersistImages).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      pendingMedia: [expect.objectContaining({ uri: 'file:///one.jpg' })],
    }), 0);
  });

  it('removes stale precise data when an existing stop is changed to a general area', () => {
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

  it('hydrates and saves an unchanged exact stop from its nested saved destination', () => {
    const onSave = jest.fn();
    const screen = render(
      <StopEditorModal
        visible
        dayIndex={0}
        stopIndex={1}
        initialData={{
          id: 'existing-stop',
          title: 'בית קפה',
          location: 'בודפשט',
          country: 'הונגריה',
          locationPrecision: 'exact',
          reuseSavedLocation: true,
          destination: {
            countryId: 'HU', cityId: 'budapest', countryName: 'הונגריה', cityName: 'בודפשט',
          },
          place: {
            placeId: 'saved-place',
            name: 'בית קפה',
            coordinates: { lat: 47.5, lng: 19.1 },
          },
        }}
        onSave={onSave}
        onClose={jest.fn()}
        allowImages={false}
      />
    );

    expect(screen.getByLabelText('exact-HU-budapest-saved-place')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('route-stop-title-input'), 'בית קפה מעודכן');
    fireEvent.press(screen.getByText('שמירה'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'existing-stop',
      title: 'בית קפה מעודכן',
      reuseSavedLocation: true,
      destination: expect.objectContaining({ countryId: 'HU', cityId: 'budapest' }),
      place: expect.objectContaining({ placeId: 'saved-place' }),
    }), 1);
  });

  it('keeps the provider destination identity on a newly selected exact stop', () => {
    const onSave = jest.fn();
    const screen = render(
      <StopEditorModal visible dayIndex={0} stopIndex={0} onSave={onSave} onClose={jest.fn()} allowImages={false} />
    );
    fireEvent.changeText(screen.getByTestId('route-stop-title-input'), 'בית קפה');
    fireEvent.press(screen.getByTestId('exact-location-picker'));
    fireEvent.press(screen.getByText('שמירה'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      locationPrecision: 'exact',
      place: expect.objectContaining({ placeId: 'hod-cafe', resolvedPlaceToken: 'resolved-token' }),
      destination: expect.objectContaining({
        countryId: 'IL', cityId: 'hod-hasharon',
        provider: 'google', providerPlaceId: 'google-hod-hasharon',
      }),
    }), 0);
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
