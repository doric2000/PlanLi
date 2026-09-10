jest.mock('../src/features/operations/BackgroundMediaService', () => ({
  backgroundTransfersAvailable: () => mockBackgroundAvailable, runBackgroundMedia: (...args) => mockBackgroundRun(...args),
  removeBackgroundSources: async () => {}, discardBackgroundJob: async () => {},
}));
import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ProfilePhotoProvider, useProfilePhotoJobs } from '../src/features/operations/ProfilePhotoContext';

let mockUser = { uid: 'alice', displayName: 'Alice', reload: jest.fn(async () => {}) };
const mockAuth = { currentUser: mockUser };
const mockUpload = jest.fn();
const mockSave = jest.fn();
const mockRecord = jest.fn(async () => {});
const mockNormalize = jest.fn(async () => 'file:///small-avatar.jpg');
const mockRead = jest.fn();
let mockBackgroundAvailable = false;
const mockBackgroundRun = jest.fn();
let mockSerial = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `photo-${++mockSerial}` }));
jest.mock('../src/config/firebase', () => ({ get auth() { return mockAuth; }, db: {} }));
jest.mock('../src/features/auth/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../src/features/operations/OperationState', () => ({ useOperations: () => ({ active: true }) }));
jest.mock('../src/features/operations/operationService', () => ({ operationStore: {
  update: (...args) => mockRecord(...args), remove: jest.fn(async () => {}),
} }));
jest.mock('../src/hooks/useImagePickerWithUpload', () => ({ useImagePickerWithUpload: () => ({ uploadImageAsset: mockUpload }) }));
jest.mock('../src/hooks/useImagePicker', () => ({ normalizeImageUri: (...args) => mockNormalize(...args) }));
jest.mock('../src/hooks/useUserData', () => ({ primeUserDataCache: jest.fn() }));
jest.mock('../src/services/ProfileService', () => ({ saveProfile: (...args) => mockSave(...args) }));
jest.mock('../src/features/profile/services/ProfileResourceService', () => ({ invalidateProfileResource: jest.fn() }));
jest.mock('firebase/firestore', () => ({ doc: (...args) => args, getDocFromServer: (...args) => mockRead(...args) }));
jest.mock('../src/features/community/publishing/recommendationPublishStorage', () => ({
  persistRecommendationPublishMedia: jest.fn(async () => ({ platform: 'native', key: 'file:///durable.jpg' })),
  materializeRecommendationPublishMedia: jest.fn(async () => ({ uri: 'file:///durable.jpg', revoke: jest.fn() })),
  deleteRecommendationPublishMedia: jest.fn(async () => {}),
}));
let api;
const Harness = () => { api = useProfilePhotoJobs(); return null; };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const asset = { assetId: 'asset-1', feed: { url: 'https://example.test/avatar.webp' } };
beforeEach(async () => {
  jest.clearAllMocks();
  mockBackgroundAvailable = false;
  await AsyncStorage.clear();
  mockUser = { uid: 'alice', displayName: 'Alice', reload: jest.fn(async () => {}) };
  mockAuth.currentUser = mockUser;
  mockUpload.mockResolvedValue(asset);
  mockSave.mockResolvedValue({});
});

it('continues after the initiating screen unmounts and remains busy through the profile save', async () => {
  const saving = deferred();
  mockSave.mockReturnValue(saving.promise);
  const screen = render(<ProfilePhotoProvider><Harness /><React.Fragment key="profile" /></ProfilePhotoProvider>);
  await act(async () => {});
  await act(async () => { await api.enqueue('file:///picked.jpg'); });
  await waitFor(() => expect(mockSave).toHaveBeenCalled());
  screen.rerender(<ProfilePhotoProvider><Harness /></ProfilePhotoProvider>);
  expect(api.jobs[0].status).toBe('saving');
  expect(mockNormalize).toHaveBeenCalledWith('file:///durable.jpg', expect.objectContaining({ normalizeWidth: 768, normalizeHeight: 768 }));
  await act(async () => { saving.resolve({}); });
  await waitFor(() => expect(api.jobs).toHaveLength(0));
  expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ kind: 'avatar', status: 'success' }), expect.anything());
  screen.unmount();
});

it('records success when refresh fails after a confirmed save', async () => {
  mockUser.reload.mockRejectedValue(new Error('offline'));
  const screen = render(<ProfilePhotoProvider><Harness /></ProfilePhotoProvider>);
  await act(async () => {});
  await act(async () => { await api.enqueue('file:///picked.jpg'); });
  await waitFor(() => expect(api.jobs).toHaveLength(0));
  expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ status: 'success', refreshNeeded: true }), expect.anything());
  expect(mockRecord.mock.calls.some(([entry]) => entry.status === 'failed')).toBe(false);
  screen.unmount();
});

it('retains the source for a failed upload and retries only when requested', async () => {
  mockUpload.mockRejectedValueOnce({ code: 'media/upload-stalled', message: 'private provider error' });
  const screen = render(<ProfilePhotoProvider><Harness /></ProfilePhotoProvider>);
  await act(async () => {});
  await act(async () => { await api.enqueue('file:///picked.jpg'); });
  await waitFor(() => expect(api.jobs[0]?.status).toBe('failed'));
  expect(api.jobs[0].localReference).toBeTruthy();
  expect(mockUpload).toHaveBeenCalledTimes(1);
  await act(async () => { await api.retry(api.jobs[0].id); });
  await waitFor(() => expect(api.jobs).toHaveLength(0));
  expect(mockUpload).toHaveBeenCalledTimes(2);
  screen.unmount();
});

it('reconciles a lost save response on restart without saving twice', async () => {
  await AsyncStorage.setItem('@planli/profile-photo-jobs', JSON.stringify([{
    id: 'saved-before-exit', ownerUid: 'alice', status: 'saving', asset,
    localReference: { platform: 'native', key: 'file:///durable.jpg' }, createdAt: 1,
  }]));
  mockRead.mockResolvedValue({ data: () => ({ photoMedia: asset }) });
  const screen = render(<ProfilePhotoProvider><Harness /></ProfilePhotoProvider>);
  await waitFor(() => expect(mockRead).toHaveBeenCalled());
  await waitFor(() => expect(api.jobs).toHaveLength(0));
  expect(mockSave).not.toHaveBeenCalled();
  expect(mockUpload).not.toHaveBeenCalled();
  screen.unmount();
});

it('does not save an old account photo into a newly signed-in account', async () => {
  const uploading = deferred();
  mockUpload.mockReturnValueOnce(uploading.promise);
  const screen = render(<ProfilePhotoProvider><Harness /></ProfilePhotoProvider>);
  await act(async () => {});
  await act(async () => { await api.enqueue('file:///picked.jpg'); });
  await waitFor(() => expect(mockUpload).toHaveBeenCalled());
  mockAuth.currentUser = { uid: 'bob' };
  await act(async () => { uploading.resolve(asset); });
  await waitFor(() => expect(api.jobs[0]?.status).toBe('failed'));
  expect(mockSave).not.toHaveBeenCalled();
  screen.unmount();
});

it('completed native bytes do not replace the server processing stage with uploading', async () => {
  mockBackgroundAvailable = true;
  const processing = deferred();
  mockBackgroundRun.mockImplementation(async ({ stage, progress }) => {
    await stage('processing');
    await progress(0, 1);
    await processing.promise;
    return { photoMedia: asset };
  });
  const screen = render(<ProfilePhotoProvider><Harness /></ProfilePhotoProvider>);
  await act(async () => {});
  await act(async () => { await api.enqueue('file:///picked.jpg'); });
  await waitFor(() => expect(mockRecord).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'processing', stage: 'processing', progress: 1 }), { durable: false }));
  await act(async () => { processing.resolve(); });
  await waitFor(() => expect(api.jobs).toHaveLength(0));
  expect(mockSave).not.toHaveBeenCalled();
  screen.unmount();
});
