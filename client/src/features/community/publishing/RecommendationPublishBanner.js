import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { colors, fontFamilies } from '../../../styles';
import { useRecommendationPublish } from './RecommendationPublishContext';

function statusCopy(job, queuedCount) {
  if (job.status === 'success') return 'ההמלצה פורסמה בהצלחה';
  if (job.status === 'failed') return 'לא הצלחנו לפרסם את ההמלצה';
  if (job.stage === 'saving') return 'שומר את ההמלצה…';
  if (job.stage === 'retrying') return 'מנסה שוב לפרסם…';
  if (job.stage === 'queued') return queuedCount > 1 ? `ממתינות לפרסום ${queuedCount} המלצות` : 'ההמלצה ממתינה לפרסום…';
  return queuedCount > 1 ? `מפרסם המלצה, ${queuedCount - 1} נוספות ממתינות…` : 'מעלה ומכין את ההמלצה…';
}

export default function RecommendationPublishBanner({ onReview }) {
  const insets = useSafeAreaInsets();
  const { activeJob, jobs, retry, discard } = useRecommendationPublish();
  if (!activeJob) return null;

  const failed = activeJob.status === 'failed';
  const success = activeJob.status === 'success';
  const progress = Math.round(Math.max(0, Math.min(1, activeJob.progress || 0)) * 100);
  const confirmDiscard = () => Alert.alert(
    'מחיקת הפרסום?',
    'ההמלצה והתמונות ששמרנו לפרסום יימחקו מהמכשיר.',
    [
      { text: 'ביטול', style: 'cancel' },
      { text: 'מחיקה', style: 'destructive', onPress: () => discard(activeJob.id) },
    ]
  );

  return (
    <View
      style={[
        styles.banner,
        { bottom: Math.max(insets.bottom, 10) + 82 },
        failed && styles.bannerFailed,
        success && styles.bannerSuccess,
      ]}
      accessibilityLiveRegion="polite"
      testID="recommendation-publish-banner"
    >
      <View style={styles.contentRow}>
        <Ionicons
          name={failed ? 'alert-circle' : success ? 'checkmark-circle' : 'cloud-upload-outline'}
          size={22}
          color={failed ? colors.error : success ? '#177245' : colors.primary}
        />
        <View style={styles.copy}>
          <AppText style={styles.title}>{statusCopy(activeJob, jobs.length)}</AppText>
          {failed ? (
            <AppText style={styles.errorText} numberOfLines={1}>
              {activeJob.error?.message || 'בדקו את החיבור ונסו שוב.'}
            </AppText>
          ) : !success ? (
            <View
              style={styles.progressTrack}
              testID="publish-progress"
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: progress }}
            >
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          ) : null}
        </View>
      </View>

      {failed ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryAction} onPress={() => retry(activeJob.id)} testID="publish-retry">
            <AppText style={styles.primaryActionText}>נסו שוב</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={() => onReview?.(activeJob.id)} testID="publish-review">
            <AppText style={styles.actionText}>עריכה</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={confirmDiscard} testID="publish-discard">
            <AppText style={[styles.actionText, styles.discardText]}>מחיקה</AppText>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 1000,
    elevation: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(30,58,95,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  bannerFailed: { borderColor: 'rgba(196,52,52,0.28)', backgroundColor: '#FFF9F9' },
  bannerSuccess: { borderColor: 'rgba(23,114,69,0.24)', backgroundColor: '#F7FFF9' },
  contentRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10 },
  copy: { flex: 1, gap: 7 },
  title: { textAlign: 'right', color: colors.textPrimary, fontSize: 14, fontFamily: fontFamilies.semiBold },
  errorText: { textAlign: 'right', color: colors.textMuted, fontSize: 12 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: '#E6EAF0', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
  actions: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 10 },
  action: { paddingHorizontal: 10, paddingVertical: 7 },
  primaryAction: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.primary },
  actionText: { color: colors.primary, fontSize: 13, fontFamily: fontFamilies.semiBold },
  primaryActionText: { color: '#FFFFFF', fontSize: 13, fontFamily: fontFamilies.semiBold },
  discardText: { color: colors.error },
});
