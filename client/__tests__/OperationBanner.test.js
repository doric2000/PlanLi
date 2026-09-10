jest.mock('../src/features/region/context/RegionSelectionState', () => ({ useOptionalRegionSelection: () => ({ selectedRegionId: null }) }));
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import OperationBanner from '../src/features/operations/OperationBanner';

let mockState;
const mockUpdate = jest.fn(async () => {});
jest.mock('../src/features/operations/OperationState', () => ({ useOperations: () => mockState }));
jest.mock('../src/features/operations/operationService', () => ({ operationStore: { update: (...args) => mockUpdate(...args), getSnapshot: () => mockState.entries } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const success = { id: 'one', ownerUid: 'owner', kind: 'avatar', status: 'success', stage: 'success', visibleMs: 0, updatedAt: 1 };
beforeEach(() => { jest.useFakeTimers(); mockUpdate.mockClear(); mockState = { active: true, noticeActive: false, entries: [success] }; });
afterEach(() => { jest.useRealTimers(); });

test('a completion receives eight foreground seconds, preserving remaining time across backgrounding', () => {
  const screen = render(<OperationBanner />);
  act(() => jest.advanceTimersByTime(2000));
  mockState.active = false; screen.rerender(<OperationBanner />);
  expect(mockUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ visibleMs: 2000 }));
  act(() => jest.advanceTimersByTime(60000));
  expect(mockUpdate.mock.calls.some(([entry]) => entry.acknowledged)).toBe(false);
  mockState.entries = [{ ...success, visibleMs: 2000 }]; mockState.active = true;
  screen.rerender(<OperationBanner />);
  act(() => jest.advanceTimersByTime(5999));
  expect(mockUpdate.mock.calls.some(([entry]) => entry.acknowledged)).toBe(false);
  act(() => jest.advanceTimersByTime(1));
  expect(mockUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ acknowledged: true, visibleMs: 8000 }));
});

test('failures stay visible until acknowledgement and dismissal retains history', () => {
  mockState.entries = [{ ...success, status: 'failed', stage: 'failed' }];
  const screen = render(<OperationBanner />);
  act(() => jest.advanceTimersByTime(60000));
  expect(mockUpdate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByTestId('operation-dismiss'));
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ id: 'one', dismissed: true, acknowledged: true }));
});

test('another upload cannot hide a completed result and Undo pauses its timer', () => {
  mockState.entries = [{ id: 'running', status: 'uploading', stage: 'uploading', kind: 'route' }, success];
  mockState.noticeActive = true;
  const screen = render(<OperationBanner />);
  expect(screen.queryByTestId('operation-banner')).toBeNull();
  act(() => jest.advanceTimersByTime(9000)); expect(mockUpdate).not.toHaveBeenCalled();
  mockState.noticeActive = false; screen.rerender(<OperationBanner />);
  expect(screen.getByText('תמונת הפרופיל עודכנה בהצלחה')).toBeTruthy();
});
