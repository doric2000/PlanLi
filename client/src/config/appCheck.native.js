import { getApp as getNativeFirebaseApp } from '@react-native-firebase/app';
import {
  ReactNativeFirebaseAppCheckProvider,
  getLimitedUseToken as getNativeLimitedUseToken,
  getToken,
  initializeAppCheck as initializeNativeAppCheck,
} from '@react-native-firebase/app-check';
import { initializeAppCheck as initializeWebSdkAppCheck } from 'firebase/app-check';

import { appCheckTokenExpiry } from './appCheckToken';

let appCheckInstance;

class NativeAppCheckBridgeProvider {
  constructor(nativeAppCheckPromise) {
    this.nativeAppCheckPromise = nativeAppCheckPromise;
  }

  initialize() {}

  isEqual(otherProvider) {
    return otherProvider instanceof NativeAppCheckBridgeProvider
      && otherProvider.nativeAppCheckPromise === this.nativeAppCheckPromise;
  }

  async getToken(isLimitedUse = false) {
    const nativeAppCheck = await this.nativeAppCheckPromise;
    const result = isLimitedUse
      ? await getNativeLimitedUseToken(nativeAppCheck)
      : await getToken(nativeAppCheck, false);
    const token = result?.token;
    if (typeof token !== 'string' || token.length < 100) {
      throw new Error('Native App Check returned an invalid token.');
    }
    return {
      token,
      expireTimeMillis: appCheckTokenExpiry(token),
      issuedAtTimeMillis: Date.now(),
    };
  }
}

export function initializePlanLiAppCheck(webSdkApp) {
  if (appCheckInstance) return appCheckInstance;

  const nativeProvider = new ReactNativeFirebaseAppCheckProvider();
  nativeProvider.configure({
    android: { provider: __DEV__ ? 'debug' : 'playIntegrity' },
    apple: { provider: __DEV__ ? 'debug' : 'appAttestWithDeviceCheckFallback' },
  });
  const nativeAppCheckPromise = initializeNativeAppCheck(getNativeFirebaseApp(), {
    provider: nativeProvider,
    isTokenAutoRefreshEnabled: true,
  });
  // Firebase JS calls provider.getToken(true) only for callables that opt into
  // replay protection. Forward that signal to the native SDK instead of
  // consuming the reusable token used by Firestore, Storage and normal calls.
  const bridgeProvider = new NativeAppCheckBridgeProvider(nativeAppCheckPromise);
  appCheckInstance = initializeWebSdkAppCheck(webSdkApp, {
    provider: bridgeProvider,
    isTokenAutoRefreshEnabled: true,
  });
  return appCheckInstance;
}
