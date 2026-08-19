const mockSaveRecommendation = jest.fn();
const mockSaveRoute = jest.fn();
const mockGetPersonalizedRoutes = jest.fn();
const mockClearDiscoveryCache = jest.fn();

jest.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => ({
    saveRecommendation: mockSaveRecommendation,
    saveRoute: mockSaveRoute,
  })[name] || jest.fn(),
}));

jest.mock('../src/config/firebase', () => ({
  cloudFunctions: { region: 'europe-west1' },
}));

jest.mock('../src/services/PersonalizationService', () => ({
  clearPersonalizationDiscoveryCache: (...args) => mockClearDiscoveryCache(...args),
  getPersonalizedRoutes: (...args) => mockGetPersonalizedRoutes(...args),
  recordRouteOpen: jest.fn(),
}));

import { saveRecommendation } from '../src/services/RecommendationService';
import { discoverRoutes, saveRoute } from '../src/services/RouteService';

describe('discovery cache mutation integration', () => {
  beforeEach(() => {
    mockSaveRecommendation.mockReset();
    mockSaveRoute.mockReset();
    mockGetPersonalizedRoutes.mockReset();
    mockClearDiscoveryCache.mockReset();
  });

  it('invalidates recommendation discovery after a successful save', async () => {
    mockSaveRecommendation.mockResolvedValue({ data: { id: 'rec-1' } });

    await expect(saveRecommendation({ recommendation: { title: 'Trip' } }))
      .resolves.toEqual({ id: 'rec-1' });
    expect(mockClearDiscoveryCache).toHaveBeenCalledWith('recommendations');
  });

  it('invalidates route discovery after a successful save', async () => {
    mockSaveRoute.mockResolvedValue({ data: { id: 'route-1' } });

    await expect(saveRoute({ title: 'Trip' })).resolves.toEqual({ id: 'route-1' });
    expect(mockClearDiscoveryCache).toHaveBeenCalledWith('routes');
  });

  it('does not invalidate a feed when its mutation fails', async () => {
    mockSaveRecommendation.mockRejectedValue(new Error('save failed'));

    await expect(saveRecommendation({ recommendation: { title: 'Trip' } }))
      .rejects.toThrow('save failed');
    expect(mockClearDiscoveryCache).not.toHaveBeenCalled();
  });

  it('forwards cache options through the route service', async () => {
    mockGetPersonalizedRoutes.mockResolvedValue({ items: [] });

    await discoverRoutes({ sort: 'popular' }, { forceRefresh: true });

    expect(mockGetPersonalizedRoutes).toHaveBeenCalledWith(
      { sort: 'popular' },
      { forceRefresh: true }
    );
  });
});
