import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import RegionSelectorScreen, { calculateAtlasLayout } from '../src/features/region/screens/RegionSelectorScreen';
import { REGIONS } from '../src/features/region/regionDefinitions';

const mockSelectRegion = jest.fn();
const mockSelectGlobal = jest.fn();
let mockRegion = null;
let mockGlobeProps;
jest.mock('../src/features/region/context/RegionSelectionState', () => ({
  useRegionSelection: () => ({ selectedRegionId: mockRegion, selectRegion: mockSelectRegion, selectGlobal: mockSelectGlobal }),
}));
jest.mock('../src/features/region/components/AtlasGlobe', () => (props) => { mockGlobeProps = props; return null; });
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }) }));
const navigation = (back = true) => ({ canGoBack: () => back, goBack: jest.fn(), navigate: jest.fn() });

beforeEach(() => { jest.clearAllMocks(); mockRegion = null; mockSelectRegion.mockResolvedValue({}); mockSelectGlobal.mockResolvedValue({}); });
it('offers eight regions and an explicit global choice without saving the preview', () => {
  const screen = render(<RegionSelectorScreen navigation={navigation()} />);
  REGIONS.forEach((region) => expect(screen.getByLabelText(region.label)).toBeTruthy());
  expect(screen.getByTestId('region-option-global').props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByTestId('region-option-europe'));
  expect(screen.getByText('לאגו די בראייס · איטליה')).toBeTruthy();
  expect(mockSelectRegion).not.toHaveBeenCalled();
  expect(mockSelectGlobal).not.toHaveBeenCalled();
});
it.each(REGIONS.map((r) => [r.id]))('confirms %s exactly once and returns to the source', async (id) => {
  const nav = navigation(); const screen = render(<RegionSelectorScreen navigation={nav} />);
  fireEvent.press(screen.getByTestId('region-option-' + id));
  fireEvent.press(screen.getByTestId('atlas-confirm')); fireEvent.press(screen.getByTestId('atlas-confirm'));
  await waitFor(() => expect(mockSelectRegion).toHaveBeenCalledWith(id));
  expect(mockSelectRegion).toHaveBeenCalledTimes(1);
  expect(nav.goBack).toHaveBeenCalledTimes(1);
});
it('restores the selection, and cancel leaves a changed preview unsaved', () => {
  mockRegion = 'israel'; const nav = navigation(); const screen = render(<RegionSelectorScreen navigation={nav} route={{ params: { source: 'home-change' } }} />);
  expect(screen.getByTestId('region-option-israel').props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByTestId('region-option-global'));
  fireEvent.press(screen.getByTestId('region-selector-cancel'));
  expect(nav.goBack).toHaveBeenCalled(); expect(mockSelectGlobal).not.toHaveBeenCalled();
});
it('confirms global in required mode without closing the gate itself', async () => {
  const nav = navigation(); const screen = render(<RegionSelectorScreen navigation={nav} route={{ params: { required: true } }} />);
  expect(screen.queryByTestId('region-selector-cancel')).toBeNull();
  fireEvent.press(screen.getByTestId('atlas-confirm'));
  await waitFor(() => expect(mockSelectGlobal).toHaveBeenCalledTimes(1));
  expect(nav.goBack).not.toHaveBeenCalled(); expect(nav.navigate).not.toHaveBeenCalled();
});
it('falls back to Main when no source screen exists', async () => {
  const nav = navigation(false); const screen = render(<RegionSelectorScreen navigation={nav} />);
  fireEvent.press(screen.getByTestId('atlas-confirm'));
  await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('Main'));
});
it('keeps the choice and shows retry after persistence fails', async () => {
  mockSelectRegion.mockRejectedValueOnce(new Error('storage unavailable'));
  const nav = navigation(); const screen = render(<RegionSelectorScreen navigation={nav} />);
  fireEvent.press(screen.getByTestId('region-option-europe')); fireEvent.press(screen.getByTestId('atlas-confirm'));
  await waitFor(() => expect(screen.getByTestId('atlas-save-error')).toBeTruthy());
  expect(nav.goBack).not.toHaveBeenCalled(); fireEvent.press(screen.getByTestId('atlas-confirm'));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalledTimes(1));
});
it('keeps accessible region selection usable when the renderer fails', async () => {
  const screen = render(<RegionSelectorScreen navigation={navigation()} />);
  const { act } = require('@testing-library/react-native');
  act(() => mockGlobeProps.onError());
  expect(screen.getByTestId('atlas-globe-error')).toBeTruthy();
  fireEvent.press(screen.getByTestId('region-option-africa')); fireEvent.press(screen.getByTestId('atlas-confirm'));
  await waitFor(() => expect(mockSelectRegion).toHaveBeenCalledWith('africa'));
});
it('uses the same preview flow for a globe photo selection', () => {
  const screen = render(<RegionSelectorScreen navigation={navigation()} />);
  const { act } = require('@testing-library/react-native');
  act(() => mockGlobeProps.onSelect('oceania'));
  expect(screen.getByText('מילפורד סאונד · ניו זילנד')).toBeTruthy();
  expect(mockSelectRegion).not.toHaveBeenCalled();
});
it('bounds the globe on narrow and desktop viewports', () => {
  const small = calculateAtlasLayout({ viewportWidth: 320, viewportHeight: 568, top: 47, bottom: 34 });
  expect(small.width).toBe(320); expect(small.globeHeight).toBeLessThan(240); expect(small.photoHeight).toBeGreaterThanOrEqual(180);
  expect(calculateAtlasLayout({ viewportWidth: 1440, viewportHeight: 1000 }).width).toBe(430);
});
