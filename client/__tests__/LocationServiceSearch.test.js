import { httpsCallable } from 'firebase/functions';

import { searchCities, searchPlaces } from '../src/services/LocationService';

jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('../src/config/firebase', () => ({ cloudFunctions: {} }));
jest.mock('../src/services/RecommendationService', () => ({
  resolveRecommendationDestination: jest.fn(),
}));

describe('LocationService search guards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not call the Places gateway for punctuation-only searches', async () => {
    await expect(searchCities(" !–' ")).resolves.toEqual([]);
    await expect(searchPlaces('...')).resolves.toEqual([]);
    expect(httpsCallable).not.toHaveBeenCalled();
  });
});
