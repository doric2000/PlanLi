import { Platform } from 'react-native';

export function shouldDetachInactiveMainTabScreens(platform = Platform.OS) {
  // Rapid tab changes can race react-native-screens attachment on Android and
  // leave the focused scene detached. Keep visited main-tab scenes attached on
  // Android; lazy mounting still avoids mounting tabs before their first visit.
  return platform !== 'android';
}
