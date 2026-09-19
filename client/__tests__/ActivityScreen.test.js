import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ActivityScreen from '../src/features/operations/ActivityScreen';

let mockEntries; let mockJobs;
const mockRetryServer = jest.fn();
const mockSync = jest.fn(async () => null);
const mockEntry = { id: 'publish:edit', source: 'publish', ownerUid: 'owner', kind: 'recommendation',
  serverOperationId: 'server-edit', status: 'failed', retryable: true, createdAt: 1 };
const mockRetry = jest.fn(); const mockAcknowledge = jest.fn(async () => {});
jest.mock('../src/features/operations/OperationState', () => ({ useOperations: () => ({ entries: mockEntries }) }));
jest.mock('../src/features/publishing/ContentPublishContext', () => ({ useContentPublish: () => ({ jobs: mockJobs, retry: mockRetry }) }));
jest.mock('../src/features/operations/ProfilePhotoContext', () => ({ useProfilePhotoJobs: () => ({ jobs: [] }) }));
jest.mock('../src/features/operations/operationService', () => ({ operationStore: { acknowledge: (...args) => mockAcknowledge(...args) } }));
jest.mock('../src/features/operations/BackgroundMediaService', () => ({
  syncBackgroundHistory: (...args) => mockSync(...args),
  retryBackgroundOperation: (...args) => mockRetryServer(...args),
  backgroundTransfersAvailable: () => false,
}));
jest.mock('../src/features/region/context/RegionSelectionState', () => ({ useOptionalRegionSelection: () => ({ selectedRegionId: null }) }));
jest.mock('../src/config/firebase', () => ({ auth: { currentUser: null } }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: require('react-native').View }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
beforeEach(() => { jest.clearAllMocks(); mockEntries = []; mockJobs = []; });

test('history offers a retry for each failed publication without blocking other jobs', async () => {
  mockJobs = ['one', 'two'].map((id) => ({ id, status: 'failed', error: { details: { retryable: true } } }));
  mockEntries = mockJobs.map((job) => ({ id: `publish:${job.id}`, ownerUid: 'owner', source: 'publish', kind: 'recommendation', status: 'failed', updatedAt: 1 }));
  let finishFirst;
  mockRetry.mockImplementation((id) => id === 'one' ? new Promise((resolve) => { finishFirst = resolve; }) : Promise.resolve());
  const screen = render(<ActivityScreen navigation={{ goBack: jest.fn() }} />);
  fireEvent.press(screen.getByTestId('activity-retry-one'));
  await act(async () => { fireEvent.press(screen.getByTestId('activity-retry-two')); });
  expect(mockRetry.mock.calls.map(([id]) => id)).toEqual(['one', 'two']);
  await act(async () => { finishFirst(); });
});

test('opening a successful result acknowledges it and navigates to its exact item', () => {
  mockEntries = [{ id: 'publish:one', ownerUid: 'owner', source: 'publish', kind: 'recommendation', status: 'success', targetId: 'post-42', updatedAt: 1 }];
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const screen = render(<ActivityScreen navigation={navigation} />);
  fireEvent.press(screen.getByText('צפייה בפריט'));
  expect(mockAcknowledge).toHaveBeenCalledWith('publish:one', 'owner');
  expect(navigation.navigate).toHaveBeenCalledWith('RecommendationDetail', { postId: 'post-42' });
});

test('activity opened from a notification prioritizes the selected older operation', () => {
  mockEntries = [{ id: 'new', ownerUid: 'owner', kind: 'profile', status: 'success', updatedAt: 2 },
    { id: 'old', ownerUid: 'owner', kind: 'avatar', status: 'failed', updatedAt: 1, serverOperationId: 'selected' }];
  const screen = render(<ActivityScreen navigation={{ goBack: jest.fn() }} route={{ params: { operationId: 'selected' } }} />);
  expect(screen.UNSAFE_getByType(require('react-native').FlatList).props.data[0].id).toBe('old');
});

test('history can retry an accepted edit when the local publish job is no longer present', async () => {
  mockRetryServer.mockResolvedValue({ status: 'ready' });
  mockEntries = [mockEntry];
  const screen = render(<ActivityScreen navigation={{ goBack: jest.fn() }} />);
  fireEvent.press(screen.getByTestId('activity-retry-server-server-edit'));
  await waitFor(() => expect(mockSync).toHaveBeenCalledWith('owner', 'server-edit'));
  expect(mockRetryServer).toHaveBeenCalledTimes(1);
  expect(mockRetryServer).toHaveBeenCalledWith('server-edit');
});

test('a still-expired sign-in shows the reauthentication instruction without automatically retrying', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockRetryServer.mockRejectedValue({ code: 'functions/failed-precondition', details: { reason: 'recent_sign_in_required' } });
  mockEntries = [mockEntry];
  const screen = render(<ActivityScreen navigation={{ goBack: jest.fn() }} />);
  fireEvent.press(screen.getByTestId('activity-retry-server-server-edit'));
  await waitFor(() => expect(alert).toHaveBeenCalledWith('הפעולה לא הושלמה', expect.stringContaining('אימות מנהל מחדש')));
  expect(mockRetryServer).toHaveBeenCalledTimes(1);
  expect(mockSync).not.toHaveBeenCalled();
  alert.mockRestore();
});

test('a local publish job retains its existing retry path', () => {
  mockJobs = [{ id: 'edit', status: 'failed', error: { details: { retryable: true } } }];
  mockEntries = [mockEntry];
  const screen = render(<ActivityScreen navigation={{ goBack: jest.fn() }} />);
  expect(screen.queryByTestId('activity-retry-server-server-edit')).toBeNull();
  expect(screen.getByTestId('activity-retry-edit')).toBeTruthy();
});
