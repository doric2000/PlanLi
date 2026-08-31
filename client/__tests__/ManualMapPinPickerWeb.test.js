import { normalizeWebPinCoordinate } from '../src/features/community/components/ManualMapPinPicker.web';

describe('ManualMapPinPicker web coordinates', () => {
  it('normalizes valid map clicks and rejects coordinates outside the world bounds', () => {
    expect(normalizeWebPinCoordinate({ lat: '48.2106', lng: '16.3652' })).toEqual({
      latitude: 48.2106,
      longitude: 16.3652,
    });
    expect(normalizeWebPinCoordinate({ latitude: 91, longitude: 16.3652 })).toBeNull();
    expect(normalizeWebPinCoordinate({ latitude: 48.2106, longitude: 181 })).toBeNull();
  });
});
