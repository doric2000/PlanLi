import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import AddRoutesScreen, {
  reorderRouteStops,
  routeFooterInsetsStyle,
  routeDraftForServer,
  routeEditorComparable,
} from '../src/features/roadtrip/screens/AddRoutesScreen';

const mockGetCurrentRouteDraft = jest.fn();
const mockSaveRouteDraft = jest.fn();
const mockDiscardRouteDraft = jest.fn();
const mockLoadRouteDetails = jest.fn();
const mockEnqueueCreate = jest.fn();
const mockLoadJobForReview = jest.fn();
const mockUseBackButton = jest.fn();

jest.mock('../src/services/RouteService', () => ({
  getCurrentRouteDraft: (...args) => mockGetCurrentRouteDraft(...args),
  saveRouteDraft: (...args) => mockSaveRouteDraft(...args),
  discardRouteDraft: (...args) => mockDiscardRouteDraft(...args),
  loadRouteDetails: (...args) => mockLoadRouteDetails(...args),
}));

jest.mock('expo-crypto', () => ({ randomUUID: () => 'stable-new-stop-id' }));

jest.mock('../src/features/publishing/ContentPublishContext', () => ({
  useContentPublish: () => ({
    enqueueCreate: mockEnqueueCreate,
    loadJobForReview: mockLoadJobForReview,
  }),
}));
jest.mock('../src/hooks/useDurableDraftMedia', () => ({
  __esModule: true,
  default: () => ({
    draftJobId: '123e4567-e89b-42d3-a456-426614174099',
    forgetUri: jest.fn(async () => {}),
    markEnqueued: jest.fn(),
    mediaForUri: (uri) => ({ uri }),
    persistUris: jest.fn(async (uris) => uris),
  }),
}));

jest.mock('../src/hooks/useBackButton', () => ({
  useBackButton: (...args) => mockUseBackButton(...args),
}));
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return { GestureHandlerRootView: View };
});
jest.mock('react-native-draggable-flatlist', () => {
  const React = require('react');
  const { ScrollView, View } = require('react-native');
  return {
    NestableScrollContainer: React.forwardRef(({ children, ...props }, ref) => (
      <ScrollView {...props} ref={ref}>{children}</ScrollView>
    )),
    NestableDraggableFlatList: ({ data, keyExtractor, renderItem, testID }) => (
      <View testID={testID}>{data.map((item, index) => (
        <React.Fragment key={keyExtractor(item, index)}>
          {renderItem({ item, index, drag: () => {}, isActive: false })}
        </React.Fragment>
      ))}</View>
    ),
    ScaleDecorator: ({ children }) => <>{children}</>,
  };
});
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));
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
jest.mock('../src/features/roadtrip/components/StopEditorModal', () => {
  const { Pressable, Text, View } = require('react-native');
  return ({ visible, initialData, dayIndex, stopIndex, onSave, onClose }) => visible ? (
    <View
      testID="direct-stop-editor"
      accessibilityLabel={`stop-${dayIndex}-${stopIndex}-${initialData?.id || 'null'}`}
    >
      <Text>{initialData?.title || 'missing stop'}</Text>
      <Pressable testID="direct-stop-save" onPress={() => {
        onSave?.({ ...initialData, title: 'עצירה מעודכנת' }, stopIndex);
        onClose?.();
      }}><Text>שמירת עצירה ישירה</Text></Pressable>
    </View>
  ) : <View testID="direct-stop-editor-closed" />;
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
    mockEnqueueCreate.mockResolvedValue('route-job-1');
    mockLoadJobForReview.mockResolvedValue(null);
    mockLoadRouteDetails.mockResolvedValue(null);
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    require('react-native').Alert.alert.mockRestore();
  });

  it('keeps device-only image references out of the server draft', () => {
    const canonicalMedia = { assetId: 'asset-1', feed: { url: 'https://cdn/feed.webp' } };
    const serverDraft = routeDraftForServer({
      title: 'מסלול',
      days: [{
        id: 'day_001',
        image: 'file:///day.jpg',
        stops: [{
          id: 'stop-1',
          image: 'file:///crop.jpg',
          pendingMedia: [{
            uri: 'file:///crop.jpg',
            localReference: { platform: 'native', key: 'file:///private/crop.jpg' },
          }],
          media: canonicalMedia,
        }],
      }],
    });
    expect(serverDraft.days[0]).not.toHaveProperty('image');
    expect(serverDraft.days[0].stops[0]).not.toHaveProperty('image');
    expect(serverDraft.days[0].stops[0]).not.toHaveProperty('pendingMedia');
    expect(serverDraft.days[0].stops[0].media).toBe(canonicalMedia);
  });

  it('keeps the publication action above the iPhone home indicator', () => {
    expect(routeFooterInsetsStyle(34)).toEqual({ paddingBottom: 34 });
    expect(routeFooterInsetsStyle(0)).toEqual({ paddingBottom: 14 });
  });

  it('reorders stops without changing their data', () => {
    const stops = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(reorderRouteStops(stops, 0, 2).map((stop) => stop.id)).toEqual(['b', 'c', 'a']);
    expect(stops.map((stop) => stop.id)).toEqual(['a', 'b', 'c']);
  });

  it('shows drag handles and can start a new stop between existing stops', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft());
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-continue'));
    expect(screen.getByTestId('route-stop-drag-handle-0')).toBeTruthy();
    expect(screen.getByTestId('route-stop-drag-handle-1')).toBeTruthy();
    fireEvent.press(screen.getByTestId('route-insert-stop-1'));
    expect(screen.getByLabelText('stop-0-1-null')).toBeTruthy();
    fireEvent.press(screen.getByTestId('direct-stop-save'));
    fireEvent.press(screen.getByTestId('route-stop-edit-1'));
    expect(screen.getByLabelText('stop-0-1-stable-new-stop-id')).toBeTruthy();
  });

  it('opens and saves the selected stop directly without opening the day editor', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft());
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-continue'));
    fireEvent.press(screen.getByTestId('route-stop-edit-1'));
    expect(screen.getByLabelText('stop-0-1-b')).toBeTruthy();
    fireEvent.press(screen.getByTestId('direct-stop-save'));
    expect(screen.getByText('עצירה מעודכנת')).toBeTruthy();
    expect(screen.getByTestId('direct-stop-editor-closed')).toBeTruthy();
  });

  it('edits day notes inline and removes a stop from the main day card', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft());
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-continue'));
    fireEvent.changeText(screen.getByTestId('route-day-description-input'), 'יום רגוע');
    expect(screen.getByTestId('route-day-description-input').props.value).toBe('יום רגוע');
    require('react-native').Alert.alert.mockImplementationOnce((_title, _message, buttons) => {
      buttons.find((button) => button.style === 'destructive')?.onPress?.();
    });
    fireEvent.press(screen.getByTestId('route-stop-remove-0'));
    expect(screen.queryByText('השוק')).toBeNull();
    expect(screen.getByLabelText('עריכת העצירה בית קפה')).toBeTruthy();
  });

  it('normalizes editor-owned fields without server metadata noise', () => {
    expect(routeEditorComparable(currentDraft({ sourceRouteId: 'route-1', version: 8 })))
      .toBe(routeEditorComparable(currentDraft({ sourceRouteId: 'route-1', version: 9 })));
  });

  it('opens an unchanged existing route locally without creating a draft', async () => {
    const source = currentDraft({ id: 'route-2', sourceRouteId: undefined });
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: { routeToEdit: source } }} />);
    await waitFor(() => expect(screen.getByTestId('route-map-peek')).toBeTruthy());
    expect(mockSaveRouteDraft).not.toHaveBeenCalled();
    expect(screen.getByTestId('route-submit').props.accessibilityState?.disabled ||
      screen.getByTestId('route-submit').props.disabled).toBe(true);
  });

  it('cleans up a legacy no-op edit draft before opening another route', async () => {
    const legacy = currentDraft({ sourceRouteId: 'route-a' });
    mockGetCurrentRouteDraft.mockResolvedValue(legacy);
    mockLoadRouteDetails.mockResolvedValue(currentDraft({ id: 'route-a', sourceRouteId: undefined }));
    const requested = currentDraft({ id: 'route-b', sourceRouteId: undefined, title: 'מסלול ב' });
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: { routeToEdit: requested } }} />);
    await waitFor(() => expect(mockDiscardRouteDraft).toHaveBeenCalledWith('draft-1'));
    await waitFor(() => expect(screen.getByTestId('route-map-peek')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-details-toggle'));
    expect(screen.getByTestId('route-title-input').props.value).toBe('מסלול ב');
    expect(mockSaveRouteDraft).not.toHaveBeenCalled();
  });

  it('warns before replacing genuine unpublished edits and opens the requested route after discard', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft({ sourceRouteId: 'route-a', title: 'עריכה שהשתנתה' }));
    mockLoadRouteDetails.mockResolvedValue(currentDraft({ id: 'route-a', sourceRouteId: undefined, title: 'המקור' }));
    const requested = currentDraft({ id: 'route-b', sourceRouteId: undefined, title: 'מסלול ב' });
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: { routeToEdit: requested } }} />);
    await waitFor(() => expect(screen.getByTestId('route-switch-discard')).toBeTruthy());
    expect(mockSaveRouteDraft).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('route-switch-discard'));
    await waitFor(() => expect(mockDiscardRouteDraft).toHaveBeenCalledWith('draft-1'));
    await waitFor(() => expect(screen.getByTestId('route-map-peek')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-details-toggle'));
    expect(screen.getByTestId('route-title-input').props.value).toBe('מסלול ב');
    expect(mockSaveRouteDraft).not.toHaveBeenCalled();
  });

  it('keeps the requested route closed when legacy draft cleanup fails and allows retry', async () => {
    const legacy = currentDraft({ sourceRouteId: 'route-a' });
    mockGetCurrentRouteDraft.mockResolvedValue(legacy);
    mockLoadRouteDetails.mockResolvedValue(currentDraft({ id: 'route-a', sourceRouteId: undefined }));
    mockDiscardRouteDraft.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ discarded: true });
    const requested = currentDraft({ id: 'route-b', sourceRouteId: undefined, title: 'מסלול ב' });
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: { routeToEdit: requested } }} />);
    await waitFor(() => expect(screen.getByTestId('route-switch-discard')).toBeTruthy());
    expect(screen.queryByTestId('route-map-peek')).toBeNull();
    fireEvent.press(screen.getByTestId('route-switch-discard'));
    await waitFor(() => expect(mockDiscardRouteDraft).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('route-map-peek')).toBeTruthy());
  });

  it('creates an edit draft only after the first real change', async () => {
    jest.useFakeTimers();
    const source = currentDraft({ id: 'route-2', sourceRouteId: undefined });
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: { routeToEdit: source } }} />);
    await waitFor(() => expect(screen.getByTestId('route-map-peek')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-details-toggle'));
    fireEvent.changeText(screen.getByTestId('route-description-input'), 'שינוי ראשון');
    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await waitFor(() => expect(mockSaveRouteDraft).toHaveBeenCalledWith(expect.objectContaining({
      sourceRouteId: 'route-2',
      draft: expect.objectContaining({ description: 'שינוי ראשון' }),
    })));
    expect(mockSaveRouteDraft.mock.calls[0][0]).not.toHaveProperty('draftId');
    jest.useRealTimers();
  });

  it('flushes a pending first edit before leaving', async () => {
    const nav = navigation();
    const source = currentDraft({ id: 'route-2', sourceRouteId: undefined });
    const screen = render(<AddRoutesScreen navigation={nav} route={{ params: { routeToEdit: source } }} />);
    await waitFor(() => expect(screen.getByTestId('route-map-peek')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-details-toggle'));
    fireEvent.changeText(screen.getByTestId('route-description-input'), 'שינוי לפני יציאה');
    const backOptions = mockUseBackButton.mock.calls.at(-1)[1];
    await act(async () => { await backOptions.onPress(); });
    expect(mockSaveRouteDraft).toHaveBeenCalledWith(expect.objectContaining({
      sourceRouteId: 'route-2',
      draft: expect.objectContaining({ description: 'שינוי לפני יציאה' }),
    }));
    expect(nav.goBack).toHaveBeenCalledTimes(1);
  });

  it('keeps draft-check failures separate and retryable', async () => {
    mockGetCurrentRouteDraft.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null);
    const screen = render(<AddRoutesScreen navigation={navigation()} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-load-retry')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-load-retry'));
    await waitFor(() => expect(screen.getByTestId('route-start-open')).toBeTruthy());
    expect(mockGetCurrentRouteDraft).toHaveBeenCalledTimes(2);
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
    expect(mockEnqueueCreate).not.toHaveBeenCalled();
  });

  it('durably queues the exact saved draft version and leaves while publication continues', async () => {
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft());
    const nav = navigation();
    const screen = render(<AddRoutesScreen navigation={nav} route={{ params: {} }} />);
    await waitFor(() => expect(screen.getByTestId('route-draft-continue')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-draft-continue'));
    fireEvent.press(screen.getByTestId('route-submit'));
    await waitFor(() => expect(mockEnqueueCreate).toHaveBeenCalledWith(expect.objectContaining({
      contentType: 'route',
      payload: expect.objectContaining({ draftId: 'draft-1', expectedVersion: 2 }),
    })));
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('publishes reordered existing stops without resolving their saved places again', async () => {
    const originalStops = [
      {
        id: 'a', title: 'השוק', locationPrecision: 'exact',
        place: { placeId: 'place-a', coordinates: { lat: 47.5, lng: 19.1 } },
        destination: { countryId: 'HU', cityId: 'budapest' },
      },
      {
        id: 'b', title: 'בית קפה', locationPrecision: 'exact',
        place: { placeId: 'place-b', coordinates: { lat: 47.51, lng: 19.11 } },
        destination: { countryId: 'HU', cityId: 'budapest' },
      },
    ];
    mockGetCurrentRouteDraft.mockResolvedValue(currentDraft({
      sourceRouteId: 'route-1',
      days: [{ id: 'day_001', stops: [originalStops[1], originalStops[0]] }],
    }));
    mockSaveRouteDraft.mockResolvedValue({ draftId: 'draft-1', version: 3 });
    const routeToEdit = {
      id: 'route-1',
      days: [{ id: 'day_001', stops: originalStops }],
    };
    const screen = render(
      <AddRoutesScreen navigation={navigation()} route={{ params: { routeToEdit } }} />
    );
    await waitFor(() => expect(screen.getByTestId('route-submit')).toBeTruthy());
    fireEvent.press(screen.getByTestId('route-submit'));

    await waitFor(() => expect(mockSaveRouteDraft).toHaveBeenCalledWith(expect.objectContaining({
      draftId: 'draft-1',
      sourceRouteId: 'route-1',
      expectedVersion: 2,
      draft: expect.objectContaining({
        days: [expect.objectContaining({
          stops: [
            expect.objectContaining({ id: 'b', reuseSavedLocation: true }),
            expect.objectContaining({ id: 'a', reuseSavedLocation: true }),
          ],
        })],
      }),
    })));
    expect(mockEnqueueCreate).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ expectedVersion: 3 }),
    }));
  });

  it('restores a failed background publication with its local image preview for editing', async () => {
    mockLoadJobForReview.mockResolvedValue({
      contentType: 'route',
      payload: { draftId: 'draft-1', expectedVersion: 3 },
      reviewedDraft: {
        route: currentDraft({
          days: [{
            id: 'day_001',
            stops: [
              { id: 'a', title: 'השוק', locationPrecision: 'general', destination: { countryId: 'HU', cityId: 'budapest' }, pendingMedia: [{ uri: 'file:///crop.jpg' }], image: 'file:///crop.jpg' },
              { id: 'b', title: 'בית קפה', locationPrecision: 'general', destination: { countryId: 'HU', cityId: 'budapest' } },
            ],
          }],
        }),
      },
    });
    const screen = render(
      <AddRoutesScreen navigation={navigation()} route={{ params: { publishJobId: 'route-job-1' } }} />
    );
    await waitFor(() => expect(screen.getByTestId('route-map-peek')).toBeTruthy());
    expect(mockLoadJobForReview).toHaveBeenCalledWith('route-job-1');
    expect(mockGetCurrentRouteDraft).not.toHaveBeenCalled();
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
