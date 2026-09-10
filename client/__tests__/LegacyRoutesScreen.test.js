import React from 'react';
import { render } from '@testing-library/react-native';
import LegacyRoutesScreen from '../src/navigation/LegacyRoutesScreen';
it('returns old route-list entry points to the existing Main stack entry without reset', () => {
  const navigation = { popTo: jest.fn(), reset: jest.fn() };
  render(<LegacyRoutesScreen navigation={navigation} />);
  expect(navigation.popTo).toHaveBeenCalledWith('Main', { screen: 'Tabs', params: { screen: 'Community', params: { screen: 'Routes' } } }, { merge: true });
  expect(navigation.reset).not.toHaveBeenCalled();
});
