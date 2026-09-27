import { createDestinationStyles } from '../src/features/destination/components/destinationStyles';
test('city content remains inside narrow widths and clears the tab overlay', () => {
  const styles = createDestinationStyles(320, { top: 59, bottom: 34 });
  expect(styles.content.width).toBe('100%');
  expect(styles.content.paddingBottom).toBeGreaterThanOrEqual(34 + 70);
  expect(styles.quickCard.minWidth).toBe(0);
  expect(styles.factCopy.minWidth).toBe(0);
  expect(styles.hero.minHeight).toBeGreaterThanOrEqual(212);
  expect(styles.hero.height).toBeUndefined();
  expect(styles.hero.paddingHorizontal).toBeUndefined();
  expect(styles.heroContent.paddingTop).toBe(67);
  expect(styles.heroBackground).toEqual(expect.objectContaining({ top: 0, right: 0, bottom: 0, left: 0 }));
  expect(styles.heroImage).toEqual(expect.objectContaining({ top: 0, right: 0, bottom: 0, left: 0 }));
  expect(styles.heroImage.width).toBeUndefined();
  expect(styles.cityName.numberOfLines).toBeUndefined();
});
test('map has measurable dimensions and one accessible expansion target', () => {
  const styles = createDestinationStyles();
  expect(styles.mapFrame.height).toBe(220);
  expect(styles.mapCanvas).toEqual(expect.objectContaining({ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }));
  expect(styles.mapExpand.width).toBe(44);
  expect(styles.mapExpand.height).toBe(44);
});
