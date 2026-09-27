import { act, renderHook } from '@testing-library/react-native';
import { useCityDiscovery } from '../src/features/destination/hooks/useCityDiscovery';

const mockLoad = jest.fn(); const mockClear = jest.fn();
const mockResolveOwners = jest.fn(); const mockInvalidate = jest.fn();
jest.mock('../src/features/destination/utils/resolveCityMapOwners', () => ({ resolveCityMapOwners: (...args) => mockResolveOwners(...args) }));
jest.mock('../src/utils/profileResourceInvalidation', () => ({ invalidateProfileResources: (...args) => mockInvalidate(...args) }));
let mockPrincipal = 'alice';
jest.mock('../src/services/PersonalizationService', () => ({
  requestPersonalizedRecommendations: (...args) => mockLoad(...args),
  requestPersonalizedRoutes: (...args) => mockLoad(...args),
  requestPersonalizedMapRecommendations: (...args) => mockLoad(...args),
  clearPersonalizationDiscoveryCache: (...args) => mockClear(...args),
}));
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ user: { uid: mockPrincipal } }) }));
jest.mock('../src/features/moderation/BlockedUsersContext', () => ({ useBlockedUsers: () => ({ blockedUserIds: new Set(['blocked']), isBlocked: (id) => id === 'blocked' }) }));
jest.mock('../src/features/profile/context/PersonalizationFeedbackContext', () => ({ usePersonalizationFeedback: () => ({ isHidden: ({ id }) => id === 'hidden' }) }));
const context = { cityId: 'city-a', countryId: 'country', filters: {} };
const tick = async () => { await act(async () => { jest.advanceTimersByTime(301); }); };
beforeEach(() => { jest.useFakeTimers(); jest.clearAllMocks(); mockPrincipal = 'alice'; });
afterEach(() => jest.useRealTimers());

test('debounces search, fixes the city scope and does not request the global region', async () => {
  mockLoad.mockReturnValue({ promise: Promise.resolve({ items: [{ id: 'ok' }, { id: 'bad', ownerId: 'blocked' }, { id: 'hidden' }] }) });
  const { result, rerender } = renderHook((props) => useCityDiscovery(props), { initialProps: context });
  rerender({ ...context, filters: { query: 'fish', destinations: [{ countryId: 'elsewhere' }], needIds: ['kosher'] } });
  await tick();
  expect(mockLoad).toHaveBeenCalledTimes(1);
  const payload = mockLoad.mock.calls[0][0];
  expect(payload).toMatchObject({ context: { countryId: 'country', cityId: 'city-a' }, destinations: [], query: 'fish', filters: { needIds: ['kosher'] } });
  expect(payload.regionId).toBeUndefined();
  expect(result.current.items.map((item) => item.id)).toEqual(['ok']);
});

test('ignores out-of-order replies after a destination or account change', async () => {
  let resolveOld;
  mockLoad.mockReturnValueOnce({ promise: new Promise((resolve) => { resolveOld = resolve; }) })
    .mockReturnValue({ promise: Promise.resolve({ items: [{ id: 'new' }] }) });
  const { result, rerender } = renderHook((props) => useCityDiscovery(props), { initialProps: context });
  await tick();
  mockPrincipal = 'bob';
  rerender({ ...context, cityId: 'city-b' });
  expect(result.current.items).toEqual([]);
  await tick();
  await act(async () => resolveOld({ items: [{ id: 'old' }] }));
  expect(result.current.items.map((item) => item.id)).toEqual(['new']);
});

test('exposes a retryable failure instead of claiming there are zero results', async () => {
  mockLoad.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('internal')) }))
    .mockImplementation(() => ({ promise: Promise.resolve({ items: [{ id: 'recovered' }] }) }));
  const { result } = renderHook(() => useCityDiscovery(context));
  await tick();
  expect(result.current.error).toBeTruthy();
  act(() => result.current.retry());
  await tick();
  expect(mockClear).toHaveBeenCalledWith('recommendations');
  expect(result.current.error).toBeNull();
  expect(result.current.items[0].id).toBe('recovered');
});

test('disabled surfaces and an unmounted pending debounce do not fetch', async () => {
  const { unmount } = renderHook(() => useCityDiscovery({ ...context, enabled: false }));
  await tick(); expect(mockLoad).not.toHaveBeenCalled(); unmount();
  const pending = renderHook(() => useCityDiscovery(context)); pending.unmount();
  await tick(); expect(mockLoad).not.toHaveBeenCalled();
});

test('resolves omitted map owners before exposing any pins and hides blocked authors', async () => {
  let resolveOwners;
  mockLoad.mockReturnValue({ promise: Promise.resolve({ items: [{ id: 'bad' }, { id: 'ok' }] }) });
  mockResolveOwners.mockReturnValue(new Promise((resolve) => { resolveOwners = resolve; }));
  const { result } = renderHook(() => useCityDiscovery({ ...context, kind: 'map', viewport: { north: 7, south: 6, east: 82, west: 81, zoom: 10 } }));
  await tick();
  expect(result.current.loading).toBe(true);
  expect(result.current.items).toEqual([]);
  await act(async () => resolveOwners([{ id: 'bad', ownerId: 'blocked' }, { id: 'ok', ownerId: 'other' }]));
  expect(result.current.items.map((entry) => entry.id)).toEqual(['ok']);
});

test('deletion invalidates discovery and the owner profile, while keeping other results', async () => {
  mockLoad.mockReturnValue({ promise: Promise.resolve({ items: [{ id: 'delete' }, { id: 'keep' }] }) });
  const { result } = renderHook(() => useCityDiscovery(context));
  await tick();
  act(() => result.current.removeItem('delete'));
  expect(mockClear).toHaveBeenCalledWith('recommendations');
  expect(mockInvalidate).toHaveBeenCalledWith('alice');
  expect(result.current.items.map((entry) => entry.id)).toEqual(['keep']);
});
