import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useDestinationData } from '../src/features/destination/hooks/useDestinationData';

const mockOverview = jest.fn();
const mockGetDoc = jest.fn();
jest.mock('../src/config/firebase', () => ({ db: {} }));
jest.mock('../src/services/DestinationService', () => ({ getDestinationOverview: (...args) => mockOverview(...args) }));
jest.mock('firebase/firestore', () => ({ doc: (_db, ...path) => path.join('/'), getDoc: (...args) => mockGetDoc(...args) }));
const overview = { destination: { name: 'עיר', identity: { coordinates: { lat: 6.8, lng: 81.8 } } }, quickFacts: {} };
const snapshot = (data) => ({ exists: () => !!data, data: () => data });
beforeEach(() => jest.clearAllMocks());

test('renders city information before a missing map center finishes loading', async () => {
  let resolveCoordinates;
  mockOverview.mockResolvedValue({ destination: { name: 'עיר' }, quickFacts: {} });
  mockGetDoc.mockReturnValue(new Promise((resolve) => { resolveCoordinates = resolve; }));
  const { result } = renderHook(() => useDestinationData('city', 'country'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.overview.destination.name).toBe('עיר');
  await act(async () => resolveCoordinates(snapshot({ googleCache: { coordinates: { lat: 6.8, lng: 81.8 } } })));
  expect(result.current.overview.destination.coordinates).toEqual({ lat: 6.8, lng: 81.8 });
});

test('ignores a slow previous city response and an unmounted request', async () => {
  let resolveOld;
  mockOverview.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValue(overview);
  const { result, rerender, unmount } = renderHook(({ id }) => useDestinationData(id, 'country'), { initialProps: { id: 'old' } });
  rerender({ id: 'new' });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(async () => resolveOld({ destination: { name: 'old' } }));
  expect(result.current.overview).toEqual(overview);
  expect(mockGetDoc).not.toHaveBeenCalled();
  unmount();
});

test('stored fallback keeps unavailable numeric facts absent and retries a real failure', async () => {
  mockOverview.mockRejectedValue(new Error('offline'));
  mockGetDoc.mockRejectedValue(new Error('offline'));
  const { result } = renderHook(() => useDestinationData('city', 'country'));
  await waitFor(() => expect(result.current.error).toBeTruthy());
  mockGetDoc.mockImplementation((path) => Promise.resolve(snapshot(path.includes('/destinations/') ? {
    name: 'עיר', coordinates: { lat: 6.8, lng: 81.8 }, widgets: { weather: { status: 'מעונן' }, airport: { name: 'Airport', distanceKm: null } },
  } : { name: 'מדינה', currencyCode: 'ILS' })));
  act(() => result.current.retry());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBeNull();
  expect(result.current.overview.quickFacts.weather.temperatureC).toBeUndefined();
  expect(result.current.overview.quickFacts.closestAirport.distanceKm).toBeNull();
});

test('invalid route parameters fail without issuing any request', () => {
  const { result } = renderHook(() => useDestinationData('', 'country'));
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeTruthy();
  expect(mockOverview).not.toHaveBeenCalled();
});
