import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from '../../../components/AppText';
import { colors, contentPublishBannerStyles as styles } from '../../../styles';
import { locationErrorKind, locationErrorMessage } from '../../../utils/locationErrors';
import { travelMediaErrorMessage } from '../../../utils/travelMediaErrors';
import { useContentPublish } from './RecommendationPublishContext';
import { useOptionalRegionSelection } from '../../region/context/RegionSelectionState';
import { getRegionById, isRegionDiscoveryEnabled } from '../../region/regionDefinitions';

export function publishErrorMessage(job) {
  const error = job?.error;
  if (error?.details?.reason === 'invalid_external_url') {
    return 'הקישור שצורף אינו תקין. פתחו עריכה, תקנו או הסירו אותו ופרסמו מחדש.';
  }
  if (error?.details?.reason === 'RECOMMENDATION_DRAFT_NOT_FOUND') {
    return 'לא הצלחנו לשחזר את טיוטת הפרסום. פתחו עריכה ונסו לפרסם מחדש.';
  }
  if (locationErrorKind(error) !== 'unknown') return locationErrorMessage(error);
  return travelMediaErrorMessage(error) ||
    error?.message ||
    'הפרסום נשמר במכשיר. בדקו את החיבור ונסו שוב.';
}

function statusCopy(job, queuedCount) {
  const noun = job.contentType === 'route' ? 'המסלול' : 'ההמלצה';
  if (job.status === 'success' && job.result?.publicationStatus === 'moderation_hold') {
    return job.contentType === 'route' ? 'המסלול נשלח לבדיקה' : 'ההמלצה נשלחה לבדיקה';
  }
  if (job.status === 'success' && job.result?.publicationStatus !== 'active') {
    return job.contentType === 'route'
      ? 'המסלול נשמר, סטטוס הפרסום בבדיקה'
      : 'ההמלצה נשמרה, סטטוס הפרסום בבדיקה';
  }
  if (job.status === 'success') return job.contentType === 'route'
    ? 'המסלול פורסם בהצלחה'
    : 'ההמלצה פורסמה בהצלחה';
  if (job.status === 'failed') return `לא הצלחנו לפרסם את ${noun}`;
  if (job.stage === 'preparing') return `מכין את התמונות של ${noun}…`;
  if (job.stage === 'saving') return `שומר את ${noun}…`;
  if (job.stage === 'retrying') return 'מנסה שוב לפרסם…';
  if (job.stage === 'queued') return queuedCount > 1 ? `${queuedCount} פרסומים ממתינים` : `${noun} ממתין לפרסום…`;
  return queuedCount > 1 ? `מפרסם כעת, ${queuedCount - 1} נוספים ממתינים…` : `מעלה ומכין את ${noun}…`;
}
export default function RecommendationPublishBanner({ onReview, onView, onChooseRegion }) {
  const insets = useSafeAreaInsets();
  const { activeJob, bannerJobCount, beginReview, retry, discard } = useContentPublish();
  const { selectedRegionId, selectRegion } = useOptionalRegionSelection();
  if (!activeJob) return null;

  const failed = activeJob.status === 'failed';
  const success = activeJob.status === 'success';
  const pendingReview = success && activeJob.result?.publicationStatus === 'moderation_hold';
  const unknownOutcome = success && !['active', 'moderation_hold'].includes(
    activeJob.result?.publicationStatus
  );
  const progress = Math.round(Math.max(0, Math.min(1, activeJob.progress || 0)) * 100);
  const publishedRegionIds = activeJob.contentType === 'route'
    ? activeJob.result?.discoveryRegionIds || []
    : [activeJob.result?.discoveryRegionId].filter(Boolean);
  const publishedOutsideRegion = isRegionDiscoveryEnabled() && success
    && activeJob.result?.publicationStatus === 'active'
    && publishedRegionIds.length > 0
    && !publishedRegionIds.includes(selectedRegionId);
  const publishedRegionLabels = publishedRegionIds.map((id) => getRegionById(id)?.label).filter(Boolean);
  const switchPublishedRegion = async () => {
    if (publishedRegionIds.length !== 1) {
      onChooseRegion?.();
      return;
    }
    try {
      await selectRegion(publishedRegionIds[0]);
    } catch {
      Alert.alert('לא הצלחנו להחליף אזור', 'הבחירה לא נשמרה. אפשר לנסות שוב בעוד רגע.');
    }
  };
  const confirmDiscard = () => Alert.alert(
    'מחיקת הפרסום?',
    `${activeJob.contentType === 'route' ? 'המסלול' : 'ההמלצה'} והתמונות ששמרנו לפרסום יימחקו מהמכשיר.`,
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
        success && !pendingReview && !unknownOutcome && styles.bannerSuccess,
        success && (pendingReview || unknownOutcome) && styles.bannerPending,
      ]}
      accessibilityLiveRegion="polite"
      testID="content-publish-banner"
    >
      <View style={styles.contentRow}>
        <Ionicons
          name={failed
            ? 'alert-circle'
            : pendingReview || unknownOutcome
              ? 'time-outline'
              : success
                ? 'checkmark-circle'
                : 'cloud-upload-outline'}
          size={22}
          color={failed ? colors.error : pendingReview || unknownOutcome ? '#9A6700' : success ? '#177245' : colors.primary}
        />
        <View style={styles.copy}>
          <AppText style={styles.title}>{statusCopy(activeJob, bannerJobCount)}</AppText>
          {pendingReview ? (
            <AppText style={styles.pendingText}>הפרסום עדיין לא מוצג לציבור ויופיע באזור „בבדיקה” בפרופיל.</AppText>
          ) : unknownOutcome ? (
            <AppText style={styles.pendingText}>לא קיבלנו אישור שהפרסום ציבורי. אפשר לרענן את הפרופיל ולבדוק שוב.</AppText>
          ) : publishedOutsideRegion ? (
            <AppText style={styles.pendingText}>התוכן פורסם ב{publishedRegionLabels.join(' וב')} ולא יוצג באזור הנוכחי.</AppText>
          ) : null}
          {failed ? (
            <AppText style={styles.errorText} numberOfLines={2}>
              {publishErrorMessage(activeJob)}
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
          <TouchableOpacity
            style={styles.action}
            onPress={() => {
              beginReview(activeJob.id);
              onReview?.(activeJob.id, activeJob.contentType);
            }}
            testID="publish-review"
          >
            <AppText style={styles.actionText}>עריכה</AppText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.action} onPress={confirmDiscard} testID="publish-discard">
            <AppText style={[styles.actionText, styles.discardText]}>מחיקה</AppText>
          </TouchableOpacity>
        </View>
      ) : publishedOutsideRegion ? (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryAction} onPress={() => onView?.(activeJob)} testID="publish-view-content">
            <AppText style={styles.primaryActionText}>צפייה בתוכן</AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.action}
            onPress={switchPublishedRegion}
            testID="publish-switch-region"
          >
            <AppText style={styles.actionText}>{publishedRegionIds.length === 1 ? 'החלפת אזור' : 'בחירת אזור'}</AppText>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
