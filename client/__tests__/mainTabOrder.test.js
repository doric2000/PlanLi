import { getVisibleMainTabNames } from '../src/navigation/mainTabOrder';

describe('main tab order', () => {
  it('keeps four destinations; Create is an integrated action between Favorites and Community', () => {
    expect(getVisibleMainTabNames(true)).toEqual(['Profile', 'Favorites', 'Community', 'Home']);
    expect(getVisibleMainTabNames(false)).toEqual(['Auth', 'Favorites', 'Community', 'Home']);
  });
});
