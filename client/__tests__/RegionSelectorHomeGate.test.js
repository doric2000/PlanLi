import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import HomeRegionPreviewChip from '../src/features/region/components/HomeRegionPreviewChip';
import {
  getRegionById,
  isRegionDiscoveryEnabled,
  isRegionSelectorPreviewEnabled,
} from '../src/features/region/regionDefinitions';
import { shouldAutoOpenRegionSelector } from '../src/features/region/utils/regionSelectorHomeGate';

const readyState = {
  previewEnabled: true,
  selectionLoading: false,
  hasSeenPrompt: false,
  isFocused: true,
  personalizationReady: true,
  dashboardSettled: true,
  refreshing: false,
  confirming: false,
  noyaOpenedThisVisit: false,
  alreadyOpened: false,
};

describe('region selector Home integration', () => {
  const originalPreviewFlag = process.env.EXPO_PUBLIC_REGION_SELECTOR_PREVIEW;
  const originalDiscoveryFlag = process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;

  afterEach(() => {
    if (originalPreviewFlag === undefined) {
      delete process.env.EXPO_PUBLIC_REGION_SELECTOR_PREVIEW;
    } else {
      process.env.EXPO_PUBLIC_REGION_SELECTOR_PREVIEW = originalPreviewFlag;
    }
    if (originalDiscoveryFlag === undefined) delete process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;
    else process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED = originalDiscoveryFlag;
  });

  it('keeps preview disabled by default and only accepts an explicit true flag', () => {
    delete process.env.EXPO_PUBLIC_REGION_SELECTOR_PREVIEW;
    expect(isRegionSelectorPreviewEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_REGION_SELECTOR_PREVIEW = 'false';
    expect(isRegionSelectorPreviewEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_REGION_SELECTOR_PREVIEW = 'true';
    expect(isRegionSelectorPreviewEnabled()).toBe(true);
  });

  it('keeps full regional discovery disabled unless explicitly enabled', () => {
    delete process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;
    expect(isRegionDiscoveryEnabled()).toBe(false);
    process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED = 'true';
    expect(isRegionDiscoveryEnabled()).toBe(true);
    delete process.env.EXPO_PUBLIC_REGION_DISCOVERY_ENABLED;
  });

  it('opens only after Home is ready and only once', () => {
    expect(shouldAutoOpenRegionSelector(readyState)).toBe(true);
    expect(shouldAutoOpenRegionSelector({ ...readyState, dashboardSettled: false })).toBe(false);
    expect(shouldAutoOpenRegionSelector({ ...readyState, alreadyOpened: true })).toBe(false);
    expect(shouldAutoOpenRegionSelector({ ...readyState, hasSeenPrompt: true })).toBe(false);
  });

  it('gives Noya onboarding priority for the whole visit', () => {
    expect(shouldAutoOpenRegionSelector({
      ...readyState,
      noyaOpenedThisVisit: true,
    })).toBe(false);
  });

  it('shows the chosen Hebrew region and reopens the selector from החלפה', () => {
    const onPress = jest.fn();
    const region = getRegionById('oceania');
    const screen = render(<HomeRegionPreviewChip regionId={region.id} onPress={onPress} />);

    expect(screen.getByText(region.label)).toBeTruthy();
    fireEvent.press(screen.getByTestId('home-region-preview-change'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not render a chip for an absent or unsupported selection', () => {
    const screen = render(<HomeRegionPreviewChip regionId="atlantis" onPress={jest.fn()} />);
    expect(screen.queryByTestId('home-region-preview-chip')).toBeNull();
  });
});
