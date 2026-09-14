jest.mock('../src/features/region/context/RegionSelectionState', () => ({ useOptionalRegionSelection: () => ({ selectedRegionId: null }) }));
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import OperationBanner from '../src/features/operations/OperationBanner';

let mockState;
const mockUpdate = jest.fn(async () => {});
const mockDismiss = jest.fn(async () => {});
jest.mock('../src/features/operations/OperationState', () => ({ useOperations: () => mockState }));
jest.mock('../src/features/operations/operationService', () => ({ operationStore: { dismiss: (...args) => mockDismiss(...args), update: (...args) => mockUpdate(...args), getSnapshot: () => mockState.entries } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
const success = { id: 'one', ownerUid: 'owner', kind: 'avatar', status: 'success', stage: 'success', visibleMs: 0, updatedAt: 1 };
beforeEach(() => { jest.useFakeTimers(); mockUpdate.mockClear(); mockDismiss.mockReset().mockResolvedValue(); mockState = { active: true, noticeActive: false, entries: [success] }; });
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

test('failures stay visible until acknowledgement and dismissal retains history', async () => {
  mockState.entries = [{ ...success, status: 'failed', stage: 'failed' }];
  const screen = render(<OperationBanner />);
  act(() => jest.advanceTimersByTime(60000));
  expect(mockUpdate).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByTestId('operation-dismiss')));
  expect(mockDismiss).toHaveBeenCalledWith('one', 'owner', expect.objectContaining({ status: 'failed' }));
});

test('slow dismissal disables repeated taps and storage failure offers an inline retry', async () => {
  mockState.entries = [{ ...success, status: 'failed' }];
  let reject;
  mockDismiss.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const screen = render(<OperationBanner />);
  fireEvent.press(screen.getByTestId('operation-dismiss'));
  fireEvent.press(screen.getByTestId('operation-dismiss'));
  expect(mockDismiss).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('operation-dismiss').props.accessibilityState.disabled).toBe(true);
  await act(async () => reject(new Error('disk full')));
  expect(screen.getByText('לא הצלחנו לשמור את סגירת ההודעה. אפשר לנסות שוב.')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByText('ניסיון נוסף לסגירה')));
  expect(mockDismiss).toHaveBeenCalledTimes(2);
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
