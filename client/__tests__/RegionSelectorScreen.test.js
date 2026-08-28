import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import RegionSelectorScreen, {
  calculateRegionSelectorCanvasSize,
} from '../src/features/region/screens/RegionSelectorScreen';
import { REGIONS } from '../src/features/region/regionDefinitions';

const mockSelectRegion = jest.fn();
const mockDismissPrompt = jest.fn();

jest.mock('../src/features/region/context/RegionSelectionState', () => ({
  useRegionSelection: () => ({
    selectRegion: (...args) => mockSelectRegion(...args),
    dismissPrompt: (...args) => mockDismissPrompt(...args),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));

function createNavigation({ canGoBack = true } = {}) {
  return {
    canGoBack: jest.fn(() => canGoBack),
    goBack: jest.fn(),
    navigate: jest.fn(),
  };
}

describe('RegionSelectorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSelectRegion.mockResolvedValue({});
    mockDismissPrompt.mockResolvedValue({});
  });

  it('renders all eight accessible region buttons and the accessible skip action', () => {
    const screen = render(<RegionSelectorScreen navigation={createNavigation()} />);

    expect(screen.getByLabelText('לא עכשיו')).toBeTruthy();
    expect(REGIONS).toHaveLength(8);
    REGIONS.forEach((region) => {
      const button = screen.getByTestId(`region-option-${region.id}`);
      expect(button).toBeTruthy();
      expect(screen.getByLabelText(region.label)).toBe(button);
      expect(button.props.accessibilityRole).toBe('button');
    });
  });

  it('fills the native viewport and preserves the reference ratio on Web', () => {
    expect(calculateRegionSelectorCanvasSize({
      viewportWidth: 390,
      viewportHeight: 844,
      platform: 'ios',
    })).toEqual({ width: 390, height: 844 });

    expect(calculateRegionSelectorCanvasSize({
      viewportWidth: 1440,
      viewportHeight: 1000,
      platform: 'web',
    })).toEqual({
      width: 430,
      height: Math.round(430 * 1844 / 853),
    });
  });

  it('draws the pressed state from the transparent region image without a rectangular fill', () => {
    const screen = render(<RegionSelectorScreen navigation={createNavigation()} />);
    const button = screen.getByTestId('region-option-africa');

    expect(screen.queryByTestId('region-option-africa-pressed-visual')).toBeNull();
    fireEvent(button, 'pressIn');
    expect(screen.getByTestId('region-option-africa-pressed-visual')).toBeTruthy();
    expect(button.props.style).not.toEqual(expect.objectContaining({ backgroundColor: expect.anything() }));

    fireEvent(button, 'pressOut');
    expect(screen.queryByTestId('region-option-africa-pressed-visual')).toBeNull();
  });

  it.each(REGIONS.map((region) => [region.id, region.label]))(
    'stores %s when its picture is pressed',
    async (regionId) => {
      const navigation = createNavigation();
      const screen = render(<RegionSelectorScreen navigation={navigation} />);

      fireEvent.press(screen.getByTestId(`region-option-${regionId}`));

      await waitFor(() => expect(mockSelectRegion).toHaveBeenCalledWith(regionId));
      await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1));
    },
  );

  it('dismisses with לא עכשיו and returns to the previous screen', async () => {
    const navigation = createNavigation();
    const screen = render(<RegionSelectorScreen navigation={navigation} />);

    fireEvent.press(screen.getByTestId('region-selector-skip'));

    await waitFor(() => expect(mockDismissPrompt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1));
  });

  it('hides skip and stays mounted after selection in required mode', async () => {
    const navigation = createNavigation();
    const screen = render(<RegionSelectorScreen navigation={navigation} route={{ params: { required: true } }} />);
    expect(screen.queryByTestId('region-selector-skip')).toBeNull();
    fireEvent.press(screen.getByTestId('region-option-israel'));
    await waitFor(() => expect(mockSelectRegion).toHaveBeenCalledWith('israel'));
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('falls back to Main when there is no screen to return to', async () => {
    const navigation = createNavigation({ canGoBack: false });
    const screen = render(<RegionSelectorScreen navigation={navigation} />);

    fireEvent.press(screen.getByTestId('region-option-europe'));

    await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith('Main'));
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('stays open when local persistence fails so the choice can be retried', async () => {
    const navigation = createNavigation();
    mockSelectRegion.mockRejectedValueOnce(new Error('storage unavailable'));
    const screen = render(<RegionSelectorScreen navigation={navigation} />);

    fireEvent.press(screen.getByTestId('region-option-europe'));

    await waitFor(() => expect(mockSelectRegion).toHaveBeenCalledWith('europe'));
    await waitFor(() => expect(screen.getByTestId('region-option-europe').props.disabled).not.toBe(true));
    expect(navigation.goBack).not.toHaveBeenCalled();
    expect(navigation.navigate).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('region-option-europe'));
    await waitFor(() => expect(mockSelectRegion).toHaveBeenCalledTimes(2));
  });
});
