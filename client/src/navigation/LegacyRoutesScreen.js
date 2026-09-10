import { useEffect } from 'react';
import { buildMainTabPath } from './authNavigation';

// Keep old Route/Routes entry points without a second feed instance or a fifth destination.
export default function LegacyRoutesScreen({ navigation }) {
  useEffect(() => {
    navigation.popTo('Main', buildMainTabPath('Routes'), { merge: true });
  }, [navigation]);
  return null;
}
