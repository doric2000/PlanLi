import React from 'react';
import { NavigationContext } from '@react-navigation/native';
import { act, renderHook } from '@testing-library/react-native';

import { useTabPressScrollOrRefresh } from '../src/hooks/useTabPressScrollOrRefresh';

function setup({ focused = false, variant = 'scrollview' } = {}) {
  let tabPress;
  const navigation = {
    addListener: jest.fn((event, handler) => {
      if (event === 'tabPress') tabPress = handler;
      return jest.fn();
    }),
    isFocused: jest.fn(() => focused),
  };
  const onRefresh = jest.fn();
  const scrollable = {
    scrollTo: jest.fn(),
    scrollToOffset: jest.fn(),
  };
  const wrapper = ({ children }) => (
    <NavigationContext.Provider value={navigation}>
      {children}
    </NavigationContext.Provider>
  );
  const hook = renderHook(() => useTabPressScrollOrRefresh({
    variant,
    scrollRef: { current: scrollable },
    onRefresh,
  }), { wrapper });

  return {
    ...hook,
    navigation,
    onRefresh,
    scrollable,
    pressTab: () => act(() => tabPress()),
  };
}

describe('useTabPressScrollOrRefresh', () => {
  it('does nothing when a tab press enters an unfocused tab', () => {
    const { pressTab, onRefresh, scrollable } = setup({ focused: false });

    pressTab();

    expect(onRefresh).not.toHaveBeenCalled();
    expect(scrollable.scrollTo).not.toHaveBeenCalled();
    expect(scrollable.scrollToOffset).not.toHaveBeenCalled();
  });

  it('refreshes only when the user re-presses an already-focused tab at the top', () => {
    const { pressTab, onRefresh } = setup({ focused: true });

    pressTab();

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['scrollview', 'scrollTo', { y: 0, animated: true }],
    ['flatlist', 'scrollToOffset', { offset: 0, animated: true }],
  ])('scrolls a focused %s to the top before refreshing', (variant, method, expected) => {
    const { result, pressTab, onRefresh, scrollable } = setup({ focused: true, variant });
    act(() => {
      result.current.onScroll({ nativeEvent: { contentOffset: { y: 40 } } });
    });

    pressTab();

    expect(scrollable[method]).toHaveBeenCalledWith(expected);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
