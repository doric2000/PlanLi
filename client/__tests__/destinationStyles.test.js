import { createDestinationStyles } from '../src/features/destination/components/destinationStyles';

test('destination hero is edge-to-edge with rounded bottom corners only', () => {
  const styles = createDestinationStyles(390, { top: 44, bottom: 0 });

  expect(styles.header).toEqual(expect.objectContaining({
    width: '100%',
    maxWidth: '100%',
  }));
  expect(styles.header.paddingTop).toBeUndefined();
  expect(styles.header.paddingHorizontal).toBeUndefined();

  expect(styles.hero).toEqual(expect.objectContaining({
    width: '100%',
    height: 288,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  }));
  expect(styles.hero.borderRadius).toBeUndefined();
  expect(styles.hero.borderTopLeftRadius).toBeUndefined();
  expect(styles.hero.borderTopRightRadius).toBeUndefined();
  expect(styles.actionButton.top).toBe(52);
});
