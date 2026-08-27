import { createContext, useContext } from 'react';

export const RegionSelectionStateContext = createContext(null);
const EMPTY_CONTEXT_VALUE = Object.freeze({
  selectedRegionId: null,
  selectedAt: null,
  hasSeenPrompt: false,
  loading: false,
  syncState: 'idle',
});

export function useRegionSelection() {
  const value = useContext(RegionSelectionStateContext);
  if (!value) throw new Error('useRegionSelection must be used inside RegionSelectionProvider');
  return value;
}

export function useOptionalRegionSelection() {
  return useContext(RegionSelectionStateContext) || EMPTY_CONTEXT_VALUE;
}
