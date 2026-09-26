import { StackRouter, CommonActions } from '@react-navigation/routers';
import { getActionFromState } from '@react-navigation/core';
import { sharedTripLinking } from '../src/navigation/sharedTripLinking';

const options = { routeNames: ['Main', 'SharedTrip', 'RouteDetail', 'RecommendationDetail'],
  routeParamList: {}, routeGetIdList: {} };

describe.each(['trip/' + 'x'.repeat(43), 'route/route-1', 'recommendation/rec-1'])('public link %s', path => {
  it('returns to the main tabs after a cold start', () => {
    const router = StackRouter({ initialRouteName: 'Main' });
    const state = router.getRehydratedState(sharedTripLinking.getStateFromPath(path), options);
    const back = router.getStateForAction(state, CommonActions.goBack(), options);
    expect(back).not.toBeNull();
    expect(back.routes[back.index].name).toBe('Main');
  });

  it('navigates without resetting an already running app', () => {
    const action = getActionFromState(sharedTripLinking.getStateFromPath(path), sharedTripLinking.config);
    expect(action.type).toBe('NAVIGATE');
    const router = StackRouter({ initialRouteName: 'Main' });
    const initial = router.getInitialState(options);
    const state = router.getStateForAction(initial, action, options);
    expect(state.routes[0].key).toBe(initial.routes[0].key);
    expect(state.routes[state.index].params).toEqual(action.payload.params);
  });
});
