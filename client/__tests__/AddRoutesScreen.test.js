import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AddRoutesScreen from '../src/features/roadtrip/screens/AddRoutesScreen';

const mockSaveRoute = jest.fn(() => Promise.resolve({ routeId: 'route-1' }));

const mockUploadImageAssets = jest.fn(async () => []);
const mockRemoveUploadedImage = jest.fn(async () => {});

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({ __type: 'collectionRef' })),
  doc: jest.fn(() => ({ __type: 'docRef' })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-id' })),
  updateDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
}));

jest.mock('../src/config/firebase', () => ({
  db: { __type: 'db' },
  auth: { currentUser: { uid: 'test-user', emailVerified: true } },
}));

jest.mock('../src/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: { uid: 'test-user' } }),
}));

jest.mock('../src/services/RouteService', () => ({
  saveRoute: (...args) => mockSaveRoute(...args),
}));

jest.mock('../src/hooks/useImagePickerWithUpload', () => ({
  useImagePickerWithUpload: () => ({
    uploadImageAssets: mockUploadImageAssets,
    removeUploadedImage: mockRemoveUploadedImage,
  }),
}));

jest.mock('../src/utils/userTier', () => ({
  getUserTier: () => 'verified',
}));

jest.mock('../src/hooks/useBackButton', () => ({ useBackButton: jest.fn() }));

jest.mock('../src/features/roadtrip/components/DayEditorModal', () => {
  const { View } = require('react-native');
  return () => <View testID="day-editor-modal-mock" />;
});

jest.mock('../src/features/roadtrip/components/DayList', () => {
  const { View } = require('react-native');
  return () => <View testID="day-list-mock" />;
});

const UNSAVED_TITLE = 'שינויים לא שמורים';

function makeRouteToEdit(overrides = {}) {
  return {
    id: 'route-1',
    title: 'Original route',
    dayCount: 1,
    distanceKm: 100,
    description: 'Route description',
    days: [
      {
        description: '',
        image: null,
        stops: [
          {
            place: {
              geometry: { location: { lat: 32.0, lng: 34.8 } },
              name: 'Stop A',
            },
          },
        ],
      },
    ],
    tags: { difficulty: '', travelStyle: '', roadTrip: [], experience: [] },
    ...overrides,
  };
}

describe('AddRoutesScreen unsaved guard (edit)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveRoute.mockResolvedValue({ routeId: 'route-1' });
    mockUploadImageAssets.mockResolvedValue([]);
    mockRemoveUploadedImage.mockResolvedValue();
  });

  it('beforeRemove shows unsaved modal when dirty; כן dispatches action', async () => {
    let beforeRemoveHandler;
    const navigationMock = {
      goBack: jest.fn(),
      setOptions: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn((event, handler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
    };

    const routeToEdit = makeRouteToEdit();

    const { getByTestId, getByText } = render(
      <AddRoutesScreen
        navigation={navigationMock}
        route={{ params: { routeToEdit } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('route-title-input').props.value).toBe('Original route');
    });

    fireEvent.changeText(getByTestId('route-title-input'), 'Changed route');

    const preventDefault = jest.fn();
    const action = { type: 'POP', source: 'test' };
    await act(async () => {
      beforeRemoveHandler({ preventDefault, data: { action } });
    });

    expect(preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(getByTestId('route-unsaved-discard-modal')).toBeTruthy();
    });
    expect(getByText(UNSAVED_TITLE)).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByTestId('route-unsaved-discard-confirm'));
    });
    expect(navigationMock.dispatch).toHaveBeenCalledWith(action);
  });

  it('beforeRemove does not prevent when form matches baseline', async () => {
    let beforeRemoveHandler;
    const navigationMock = {
      goBack: jest.fn(),
      setOptions: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn((event, handler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
    };

    const routeToEdit = makeRouteToEdit();

    const { getByTestId } = render(
      <AddRoutesScreen
        navigation={navigationMock}
        route={{ params: { routeToEdit } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('route-title-input').props.value).toBe('Original route');
    });

    const preventDefault = jest.fn();
    beforeRemoveHandler({ preventDefault, data: { action: { type: 'POP' } } });

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('leaves failed prepared media for scheduled server cleanup', async () => {
    const asset = {
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      large: {
        url: 'https://cdn.example/day-large.webp',
        path: 'media/test-user/a/large.webp',
      },
      feed: {
        url: 'https://cdn.example/day-feed.webp',
        path: 'media/test-user/a/feed.webp',
      },
      thumb: {
        url: 'https://cdn.example/day-thumb.webp',
        path: 'media/test-user/a/thumb.webp',
      },
    };
    mockUploadImageAssets.mockResolvedValueOnce([asset]);
    mockSaveRoute.mockRejectedValueOnce(new Error('write failed'));
    const navigationMock = {
      goBack: jest.fn(),
      setOptions: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const routeToEdit = makeRouteToEdit({
      days: [
        {
          description: '',
          image: 'file:///day.jpg',
          stops: makeRouteToEdit().days[0].stops,
        },
      ],
    });
    const { getByTestId } = render(
      <AddRoutesScreen
        navigation={navigationMock}
        route={{ params: { routeToEdit } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('route-title-input').props.value).toBe('Original route');
    });
    await act(async () => {
      fireEvent.press(getByTestId('route-submit'));
    });

    await waitFor(() => expect(mockSaveRoute).toHaveBeenCalled());
    expect(mockRemoveUploadedImage).not.toHaveBeenCalled();
    expect(navigationMock.goBack).not.toHaveBeenCalled();
  });

  it('retains canonical remote media without version fields', async () => {
    const navigationMock = {
      goBack: jest.fn(),
      setOptions: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const routeToEdit = makeRouteToEdit({
      days: [
        {
          description: '',
          image: 'https://cdn.example/day-feed.webp',
          media: {
            assetId: '123e4567-e89b-42d3-a456-426614174000',
            large: { url: 'https://cdn.example/day-large.webp' },
            feed: { url: 'https://cdn.example/day-feed.webp' },
            thumb: { url: 'https://cdn.example/day-thumb.webp' },
          },
          stops: makeRouteToEdit().days[0].stops,
        },
      ],
    });
    const { getByTestId } = render(
      <AddRoutesScreen
        navigation={navigationMock}
        route={{ params: { routeToEdit } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('route-title-input').props.value).toBe('Original route');
    });
    await act(async () => {
      fireEvent.press(getByTestId('route-submit'));
    });

    await waitFor(() => expect(mockSaveRoute).toHaveBeenCalled());
    expect(mockSaveRoute.mock.calls[0][0].mediaVersion).toBeUndefined();
    expect(mockSaveRoute.mock.calls[0][0].days[0].media.assetId).toBe(
      '123e4567-e89b-42d3-a456-426614174000'
    );
    expect(mockSaveRoute.mock.calls[0][0].days[0].image).toBeUndefined();
  });
});
