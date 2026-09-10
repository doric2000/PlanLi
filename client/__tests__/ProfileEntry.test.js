import React from 'react';
import { act, render, renderHook } from '@testing-library/react-native';
import ProfileScreen from '../src/features/profile/screens/ProfileScreen';
import { useProfilePhoto } from '../src/features/profile/hooks/useProfilePhoto';

let mockPhotoState;
let mockUserSnapshot;
const mockUnsubscribe = jest.fn();
const mockUpdateLocal = jest.fn();
const mockRefresh = () => ({ requested: false, promise: Promise.resolve() });
jest.mock('../src/config/firebase', () => ({ auth: { currentUser: { uid: 'alice' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  doc: (...args) => args,
  onSnapshot: (_ref, success) => { mockUserSnapshot = success; return mockUnsubscribe; },
}));
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ isGuest: false, loading: false }) }));
// Keep the real screen, asynchronous user hook, photo hook and image picker.
// Only external data/services and presentation are replaced.
jest.mock('../src/features/operations/ProfilePhotoContext', () => ({ useProfilePhotoJobs: () => mockPhotoState }));
jest.mock('../src/features/profile/hooks/useProfileData', () => ({ useProfileData: () => ({
  userData: {}, stats: {}, loading: false, refresh: mockRefresh, setUserData: mockUpdateLocal,
}) }));
jest.mock('../src/features/profile/hooks/useProfileContent', () => ({ useProfileContent: () => ({
  recommendations: [], routes: [], pendingContent: [], loading: false, refresh: mockRefresh,
}) }));
jest.mock('../src/features/publishing/ContentPublishContext', () => ({ useContentPublish: () => ({}) }));
jest.mock('../src/services/ProfileService', () => ({ saveProfile: jest.fn() }));
jest.mock('../src/features/profile/services/ProfileResourceService', () => ({ invalidateProfileResource: jest.fn() }));
jest.mock('../src/features/profile/components/SupportModal', () => () => null);
jest.mock('../src/features/profile/components/ProfileView', () => {
  const ReactRuntime = require('react');
  const { Text } = require('react-native');
  return ({ isOwner }) => ReactRuntime.createElement(Text, null, isOwner ? 'own-profile' : 'public-profile');
});

const savedAsset = { feed: { url: 'https://example.test/avatar.webp' }, assetId: 'avatar-1' };
beforeEach(() => {
  jest.clearAllMocks();
  mockPhotoState = { jobs: [], lastSaved: null, enqueue: jest.fn() };
});

it('opens and reopens the profile tab before the user snapshot arrives', () => {
  const navigation = { navigate: jest.fn(), dispatch: jest.fn() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const screen = render(<ProfileScreen navigation={navigation} />);
    expect(mockUpdateLocal).not.toHaveBeenCalled();
    act(() => mockUserSnapshot({ exists: () => true, data: () => ({ displayName: 'Alice' }) }));
    expect(screen.getByText('own-profile')).toBeTruthy();
    screen.unmount();
  }
  expect(mockUnsubscribe).toHaveBeenCalledTimes(2);
});

it.each(['alice', 'bob'])('opens a profile from a direct route with uid %s', (uid) => {
  const screen = render(<ProfileScreen navigation={{}} route={{ params: { uid } }} />);
  act(() => mockUserSnapshot({ exists: () => true, data: () => ({ displayName: 'Alice' }) }));
  expect(screen.getByText(uid === 'alice' ? 'own-profile' : 'public-profile')).toBeTruthy();
  expect(mockUpdateLocal).not.toHaveBeenCalled();
});

it.each([undefined, null, ''])('ignores a missing user identity (%s) and absent save result', (uid) => {
  const { result } = renderHook(() => useProfilePhoto({ uid, updateLocalUserData: mockUpdateLocal }));
  expect(result.current.uploading).toBe(false);
  expect(mockUpdateLocal).not.toHaveBeenCalled();
});

it('applies a saved avatar only after its matching user is loaded', () => {
  mockPhotoState.lastSaved = { ownerUid: 'alice', asset: savedAsset };
  const screen = renderHook(({ uid }) => useProfilePhoto({ uid, updateLocalUserData: mockUpdateLocal }), {
    initialProps: { uid: undefined },
  });
  expect(mockUpdateLocal).not.toHaveBeenCalled();
  screen.rerender({ uid: 'bob' });
  expect(mockUpdateLocal).not.toHaveBeenCalled();
  screen.rerender({ uid: 'alice' });
  expect(mockUpdateLocal).toHaveBeenCalledTimes(1);
  expect(mockUpdateLocal).toHaveBeenCalledWith({ photoURL: savedAsset.feed.url, photoMedia: savedAsset });
});

it.each([{}, { feed: null }, { feed: {} }])('ignores an incomplete saved avatar %j', (asset) => {
  mockPhotoState.lastSaved = { ownerUid: 'alice', asset };
  renderHook(() => useProfilePhoto({ uid: 'alice', updateLocalUserData: mockUpdateLocal }));
  expect(mockUpdateLocal).not.toHaveBeenCalled();
});
