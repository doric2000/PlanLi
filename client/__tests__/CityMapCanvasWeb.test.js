import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import CityMapCanvas from '../src/features/destination/components/CityMapCanvas.web';

const mockMap = { on: jest.fn(), resize: jest.fn(), remove: jest.fn(), loaded: jest.fn(() => false),
  getCenter: () => ({ lat: 6.8, lng: 81.8 }),
  getBounds: () => ({ getNorth: () => 6.9, getSouth: () => 6.7, getEast: () => 81.9, getWest: () => 81.7 }) };
const mockConstruct = jest.fn();
const mockMarkers = [];
const mockEvents = {};
const mockDisconnect = jest.fn();
let mockStyle = 'https://example.test/style.json';
jest.mock('../src/config/mapConfig', () => ({ getMapTilerStyleUrl: () => mockStyle }));
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: { loadFont: async () => {}, getRawGlyphMap: () => ({ restaurant: 1 }), getFontFamily: () => 'MaterialIcons' } }));
jest.mock('../src/features/destination/utils/cityMapRuntime.web', () => ({ loadCityMapRuntime: async () => ({
  setWorkerUrl: jest.fn(),
  Map: function Map(options) { mockConstruct(options); return mockMap; },
  Marker: function Marker({ element }) {
    const marker = { element, setLngLat: jest.fn().mockReturnThis(), addTo: jest.fn().mockReturnThis(), remove: jest.fn() };
    mockMarkers.push(marker); return marker;
  },
}) }));
const savedDocument = global.document;
const savedLocation = global.window?.location;
const savedObserver = global.ResizeObserver;
const host = {};
const options = { createNodeMock: ({ type }) => type === 'div' ? host : null };
const props = { region: { latitude: 6.8, longitude: 81.8, longitudeDelta: 0.03, latitudeDelta: 0.03 },
  items: [{ id: 'fish', title: 'מסעדה', coordinates: { lat: 6.81, lng: 81.81 }, visual: { icon: 'restaurant', color: '#123456' } }],
  styles: {}, onSelect: jest.fn(), onReady: jest.fn(), onError: jest.fn(), onMapPress: jest.fn(), onRegionChange: jest.fn() };
beforeEach(() => {
  jest.clearAllMocks(); mockMarkers.length = 0; mockStyle = 'https://example.test/style.json';
  Object.keys(mockEvents).forEach((key) => delete mockEvents[key]);
  mockMap.on.mockImplementation((event, handler) => { mockEvents[event] = handler; });
  global.document = { createElement: () => ({ style: {}, dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }) };
  global.window.location = { origin: 'https://example.test' };
  global.ResizeObserver = class { observe() {} disconnect() { mockDisconnect(); } };
});
afterEach(() => { global.document = savedDocument; global.window.location = savedLocation; global.ResizeObserver = savedObserver; });

test('waits for map load, isolates pin clicks, updates selection and cleans up the map', async () => {
  const screen = render(<CityMapCanvas {...props} />, options);
  await waitFor(() => expect(mockConstruct).toHaveBeenCalled());
  expect(mockConstruct).toHaveBeenCalledWith(expect.objectContaining({ container: host, interactive: false,
    fitBoundsOptions: { padding: 24, maxZoom: 16 } }));
  const bounds = mockConstruct.mock.calls[0][0].bounds;
  expect(bounds[0][0]).toBeCloseTo(81.785);
  expect(bounds[0][1]).toBeCloseTo(6.785);
  expect(bounds[1][1]).toBeCloseTo(6.815);
  expect(props.onReady).not.toHaveBeenCalled();
  expect(mockMarkers).toHaveLength(0);
  act(() => mockEvents.load());
  expect(props.onReady).toHaveBeenCalledTimes(1);
  expect(mockMarkers[0].setLngLat).toHaveBeenCalledWith([81.81, 6.81]);
  const event = { stopPropagation: jest.fn() };
  mockMarkers[0].element.onclick(event);
  expect(event.stopPropagation).toHaveBeenCalledTimes(1);
  expect(props.onSelect).toHaveBeenCalledWith('fish');
  expect(props.onMapPress).not.toHaveBeenCalled();
  screen.rerender(<CityMapCanvas {...props} selectedId="fish" />);
  expect(mockMarkers[0].remove).toHaveBeenCalled();
  expect(mockMarkers.at(-1).element.attributes['aria-pressed']).toBe('true');
  const lateLoad = mockEvents.load;
  screen.unmount();
  expect(mockMap.remove).toHaveBeenCalledTimes(1);
  expect(mockDisconnect).toHaveBeenCalledTimes(1);
  lateLoad();
  expect(props.onReady).toHaveBeenCalledTimes(1);
});

test('reports tile failure separately and only forwards user viewport changes', async () => {
  const screen = render(<CityMapCanvas {...props} interactive />, options);
  await waitFor(() => expect(mockEvents.error).toBeDefined());
  act(() => mockEvents.error());
  expect(props.onError).toHaveBeenCalledTimes(1);
  act(() => mockEvents.moveend({}));
  expect(props.onRegionChange).not.toHaveBeenCalled();
  act(() => mockEvents.moveend({ originalEvent: {} }));
  expect(props.onRegionChange).toHaveBeenCalledWith(expect.objectContaining({ latitude: 6.8, longitude: 81.8 }));
  expect(props.onRegionChange.mock.calls[0][0].latitudeDelta).toBeCloseTo(0.2);
  screen.unmount();
});

test('missing map configuration is a retryable error, never a successful empty map', () => {
  mockStyle = null;
  render(<CityMapCanvas {...props} />, options);
  expect(props.onError).toHaveBeenCalledTimes(1);
  expect(props.onReady).not.toHaveBeenCalled();
  expect(mockConstruct).not.toHaveBeenCalled();
});
