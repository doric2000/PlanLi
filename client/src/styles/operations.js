import { StyleSheet } from 'react-native';
import { colors } from './colors';

export default StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background || '#F5F7FA' },
  list: { padding: 18, paddingBottom: 140, gap: 12 },
  banner: { position: 'absolute', left: 16, right: 16, zIndex: 2100, elevation: 22,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#DCE4EC',
    shadowColor: '#142B45', shadowOpacity: 0.13, shadowRadius: 14, shadowOffset: { width: 0, height: 3 } },
  card: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#DCE4EC', gap: 8 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  copy: { flex: 1, gap: 6 },
  title: { color: colors.primary, fontSize: 16, fontWeight: '700', textAlign: 'right', writingDirection: 'rtl' },
  detail: { color: '#526477', fontSize: 14, textAlign: 'right', writingDirection: 'rtl' },
  error: { color: '#B42318' },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.primary, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  track: { height: 5, backgroundColor: '#E5EDF3', borderRadius: 3, overflow: 'hidden', flexDirection: 'row-reverse' },
  fill: { height: 5, backgroundColor: colors.primary },
  empty: { padding: 32, textAlign: 'center', color: '#526477' },
});
