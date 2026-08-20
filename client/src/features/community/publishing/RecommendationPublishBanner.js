import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { colors, contentPublishBannerStyles as styles } from '../../../styles';
import { locationErrorKind, locationErrorMessage } from '../../../utils/locationErrors';
import { useContentPublish } from './RecommendationPublishContext';

function publishErrorMessage(error) {
  return locationErrorKind(error) === 'unknown'
    ? error?.message || 'בדקו את החיבור ונסו שוב.'
    : locationErrorMessage(error);
}

function statusCopy(job, queuedCount) {
  const noun = job.contentType === 'route' ? 'הטיול' : 'ההמלצה';
  if (job.status === 'success') return job.contentType === 'route'
    ? 'הטיול פורסם בהצלחה'
    : 'ההמלצה פורסמה בהצלחה';
  if (job.status === 'failed') return `לא הצלחנו לפרסם את ${noun}`;
  if (job.stage === 'saving') return `שומר את ${noun}…`;
  if (job.stage === 'retrying') return 'מנסה שוב לפרסם…';
  if (job.stage === 'queued') return queuedCount > 1 ? `${queuedCount} פרסומים ממתינים` : `${noun} ממתין לפרסום…`;
  return queuedCount > 1 ? `מפרסם כעת, ${queuedCount - 1} נוספים ממתינים…` : `מעלה ומכין את ${noun}…`;
}
export default function RecommendationPublishBanner({ onReview }) {
  const insets = useSafeAreaInsets();
  const { activeJob, jobs, retry, discard } = useContentPublish();
  if (!activeJob) return null;

  const failed = activeJob.status === 'failed';
  const success = activeJob.status === 'success';
  const progress = Math.round(Math.max(0, Math.min(1, activeJob.progress || 0)) * 100);
  const confirmDiscard = () => Alert.alert(
    'מחיקת הפרסום?',
    `${activeJob.contentType === 'route' ? 'הטיול' : 'ההמלצה'} והתמונות ששמרנו לפרסום יימחקו מהמכשיר.`,
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
      testID="content-publish-banner"
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
              {publishErrorMessage(activeJob.error)}
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
          {!activeJob.reviewRequired && activeJob.error?.details?.retryable !== false ? (
            <TouchableOpacity style={styles.primaryAction} onPress={() => retry(activeJob.id)} testID="publish-retry">
              <AppText style={styles.primaryActionText}>נסו שוב</AppText>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.action} onPress={() => onReview?.(activeJob.id, activeJob.contentType)} testID="publish-review">
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
