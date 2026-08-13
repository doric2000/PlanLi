import {
  getAdjacentSwipeIndex,
  getAdjacentSwipeItem,
  getCommittedSwipeDirection,
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
