import React from 'react';
import { ActivityIndicator, TouchableOpacity, View } from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { colors } from '../styles';
import { guidedFormStyles as styles } from './guidedFormStyles';

export function GuidedFormHeader({ currentStep, totalSteps, title, intro, testID }) {
  const progress = Math.max(0, Math.min(1, currentStep / Math.max(1, totalSteps)));
  return (
    <View style={styles.introCard} testID={testID}>
      <AppText style={styles.eyebrow}>חלק {currentStep} מתוך {totalSteps}</AppText>
      <AppText style={styles.title}>{title}</AppText>
      {!!intro && <AppText style={styles.intro}>{intro}</AppText>}
      <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: totalSteps, now: currentStep }}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

export function GuidedFormSection({
  id,
  index,
  title,
  summary,
  expanded,
  completed,
  errorCount = 0,
  onToggle,
  onContinue,
  continueLabel = 'המשך',
  children,
  testIDPrefix = 'guided-section',
}) {
  const hasErrors = errorCount > 0;
  const statusSummary = hasErrors
    ? `${errorCount === 1 ? 'שדה אחד דורש תיקון' : `${errorCount} שדות דורשים תיקון`}`
    : summary;
  return (
    <View
      style={[
        styles.section,
        completed && styles.sectionComplete,
        hasErrors && styles.sectionError,
      ]}
      testID={`${testIDPrefix}-${id}`}
    >
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: Boolean(expanded) }}
        accessibilityLabel={`${title}, ${statusSummary || 'טרם הושלם'}`}
        activeOpacity={0.75}
      >
        <View style={styles.sectionCopy}>
          <View style={styles.sectionTitleRow}>
            <View style={[
              styles.sectionIndex,
              completed && styles.sectionIndexComplete,
              hasErrors && styles.sectionIndexError,
            ]}>
              <AppText style={styles.sectionIndexText}>{completed && !hasErrors ? '✓' : index}</AppText>
            </View>
            <AppText style={styles.sectionTitle}>{title}</AppText>
          </View>
          <AppText
            style={[styles.sectionSummary, hasErrors && styles.sectionSummaryError]}
            numberOfLines={expanded ? 2 : 1}
          >
            {statusSummary || 'טרם הושלם'}
          </AppText>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={hasErrors ? colors.error : colors.textSecondary}
        />
      </TouchableOpacity>
      {expanded ? (
        <View style={styles.sectionBody}>
          {children}
          {!!onContinue && (
            <TouchableOpacity
              style={styles.continueButton}
              onPress={onContinue}
              accessibilityRole="button"
              testID={`${testIDPrefix}-${id}-continue`}
            >
              <AppText style={styles.continueText}>{continueLabel}</AppText>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

export function GuidedFormFooter({ label, onPress, loading, disabled, testID }) {
  return (
    <SafeAreaInsetsContext.Consumer>
      {(insets) => (
        <View style={[styles.footer, { paddingBottom: Math.max(insets?.bottom || 0, 12) }]}>
          <View style={styles.footerInner}>
            <TouchableOpacity
              style={[styles.submitButton, disabled && styles.submitButtonDisabled]}
              onPress={onPress}
              disabled={disabled}
              accessibilityRole="button"
              testID={testID}
            >
              {loading ? <ActivityIndicator color={colors.white} /> : <AppText style={styles.submitText}>{label}</AppText>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaInsetsContext.Consumer>
  );
}
