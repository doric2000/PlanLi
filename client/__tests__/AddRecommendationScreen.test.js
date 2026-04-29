import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AddRecommendationScreen from '../src/features/community/screens/AddRecommendationScreen';
import { Alert } from 'react-native';
import { addDoc, serverTimestamp } from 'firebase/firestore';

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
jest.mock('../src/services/LocationService', () => ({
  getOrCreateDestinationForPlace: jest.fn(() => Promise.resolve({
    // General destination info used for app routing/filtering
    destination: {
      country: { id: 'IL', name: 'Israel' },
      city: { id: 'TLV', name: 'Tel Aviv' }
    },
    // Specific Google Place details
    place: { 
      placeId: 'google-place-id', 
      name: 'Pizza Hut', 
      address: 'Tel Aviv St 1',
      // REQUIRED: Coordinates (saved in Firestore under postData.place)
      geometry: {
        location: {
          lat: 32.0853,
          lng: 34.7818
        }
      },
      types: ['restaurant', 'food', 'establishment'],
      rating: 4.5
    }
  })),
  searchPlaces: jest.fn(() => Promise.resolve([]))
}));

// C. Mock Image Picker
// The screen calls pickImages() to obtain local/remote URIs; we return a remote URL.
const mockPickImages = jest.fn(() => Promise.resolve(['https://fake-url.com/tasty-pizza.jpg']));
const mockUploadImages = jest.fn(() => Promise.resolve([]));

jest.mock('../src/hooks/useImagePickerWithUpload', () => ({
  useImagePickerWithUpload: () => ({
    pickImages: mockPickImages,
    uploadImages: mockUploadImages,
  })
}));

// D. Mock User Permissions
// The app's tiers are: guest | unverified | verified
jest.mock('../src/utils/userTier', () => ({
  getUserTier: () => 'verified',
}));

// E. Mock GooglePlacesInput Component
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
    tags: ['מסעדה'],
    budget: '₪',
    countryId: 'IL',
    cityId: 'TLV',
    country: 'Israel',
    location: 'Tel Aviv',
    place: { placeId: 'p1', name: 'Spot', geometry: { location: { lat: 32, lng: 34 } } },
    images: [],
    ...overrides,
  };
}

describe('AddRecommendationScreen Integration Test', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    Alert.alert.mockRestore?.();
  });

  it('should fill all form fields (including geometry coordinates & tags) and submit to Firebase', async () => {
    
    // ------------------------------------------------
    // Step 1: Arrange (Setup)
    // ------------------------------------------------
    
    // Mock navigation to verify 'goBack' is called upon success
    const navigationMock = { 
      goBack: jest.fn(), 
      setOptions: jest.fn(), 
      navigate: jest.fn() 
    };
    
    // Render the screen
    const { getByTestId } = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    // ------------------------------------------------
    // Step 2: Act (Simulate User Actions)
    // ------------------------------------------------

    // 0. Add an image (optional in validation, but required by test requirements)
    fireEvent.press(getByTestId('add-rec-image-picker'));
    await waitFor(() => expect(mockPickImages).toHaveBeenCalled());

    // 1. Enter Title
    fireEvent.changeText(getByTestId('add-rec-title-input'), 'Best Pizza Ever');

    // 2. Select Location (Simulated)
    // We type 'Tel Aviv' and then click our mock button to simulate a Google API selection.
    fireEvent.changeText(getByTestId('add-rec-location-input'), 'Tel Aviv'); 
    fireEvent.press(getByTestId('google-result-select')); 
    // This triggers the LocationService mock, setting state with 'Israel', 'Tel Aviv', and coordinates.

    // 3. Enter Description
    fireEvent.changeText(getByTestId('add-rec-description-input'), 'Great cheese and crust!');

    // 4. Select Main Category
    fireEvent.press(getByTestId('add-rec-category-0'));

    // 5. Select Sub-Category (Tags)
    // We wait for the tags to appear (async UI update) then select 'מסעדה'.
    await waitFor(() => getByTestId('add-rec-tag-0'));
    fireEvent.press(getByTestId('add-rec-tag-0'));

    // 6. Select Budget
    fireEvent.press(getByTestId('add-rec-budget-2'));

    // 7. Submit Form
    fireEvent.press(getByTestId('add-rec-submit'));

    // ------------------------------------------------
    // Step 3: Assert (Verify Outcome)
    // ------------------------------------------------

    await waitFor(() => {
      // Verify that Firestore's addDoc was called
      expect(addDoc).toHaveBeenCalled();

      // Verify the data sent to Firestore matches our inputs AND the mocked service data
      expect(addDoc).toHaveBeenCalledWith(
        expect.anything(), // Collection reference
        expect.objectContaining({
          title: 'Best Pizza Ever',
          description: 'Great cheese and crust!',
          category: 'אוכל ובילויים',
          categoryId: 'food',
          
          // These fields come from the LocationService mock:
          country: 'Israel',
          location: 'Tel Aviv',
          countryId: 'IL',
          cityId: 'TLV',

          // Verify tags (sub-category)
          tags: expect.arrayContaining(['מסעדה']),
          budget: '₪₪',

          // Images are stored as an array in current implementation
          images: ['https://fake-url.com/tasty-pizza.jpg'],

          // Place object should include geometry with coordinates
          place: expect.objectContaining({
            placeId: 'google-place-id',
            geometry: expect.objectContaining({
              location: expect.objectContaining({
                lat: 32.0853,
                lng: 34.7818,
              }),
            }),
          }),

          // Created-by fields
          userId: 'test-user-id',
          createdAt: serverTimestamp(),
          likes: 0,
          likedBy: [],
        })
      );
    });

    // Verify navigation back to the previous screen
    expect(navigationMock.goBack).toHaveBeenCalled();
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
