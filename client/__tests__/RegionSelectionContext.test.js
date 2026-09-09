import React from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RegionSelectionProvider, useRegionSelection } from '../src/features/region/context/RegionSelectionContext';
import { loadRegionSelection, saveSelectedRegion } from '../src/features/region/services/RegionSelectionStorage';
let mockUser;
let mockAppListener;
let mockDocument;
const mockSync = jest.fn();
jest.mock('../src/features/auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser, userDocument: mockDocument }) }));
jest.mock('../src/features/region/services/RegionSelectionService', () => ({ syncSelectedRegion: (...args) => mockSync(...args) }));
jest.mock('../src/services/DestinationService', () => ({ clearDestinationSearchCache: jest.fn() }));
jest.mock('../src/services/PersonalizationService', () => ({ clearPersonalizationDiscoveryCache: jest.fn() }));
function Probe() {
  const s = useRegionSelection();
  return <View><Text testID="scope">{s.selectedMode + ':' + (s.selectedRegionId || '')}</Text><Text testID="sync">{s.syncState}</Text>
    <Text testID="chosen">{String(s.hasSelection)}</Text>
    <Pressable testID="global" onPress={s.selectGlobal} /><Pressable testID="africa" onPress={() => s.selectRegion('africa')} />
  </View>;
}
const mount = () => render(<RegionSelectionProvider><Probe /></RegionSelectionProvider>);
beforeEach(async () => {
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, callback) => { mockAppListener = callback; return { remove: jest.fn() }; });
  await AsyncStorage.clear();
  await saveSelectedRegion('europe', new Date('2026-08-27T10:00:00Z'));
  mockUser = { uid: 'u1' }; mockDocument = { discoveryRegion: { regionId: 'europe' } };
  mockSync.mockReset().mockResolvedValue({});
});
it('does not restore a stale cloud region after confirming global', async () => {
  const screen = mount(); await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('region:europe'));
  fireEvent.press(screen.getByTestId('global'));
  await waitFor(() => expect(screen.getByTestId('sync').props.children).toBe('synced'));
  expect(mockSync).toHaveBeenCalledWith(null, 'global');
  expect(screen.getByTestId('scope').props.children).toBe('global:');
  expect(screen.getByTestId('chosen').props.children).toBe('true');
});
it('retains regional compatibility', async () => {
  const screen = mount(); await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('region:europe'));
  fireEvent.press(screen.getByTestId('africa'));
  await waitFor(() => expect(screen.getByTestId('sync').props.children).toBe('synced'));
  expect(mockSync).toHaveBeenCalledWith('africa'); expect(screen.getByTestId('scope').props.children).toBe('region:africa');
});
it('uses a global cloud preference on a new device', async () => {
  await AsyncStorage.clear(); mockDocument = { discoveryRegion: { mode: 'global', regionId: null } };
  const screen = mount(); await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('global:'));
  expect(mockSync).not.toHaveBeenCalled();
});
it('persists guest global and queues it on sign-in', async () => {
  mockUser = null; mockDocument = null;
  const screen = mount(); await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('region:europe'));
  fireEvent.press(screen.getByTestId('global'));
  await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('global:'));
  expect(mockSync).not.toHaveBeenCalled();
  mockUser = { uid: 'u1' }; mockDocument = {};
  screen.rerender(<RegionSelectionProvider><Probe /></RegionSelectionProvider>);
  await waitFor(() => expect(mockSync).toHaveBeenCalledWith(null, 'global'));
});
it('keeps offline global pending, then syncs on foreground', async () => {
  mockSync.mockRejectedValue(new Error('offline'));
  const screen = mount(); await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('region:europe'));
  fireEvent.press(screen.getByTestId('global'));
  await waitFor(() => expect(screen.getByTestId('sync').props.children).toBe('pending'));
  expect((await loadRegionSelection()).pendingAccountSync.mode).toBe('global');
  mockSync.mockResolvedValue({});
  await act(async () => { mockAppListener('active'); });
  await waitFor(() => expect(screen.getByTestId('sync').props.children).toBe('synced'));
});
it('serializes rapid choices and ignores an earlier acknowledgement', async () => {
  const resolves = [];
  mockSync.mockImplementation(() => new Promise((resolve) => resolves.push(resolve)));
  const screen = mount(); await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('region:europe'));
  fireEvent.press(screen.getByTestId('africa')); await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
  fireEvent.press(screen.getByTestId('global')); await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('global:'));
  await act(async () => { resolves[0]({}); });
  await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId('scope').props.children).toBe('global:');
  await act(async () => { resolves[1]({}); });
  await waitFor(() => expect(screen.getByTestId('sync').props.children).toBe('synced'));
  expect((await loadRegionSelection()).pendingAccountSync).toBeNull();
});

it.each(['success', 'failure'])('resumes the new account queue after the earlier account request %s', async (outcome) => {
  const requests = [];
  mockSync.mockImplementation(() => new Promise((resolve, reject) => requests.push({ resolve, reject })));
  const screen = mount();
  await waitFor(() => expect(screen.getByTestId('scope').props.children).toBe('region:europe'));
  fireEvent.press(screen.getByTestId('africa'));
  await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(1));
  mockUser = { uid: 'u2' }; mockDocument = {};
  screen.rerender(<RegionSelectionProvider><Probe /></RegionSelectionProvider>);
  await waitFor(async () => expect((await loadRegionSelection()).pendingAccountSync.uid).toBe('u2'));
  await act(async () => {
    if (outcome === 'success') requests[0].resolve({});
    else requests[0].reject(new Error('earlier account request failed'));
  });
  await waitFor(() => expect(mockSync).toHaveBeenCalledTimes(2));
  expect(mockSync).toHaveBeenLastCalledWith('africa');
  await act(async () => { requests[1].resolve({}); });
  await waitFor(() => expect(screen.getByTestId('sync').props.children).toBe('synced'));
  expect((await loadRegionSelection()).pendingAccountSync).toBeNull();
});
