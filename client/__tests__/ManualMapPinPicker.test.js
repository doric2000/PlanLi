import React from 'react';
import { render } from '@testing-library/react-native';

import ManualMapPinPicker from '../src/features/community/components/ManualMapPinPicker';

const mockMapProps = jest.fn();

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MapView = ({ children, ...props }) => {
    mockMapProps(props);
    return <View testID="mock-map">{children}</View>;
  };
  const Marker = (props) => <View testID="mock-marker" {...props} />;
  return {
    __esModule: true,
    default: MapView,
    Marker,
    PROVIDER_GOOGLE: 'google',
  };
});

describe('ManualMapPinPicker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('centers an existing edited pin when its destination has no coordinates', () => {
    render(
      <ManualMapPinPicker
        destination={{ countryId: 'HU', cityId: 'budapest' }}
        value={{ latitude: 47.5, longitude: 19.05 }}
        onChange={jest.fn()}
      />
    );

    expect(mockMapProps).toHaveBeenLastCalledWith(expect.objectContaining({
      initialRegion: expect.objectContaining({ latitude: 47.5, longitude: 19.05 }),
    }));
  });

  it('prefers the selected destination center before a new pin is placed', () => {
    render(
      <ManualMapPinPicker
        destination={{ coordinates: { lat: 48.2, lng: 16.37 } }}
        value={null}
        onChange={jest.fn()}
      />
    );

    expect(mockMapProps).toHaveBeenLastCalledWith(expect.objectContaining({
      initialRegion: expect.objectContaining({ latitude: 48.2, longitude: 16.37 }),
    }));
  });
});
