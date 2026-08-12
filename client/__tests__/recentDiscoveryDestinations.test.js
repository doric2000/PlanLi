import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadRecentDiscoveryDestinations,
  mergeRecentDiscoveryDestinations,
  rememberDiscoveryDestinations,
} from '../src/utils/recentDiscoveryDestinations';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const destination = (index, overrides = {}) => ({
  countryId: `C${index}`,
  cityId: `D${index}`,
  name: `Destination ${index}`,
  countryName: `Country ${index}`,
  label: `Destination ${index} · Country ${index}`,
  ...overrides,
});

describe('recent discovery destinations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue(undefined);
  });

  it('keeps the newest canonical destination first, deduplicates, and caps the list at five', () => {
    const result = mergeRecentDiscoveryDestinations(
      [destination(2, { name: 'Updated destination' })],
      [destination(1), destination(2), destination(3), destination(4), destination(5)]
    );

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual(expect.objectContaining({
      countryId: 'C2',
      cityId: 'D2',
      name: 'Updated destination',
    }));
    expect(result.filter((item) => item.cityId === 'D2')).toHaveLength(1);
    expect(result.map((item) => item.cityId)).toEqual(['D2', 'D1', 'D3', 'D4', 'D5']);
  });

  it('loads legacy records that contain only a label', async () => {
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify([{
      countryId: 'FR',
      cityId: 'PAR',
      label: 'פריז · צרפת',
    }]));

    await expect(loadRecentDiscoveryDestinations()).resolves.toEqual([{
      countryId: 'FR',
      cityId: 'PAR',
      label: 'פריז · צרפת',
    }]);
  });

  it('returns the in-session list even when local storage cannot be written', async () => {
    AsyncStorage.getItem.mockResolvedValue(JSON.stringify([destination(1)]));
    AsyncStorage.setItem.mockRejectedValue(new Error('storage unavailable'));

    const result = await rememberDiscoveryDestinations([destination(2)]);

    expect(result.map((item) => item.cityId)).toEqual(['D2', 'D1']);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
  });
});
