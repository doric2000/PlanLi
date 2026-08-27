import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AddRecommendationScreen from '../src/features/community/screens/AddRecommendationScreen';
import {
  recommendationDraftResumeStep,
  scrollFocusedRecommendationInputIntoView,
} from '../src/features/community/screens/CreateRecommendationScreen';
import { Alert, Keyboard, KeyboardAvoidingView, Platform } from 'react-native';
import { ENVIRONMENTS, VIBES } from '../src/constants/travelTaxonomy';

// ==========================================
// 1. Mocks Setup
// ==========================================

// A. Mock Firebase Firestore
// Simulates database operations without connecting to the real Firebase backend.
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({ __type: 'collectionRef' })),
  doc: jest.fn(() => ({ __type: 'docRef' })),
  addDoc: jest.fn(() => Promise.resolve({ id: 'new-doc-id' })),
  updateDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP'),
  getDocs: jest.fn(() => Promise.resolve({ docs: [] })),
  query: jest.fn((...args) => ({ __type: 'query', args })),
  where: jest.fn((...args) => ({ __type: 'where', args })),
  limit: jest.fn((...args) => ({ __type: 'limit', args })),
  collectionGroup: jest.fn((...args) => ({ __type: 'collectionGroup', args })),
}));

// A2. Mock Firebase config used by the screen
jest.mock('../src/config/firebase', () => ({
  db: { __type: 'db' },
  auth: {
    currentUser: {
      uid: 'test-user-id',
      emailVerified: true,
      providerData: [{ providerId: 'password' }],
    },
  },
}));

// B. Mock Location Service (UPDATED WITH GEOMETRY)
// This simulates the response from your backend/Google API when a city is selected.
// Crucial: we return geometry.location lat/lng and the screen saves it in postData.place.
const mockResolveDestinationForPlacePreview = jest.fn(() => Promise.resolve({
    // General destination info used for app routing/filtering
    destination: {
      country: { id: 'IL', name: 'Israel' },
      city: { id: 'TLV', name: 'Tel Aviv', googlePlaceId: 'google-tel-aviv' }
    },
    // Specific Google Place details
    place: { 
      placeId: 'google-place-id',
      resolvedPlaceToken: 'resolved-place-token',
      name: 'Pizza Hut', 
      address: 'Tel Aviv St 1',
      // REQUIRED: Coordinates (saved in Firestore under postData.place)
      geometry: {
        location: {
          lat: 32.0853,
          lng: 34.7818
        }
      },
      types: ['restaurant', 'food', 'establishment']
    }
  }));
jest.mock('../src/services/LocationService', () => ({
  resolveDestinationForPlacePreview: (...args) =>
    mockResolveDestinationForPlacePreview(...args),
  searchPlaces: jest.fn(() => Promise.resolve([]))
}));

jest.mock('../src/services/DestinationService', () => ({
  searchDestinations: jest.fn(() => Promise.resolve({ items: [], nextCursor: null })),
  destinationCatalogItemToCity: jest.fn((item) => ({
    id: item.cityId,
    cityId: item.cityId,
    countryId: item.countryId,
    name: item.names?.he || item.names?.en || item.cityId,
  })),
}));

const mockSaveRecommendation = jest.fn(() =>
  Promise.resolve({
    recommendationId: 'new-doc-id',
    country: { id: 'IL', name: 'ישראל' },
    city: { id: 'TLV', name: 'תל אביב' },
  })
);
const mockGetCurrentRecommendationDraft = jest.fn(() => Promise.resolve(null));
const mockSaveRecommendationDraft = jest.fn(() => Promise.resolve({ draftId: 'recommendation-draft-1', version: 1 }));
const mockDiscardRecommendationDraft = jest.fn(() => Promise.resolve({ discarded: true }));
jest.mock('../src/services/RecommendationService', () => ({
  saveRecommendation: (...args) => mockSaveRecommendation(...args),
  getCurrentRecommendationDraft: (...args) => mockGetCurrentRecommendationDraft(...args),
  saveRecommendationDraft: (...args) => mockSaveRecommendationDraft(...args),
  discardRecommendationDraft: (...args) => mockDiscardRecommendationDraft(...args),
}));

const mockCaptureDiagnosticException = jest.fn();
jest.mock('../src/services/ErrorReporting', () => ({
  captureDiagnosticException: (...args) => mockCaptureDiagnosticException(...args),
}));

const mockRememberRecentDestination = jest.fn(() => Promise.resolve([]));
jest.mock('../src/utils/recentDiscoveryDestinations', () => ({
  rememberDiscoveryDestinations: (...args) => mockRememberRecentDestination(...args),
}));

const mockEnqueueCreate = jest.fn(() => Promise.resolve('publish-job-1'));
const mockLoadJobForReview = jest.fn(() => Promise.resolve(null));
jest.mock('../src/features/community/publishing/RecommendationPublishContext', () => ({
  useRecommendationPublish: () => ({
    enqueueCreate: mockEnqueueCreate,
    loadJobForReview: mockLoadJobForReview,
  }),
}));

// C. Mock Image Picker
// The screen calls pickImages() to obtain local/remote URIs; we return a remote URL.
const mockPickImages = jest.fn(() => Promise.resolve(['file:///tasty-pizza.jpg']));
const mockUploadImages = jest.fn(() =>
  Promise.resolve([
    {
      assetId: '123e4567-e89b-42d3-a456-426614174000',
      large: { url: 'https://cdn/large.webp' },
      feed: { url: 'https://cdn/feed.webp' },
      thumb: { url: 'https://cdn/thumb.webp' },
    },
  ])
);
const mockRemoveUploadedImage = jest.fn(() => Promise.resolve());

jest.mock('../src/hooks/useImagePickerWithUpload', () => ({
  useImagePickerWithUpload: () => ({
    pickImages: mockPickImages,
    uploadImages: mockUploadImages,
    uploadImageAssets: mockUploadImages,
    removeUploadedImage: mockRemoveUploadedImage,
  })
}));
jest.mock('../src/components/TravelMediaComposer', () => {
  const React = require('react');
  return function MockTravelMediaComposer({ visible, value = [], onChange }) {
    React.useEffect(() => {
      if (!visible) return;
      mockPickImages().then((uris) => onChange?.([
        ...value,
        ...uris.map((uri) => ({ uri, previewUri: uri, sourceId: uri, type: 'local' })),
      ]));
    }, [visible]);
    return null;
  };
});
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
const mockBindRecommendationDraftMedia = jest.fn(async () => {});
const mockClearRecommendationDraftMedia = jest.fn(async () => {});
const mockClearStaleRecommendationDraftMedia = jest.fn(async () => {});
const mockForgetRecommendationDraftMedia = jest.fn(async () => {});
const mockPersistRecommendationDraftMedia = jest.fn(async (uris) => uris);
const mockRestoreRecommendationDraftMedia = jest.fn(async () => ({ uris: [], missingCount: 0 }));
jest.mock('../src/hooks/useRecommendationDraftMedia', () => ({
  __esModule: true,
  default: () => ({
    bindDraft: mockBindRecommendationDraftMedia,
    clearDraft: mockClearRecommendationDraftMedia,
    clearStaleDraft: mockClearStaleRecommendationDraftMedia,
    forgetMedia: mockForgetRecommendationDraftMedia,
    forgetUri: mockForgetRecommendationDraftMedia,
    mediaForItem: (item) => item,
    mediaForUri: (uri) => ({ uri }),
    persistMedia: mockPersistRecommendationDraftMedia,
    persistUris: mockPersistRecommendationDraftMedia,
    restoreDraft: mockRestoreRecommendationDraftMedia,
    waitForMedia: async (items) => items,
  }),
}));

// D. Mock GooglePlacesInput Component
// Replaces the complex Google Autocomplete component with a simple TextInput and a Button.
// This allows us to "type" and "select" a location programmatically.
jest.mock('../src/components/GooglePlacesInput', () => {
  const { View, TextInput, Button } = require('react-native');
  return ({ onSelect, placeholder, onChangeValue, inputTestID }) => (
    <View>
      <TextInput 
        placeholder={placeholder} 
        onChangeText={onChangeValue} 
        testID={inputTestID || 'google-places-input'}
      />
      {/* This button simulates the user clicking a result from the dropdown list */}
      <Button 
        title="Simulate Google Select" 
        onPress={() => onSelect('dummy-place-id')} 
        testID="google-result-select"
      />
    </View>
  );
});

const mockSingleDestinationPickerProps = jest.fn();
jest.mock('../src/features/community/components/SingleDestinationPicker', () => {
  const { Button } = require('react-native');
  return (props) => {
    mockSingleDestinationPickerProps(props);
    const { value, onChange } = props;
    return value ? (
      <Button
        title="Selected destination"
        testID="recommendation-destination-selected"
        onPress={() => onChange(null)}
      />
    ) : (
      <Button
        title="Select general destination"
        testID="recommendation-test-select-destination"
        onPress={() => onChange({
          key: 'city:HU:budapest',
          kind: 'city',
          countryId: 'HU',
          cityId: 'budapest',
          countryName: 'הונגריה',
          name: 'בודפשט',
          label: 'בודפשט · הונגריה',
          coordinates: { lat: 47.4979, lng: 19.0402 },
        })}
      />
    );
  };
});

// F. Mock Back Button Hook
jest.mock('../src/hooks/useBackButton', () => ({ useBackButton: jest.fn() }));


// ==========================================
// 2. The Integration Test Suite
// ==========================================

const UNSAVED_EDIT_TITLE = 'שינויים לא שמורים';
const UNSAVED_EDIT_MESSAGE = 'האם אתה בטוח שברצונך לצאת מבלי לשמור?';

function makeEditItem(overrides = {}) {
  return {
    id: 'post-1',
    userId: 'test-user-id',
    title: 'Original',
    description: 'Desc',
    categoryId: 'food',
    category: 'אוכל ובילויים',
    tags: ['restaurant'],
    budget: 'economy',
    facets: {
      interests: ['food'], audienceScope: 'all', audiences: [], vibes: [], environments: [], needs: [],
    },
    destination: {
      countryId: 'IL', cityId: 'TLV', countryName: 'Israel', cityName: 'Tel Aviv',
    },
    place: { placeId: 'p1', name: 'Spot', geometry: { location: { lat: 32, lng: 34 } } },
    media: [],
    ...overrides,
  };
}

function canonicalMedia(assetId = '123e4567-e89b-42d3-a456-426614174999') {
  return {
    assetId,
    large: { url: `https://cdn/${assetId}/large.webp` },
    feed: { url: `https://cdn/${assetId}/feed.webp` },
    thumb: { url: `https://cdn/${assetId}/thumb.webp` },
  };
}

describe('AddRecommendationScreen Integration Test', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentRecommendationDraft.mockResolvedValue(null);
    mockSaveRecommendationDraft.mockResolvedValue({ draftId: 'recommendation-draft-1', version: 1 });
    mockDiscardRecommendationDraft.mockResolvedValue({ discarded: true });
    mockRestoreRecommendationDraftMedia.mockResolvedValue({ uris: [], missingCount: 0 });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    Alert.alert.mockRestore?.();
  });

  const waitForCatalogEditor = async (screen) => {
    await waitFor(() => expect(screen.getByTestId('recommendation-image-picker')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-image-picker'));
    await waitFor(() => expect(mockPersistRecommendationDraftMedia).toHaveBeenCalled());
    fireEvent.press(screen.getByTestId('recommendation-next'));
    await waitFor(() => expect(screen.getByTestId('recommendation-exact-location-search')).toBeTruthy());
  };

  it('scrolls a focused native input above the keyboard with composer clearance', () => {
    const scrollResponderScrollNativeHandleToKeyboard = jest.fn();
    const responder = { scrollResponderScrollNativeHandleToKeyboard };

    expect(scrollFocusedRecommendationInputIntoView({
      getScrollResponder: () => responder,
    }, 42)).toBe(true);
    expect(scrollResponderScrollNativeHandleToKeyboard).toHaveBeenCalledWith(42, 16, true);
    expect(scrollFocusedRecommendationInputIntoView(null, 42)).toBe(false);
  });

  it('requires a photo first and a resolved location before category selection', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await screen.findByTestId('recommendation-image-picker');
    fireEvent.press(screen.getByTestId('recommendation-next'));
    expect(screen.getByText('כדאי לבחור לפחות תמונה אחת כדי להמשיך.')).toBeTruthy();
    expect(screen.queryByTestId('recommendation-exact-location-search')).toBeNull();

    fireEvent.press(screen.getByTestId('recommendation-image-picker'));
    await waitFor(() => expect(mockPersistRecommendationDraftMedia).toHaveBeenCalled());
    fireEvent.press(screen.getByTestId('recommendation-next'));
    await screen.findByTestId('recommendation-exact-location-search');
    fireEvent.press(screen.getByTestId('recommendation-next'));
    expect(screen.getByText('כדאי לבחור תוצאה מדויקת מהחיפוש.')).toBeTruthy();
    expect(screen.queryByTestId('recommendation-category-food')).toBeNull();
  });

  it('restores drafts at the earliest incomplete photo-first stage', () => {
    const mediaItems = [{ uri: 'file:///photo.jpg' }];
    const validLocation = {
      locationMode: 'exact',
      selectedPlace: { placeId: 'place-1' },
      selectedCountry: { id: 'IL' },
      selectedCity: { id: 'TLV' },
    };
    expect(recommendationDraftResumeStep(validLocation, [])).toBe(1);
    expect(recommendationDraftResumeStep({}, mediaItems)).toBe(2);
    expect(recommendationDraftResumeStep({
      locationMode: 'exact',
      selectedPlace: { placeId: 'place-1' },
    }, mediaItems)).toBe(2);
    expect(recommendationDraftResumeStep(validLocation, mediaItems)).toBe(3);
    expect(recommendationDraftResumeStep({
      ...validLocation,
      categoryId: 'food',
      subcategoryIds: ['restaurant'],
    }, mediaItems)).toBe(4);
  });

  it('offers continue or discard when a recommendation draft already exists', async () => {
    mockGetCurrentRecommendationDraft.mockResolvedValueOnce({
      ...makeEditItem({
        id: undefined,
        title: 'המלצה שנשמרה',
        recommendationCatalogVersion: undefined,
      }),
      id: 'draft-existing',
      version: 4,
      sourceRecommendationId: null,
      step: 3,
      locationMode: 'destination',
      selectedCountry: { id: 'IL', name: 'ישראל' },
      selectedCity: { id: 'TLV', name: 'תל אביב' },
      generalDestination: {
        key: 'city:IL:TLV', kind: 'city', countryId: 'IL', cityId: 'TLV',
        countryName: 'ישראל', name: 'תל אביב',
      },
      media: [],
      localMediaCount: 1,
    });
    mockRestoreRecommendationDraftMedia.mockResolvedValueOnce({ uris: [], missingCount: 1 });
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitFor(() => expect(screen.getByTestId('recommendation-draft-continue')).toBeTruthy());
    expect(screen.getByTestId('recommendation-draft-discard')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recommendation-draft-continue'));
    expect(mockRestoreRecommendationDraftMedia).toHaveBeenCalledWith('draft-existing', 1);
    await waitFor(() => expect(screen.getByTestId('recommendation-missing-local-media')).toBeTruthy());
    expect(screen.getByTestId('recommendation-image-picker')).toBeTruthy();
    expect(screen.queryByTestId('recommendation-title-input')).toBeNull();
    fireEvent.press(screen.getByTestId('recommendation-image-picker'));
    await waitFor(() => expect(mockPersistRecommendationDraftMedia).toHaveBeenCalled());
    fireEvent.press(await screen.findByTestId('recommendation-next'));
    await waitFor(() => expect(screen.getByTestId('recommendation-destination-selected')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-back'));
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft-existing',
      expectedVersion: 4,
      draft: expect.objectContaining({ step: 1 }),
    })), { timeout: 2500 });
  });

  it('keeps another draft unless the user discards it before opening a requested edit', async () => {
    mockGetCurrentRecommendationDraft.mockResolvedValueOnce({
      id: 'draft-other', version: 2, sourceRecommendationId: 'another-post',
      step: 2, locationMode: 'destination', title: 'עריכה אחרת', media: [], localMediaCount: 0,
    });
    const editItem = makeEditItem({ recommendationCatalogVersion: 1 });
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { mode: 'edit', item: editItem, postId: editItem.id } }}
      />
    );

    await waitFor(() => expect(screen.getByTestId('recommendation-switch-cancel')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-switch-cancel'));
    expect(navigationMock.goBack).toHaveBeenCalled();
    expect(mockDiscardRecommendationDraft).not.toHaveBeenCalled();
  });

  it('creates the draft after the required photo and autosaves later location changes', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );
    await waitForCatalogEditor(screen);
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft: expect.objectContaining({ localMediaCount: 1 }),
    })), { timeout: 2500 });

    fireEvent.changeText(screen.getByTestId('recommendation-exact-location-search'), 'טיוטה ראשונה');
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledWith(expect.objectContaining({
      sourceRecommendationId: null,
      draft: expect.objectContaining({ locationQuery: 'טיוטה ראשונה' }),
    })), { timeout: 2500 });
    expect(mockBindRecommendationDraftMedia).toHaveBeenCalledWith('recommendation-draft-1');
  });

  it('shows an autosave failure and retries with the same unsaved snapshot', async () => {
    mockSaveRecommendationDraft
      .mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'functions/unavailable' }))
      .mockResolvedValueOnce({ draftId: 'recommendation-draft-1', version: 1 });
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );
    await waitForCatalogEditor(screen);
    fireEvent.changeText(screen.getByTestId('recommendation-exact-location-search'), 'שינוי שלא נשמר');
    await waitFor(() => expect(screen.getByTestId('recommendation-save-retry')).toBeTruthy(), { timeout: 2500 });
    fireEvent.press(screen.getByTestId('recommendation-save-retry'));
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalledTimes(2));
    expect(mockSaveRecommendationDraft.mock.calls[1][0].draft.locationQuery).toBe('שינוי שלא נשמר');
    expect(mockSaveRecommendationDraft.mock.calls[1][0].saveRequestId)
      .toBe(mockSaveRecommendationDraft.mock.calls[0][0].saveRequestId);
  });

  it('freezes autosave while a recommendation is handed to the background publisher', async () => {
    jest.useFakeTimers();
    let finishEnqueue;
    let beforeRemoveHandler;
    mockGetCurrentRecommendationDraft.mockResolvedValueOnce({
      id: 'recommendation-draft-1',
      version: 7,
      sourceRecommendationId: null,
      step: 4,
      locationMode: 'exact',
      selectedCountry: { id: 'NI', name: 'ניקרגואה' },
      selectedCity: { id: 'rivas', name: 'ריוואס' },
      selectedPlace: { placeId: 'ojo-de-agua', name: 'Ojo de Agua' },
      locationQuery: 'Ojo de Agua',
      categoryId: 'food',
      subcategoryIds: ['restaurant'],
      title: 'Ojo de Agua',
      description: 'מעיינות נעימים באומטפה.',
      budget: 'economy',
      details: {},
      media: [canonicalMedia()],
      localMediaCount: 0,
    });
    mockSaveRecommendationDraft.mockResolvedValueOnce({
      draftId: 'recommendation-draft-1', version: 8,
    });
    mockEnqueueCreate.mockImplementationOnce(() => new Promise((resolve) => {
      finishEnqueue = resolve;
    }));
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn((event, handler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitFor(() => expect(screen.getByTestId('recommendation-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-draft-continue'));
    await waitFor(() => expect(screen.getByText('פרסום ההמלצה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-next'));
    await waitFor(() => expect(mockEnqueueCreate).toHaveBeenCalledTimes(1));
    expect(mockSaveRecommendationDraft).toHaveBeenCalledTimes(1);

    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemoveHandler({ preventDefault, data: { action: { type: 'POP' } } });
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'ההמלצה עוברת לפרסום',
      expect.stringContaining('כבר התחלנו'),
      expect.any(Array),
      expect.objectContaining({ cancelable: true })
    );

    fireEvent.press(screen.getByTestId('recommendation-budget-2'));
    await act(async () => {
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    expect(mockSaveRecommendationDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishEnqueue('publish-job-1');
      await Promise.resolve();
    });
    await waitFor(() => expect(navigationMock.goBack).toHaveBeenCalledTimes(1));
    jest.useRealTimers();
  });

  it('refreshes a stale draft version and completes the publication handoff', async () => {
    const draft = {
      id: 'recommendation-draft-1',
      version: 7,
      sourceRecommendationId: null,
      step: 4,
      locationMode: 'exact',
      selectedCountry: { id: 'NI', name: 'ניקרגואה' },
      selectedCity: { id: 'rivas', name: 'ריוואס' },
      selectedPlace: { placeId: 'ojo-de-agua', name: 'Ojo de Agua' },
      locationQuery: 'Ojo de Agua',
      categoryId: 'food',
      subcategoryIds: ['restaurant'],
      title: 'Ojo de Agua',
      description: 'מעיינות נעימים באומטפה.',
      budget: 'economy',
      details: {},
      media: [canonicalMedia()],
      localMediaCount: 0,
    };
    mockGetCurrentRecommendationDraft
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, version: 8 });
    mockSaveRecommendationDraft
      .mockRejectedValueOnce(Object.assign(new Error('stale'), {
        code: 'functions/aborted',
        details: { reason: 'RECOMMENDATION_DRAFT_VERSION_CONFLICT' },
      }))
      .mockResolvedValueOnce({ draftId: draft.id, version: 9 });
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitFor(() => expect(screen.getByTestId('recommendation-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-draft-continue'));
    await waitFor(() => expect(screen.getByText('פרסום ההמלצה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-next'));

    await waitFor(() => expect(mockEnqueueCreate).toHaveBeenCalledWith(expect.objectContaining({
      payload: { draftId: draft.id, expectedVersion: 9 },
    })));
    expect(mockSaveRecommendationDraft).toHaveBeenNthCalledWith(1, expect.objectContaining({
      draftId: draft.id,
      expectedVersion: 7,
    }));
    expect(mockSaveRecommendationDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({
      draftId: draft.id,
      expectedVersion: 8,
    }));
    expect(mockCaptureDiagnosticException).not.toHaveBeenCalled();
    expect(navigationMock.goBack).toHaveBeenCalled();
  });

  it('does not overwrite another draft while recovering a publication conflict', async () => {
    const draft = {
      id: 'recommendation-draft-1',
      version: 7,
      sourceRecommendationId: null,
      step: 4,
      locationMode: 'destination',
      generalDestination: {
        key: 'city:IL:TLV', kind: 'city', countryId: 'IL', cityId: 'TLV',
        countryName: 'ישראל', name: 'תל אביב',
      },
      selectedCountry: { id: 'IL', name: 'ישראל' },
      selectedCity: { id: 'TLV', name: 'תל אביב' },
      categoryId: 'food',
      subcategoryIds: ['restaurant'],
      title: 'מסעדה מקומית',
      description: 'מקום נעים לארוחה בעיר.',
      budget: 'economy',
      details: {},
      media: [canonicalMedia()],
      localMediaCount: 0,
    };
    const conflict = Object.assign(new Error('stale'), {
      code: 'functions/aborted',
      details: { reason: 'RECOMMENDATION_DRAFT_VERSION_CONFLICT' },
    });
    mockGetCurrentRecommendationDraft
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, id: 'another-draft', version: 8 });
    mockSaveRecommendationDraft.mockRejectedValueOnce(conflict);
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitFor(() => expect(screen.getByTestId('recommendation-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-draft-continue'));
    await waitFor(() => expect(screen.getByText('פרסום ההמלצה')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-next'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'לא הצלחנו לשמור את ההמלצה',
      'אפשר לנסות שוב בעוד רגע.'
    ));
    expect(mockSaveRecommendationDraft).toHaveBeenCalledTimes(1);
    expect(mockEnqueueCreate).not.toHaveBeenCalled();
    expect(mockCaptureDiagnosticException).toHaveBeenCalledWith(conflict, {
      operation: 'save_recommendation_for_publish',
      code: 'functions/aborted',
      reason: 'RECOMMENDATION_DRAFT_VERSION_CONFLICT',
      contentMode: 'destination',
    });
  });

  it('keeps a bottom optional field reachable and dismissible while preserving its text', async () => {
    const keyboardListeners = {};
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const addListenerSpy = jest.spyOn(Keyboard, 'addListener').mockImplementation((event, listener) => {
      keyboardListeners[event] = listener;
      return { remove: jest.fn() };
    });
    mockLoadJobForReview.mockResolvedValueOnce({
      payload: { draftId: 'recommendation-draft-keyboard', expectedVersion: 3 },
      draft: {
        step: 4,
        locationMode: 'exact',
        title: 'Queued title',
        description: 'Queued description',
        categoryId: 'food',
        subcategoryIds: ['restaurant'],
        budget: 'economy',
        details: {},
        selectedCountry: { id: 'IL', name: 'Israel' },
        selectedCity: { id: 'TLV', name: 'Tel Aviv' },
        selectedPlace: { placeId: 'place-1', name: 'Queued place' },
        locationQuery: 'Queued place',
      },
      imageUris: [],
      materializedMedia: [{ type: 'local', uri: 'file:///keyboard-photo.jpg' }],
    });
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { publishJobId: 'publish-job-keyboard' } }}
      />
    );

    try {
      await waitFor(() => expect(screen.getByTestId('recommendation-optional-accessibilityNote')).toBeTruthy());
      fireEvent.press(screen.getByTestId('recommendation-optional-accessibilityNote'));
      const input = screen.getByTestId('recommendation-optional-input-accessibilityNote');
      fireEvent(input, 'focus', { nativeEvent: { target: 42 } });
      act(() => {
        keyboardListeners.keyboardDidShow?.();
      });

      expect(screen.UNSAFE_getByType(KeyboardAvoidingView).props.behavior).toBe(
        Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
      );
      expect(screen.getByTestId('recommendation-composer-scroll').props.keyboardDismissMode).toBe(
        Platform.OS === 'ios' ? 'interactive' : 'on-drag'
      );
      fireEvent.changeText(input, 'כניסה נגישה ומעלית');
      fireEvent.press(screen.getByTestId('recommendation-keyboard-dismiss'));

      expect(dismissSpy).toHaveBeenCalled();
      expect(screen.getByTestId('recommendation-optional-input-accessibilityNote').props.value)
        .toBe('כניסה נגישה ומעלית');

      dismissSpy.mockClear();
      fireEvent.press(screen.getByTestId('recommendation-back'));
      expect(dismissSpy).toHaveBeenCalled();

      dismissSpy.mockClear();
      fireEvent.press(screen.getByTestId('recommendation-next'));
      expect(dismissSpy).toHaveBeenCalled();
      expect(screen.getByTestId('recommendation-optional-input-accessibilityNote').props.value)
        .toBe('כניסה נגישה ומעלית');

      const { useBackButton } = require('../src/hooks/useBackButton');
      dismissSpy.mockClear();
      useBackButton.mock.calls.at(-1)[1].onPress();
      expect(dismissSpy).toHaveBeenCalled();
    } finally {
      screen.unmount();
      addListenerSpy.mockRestore();
      dismissSpy.mockRestore();
    }
  });

  it('creates a concise catalog recommendation from an exact Google place', async () => {
    
    // ------------------------------------------------
    // Step 1: Arrange (Setup)
    // ------------------------------------------------
    
    // Mock navigation to verify 'goBack' is called upon success
    const navigationMock = { 
      goBack: jest.fn(), 
      setOptions: jest.fn(), 
      navigate: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    
    // Render the screen
    const { getByTestId, getByText } = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitForCatalogEditor({ getByTestId });

    // ------------------------------------------------
    // Step 2: Act (Simulate User Actions)
    // ------------------------------------------------

    // 1. Select and confirm an exact place.
    fireEvent.changeText(getByTestId('recommendation-exact-location-search'), 'Tel Aviv');
    fireEvent.press(getByTestId('google-result-select')); 
    await waitFor(() =>
      expect(mockResolveDestinationForPlacePreview).toHaveBeenCalledWith(
        'dummy-place-id'
      )
    );
    expect(mockUploadImages).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('exact-location-confirm'));
    fireEvent.press(getByTestId('recommendation-next'));

    // 2. Accept the Google classification suggestion.
    await waitFor(() => expect(getByText('כן, מתאים')).toBeTruthy());
    fireEvent.press(getByText('כן, מתאים'));
    fireEvent.press(getByTestId('recommendation-next'));

    // 3. Add the short story; the required image was selected in stage one.
    fireEvent.changeText(getByTestId('recommendation-title-input'), 'Best Pizza Ever');
    fireEvent.changeText(getByTestId('recommendation-description-input'), 'Great cheese and crust!');
    fireEvent.press(getByTestId('recommendation-next'));

    // 4. Price is required, while exact contact details stay optional.
    fireEvent.press(getByTestId('recommendation-budget-2'));
    fireEvent.press(getByTestId('recommendation-optional-phone'));
    expect(getByTestId('recommendation-optional-input-phone').props.maxLength).toBe(40);
    fireEvent.changeText(getByTestId('recommendation-optional-input-phone'), '+972 50 123 4567');
    fireEvent.press(getByTestId('recommendation-optional-externalUrl'));
    fireEvent.changeText(
      getByTestId('recommendation-optional-input-externalUrl'),
      '\u200f https://example.com/place'
    );
    expect(getByTestId('recommendation-optional-input-externalUrl').props.value)
      .toBe('https://example.com/place');
    fireEvent.press(getByTestId('recommendation-next'));

    // ------------------------------------------------
    // Step 3: Assert (Verify Outcome)
    // ------------------------------------------------

    await waitFor(() => {
      expect(mockEnqueueCreate).toHaveBeenCalledWith(expect.objectContaining({
        contentType: 'recommendation',
        sourceJobId: null,
        payload: { draftId: 'recommendation-draft-1', expectedVersion: 1 },
        media: [{ uri: 'file:///tasty-pizza.jpg' }],
        draft: expect.objectContaining({
          title: 'Best Pizza Ever',
          selectedPlace: expect.objectContaining({ placeId: 'google-place-id' }),
          selectedCity: expect.objectContaining({
            id: 'TLV', googlePlaceId: 'google-tel-aviv',
          }),
        }),
      }));
    });
    expect(mockSaveRecommendationDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft: expect.objectContaining({
        title: 'Best Pizza Ever',
        description: 'Great cheese and crust!',
        categoryId: 'food',
        subcategoryIds: ['restaurant'],
        budget: 'balanced',
        details: {
          phone: '+972 50 123 4567',
          externalUrl: 'https://example.com/place',
        },
        selectedPlace: expect.objectContaining({
          placeId: 'google-place-id', resolvedPlaceToken: 'resolved-place-token',
        }),
        selectedCity: expect.objectContaining({
          id: 'TLV', googlePlaceId: 'google-tel-aviv',
        }),
      }),
    }));

    // Verify navigation back to the previous screen
    expect(navigationMock.goBack).toHaveBeenCalled();
    expect(mockUploadImages).not.toHaveBeenCalled();
    expect(mockSaveRecommendation).not.toHaveBeenCalled();
    expect(mockRememberRecentDestination).not.toHaveBeenCalled();
  }, 15000);

  it('advances exactly once when an exact recommendation place is approved', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );
    await waitForCatalogEditor(screen);
    fireEvent.changeText(screen.getByTestId('recommendation-exact-location-search'), 'Tel Aviv');
    fireEvent.press(screen.getByTestId('google-result-select'));
    const confirm = await screen.findByTestId('exact-location-confirm');
    fireEvent.press(confirm);
    fireEvent.press(confirm);
    await waitFor(() => expect(screen.getByText('שלב 3 מתוך 4')).toBeTruthy());
    expect(screen.queryByTestId('recommendation-title-input')).toBeNull();
  });

  it('creates a recommendation for a general destination without guessing its classification', async () => {
    const navigationMock = {
      goBack: jest.fn(),
      setOptions: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const { getByTestId, getByText } = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitForCatalogEditor({ getByTestId });

    fireEvent.press(getByTestId('recommendation-location-mode-destination'));
    fireEvent.press(getByTestId('recommendation-test-select-destination'));
    expect(getByTestId('recommendation-destination-selected')).toBeTruthy();
    expect(getByText('שלב 2 מתוך 4')).toBeTruthy();
    fireEvent.press(getByTestId('recommendation-next'));

    fireEvent.press(getByTestId('recommendation-category-nature'));
    fireEvent.press(getByTestId('recommendation-subcategory-beach'));
    fireEvent.press(getByTestId('recommendation-next'));

    fireEvent.changeText(getByTestId('recommendation-title-input'), 'חוף עירוני נעים');
    fireEvent.changeText(getByTestId('recommendation-description-input'), 'מתאים לעצירה רגועה ליד העיר.');
    fireEvent.press(getByTestId('recommendation-next'));
    fireEvent.press(getByTestId('recommendation-budget-1'));
    fireEvent.press(getByTestId('recommendation-next'));

    await waitFor(() => expect(mockEnqueueCreate).toHaveBeenCalledWith(expect.objectContaining({
      payload: { draftId: 'recommendation-draft-1', expectedVersion: 1 },
      draft: expect.objectContaining({
        generalDestination: expect.objectContaining({ countryId: 'HU', cityId: 'budapest' }),
        categoryId: 'nature',
        subcategoryIds: ['beach'],
        budget: 'economy',
      }),
    })));
    expect(mockResolveDestinationForPlacePreview).not.toHaveBeenCalled();
    expect(navigationMock.goBack).toHaveBeenCalled();
  });

  it('allows provider destinations when choosing a city or region', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitForCatalogEditor(screen);
    fireEvent.press(screen.getByTestId('recommendation-location-mode-destination'));

    expect(mockSingleDestinationPickerProps).toHaveBeenCalledWith(expect.objectContaining({
      allowProviderDestinations: true,
    }));
  });

  it('edits a catalog recommendation in the concise flow without losing its classification', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const existingAsset = {
      assetId: '123e4567-e89b-42d3-a456-426614174111',
      large: { url: 'https://cdn/existing-large.webp' },
      feed: { url: 'https://cdn/existing-feed.webp' },
      thumb: { url: 'https://cdn/existing-thumb.webp' },
    };
    const editItem = makeEditItem({
      recommendationCatalogVersion: 1,
      subcategoryIds: ['restaurant'],
      details: { phone: '+972 50 111 2233' },
      locationMode: 'exact',
      media: [existingAsset],
    });
    const screen = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { mode: 'edit', item: editItem, postId: editItem.id } }}
      />
    );

    await waitFor(() => expect(screen.getByText('עריכת המלצה')).toBeTruthy());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 950)); });
    expect(mockSaveRecommendationDraft).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('recommendation-next'));
    fireEvent.press(screen.getByTestId('recommendation-next'));
    fireEvent.press(screen.getByTestId('recommendation-next'));
    fireEvent.changeText(screen.getByTestId('recommendation-title-input'), 'Original updated');
    fireEvent.press(screen.getByTestId('recommendation-next'));

    await waitFor(() => expect(mockEnqueueCreate).toHaveBeenCalledWith(expect.objectContaining({
      payload: {
        draftId: 'recommendation-draft-1',
        expectedVersion: 1,
        sourceRecommendationId: 'post-1',
      },
      media: [{ asset: existingAsset }],
      draft: expect.objectContaining({
        sourceRecommendationId: 'post-1',
        categoryId: 'food',
        subcategoryIds: ['restaurant'],
        title: 'Original updated',
        details: { phone: '+972 50 111 2233' },
      }),
    })));
    expect(mockSaveRecommendation).not.toHaveBeenCalled();
    expect(mockUploadImages).not.toHaveBeenCalled();
    expect(navigationMock.goBack).toHaveBeenCalled();
  });

  it('keeps the custom label while Other remains selected with another subcategory', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitForCatalogEditor(screen);

    fireEvent.press(screen.getByTestId('recommendation-location-mode-destination'));
    fireEvent.press(screen.getByTestId('recommendation-test-select-destination'));
    fireEvent.press(screen.getByTestId('recommendation-next'));
    fireEvent.press(screen.getByTestId('recommendation-category-food'));
    fireEvent.press(screen.getByTestId('recommendation-subcategory-more'));
    fireEvent.press(screen.getByTestId('recommendation-subcategory-food_other'));
    fireEvent.changeText(screen.getByTestId('recommendation-custom-subcategory'), 'סיור אוכל ביתי');
    fireEvent.press(screen.getByTestId('recommendation-subcategory-restaurant'));

    expect(screen.getByTestId('recommendation-custom-subcategory').props.value).toBe('סיור אוכל ביתי');
  });

  it('requires reselecting a coordinate-aware destination before adding a pin in edit mode', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const editItem = makeEditItem({
      recommendationCatalogVersion: 1,
      subcategoryIds: ['restaurant'],
      locationMode: 'destination',
      place: null,
      media: [canonicalMedia('123e4567-e89b-42d3-a456-426614174998')],
    });
    const screen = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { mode: 'edit', item: editItem, postId: editItem.id } }}
      />
    );

    fireEvent.press(await screen.findByTestId('recommendation-next'));
    await waitFor(() => expect(screen.getByTestId('recommendation-destination-selected')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-location-mode-pin'));

    expect(screen.queryByTestId('recommendation-destination-selected')).toBeNull();
    expect(screen.getByText('כדי לסמן נקודה במפה, כדאי לבחור שוב את העיר או האזור.')).toBeTruthy();
  });

  it('shows a place-resolution limit inline without opening a native alert', async () => {
    mockResolveDestinationForPlacePreview.mockRejectedValueOnce(Object.assign(
      new Error('Google request limit reached.'),
      { code: 'functions/resource-exhausted' }
    ));
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitForCatalogEditor(screen);

    fireEvent.press(screen.getByTestId('google-result-select'));

    await waitFor(() => expect(screen.getByTestId('recommendation-location-error')).toBeTruthy());
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('restores a failed queued recommendation for review', async () => {
    mockLoadJobForReview.mockResolvedValueOnce({
      payload: { draftId: 'recommendation-draft-review', expectedVersion: 7 },
      draft: {
        step: 3,
        locationMode: 'exact',
        title: 'Queued title',
        description: 'Queued description',
        categoryId: 'food',
        subcategoryIds: ['restaurant'],
        details: {},
        selectedCountry: { id: 'IL', name: 'Israel' },
        selectedCity: { id: 'TLV', name: 'Tel Aviv' },
        selectedPlace: { placeId: 'place-1', name: 'Queued place' },
        locationQuery: 'Queued place',
      },
      materializedMedia: [{ type: 'local', uri: 'file:///durable-queue-image.jpg' }],
    });
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const screen = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { publishJobId: 'publish-job-1' } }}
      />
    );

    await waitFor(() => expect(mockLoadJobForReview).toHaveBeenCalledWith('publish-job-1'));
    await waitFor(() => expect(screen.getByTestId('recommendation-title-input').props.value).toBe('Queued title'));
    expect(screen.getByTestId('recommendation-description-input').props.value).toBe('Queued description');
  });

  it('edit mode preserves saved vibe and environment without marking the form dirty', async () => {
    let beforeRemoveHandler;
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn((event, handler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
    };
    const editItem = makeEditItem({
      facets: {
        interests: ['food'], audienceScope: 'all', audiences: [],
        vibes: ['relaxed'], environments: ['indoor'], needs: [],
      },
    });
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: { mode: 'edit', item: editItem, postId: editItem.id } }} />
    );
    await waitFor(() => expect(screen.getByTestId('add-rec-title-input').props.value).toBe('Original'));
    fireEvent.press(screen.getByLabelText(/קהל ומאפיינים,/));
    expect(screen.getByTestId(`add-rec-vibe-${VIBES.findIndex((item) => item.value === 'relaxed')}`).props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId(`add-rec-environment-${ENVIRONMENTS.findIndex((item) => item.value === 'indoor')}`).props.accessibilityState.checked).toBe(true);
    const preventDefault = jest.fn();
    beforeRemoveHandler({ preventDefault, data: { action: { type: 'POP' } } });
    expect(preventDefault).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('add-rec-submit'));
    await waitFor(() => expect(mockSaveRecommendation).toHaveBeenCalled());
    expect(mockSaveRecommendation.mock.calls[0][0].recommendation.attributes.vibes).toEqual(['relaxed']);
    expect(mockSaveRecommendation.mock.calls[0][0].recommendation.attributes.environment).toBe('indoor');
  });

  it('clears hydrated attributes only after an applicable tag is removed', async () => {
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const editItem = makeEditItem({
      facets: {
        interests: ['food'], audienceScope: 'all', audiences: [],
        vibes: ['relaxed'], environments: ['indoor'], needs: [],
      },
    });
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: { mode: 'edit', item: editItem, postId: editItem.id } }} />
    );
    await waitFor(() => expect(screen.getByTestId('add-rec-title-input').props.value).toBe('Original'));
    fireEvent.press(screen.getByLabelText(/קטגוריה וסוג,/));
    fireEvent.press(screen.getByTestId('add-rec-tag-0'));
    await waitFor(() => expect(screen.getByTestId('add-rec-tag-0').props.accessibilityState.checked).toBe(false));
    fireEvent.press(screen.getByTestId('add-rec-tag-0'));
    fireEvent.press(screen.getByLabelText(/קהל ומאפיינים,/));
    await waitFor(() => {
      expect(screen.getByTestId(`add-rec-vibe-${VIBES.findIndex((item) => item.value === 'relaxed')}`).props.accessibilityState.checked).toBe(false);
      expect(screen.getByTestId(`add-rec-environment-${ENVIRONMENTS.findIndex((item) => item.value === 'indoor')}`).props.accessibilityState.checked).toBe(false);
    });
  });

  it('create mode: protects an unfinished recommendation before leaving', async () => {
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
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitForCatalogEditor({ getByTestId });

    fireEvent.changeText(getByTestId('recommendation-exact-location-search'), 'טיוטת המלצה');
    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemoveHandler({ preventDefault, data: { action: { type: 'POP' } } });
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'ההמלצה עדיין בתהליך',
      'מה תרצו לעשות לפני היציאה?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'המשך עריכה' }),
        expect.objectContaining({ text: 'ויתור על השינויים ויציאה' }),
        expect.objectContaining({ text: 'שמירת טיוטה ויציאה' }),
      ]),
      expect.objectContaining({ cancelable: true })
    );
    const leaveActions = Alert.alert.mock.calls.at(-1)[2];
    await act(async () => {
      await leaveActions.find((action) => action.text === 'שמירת טיוטה ויציאה').onPress();
    });
    await waitFor(() => expect(mockSaveRecommendationDraft).toHaveBeenCalled());
    await waitFor(() => expect(navigationMock.dispatch).toHaveBeenCalledWith({ type: 'POP' }));
  });

  it('save and exit refreshes a stale recommendation draft version and retries once', async () => {
    let beforeRemoveHandler;
    const draft = {
      ...makeEditItem({ id: undefined, recommendationCatalogVersion: undefined }),
      id: 'recommendation-draft-1',
      version: 7,
      sourceRecommendationId: null,
      step: 4,
      locationMode: 'exact',
      selectedCountry: { id: 'IL', name: 'ישראל' },
      selectedCity: { id: 'TLV', name: 'תל אביב' },
      selectedPlace: { placeId: 'p1', name: 'Spot' },
      locationQuery: 'Spot',
      subcategoryIds: ['restaurant'],
      media: [canonicalMedia()],
      localMediaCount: 0,
    };
    mockGetCurrentRecommendationDraft
      .mockResolvedValueOnce(draft)
      .mockResolvedValueOnce({ ...draft, version: 8 });
    mockSaveRecommendationDraft
      .mockRejectedValueOnce(Object.assign(new Error('stale'), {
        code: 'functions/aborted',
        details: { reason: 'RECOMMENDATION_DRAFT_VERSION_CONFLICT' },
      }))
      .mockResolvedValueOnce({ draftId: draft.id, version: 9 });
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn((event, handler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitFor(() => expect(screen.getByTestId('recommendation-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-draft-continue'));
    await waitFor(() => expect(screen.getByTestId('recommendation-budget-2')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-budget-2'));
    await act(async () => {
      beforeRemoveHandler({ preventDefault: jest.fn(), data: { action: { type: 'POP' } } });
    });
    const leaveActions = Alert.alert.mock.calls.at(-1)[2];
    await act(async () => {
      await leaveActions.find((action) => action.text === 'שמירת טיוטה ויציאה').onPress();
    });

    expect(mockGetCurrentRecommendationDraft).toHaveBeenCalledTimes(2);
    expect(mockSaveRecommendationDraft).toHaveBeenNthCalledWith(1, expect.objectContaining({
      draftId: draft.id,
      expectedVersion: 7,
    }));
    expect(mockSaveRecommendationDraft).toHaveBeenNthCalledWith(2, expect.objectContaining({
      draftId: draft.id,
      expectedVersion: 8,
      draft: expect.objectContaining({ budget: 'balanced' }),
    }));
    expect(navigationMock.dispatch).toHaveBeenCalledWith({ type: 'POP' });
  });

  it('finishes leaving when a recommendation draft was already discarded remotely', async () => {
    let beforeRemoveHandler;
    mockGetCurrentRecommendationDraft.mockResolvedValueOnce({
      ...makeEditItem({ id: undefined, recommendationCatalogVersion: undefined }),
      id: 'recommendation-draft-1',
      version: 7,
      sourceRecommendationId: null,
      step: 4,
      locationMode: 'destination',
      selectedCountry: { id: 'IL', name: 'ישראל' },
      selectedCity: { id: 'TLV', name: 'תל אביב' },
      subcategoryIds: ['restaurant'],
      media: [canonicalMedia()],
      localMediaCount: 0,
    });
    mockDiscardRecommendationDraft.mockRejectedValueOnce(Object.assign(new Error('gone'), {
      code: 'functions/not-found',
      details: { reason: 'RECOMMENDATION_DRAFT_NOT_FOUND' },
    }));
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn((event, handler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitFor(() => expect(screen.getByTestId('recommendation-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-draft-continue'));
    await waitFor(() => expect(screen.getByTestId('recommendation-budget-1')).toBeTruthy());
    await act(async () => {
      beforeRemoveHandler({ preventDefault: jest.fn(), data: { action: { type: 'POP' } } });
    });
    const leaveActions = Alert.alert.mock.calls.at(-1)[2];
    await act(async () => {
      await leaveActions.find((action) => action.text === 'ויתור על השינויים ויציאה').onPress();
    });

    expect(mockClearRecommendationDraftMedia).toHaveBeenCalledWith({ deleteFiles: true });
    expect(navigationMock.dispatch).toHaveBeenCalledWith({ type: 'POP' });
    expect(Alert.alert.mock.calls.some(([title]) => title === 'לא הצלחנו לוותר על השינויים')).toBe(false);
  });

  it('shows discard progress, ignores a duplicate press, and leaves after local cleanup fails', async () => {
    let beforeRemoveHandler;
    let finishDiscard;
    const draft = {
      ...makeEditItem({ id: undefined, recommendationCatalogVersion: undefined }),
      id: 'recommendation-draft-1',
      version: 7,
      sourceRecommendationId: null,
      step: 4,
      locationMode: 'destination',
      selectedCountry: { id: 'IL', name: 'ישראל' },
      selectedCity: { id: 'TLV', name: 'תל אביב' },
      subcategoryIds: ['restaurant'],
      media: [canonicalMedia()],
      localMediaCount: 0,
    };
    mockGetCurrentRecommendationDraft.mockResolvedValueOnce(draft);
    mockDiscardRecommendationDraft.mockImplementationOnce(() => new Promise((resolve) => {
      finishDiscard = resolve;
    }));
    mockClearRecommendationDraftMedia.mockRejectedValueOnce(Object.assign(new Error('cleanup failed'), {
      code: 'storage/unavailable',
    }));
    const navigationMock = {
      goBack: jest.fn(), setOptions: jest.fn(), navigate: jest.fn(), dispatch: jest.fn(),
      addListener: jest.fn((event, handler) => {
        if (event === 'beforeRemove') beforeRemoveHandler = handler;
        return jest.fn();
      }),
    };
    const screen = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    await waitFor(() => expect(screen.getByTestId('recommendation-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('recommendation-draft-continue'));
    await waitFor(() => expect(screen.getByTestId('recommendation-budget-1')).toBeTruthy());
    await act(async () => {
      beforeRemoveHandler({ preventDefault: jest.fn(), data: { action: { type: 'POP' } } });
    });
    const discardAction = Alert.alert.mock.calls.at(-1)[2]
      .find((action) => action.text === 'ויתור על השינויים ויציאה');
    act(() => {
      discardAction.onPress();
      discardAction.onPress();
    });

    expect(screen.getByText('מוותרים על השינויים…')).toBeTruthy();
    await waitFor(() => expect(mockDiscardRecommendationDraft).toHaveBeenCalledTimes(1));
    await act(async () => {
      finishDiscard({ discarded: true });
      await Promise.resolve();
    });

    await waitFor(() => expect(navigationMock.dispatch).toHaveBeenCalledWith({ type: 'POP' }));
    expect(mockCaptureDiagnosticException).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({
      operation: 'cleanup_recommendation_draft_media',
      contentMode: 'destination',
    }));
  });

  it('edit mode: beforeRemove shows unsaved alert when dirty; כן dispatches action', async () => {
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

    const editItem = makeEditItem();
    const { getByTestId, getByText } = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { mode: 'edit', item: editItem, postId: 'post-1' } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('add-rec-title-input').props.value).toBe('Original');
    });

    fireEvent.changeText(getByTestId('add-rec-title-input'), 'Changed');

    const preventDefault = jest.fn();
    const action = { type: 'POP', source: 'test' };
    await act(async () => {
      beforeRemoveHandler({ preventDefault, data: { action } });
    });

    expect(preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(getByTestId('unsaved-discard-modal')).toBeTruthy();
    });
    expect(getByText(UNSAVED_EDIT_TITLE)).toBeTruthy();
    expect(getByText(UNSAVED_EDIT_MESSAGE)).toBeTruthy();

    fireEvent.press(getByTestId('unsaved-discard-confirm'));
    expect(navigationMock.dispatch).toHaveBeenCalledWith(action);
  });

  it('edit mode: beforeRemove does not prevent when form is clean', async () => {
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

    const editItem = makeEditItem({
      facets: {
        interests: ['food'], audienceScope: 'all', audiences: [],
        vibes: ['relaxed'], environments: ['indoor'], needs: [],
      },
    });
    const { getByTestId, getByLabelText } = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { mode: 'edit', item: editItem, postId: 'post-1' } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('add-rec-title-input').props.value).toBe('Original');
    });
    fireEvent.press(getByLabelText(/קהל ומאפיינים,/));
    expect(getByTestId(`add-rec-vibe-${VIBES.findIndex((item) => item.value === 'relaxed')}`).props.accessibilityState.checked).toBe(true);
    expect(getByTestId(`add-rec-environment-${ENVIRONMENTS.findIndex((item) => item.value === 'indoor')}`).props.accessibilityState.checked).toBe(true);

    const preventDefault = jest.fn();
    const action = { type: 'POP' };
    beforeRemoveHandler({ preventDefault, data: { action } });

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('edit mode: לא does not dispatch navigation', async () => {
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

    const editItem = makeEditItem();
    const { getByTestId } = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { mode: 'edit', item: editItem, postId: 'post-1' } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('add-rec-title-input').props.value).toBe('Original');
    });

    fireEvent.changeText(getByTestId('add-rec-title-input'), 'Changed');

    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemoveHandler({ preventDefault, data: { action: { type: 'POP' } } });
    });

    expect(preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(getByTestId('unsaved-discard-modal')).toBeTruthy();
    });

    fireEvent.press(getByTestId('unsaved-discard-cancel'));
    expect(navigationMock.dispatch).not.toHaveBeenCalled();
  });

  it('edit mode: uses route.params.recommendation when item is absent', async () => {
    const navigationMock = {
      goBack: jest.fn(),
      setOptions: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      addListener: jest.fn(() => jest.fn()),
    };
    const editItem = makeEditItem();
    const { getByTestId } = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { mode: 'edit', recommendation: editItem, postId: 'post-1' } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('add-rec-title-input').props.value).toBe('Original');
    });
  });

  it('edit mode: non-owner post (e.g. admin) still shows unsaved dialog when dirty', async () => {
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

    const editItem = makeEditItem({ userId: 'another-authors-uid' });
    const { getByTestId, getByText } = render(
      <AddRecommendationScreen
        navigation={navigationMock}
        route={{ params: { mode: 'edit', item: editItem, postId: 'post-1' } }}
      />
    );

    await waitFor(() => {
      expect(getByTestId('add-rec-title-input').props.value).toBe('Original');
    });

    fireEvent.changeText(getByTestId('add-rec-title-input'), 'Admin edit');

    const preventDefault = jest.fn();
    await act(async () => {
      beforeRemoveHandler({ preventDefault, data: { action: { type: 'POP' } } });
    });

    expect(preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(getByTestId('unsaved-discard-modal')).toBeTruthy();
    });
    expect(getByText(UNSAVED_EDIT_TITLE)).toBeTruthy();
  });

  it('edit mode: in-place route swap to another post when dirty calls setParams(restore) and modal; כן applies pending post', async () => {
    const itemA = makeEditItem({ id: 'post-a', title: 'Alpha' });
    const itemB = makeEditItem({ id: 'post-b', title: 'Beta' });

    const setParams = jest.fn();
    const navigationMock = {
      goBack: jest.fn(),
      setOptions: jest.fn(),
      navigate: jest.fn(),
      dispatch: jest.fn(),
      setParams,
      addListener: jest.fn(() => jest.fn()),
    };

    let routeParams = { mode: 'edit', item: itemA, postId: 'post-a' };

    const { getByTestId, rerender } = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: routeParams }} />
    );

    await waitFor(() => {
      expect(getByTestId('add-rec-title-input').props.value).toBe('Alpha');
    });

    fireEvent.changeText(getByTestId('add-rec-title-input'), 'Alpha edited');

    routeParams = { mode: 'edit', item: itemB, postId: 'post-b' };
    rerender(<AddRecommendationScreen navigation={navigationMock} route={{ params: routeParams }} />);

    await waitFor(() => {
      expect(setParams).toHaveBeenCalled();
    });

    const restoreArg = setParams.mock.calls.map((c) => c[0]).find((p) => p?.postId === 'post-a');
    expect(restoreArg).toBeTruthy();
    expect(restoreArg.item?.id ?? restoreArg.recommendation?.id).toBe('post-a');

    await waitFor(() => {
      expect(getByTestId('unsaved-discard-modal')).toBeTruthy();
    });

    routeParams = { ...restoreArg };
    rerender(<AddRecommendationScreen navigation={navigationMock} route={{ params: routeParams }} />);

    expect(getByTestId('add-rec-title-input').props.value).toBe('Alpha edited');

    await act(async () => {
      fireEvent.press(getByTestId('unsaved-discard-confirm'));
    });

    const pendingArg = [...setParams.mock.calls].reverse().map((c) => c[0]).find((p) => p?.postId === 'post-b');
    expect(pendingArg).toBeTruthy();

    routeParams = { ...pendingArg };
    rerender(<AddRecommendationScreen navigation={navigationMock} route={{ params: routeParams }} />);

    await waitFor(() => {
      expect(getByTestId('add-rec-title-input').props.value).toBe('Beta');
    });
  });
});
