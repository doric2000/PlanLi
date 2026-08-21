import { useEffect, useMemo } from 'react';

import { useAuthUser } from '../../../hooks/useAuthUser';
import {
  addDiagnosticBreadcrumb,
  captureDiagnosticException,
} from '../../../services/ErrorReporting';
import {
  getNotificationPushRuntime,
  setNotificationPushRuntimeHandlers,
} from './runtimeManager';
import { setNotificationDeviceUnregisterHandler } from './session';

export function buildNotificationCenterPath(intent) {
  return {
    screen: 'Tabs',
    params: {
      screen: 'Notifications',
      params: {
        notificationId: intent.notificationId,
        channel: intent.channel,
      },
    },
  };
}

export default function NotificationPushBridge({ navigationRef, navigationReady }) {
  const { user } = useAuthUser();
  const uid = user?.uid || null;
  const runtime = useMemo(() => getNotificationPushRuntime(), []);

  useEffect(() => setNotificationDeviceUnregisterHandler(
    () => runtime.unregisterCurrentDevice()
  ), [runtime]);

  useEffect(() => {
    if (!uid || !navigationReady || !navigationRef?.isReady?.()) {
      runtime.stop();
      return undefined;
    }

    let active = true;
    const onIntent = async (intent) => {
      if (!active || !navigationRef.isReady()) return false;
      navigationRef.navigate('Main', buildNotificationCenterPath(intent));
      addDiagnosticBreadcrumb({
        category: 'navigation',
        message: 'Notification response opened inbox',
        data: { outcome: 'opened', to: 'Notifications' },
      });
      return true;
    };
    const onError = ({ stage, error }) => {
      captureDiagnosticException(error, {
        operation: 'notification_push',
        code: String(stage || 'unknown').slice(0, 60),
      });
    };

    const clearHandlers = setNotificationPushRuntimeHandlers({ onIntent, onError });
    Promise.resolve(runtime.start({ syncRegistration: true }))
      .then(() => runtime.flushPendingResponse())
      .catch((error) => onError({ stage: 'start', error }));

    return () => {
      active = false;
      clearHandlers();
      runtime.stop();
    };
  }, [navigationReady, navigationRef, runtime, uid]);

  return null;
}
