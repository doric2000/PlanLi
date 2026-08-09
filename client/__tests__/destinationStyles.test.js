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

test('quick facts share one restrained surface instead of separate cards', () => {
  const styles = createDestinationStyles(390, { top: 44, bottom: 0 });

  expect(styles.quickGrid).toEqual(expect.objectContaining({
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
  }));
  expect(styles.quickCard).toEqual(expect.objectContaining({
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
  }));
  expect(styles.quickCard.backgroundColor).toBeUndefined();
  expect(styles.quickCard.borderRadius).toBeUndefined();
  expect(styles.quickCard.shadowOpacity).toBeUndefined();
  expect(styles.factIcon.backgroundColor).toBeUndefined();
  expect(styles.factValue.fontFamily).toBe('Assistant_500Medium');
});
