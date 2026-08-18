import { MAIN_TAB_TRANSITION_OPTIONS } from '../src/navigation/mainTabTransition';

describe('main tab transition', () => {
  it('uses React Navigation fade without a custom scene transform', () => {
    expect(MAIN_TAB_TRANSITION_OPTIONS).toEqual({ animation: 'fade' });
    expect(MAIN_TAB_TRANSITION_OPTIONS).not.toHaveProperty('sceneStyleInterpolator');
    expect(MAIN_TAB_TRANSITION_OPTIONS).not.toHaveProperty('transitionSpec');
  });
});
