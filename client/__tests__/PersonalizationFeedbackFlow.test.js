import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PreferenceContextLine from '../src/components/PreferenceContextLine';
import {
  PersonalizationFeedbackProvider,
  usePersonalizationFeedback,
} from '../src/features/profile/context/PersonalizationFeedbackContext';

const mockSetFeedback = jest.fn(() => Promise.resolve({ applied: true }));
let mockAuthUser = { uid: 'user-1' };

jest.mock('../src/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockAuthUser }),
}));

jest.mock('../src/services/PersonalizationService', () => ({
  setPersonalizationFeedback: (...args) => mockSetFeedback(...args),
}));

jest.mock('@expo/vector-icons', () => {
  const ReactModule = require('react');
  const { Text } = require('react-native');
  return {
    MaterialIcons: ({ name }) => ReactModule.createElement(Text, null, name),
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function HiddenState({ target }) {
  const { isHidden } = usePersonalizationFeedback();
  return <Text testID="hidden-state">{isHidden(target) ? 'hidden' : 'visible'}</Text>;
}

beforeEach(() => {
  mockSetFeedback.mockClear();
  mockAuthUser = { uid: 'user-1' };
});

test('opens truthful reasons and supports hide with immediate undo', async () => {
  const item = { id: 'rec-1', facets: { interests: ['food'] } };
  const screen = render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <PersonalizationFeedbackProvider>
        <PreferenceContextLine
          personalization={{
            reasons: [
              { code: 'declared_interest', value: 'food' },
              { code: 'budget_exact', value: 'balanced' },
            ],
          }}
          target={{ type: 'recommendation', id: item.id }}
          item={item}
        />
      </PersonalizationFeedbackProvider>
    </SafeAreaProvider>
  );

  fireEvent.press(screen.getByTestId('preference-context-line'));
  expect(screen.getByText('למה זה מופיע בשבילך?')).toBeTruthy();
  expect(screen.getAllByText('כי בחרת בתחום אוכל וקולינריה').length).toBeGreaterThan(0);
  expect(screen.getByText('מתאים לרמת המחיר שבחרת')).toBeTruthy();

  fireEvent.press(screen.getByText('פחות דברים כאלה'));
  expect(await screen.findByText('הפריט הוסר מבשבילך')).toBeTruthy();
  expect(mockSetFeedback).toHaveBeenCalledWith(expect.objectContaining({ value: 'less' }));

  fireEvent.press(screen.getByText('ביטול'));
  await waitFor(() => expect(mockSetFeedback).toHaveBeenCalledWith(expect.objectContaining({ value: 'undo' })));
});

test('clears optimistic hidden paths when the active account changes', async () => {
  const item = { id: 'rec-1', facets: { interests: ['food'] } };
  const target = { type: 'recommendation', id: item.id };
  const content = () => (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PersonalizationFeedbackProvider>
        <HiddenState target={target} />
        <PreferenceContextLine
          personalization={{ reasons: [{ code: 'declared_interest', value: 'food' }] }}
          target={target}
          item={item}
        />
      </PersonalizationFeedbackProvider>
    </SafeAreaProvider>
  );
  const screen = render(content());
  fireEvent.press(screen.getByTestId('preference-context-line'));
  fireEvent.press(screen.getByText('פחות דברים כאלה'));
  expect(screen.getByTestId('hidden-state').props.children).toBe('hidden');

  mockAuthUser = { uid: 'user-2' };
  screen.rerender(content());

  await waitFor(() => expect(screen.getByTestId('hidden-state').props.children).toBe('visible'));
});
