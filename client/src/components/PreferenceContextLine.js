import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getPersonalizationReasonPresentation } from '../constants/travelPresentation';
import { colors } from '../styles/colors';
import { fontFamilies } from '../styles/typography';
import AppText from './AppText';
import PersonalizationReasonSheet from './PersonalizationReasonSheet';

export default function PreferenceContextLine({
  reasonCode,
  personalization,
  target,
  item,
  style,
  textStyle,
  iconSize = 15,
}) {
  const [visible, setVisible] = useState(false);
  const primaryReason = personalization?.reasons?.[0] || reasonCode;
  const presentation = getPersonalizationReasonPresentation(primaryReason);
  if (!presentation) return null;

  const isInteractive = Boolean(personalization?.reasons?.length && target?.id);
  const content = (
    <>
      <MaterialIcons
        name={presentation.icon}
        size={iconSize}
        color={isInteractive ? colors.primary : colors.textSecondary}
      />
      <AppText style={[styles.text, textStyle, isInteractive && styles.interactiveText]} numberOfLines={1}>
        {presentation.label}
      </AppText>
      {isInteractive ? (
        <MaterialIcons name="help-outline" size={iconSize} color={colors.primary} />
      ) : null}
    </>
  );

  return (
    <>
      {isInteractive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${presentation.label}. מידע נוסף`}
          hitSlop={6}
          onPress={(event) => {
            event?.stopPropagation?.();
            setVisible(true);
          }}
          style={[styles.row, styles.interactive, style]}
          testID="preference-context-line"
        >
          {content}
        </Pressable>
      ) : (
        <View style={[styles.row, style]} testID="preference-context-line">{content}</View>
      )}
      {isInteractive && visible ? (
        <PersonalizationReasonSheet
          visible={visible}
          onClose={() => setVisible(false)}
          personalization={personalization}
          target={target}
          item={item}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 28,
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  interactive: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: colors.surfaceSubtle,
  },
  interactiveText: { color: colors.primary },
  text: {
    flexShrink: 1,
    color: colors.textSecondary,
    fontFamily: fontFamilies.regular,
    fontSize: 13,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
