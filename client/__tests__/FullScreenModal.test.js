import React from 'react';
import { Modal, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import FullScreenModal from '../src/components/FullScreenModal';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: require('react-native').View,
}));

test('owns modal safe area on every edge and forwards native close/dismiss separately', () => {
  const close = jest.fn(); const dismiss = jest.fn();
  const screen = render(<FullScreenModal visible onRequestClose={close} onDismiss={dismiss}>
    <View testID="content" />
  </FullScreenModal>);
  const modal = screen.UNSAFE_getByType(Modal);
  expect(modal.props.presentationStyle).toBe('fullScreen');
  expect(modal.findByType(SafeAreaProvider).findByType(SafeAreaView).props.edges).toEqual(['top', 'right', 'bottom', 'left']);
  fireEvent(modal, 'requestClose');
  expect(close).toHaveBeenCalledTimes(1);
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent(modal, 'dismiss');
  expect(dismiss).toHaveBeenCalledTimes(1);
});
