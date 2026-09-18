jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: jest.fn(() => null),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'ios' }, AppState: { currentState: 'active' } }));
jest.mock('firebase/app-check', () => ({ getToken: jest.fn() }));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'test-id' }));
jest.mock('../src/config/firebase', () => ({ auth: {}, appCheck: {}, cloudFunctions: {}, mediaBucket: 'test' }));
jest.mock('../src/config/localEmulators', () => ({ localEmulatorSettings: () => false }));
jest.mock('../src/utils/travelMediaPreparation', () => ({}));
jest.mock('../src/features/community/publishing/recommendationPublishStorage', () => ({}));
jest.mock('../src/features/operations/operationService', () => ({ operationStore: {} }));
jest.mock('../src/features/operations/operationModel', () => ({ safeOperationError: (error) => error }));

import { Platform } from 'react-native';
import nativeTransfers from '../modules/planli-transfers';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { backgroundTransfersAvailable } from '../src/features/operations/BackgroundMediaService';

test.each(['ios', 'android'])('an installed %s binary without PlanLiTransfers stays on the foreground fallback', (platform) => {
  Platform.OS = platform;
  expect(requireOptionalNativeModule).toHaveBeenCalledWith('PlanLiTransfers');
  expect(nativeTransfers).toBeNull();
  expect(backgroundTransfersAvailable()).toBe(false);
});
