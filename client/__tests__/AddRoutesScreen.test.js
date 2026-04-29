import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import AddRoutesScreen from '../src/features/roadtrip/screens/AddRoutesScreen';

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
    Title: 'Original route',
    days: 1,
    distance: 100,
    desc: 'Route description',
    tripDaysData: [
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
    difficultyTag: '',
    travelStyleTag: '',
    roadTripTags: [],
    experienceTags: [],
    ...overrides,
  };
}

describe('AddRoutesScreen unsaved guard (edit)', () => {
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
});
