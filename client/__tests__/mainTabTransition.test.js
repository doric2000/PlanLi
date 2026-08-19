import { MAIN_TAB_TRANSITION_OPTIONS } from '../src/navigation/mainTabTransition';

describe('main tab transition', () => {
  it('keeps focused tab visibility independent from interruptible animations', () => {
    expect(MAIN_TAB_TRANSITION_OPTIONS).toEqual({ animation: 'none' });
    expect(MAIN_TAB_TRANSITION_OPTIONS).not.toHaveProperty('sceneStyleInterpolator');
    expect(MAIN_TAB_TRANSITION_OPTIONS).not.toHaveProperty('transitionSpec');
  });
});
