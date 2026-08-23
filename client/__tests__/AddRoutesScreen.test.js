import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import AddRoutesScreen from '../src/features/roadtrip/screens/AddRoutesScreen';

const mockGetCurrentRouteDraft = jest.fn();
const mockSaveRouteDraft = jest.fn();
const mockDiscardRouteDraft = jest.fn();
const mockPublishRouteDraft = jest.fn();

jest.mock('../src/services/RouteService', () => ({
  getCurrentRouteDraft: (...args) => mockGetCurrentRouteDraft(...args),
  saveRouteDraft: (...args) => mockSaveRouteDraft(...args),
  discardRouteDraft: (...args) => mockDiscardRouteDraft(...args),
  publishRouteDraft: (...args) => mockPublishRouteDraft(...args),
}));

jest.mock('../src/hooks/useBackButton', () => ({ useBackButton: jest.fn() }));
jest.mock('../src/features/community/components/NoyaGuide', () => {
  const { Text } = require('react-native');
  return ({ message }) => <Text>{message}</Text>;
});
jest.mock('../src/features/community/components/SingleDestinationPicker', () => {
  const { Pressable, Text, View } = require('react-native');
  return ({ value, onChange }) => value ? (
    <View><Text>{value.name}</Text><Pressable testID="destination-clear" onPress={() => onChange(null)}><Text>שינוי</Text></Pressable></View>
  ) : (
    <Pressable testID="destination-select" onPress={() => onChange({
      countryId: 'HU', cityId: 'budapest', countryName: 'הונגריה', name: 'בודפשט',
    })}><Text>בחירת בודפשט</Text></Pressable>
  );
});
jest.mock('../src/features/roadtrip/components/DayEditorModal', () => {
  const { View } = require('react-native');
  return () => <View testID="day-editor-modal" />;
});

const navigation = () => ({
  goBack: jest.fn(),
  navigate: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
});

const currentDraft = (overrides = {}) => ({
  id: 'draft-1',
  version: 2,
  sourceRouteId: null,
  area: { countryId: 'HU', cityId: 'budapest', countryName: 'הונגריה', cityName: 'בודפשט' },
  dayCount: 1,
  title: 'יום בבודפשט',
  description: 'מסלול קצר',
  attributes: { audienceScope: 'all', audiences: [], budgetLevel: 'balanced', seasons: [] },
  categoryIds: [],
  subcategoryIds: [],
  transportModes: [],
  days: [{
    id: 'day_001',
    stops: [
      { id: 'a', title: 'השוק', locationPrecision: 'general', destination: { countryId: 'HU', cityId: 'budapest' } },
      { id: 'b', title: 'בית קפה', locationPrecision: 'general', destination: { countryId: 'HU', cityId: 'budapest' } },
    ],
  }],
  ...overrides,
});

describe('streamlined route builder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentRouteDraft.mockResolvedValue(null);
    mockSaveRouteDraft.mockResolvedValue({ draftId: 'draft-1', version: 1 });
    mockDiscardRouteDraft.mockResolvedValue({ discarded: true });
    mockPublishRouteDraft.mockResolvedValue({ routeId: 'route-1', published: true });
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    require('react-native').Alert.alert.mockRestore();
  });

  it('opens a server draft from only a destination and day count', async () => {
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: {} }} />);
    await waitFor(
      () => expect(screen.getByText('נתחיל בקטן. איפה המסלול וכמה ימים?')).toBeTruthy(),
      { timeout: 5000 }
    );
    fireEvent.press(screen.getByTestId('destination-select'));
    fireEvent.press(screen.getByTestId('route-start-days-2'));
    fireEvent.press(screen.getByTestId('route-start-open'));
    await waitFor(() => expect(mockSaveRouteDraft).toHaveBeenCalledWith(expect.objectContaining({
      draft: expect.objectContaining({ dayCount: 2, title: '2 ימים בבודפשט' }),
    })));
    await waitFor(() => expect(screen.getByTestId('route-map-peek')).toBeTruthy());
  });

  it('offers continue or discard when one private draft already exists', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft());
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-discard'));
    await waitFor(() => expect(mockDiscardRouteDraft).toHaveBeenCalledWith('draft-1'));
    expect(screen.getByText('נתחיל בקטן. איפה המסלול וכמה ימים?')).toBeTruthy();
  });

  it('keeps an existing draft and requires route description, price and useful stops before publish', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft({
      sourceRouteId: 'route-1',
      description: '',
      attributes: { audienceScope: 'all', audiences: [], budgetLevel: '', seasons: [] },
      days: [{ id: 'day_001', stops: [] }],
    }));
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: { routeToEdit: { id: 'route-1' } } }} />);
    await waitFor(() => expect(screen.getByTestId('route-submit')).toBeTruthy());
    expect(screen.getByText('שמור שינויים')).toBeTruthy();
    expect(screen.queryByText('פרסום המסלול')).toBeNull();
    fireEvent.press(screen.getByTestId('route-submit'));
    await waitFor(() => expect(screen.getByTestId('route-description-input')).toBeTruthy());
    expect(screen.getByText('כדאי להוסיף תיאור למסלול.')).toBeTruthy();
    expect(mockPublishRouteDraft).not.toHaveBeenCalled();
  });

  it('publishes the exact saved draft version after validation succeeds', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft());
    const nav = navigation();
    const screen = render(<AddRoutesScreen navigation={nav} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-continue'));
    fireEvent.press(screen.getByTestId('route-submit'));
    await waitFor(() => expect(mockPublishRouteDraft).toHaveBeenCalledWith('draft-1', 2));
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('autosaves changed publication details with optimistic versioning', async () => {
    jest.useFakeTimers();
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft());
    mockSaveRouteDraft.mockResolvedValue({ draftId: 'draft-1', version: 3 });
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-continue'));
    fireEvent.press(screen.getByTestId('route-details-toggle'));
    fireEvent.changeText(screen.getByTestId('route-description-input'), 'תיאור מעודכן');
    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await waitFor(() => expect(mockSaveRouteDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft-1', expectedVersion: 2,
      draft: expect.objectContaining({ description: 'תיאור מעודכן' }),
    })));
    jest.useRealTimers();
  });

  it('keeps local changes after an autosave failure and retries successfully', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft());
    mockSaveRouteDraft
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ draftId: 'draft-1', version: 3 });
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-continue'));
    fireEvent.press(screen.getByTestId('route-details-toggle'));
    fireEvent.changeText(screen.getByTestId('route-description-input'), 'תיאור שנשאר במסך');
    await waitFor(() => expect(screen.getByTestId('route-save-retry')).toBeTruthy(), { timeout: 4000 });
    expect(screen.getByTestId('route-description-input').props.value).toBe('תיאור שנשאר במסך');
    fireEvent.press(screen.getByTestId('route-save-retry'));
    await waitFor(() => expect(mockSaveRouteDraft).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('נשמר')).toBeTruthy());
  });
});
