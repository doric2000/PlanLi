const mockCallable = jest.fn();
const mockHttpsCallable = jest.fn(() => mockCallable);

jest.mock('firebase/functions', () => ({
  httpsCallable: (...args) => mockHttpsCallable(...args),
}));

jest.mock('../src/config/firebase', () => ({
  auth: { currentUser: { uid: 'traveler-1' } },
  cloudFunctions: { region: 'europe-west1' },
}));

import { auth as mockAuth } from '../src/config/firebase';
import {
  DISCOVERY_CACHE_TTL_MS,
  DISCOVERY_ERROR_RETRY_MS,
  clearPersonalizationDiscoveryCache,
  getPersonalizedMapRecommendations,
  getPersonalizedRecommendations,
  getPersonalizedRoutes,
} from '../src/services/PersonalizationService';

describe('PersonalizationService discovery cache', () => {
  let now;

  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    mockCallable.mockReset();
    mockHttpsCallable.mockClear();
    mockAuth.currentUser = { uid: 'traveler-1' };
    clearPersonalizationDiscoveryCache();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reuses a fresh response for equivalent payloads with different key order', async () => {
    mockCallable.mockResolvedValue({ data: { items: [{ id: 'rec-1' }] } });

    const first = await getPersonalizedRecommendations({ sort: 'popular', limit: 30 });
    const second = await getPersonalizedRecommendations({ limit: 30, sort: 'popular' });

    expect(first).toEqual({ items: [{ id: 'rec-1' }] });
    expect(second).toBe(first);
    expect(mockCallable).toHaveBeenCalledTimes(1);
  });

  it('deduplicates identical in-flight requests', async () => {
    let resolveRequest;
    mockCallable.mockImplementation(() => new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = getPersonalizedRoutes({ sort: 'popular', limit: 30 });
    const second = getPersonalizedRoutes({ sort: 'popular', limit: 30 });
    expect(mockCallable).toHaveBeenCalledTimes(1);

    resolveRequest({ data: { items: [{ id: 'route-1' }] } });
    await expect(first).resolves.toEqual({ items: [{ id: 'route-1' }] });
    await expect(second).resolves.toEqual({ items: [{ id: 'route-1' }] });
  });

  it('reuses map results for equivalent viewports with GPS jitter', async () => {
    mockCallable.mockResolvedValue({ data: { items: [{ id: 'map-rec-1' }] } });

    const first = await getPersonalizedMapRecommendations({
      query: '',
      viewport: { north: 33, south: 32, west: 34, east: 35, zoom: 12 },
    });
    const second = await getPersonalizedMapRecommendations({
      query: '',
      viewport: {
        north: 33.00001,
        south: 32.00001,
        west: 34.00001,
        east: 35.00001,
        zoom: 12.001,
      },
    });

    expect(second).toBe(first);
    expect(mockCallable).toHaveBeenCalledTimes(1);
  });

  it('preserves each caller refresh policy when sharing an in-flight request', async () => {
    const cached = { items: [{ id: 'route-1' }] };
    mockCallable.mockResolvedValueOnce({ data: cached });
    await getPersonalizedRoutes({ sort: 'popular' });
    now += DISCOVERY_CACHE_TTL_MS + 1;

    let rejectRequest;
    const error = new Error('resource-exhausted');
    mockCallable.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectRequest = reject;
    }));

    const focusRequest = getPersonalizedRoutes({ sort: 'popular' });
    const forcedRequest = getPersonalizedRoutes(
      { sort: 'popular' },
      { forceRefresh: true }
    );
    expect(mockCallable).toHaveBeenCalledTimes(2);

    rejectRequest(error);
    await expect(focusRequest).resolves.toBe(cached);
    await expect(forcedRequest).rejects.toBe(error);
  });

  it('lets explicit refresh bypass a settled cache entry', async () => {
    mockCallable
      .mockResolvedValueOnce({ data: { items: [{ id: 'rec-1' }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'rec-2' }] } });

    await getPersonalizedRecommendations({ sort: 'popular' });
    const refreshed = await getPersonalizedRecommendations(
      { sort: 'popular' },
      { forceRefresh: true }
    );

    expect(refreshed).toEqual({ items: [{ id: 'rec-2' }] });
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it('falls back to a stale response when a focus refresh fails', async () => {
    const cached = { items: [{ id: 'route-1' }] };
    mockCallable.mockResolvedValueOnce({ data: cached });
    await getPersonalizedRoutes({ sort: 'popular' });

    now += DISCOVERY_CACHE_TTL_MS + 1;
    mockCallable.mockRejectedValueOnce(new Error('resource-exhausted'));

    await expect(getPersonalizedRoutes({ sort: 'popular' })).resolves.toBe(cached);
    await expect(getPersonalizedRoutes({ sort: 'popular' })).resolves.toBe(cached);
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it('does not hide an explicit refresh error behind stale data', async () => {
    mockCallable.mockResolvedValueOnce({ data: { items: [{ id: 'route-1' }] } });
    await getPersonalizedRoutes({ sort: 'popular' });
    mockCallable.mockRejectedValueOnce(new Error('resource-exhausted'));

    await expect(getPersonalizedRoutes(
      { sort: 'popular' },
      { forceRefresh: true }
    )).rejects.toThrow('resource-exhausted');
  });

  it('backs off repeated focus calls after an uncached error', async () => {
    const error = new Error('resource-exhausted');
    mockCallable.mockRejectedValueOnce(error);

    await expect(getPersonalizedRecommendations({ sort: 'popular' })).rejects.toBe(error);
    await expect(getPersonalizedRecommendations({ sort: 'popular' })).rejects.toBe(error);
    expect(mockCallable).toHaveBeenCalledTimes(1);

    now += DISCOVERY_ERROR_RETRY_MS + 1;
    mockCallable.mockResolvedValueOnce({ data: { items: [{ id: 'rec-1' }] } });
    await expect(getPersonalizedRecommendations({ sort: 'popular' }))
      .resolves.toEqual({ items: [{ id: 'rec-1' }] });
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it('separates cached responses by authenticated user', async () => {
    mockCallable
      .mockResolvedValueOnce({ data: { items: [{ id: 'user-1-rec' }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'user-2-rec' }] } });

    const first = await getPersonalizedRecommendations({ sort: 'forYou' });
    mockAuth.currentUser = { uid: 'traveler-2' };
    const second = await getPersonalizedRecommendations({ sort: 'forYou' });

    expect(first.items[0].id).toBe('user-1-rec');
    expect(second.items[0].id).toBe('user-2-rec');
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it('invalidates only the selected feed type', async () => {
    mockCallable
      .mockResolvedValueOnce({ data: { items: [{ id: 'rec-1' }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'route-1' }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'rec-2' }] } });
    await getPersonalizedRecommendations({ sort: 'popular' });
    await getPersonalizedRoutes({ sort: 'popular' });

    clearPersonalizationDiscoveryCache('recommendations');

    await expect(getPersonalizedRecommendations({ sort: 'popular' }))
      .resolves.toEqual({ items: [{ id: 'rec-2' }] });
    await expect(getPersonalizedRoutes({ sort: 'popular' }))
      .resolves.toEqual({ items: [{ id: 'route-1' }] });
    expect(mockCallable).toHaveBeenCalledTimes(3);
  });

  it('invalidates map results when recommendations change', async () => {
    mockCallable
      .mockResolvedValueOnce({ data: { items: [{ id: 'map-rec-1' }] } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'map-rec-2' }] } });
    const payload = { viewport: { north: 33, south: 32, west: 34, east: 35, zoom: 12 } };
    await getPersonalizedMapRecommendations(payload);

    clearPersonalizationDiscoveryCache('recommendations');

    await expect(getPersonalizedMapRecommendations(payload))
      .resolves.toEqual({ items: [{ id: 'map-rec-2' }] });
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it('does not let an invalidated in-flight request repopulate the cache', async () => {
    let resolveFirst;
    let resolveSecond;
    mockCallable
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));

    const oldRequest = getPersonalizedRoutes({ sort: 'popular' });
    clearPersonalizationDiscoveryCache('routes');
    const newRequest = getPersonalizedRoutes({ sort: 'popular' });
    expect(mockCallable).toHaveBeenCalledTimes(2);

    resolveFirst({ data: { items: [{ id: 'old-route' }] } });
    resolveSecond({ data: { items: [{ id: 'new-route' }] } });
    await oldRequest;
    await newRequest;

    await expect(getPersonalizedRoutes({ sort: 'popular' }))
      .resolves.toEqual({ items: [{ id: 'new-route' }] });
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });
});
