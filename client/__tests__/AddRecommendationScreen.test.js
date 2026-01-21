import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
  return ({ onSelect, placeholder, onChangeValue }) => (
    <View>
      <TextInput 
        placeholder={placeholder} 
        onChangeText={onChangeValue} 
        testID="google-places-input"
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
    const { getByPlaceholderText, getByText, getByTestId, getAllByText } = render(
      <AddRecommendationScreen navigation={navigationMock} route={{ params: {} }} />
    );

    // ------------------------------------------------
    // Step 2: Act (Simulate User Actions)
    // ------------------------------------------------

    // 0. Add an image (optional in validation, but required by test requirements)
    fireEvent.press(getByText('הוסף תמונות (עד 5)'));
    await waitFor(() => expect(mockPickImages).toHaveBeenCalled());

    // 1. Enter Title
    fireEvent.changeText(getByPlaceholderText('לדוגמא: מסעדת שף בתל אביב'), 'Best Pizza Ever');

    // 2. Select Location (Simulated)
    // We type 'Tel Aviv' and then click our mock button to simulate a Google API selection.
    fireEvent.changeText(getByTestId('google-places-input'), 'Tel Aviv'); 
    fireEvent.press(getByTestId('google-result-select')); 
    // This triggers the LocationService mock, setting state with 'Israel', 'Tel Aviv', and coordinates.

    // 3. Enter Description
    fireEvent.changeText(getByPlaceholderText('תאר לנו למה אתה ממליץ על המקום הזה...'), 'Great cheese and crust!');

    // 4. Select Main Category
    fireEvent.press(getByText('אוכל ובילויים'));

    // 5. Select Sub-Category (Tags)
    // We wait for the tags to appear (async UI update) then select 'מסעדה'.
    await waitFor(() => getByText('מסעדה'));
    fireEvent.press(getByText('מסעדה'));

    // 6. Select Budget
    const budgetOptions = getAllByText('₪₪');
    fireEvent.press(budgetOptions[0]);

    // 7. Submit Form
    const submitBtn = getByText('פרסם המלצה');
    fireEvent.press(submitBtn);

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
});