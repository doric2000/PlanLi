import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { createNotificationPushCallableClient } from './callables';
import { createNotificationPushCoordinator } from './createNotificationPushCoordinator';

function configuredProjectId() {
  return Constants?.expoConfig?.extra?.eas?.projectId
    ?? Constants?.easConfig?.projectId
    ?? null;
}

export function createNotificationPushRuntime(options = {}) {
  return createNotificationPushCoordinator({
    notifications: Notifications,
    callables: createNotificationPushCallableClient(),
    storage: AsyncStorage,
    platform: Platform.OS,
    projectId: configuredProjectId(),
    appVersion: Constants?.expoConfig?.version || null,
    ...options,
  });
}
