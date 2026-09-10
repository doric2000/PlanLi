import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CreateMenuScreen from '../src/navigation/CreateMenuScreen';
import { CAPABILITIES } from '../src/constants/authPolicy';
const mockEnsure = jest.fn();
jest.mock('../src/hooks/useAuthUser', () => ({ useAuthUser: () => ({ ensureCapability: mockEnsure }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 34 }) }));
beforeEach(() => jest.clearAllMocks());
it.each([['recommendation', 'AddRecommendation'], ['route', 'AddRoutesScreen']])('gates %s publishing', async (id, destination) => {
  mockEnsure.mockResolvedValue(true);
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const s = render(<CreateMenuScreen navigation={navigation} />);
  fireEvent.press(s.getByTestId('create-' + id));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith(destination));
  expect(mockEnsure).toHaveBeenCalledWith(CAPABILITIES.ACTIVE, { name: destination });
  expect(navigation.goBack.mock.invocationCallOrder[0]).toBeLessThan(mockEnsure.mock.invocationCallOrder[0]);
});
it('does not navigate when denied and ignores duplicate taps', async () => {
  mockEnsure.mockResolvedValue(false);
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const s = render(<CreateMenuScreen navigation={navigation} />);
  fireEvent.press(s.getByTestId('create-recommendation')); fireEvent.press(s.getByTestId('create-route'));
  await waitFor(() => expect(mockEnsure).toHaveBeenCalledTimes(1));
  expect(navigation.navigate).not.toHaveBeenCalled(); expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
it('marks planning as coming soon and dismisses without changing tabs', () => {
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const s = render(<CreateMenuScreen navigation={navigation} />);
  const plan = s.getByTestId('create-trip');
  expect(plan.props.accessibilityState.disabled).toBe(true); fireEvent.press(plan);
  expect(mockEnsure).not.toHaveBeenCalled(); expect(navigation.navigate).not.toHaveBeenCalled();
  fireEvent.press(s.getByTestId('create-menu-close')); expect(navigation.goBack).toHaveBeenCalledTimes(1);
});
