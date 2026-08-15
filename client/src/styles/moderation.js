import { StyleSheet } from 'react-native';
import { colors } from './colors';
import { fontFamilies } from './typography';

export const moderationStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '88%' },
  header: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { color: colors.textPrimary, fontFamily: fontFamilies.bold, fontSize: 22, textAlign: 'right' },
  subtitle: { color: colors.textSecondary, fontFamily: fontFamilies.regular, fontSize: 14, textAlign: 'right', marginBottom: 12 },
  category: { minHeight: 48, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14, paddingHorizontal: 14, marginBottom: 8, flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  categorySelected: { borderColor: colors.primary, backgroundColor: '#EFF6FF' },
  categoryText: { flex: 1, color: colors.textPrimary, fontFamily: fontFamilies.semiBold, textAlign: 'right' },
  input: { minHeight: 92, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 14, padding: 12, textAlign: 'right', writingDirection: 'rtl', fontFamily: fontFamilies.regular, marginTop: 6 },
  count: { color: colors.textSecondary, fontSize: 12, textAlign: 'left', marginVertical: 5 },
  submit: { minHeight: 50, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: colors.white, fontFamily: fontFamilies.bold, fontSize: 16 },
  reportButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexDirection: 'row-reverse', gap: 5 },
  reportLabel: { color: colors.textSecondary, fontFamily: fontFamilies.semiBold, fontSize: 13 },
});
