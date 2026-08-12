import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AddRoutesScreen from '../src/features/roadtrip/screens/AddRoutesScreen';
import { ENVIRONMENTS, VIBES } from '../src/constants/travelTaxonomy';

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

const mockEnqueueCreate = jest.fn(async () => 'route-job-1');
const mockLoadJobForReview = jest.fn(async () => null);
jest.mock('../src/features/publishing/ContentPublishContext', () => ({
  useContentPublish: () => ({
    enqueueCreate: mockEnqueueCreate,
    loadJobForReview: mockLoadJobForReview,
  }),
}));

jest.mock('../src/hooks/useImagePickerWithUpload', () => ({
  useImagePickerWithUpload: () => ({
    uploadImageAssets: mockUploadImageAssets,
    removeUploadedImage: mockRemoveUploadedImage,
  }),
}));
jest.mock('../src/hooks/useDurableDraftMedia', () => ({
  __esModule: true,
  default: () => ({
    draftJobId: '123e4567-e89b-42d3-a456-426614174000',
    forgetUri: jest.fn(async () => {}),
    markEnqueued: jest.fn(),
    mediaForUri: (uri) => ({ uri }),
    persistUris: async (uris) => uris,
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
              placeId: 'place-a',
              geometry: { location: { lat: 32.0, lng: 34.8 } },
              name: 'Stop A',
            },
          },
        ],
      },
    ],
    taxonomyVersion: 3,
    categoryIds: ['nature'],
    subcategoryIds: ['viewpoint'],
    facets: {
      interests: ['nature_scenery'],
      audiences: ['friends'],
      budgetLevel: 'balanced',
      vibes: [],
      travelerStyles: ['roadtrip'],
      needs: [],
	  seasons: ['all_year'],
      environments: ['outdoor'],
    },
    difficulty: 'easy',
    experienceLevel: 'beginner',
    transportModes: ['car'],
    pace: 'balanced',
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

  it('guides a new route from basics to the day builder', async () => {
    const navigationMock = {
      goBack: jest.fn(),
      setOptions: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const { getByTestId, queryByTestId } = render(
      <AddRoutesScreen navigation={navigationMock} route={{ params: {} }} />
    );

    expect(queryByTestId('route-section-days-continue')).toBeNull();
    fireEvent.changeText(getByTestId('route-title-input'), 'מסלול קצר');
    fireEvent.changeText(getByTestId('route-days-input'), '2');
    fireEvent.changeText(getByTestId('route-distance-input'), '18');
    fireEvent.changeText(getByTestId('route-description-input'), 'מסלול נעים ליומיים');
    fireEvent.press(getByTestId('route-section-basics-continue'));

    await waitFor(() => expect(getByTestId('route-section-days-continue')).toBeTruthy());
  });

  it('closes a reviewed route after durable enqueue without calling the network save', async () => {
    const source = makeRouteToEdit();
    mockLoadJobForReview.mockResolvedValueOnce({
      reviewedDraft: {
        route: {
          taxonomyVersion: 4,
          title: source.title,
          description: source.description,
          distanceKm: source.distanceKm,
          days: source.days,
          categoryIds: source.categoryIds,
          subcategoryIds: source.subcategoryIds,
          attributes: {
            audienceScope: 'selected',
            audiences: source.facets.audiences,
            budgetLevel: source.facets.budgetLevel,
            vibes: source.facets.vibes,
            travelerStyles: source.facets.travelerStyles,
            needs: [],
            needsCoverageConfirmed: false,
            seasons: source.facets.seasons,
            environment: source.facets.environments[0],
          },
          difficulty: source.difficulty,
          experienceLevel: source.experienceLevel,
          transportModes: source.transportModes,
          pace: source.pace,
        },
      },
    });
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const { getByTestId } = render(
      <AddRoutesScreen navigation={navigationMock} route={{ params: { publishJobId: 'route-job-1' } }} />
    );
    await waitFor(() => expect(mockLoadJobForReview).toHaveBeenCalledWith('route-job-1'));
    fireEvent.press(getByTestId('route-submit'));
    await waitFor(() => expect(mockEnqueueCreate).toHaveBeenCalled());
    expect(mockEnqueueCreate).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'route', sourceJobId: 'route-job-1',
    }));
    expect(mockSaveRoute).not.toHaveBeenCalled();
    expect(navigationMock.goBack).toHaveBeenCalled();
  });

  it('protects unsaved work when creating a new route', async () => {
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
    const { getByTestId } = render(
      <AddRoutesScreen navigation={navigationMock} route={{ params: {} }} />
    );

    fireEvent.changeText(getByTestId('route-title-input'), 'טיוטת מסלול');
    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemoveHandler({ preventDefault, data: { action: { type: 'POP' } } });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(getByTestId('route-unsaved-discard-modal')).toBeTruthy();
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

  it('restores and resubmits saved vibe and environment while editing', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const routeToEdit = makeRouteToEdit({
      facets: {
        ...makeRouteToEdit().facets,
        vibes: ['relaxed'],
        environments: ['outdoor'],
      },
    });
    const screen = render(
      <AddRoutesScreen navigation={navigationMock} route={{ params: { routeToEdit } }} />
    );
    await waitFor(() => expect(screen.getByTestId('route-title-input').props.value).toBe('Original route'));
    fireEvent.press(screen.getByLabelText(/קהל ומאפיינים,/));
    expect(screen.getByTestId(`route-vibe-${VIBES.findIndex((item) => item.value === 'relaxed')}`).props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId(`route-environment-${ENVIRONMENTS.findIndex((item) => item.value === 'outdoor')}`).props.accessibilityState.checked).toBe(true);
    fireEvent.press(screen.getByTestId('route-submit'));
    await waitFor(() => expect(mockSaveRoute).toHaveBeenCalled());
    expect(mockSaveRoute.mock.calls[0][0].attributes.vibes).toEqual(['relaxed']);
    expect(mockSaveRoute.mock.calls[0][0].attributes.environment).toBe('outdoor');
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

  it('shows a localized retry message for Google quota failures without console errors', async () => {
    const quotaError = Object.assign(
      new Error('Google request limit reached. Please try again shortly.'),
      { code: 'functions/resource-exhausted' }
    );
    mockSaveRoute.mockRejectedValueOnce(quotaError);
    const alertSpy = jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRoutesScreen navigation={navigationMock} route={{ params: { routeToEdit: makeRouteToEdit() } }} />
    );

    await waitFor(() => expect(screen.getByTestId('route-title-input').props.value).toBe('Original route'));
    fireEvent.press(screen.getByTestId('route-submit'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      'מגבלת חיפוש זמנית',
      'מגבלת החיפוש הזמנית הושגה. נסו שוב בעוד זמן קצר.'
    ));
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(navigationMock.goBack).not.toHaveBeenCalled();

    alertSpy.mockRestore();
    consoleErrorSpy.mockRestore();
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
