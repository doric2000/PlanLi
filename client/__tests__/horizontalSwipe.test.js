import {
  createSwipeNavigationCoordinator,
  getAdjacentSwipeIndex,
  getAdjacentSwipeItem,
  getCommittedSwipeDirection,
  navigateToAdjacentSwipeItem,
  resolveAdjacentSwipe,
  shouldCaptureHorizontalSwipe,
} from '../src/navigation/horizontalSwipe';

describe('horizontal swipe navigation', () => {
  it('captures only intentional horizontal movement', () => {
    expect(shouldCaptureHorizontalSwipe({ dx: 12, dy: 4 })).toBe(true);
    expect(shouldCaptureHorizontalSwipe({ dx: 10, dy: 1 })).toBe(false);
    expect(shouldCaptureHorizontalSwipe({ dx: 20, dy: 18 })).toBe(false);
  });

  it('commits by distance or velocity but ignores short slow drags', () => {
    expect(getCommittedSwipeDirection({ dx: -48, vx: 0.1 })).toBe('left');
    expect(getCommittedSwipeDirection({ dx: 18, vx: 0.5 })).toBe('right');
    expect(getCommittedSwipeDirection({ dx: -30, vx: -0.2 })).toBeNull();
  });

  it('moves one physical bottom-navigation tab without wrapping', () => {
    expect(resolveAdjacentSwipe({
      activeIndex: 2,
      itemCount: 5,
      gestureState: { dx: -60, vx: -0.2 },
    })).toBe(3);
    expect(resolveAdjacentSwipe({
      activeIndex: 4,
      itemCount: 5,
      gestureState: { dx: -60, vx: -0.2 },
    })).toBe(4);
    expect(getAdjacentSwipeItem({
      items: [{ name: 'Favorites' }, { name: 'Routes' }, { name: 'Community' }],
      activeIndex: 1,
      gestureState: { dx: -60, vx: -0.2 },
    })).toEqual({ name: 'Community' });
  });

  it('navigates adjacent bottom tabs without requiring navigation.emit', () => {
    const navigation = {
      getState: () => ({
        index: 1,
        routes: [{ name: 'Favorites' }, { name: 'Routes' }, { name: 'Community' }],
      }),
      navigate: jest.fn(),
    };

    expect(() => navigateToAdjacentSwipeItem({
      navigation,
      gestureState: { dx: -60, vx: -0.2 },
    })).not.toThrow();
    expect(navigation.navigate).toHaveBeenCalledWith('Community', undefined);
  });

  it('serializes overlapping swipe navigation until the target is focused', () => {
    let state = {
      index: 1,
      routes: [
        { key: 'favorites', name: 'Favorites' },
        { key: 'routes', name: 'Routes' },
        { key: 'community', name: 'Community' },
      ],
    };
    const navigation = {
      getState: () => state,
      navigate: jest.fn(),
    };
    const coordinator = createSwipeNavigationCoordinator();

    expect(coordinator.navigate({
      navigation,
      gestureState: { dx: -60, vx: -0.2 },
    })).toEqual(state.routes[2]);
    expect(coordinator.navigate({
      navigation,
      gestureState: { dx: -60, vx: -0.2 },
    })).toBeNull();
    expect(navigation.navigate).toHaveBeenCalledTimes(1);

    state = { ...state, index: 2 };
    coordinator.confirmState(state);
    expect(coordinator.hasPendingNavigation()).toBe(false);
    expect(coordinator.navigate({
      navigation,
      gestureState: { dx: 60, vx: 0.2 },
    })).toEqual(state.routes[1]);
    expect(navigation.navigate).toHaveBeenCalledTimes(2);

    coordinator.dispose();
  });

  it('recovers the swipe coordinator if navigation never focuses its target', () => {
    jest.useFakeTimers();
    const navigation = {
      getState: () => ({
        index: 0,
        routes: [
          { key: 'home', name: 'Home' },
          { key: 'community', name: 'Community' },
        ],
      }),
      navigate: jest.fn(),
    };
    const coordinator = createSwipeNavigationCoordinator({ pendingTimeoutMs: 100 });

    coordinator.navigate({ navigation, gestureState: { dx: -60, vx: -0.2 } });
    expect(coordinator.hasPendingNavigation()).toBe(true);
    jest.advanceTimersByTime(100);
    expect(coordinator.hasPendingNavigation()).toBe(false);
    coordinator.navigate({ navigation, gestureState: { dx: -60, vx: -0.2 } });
    expect(navigation.navigate).toHaveBeenCalledTimes(2);

    coordinator.dispose();
    jest.useRealTimers();
  });

  it('follows the reversed Favorites visual order one category at a time', () => {
    const recommendationsIndex = resolveAdjacentSwipe({
      activeIndex: 2,
      itemCount: 4,
      gestureState: { dx: -60, vx: -0.2 },
      swipeLeftDelta: -1,
    });
    expect(recommendationsIndex).toBe(1);
    expect(resolveAdjacentSwipe({
      activeIndex: recommendationsIndex,
      itemCount: 4,
      gestureState: { dx: -60, vx: -0.2 },
      swipeLeftDelta: -1,
    })).toBe(0);
    expect(getAdjacentSwipeIndex({
      activeIndex: 0,
      itemCount: 4,
      direction: 'left',
      swipeLeftDelta: -1,
    })).toBe(0);
  });
});
