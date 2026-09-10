import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import ActivityScreen from '../src/features/operations/ActivityScreen';

let mockEntries; let mockJobs;
const mockRetry = jest.fn(); const mockAcknowledge = jest.fn(async () => {});
jest.mock('../src/features/operations/OperationState', () => ({ useOperations: () => ({ entries: mockEntries }) }));
jest.mock('../src/features/publishing/ContentPublishContext', () => ({ useContentPublish: () => ({ jobs: mockJobs, retry: mockRetry }) }));
jest.mock('../src/features/operations/ProfilePhotoContext', () => ({ useProfilePhotoJobs: () => ({ jobs: [] }) }));
jest.mock('../src/features/operations/operationService', () => ({ operationStore: { acknowledge: (...args) => mockAcknowledge(...args) } }));
jest.mock('../src/features/operations/BackgroundMediaService', () => ({ syncBackgroundHistory: async () => {} }));
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
