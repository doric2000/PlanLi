import {
  getFabBottomInset,
  getTabOverlayBottomInset,
} from '../src/navigation/tabBarLayout';

describe('floating tab layout', () => {
  it('keeps overlays above the tab bar with and without a device inset', () => {
    expect(getTabOverlayBottomInset({ bottom: 0 })).toBe(92);
    expect(getTabOverlayBottomInset({ bottom: 34 })).toBe(116);
    expect(getFabBottomInset({ bottom: 0 })).toBe(92);
  });
});
