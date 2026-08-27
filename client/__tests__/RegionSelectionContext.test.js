import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import {
  RegionSelectionProvider,
  useRegionSelection,
} from '../src/features/region/context/RegionSelectionContext';

let mockStoredSelection;
const mockSyncSelectedRegion = jest.fn();

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'traveler-1' },
    userDocument: {
      discoveryRegion: {
        regionId: 'europe',
        selectedAt: { toDate: () => new Date('2026-08-27T10:00:00.000Z') },
      },
    },
  }),
}));
jest.mock('../src/features/region/services/RegionSelectionService', () => ({
  syncSelectedRegion: (...args) => mockSyncSelectedRegion(...args),
}));
jest.mock('../src/services/DestinationService', () => ({ clearDestinationSearchCache: jest.fn() }));
jest.mock('../src/services/PersonalizationService', () => ({ clearPersonalizationDiscoveryCache: jest.fn() }));
jest.mock('../src/features/region/services/RegionSelectionStorage', () => ({
  createEmptyRegionSelection: () => ({
    version: 2, regionId: null, selectedAt: null, hasSeenPrompt: false, pendingAccountSync: null,
  }),
  loadRegionSelection: async () => mockStoredSelection,
  saveSelectedRegion: async (regionId, now = new Date()) => {
    mockStoredSelection = {
      version: 2, regionId, selectedAt: now.toISOString(), hasSeenPrompt: true, pendingAccountSync: null,
    };
    return mockStoredSelection;
  },
  savePendingAccountSync: async (uid, regionId, selectedAt) => {
    mockStoredSelection = { ...mockStoredSelection, pendingAccountSync: { uid, regionId, selectedAt } };
    return mockStoredSelection;
  },
  clearPendingAccountSync: async (uid) => {
    if (mockStoredSelection.pendingAccountSync?.uid === uid) {
      mockStoredSelection = { ...mockStoredSelection, pendingAccountSync: null };
    }
    return mockStoredSelection;
  },
  saveRegionPromptDismissed: async () => mockStoredSelection,
  clearSelectedRegion: async () => mockStoredSelection,
}));

function SelectionProbe() {
  const { selectedRegionId, selectRegion } = useRegionSelection();
  return (
    <Pressable testID="select-africa" onPress={() => selectRegion('africa')}>
      <Text testID="selected-region">{selectedRegionId || 'none'}</Text>
    </Pressable>
  );
}

describe('RegionSelectionProvider cloud synchronization', () => {
  beforeEach(() => {
    mockStoredSelection = {
      version: 2,
      regionId: 'europe',
      selectedAt: '2026-08-27T10:00:00.000Z',
      hasSeenPrompt: true,
      pendingAccountSync: null,
    };
    mockSyncSelectedRegion.mockReset().mockResolvedValue({ regionId: 'africa' });
  });

  it('does not restore a stale cloud value after a successful local selection sync', async () => {
    const screen = render(<RegionSelectionProvider><SelectionProbe /></RegionSelectionProvider>);
    await waitFor(() => expect(screen.getByTestId('selected-region').props.children).toBe('europe'));

    fireEvent.press(screen.getByTestId('select-africa'));
    await waitFor(() => expect(mockSyncSelectedRegion).toHaveBeenCalledWith('africa'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(screen.getByTestId('selected-region').props.children).toBe('africa');
    expect(mockStoredSelection.regionId).toBe('africa');
  });
});
