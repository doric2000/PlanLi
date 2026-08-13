import { getVisibleMainTabNames } from '../src/navigation/mainTabOrder';

describe('main tab order', () => {
  it('keeps Profile for authenticated users and Auth for guests', () => {
    expect(getVisibleMainTabNames(true)).toEqual([
      'Profile', 'Favorites', 'Routes', 'Community', 'Home',
    ]);
    expect(getVisibleMainTabNames(false)).toEqual([
      'Auth', 'Favorites', 'Routes', 'Community', 'Home',
    ]);
  });
});
