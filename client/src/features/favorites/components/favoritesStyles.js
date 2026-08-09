import { StyleSheet } from 'react-native';
import { colors, layout, spacing } from '../../../styles';

export const favoritesStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  headerTabs: { marginHorizontal: layout.screenPadding, marginTop: spacing.md, marginBottom: spacing.md },
  listContent: {
    width: '100%',
    maxWidth: layout.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 118,
  },
  gridRow: { flexDirection: 'row-reverse', justifyContent: 'flex-start' },
  tileWrap: { padding: 2 },
  destinationWrap: { padding: 6 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export function getGridTileWidth(width, columns, outerPadding = 8) {
  const contentWidth = Math.min(Number(width) || 390, layout.contentMaxWidth) - outerPadding;
  return Math.max(1, contentWidth / columns);
}
