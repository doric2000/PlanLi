import React, { useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GooglePlacesInput from '../src/components/GooglePlacesInput';
import PageHeader from '../src/components/PageHeader';
import { searchCities } from '../src/services/LocationService';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/services/LocationService', () => ({
  searchCities: jest.fn(() => Promise.resolve([])),
}));

const recent = [{
  id: 'PAR',
  cityId: 'PAR',
  countryId: 'FR',
  name: 'פריז',
  countryName: 'צרפת',
  label: 'פריז · צרפת',
}];

function ControlledInput(props) {
  const [value, setValue] = useState('');
  return (
    <GooglePlacesInput
      mode="google"
      value={value}
      onChangeValue={setValue}
      inputTestID="places-input"
      {...props}
    />
  );
}

describe('GooglePlacesInput recent destinations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows an idle recent destination and selects it without a provider request or query change', () => {
    const onSelectLocal = jest.fn();
    const screen = render(
      <ControlledInput
        idleLocalResults={recent}
        idleLocalTitle="חיפושים אחרונים"
        onSelectLocal={onSelectLocal}
      />
    );

    fireEvent(screen.getByTestId('places-input'), 'focus');

    expect(screen.getByText('חיפושים אחרונים')).toBeTruthy();
    expect(screen.getByText('פריז')).toBeTruthy();
    expect(screen.getByText('צרפת')).toBeTruthy();
    fireEvent.press(screen.getByTestId('recent-destination-FR-PAR'));

    expect(onSelectLocal).toHaveBeenCalledWith(recent[0]);
    expect(searchCities).not.toHaveBeenCalled();
    expect(screen.getByTestId('places-input').props.value).toBe('');
    expect(screen.queryByText('חיפושים אחרונים')).toBeNull();
  });

  it('replaces idle history with live local results after typing', () => {
    const screen = render(
      <ControlledInput
        idleLocalResults={recent}
        localResults={[{
          id: 'ROM',
          cityId: 'ROM',
          countryId: 'IT',
          name: 'רומא',
          description: 'איטליה',
        }]}
        onSelectLocal={jest.fn()}
      />
    );

    fireEvent(screen.getByTestId('places-input'), 'focus');
    expect(screen.getByText('חיפושים אחרונים')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('places-input'), 'רו');

    expect(screen.queryByText('חיפושים אחרונים')).toBeNull();
    expect(screen.getByText('רומא')).toBeTruthy();
    expect(searchCities).not.toHaveBeenCalled();
  });
});

describe('PageHeader overflow', () => {
  it('allows only opted-in headers to render overlays outside their bounds', () => {
    const originalPlatform = Platform.OS;
    const screen = render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 44, left: 0, right: 0, bottom: 34 },
        }}
      >
        <PageHeader variant="hero" allowOverflow testID="overflow-header" />
        <PageHeader variant="hero" testID="clipped-header" />
      </SafeAreaProvider>
    );

    expect(StyleSheet.flatten(screen.getByTestId('overflow-header').props.style).overflow).toBe('visible');
    expect(StyleSheet.flatten(screen.getByTestId('clipped-header').props.style).overflow).toBe('hidden');
    expect(Platform.OS).toBe(originalPlatform);
  });
});
