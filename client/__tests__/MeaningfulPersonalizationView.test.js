import React from 'react';
import { render, act } from '@testing-library/react-native';

import { useMeaningfulPersonalizationView } from '../src/hooks/useMeaningfulPersonalizationView';

function Probe({ item, navigation, record }) {
  useMeaningfulPersonalizationView({ item, navigation, record });
  return null;
}

describe('useMeaningfulPersonalizationView', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('records only after eight active seconds', async () => {
    const record = jest.fn(() => Promise.resolve());
    const navigation = { isFocused: () => true };
    render(<Probe item={{ id: 'rec-1' }} navigation={navigation} record={record} />);

    await act(async () => { jest.advanceTimersByTime(7_999); });
    expect(record).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(record).toHaveBeenCalledWith({ id: 'rec-1' });
  });

  it('cancels before the threshold when the screen unmounts', async () => {
    const record = jest.fn(() => Promise.resolve());
    const screen = render(<Probe item={{ id: 'rec-1' }} navigation={{ isFocused: () => true }} record={record} />);
    await act(async () => { jest.advanceTimersByTime(4_000); });
    screen.unmount();
    await act(async () => { jest.advanceTimersByTime(8_000); });
    expect(record).not.toHaveBeenCalled();
  });
});
