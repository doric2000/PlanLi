import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { getPersonalizationReasonPresentation } from '../constants/travelPresentation';
import { colors } from '../styles/colors';
import { fontFamilies } from '../styles/typography';
import AppText from './AppText';

export default function PreferenceContextLine({ reasonCode, style, textStyle, iconSize = 15 }) {
  const presentation = getPersonalizationReasonPresentation(reasonCode);
  if (!presentation) return null;

  return (
    <View style={[styles.row, style]} testID="preference-context-line">
      <MaterialIcons
        name={presentation.icon}
        size={iconSize}
        color={colors.textSecondary}
      />
      <AppText style={[styles.text, textStyle]} numberOfLines={1}>
        {presentation.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 22,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  text: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
