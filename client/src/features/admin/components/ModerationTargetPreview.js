import React, { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';

import AppText from '../../../components/AppText';
import { adminStyles as styles } from '../../../styles';

const COLLAPSE_THRESHOLD = 220;

function destinationLabel(destination) {
  return [destination?.cityName, destination?.countryName].filter(Boolean).join(', ');
}

export default function ModerationTargetPreview({ preview }) {
  const [expanded, setExpanded] = useState(false);
  const destination = useMemo(() => destinationLabel(preview?.destination), [preview?.destination]);

  const hasSnapshot = Boolean(preview?.title || preview?.text || preview?.imageUrl);
  if (!preview?.available && !hasSnapshot) {
    return (
      <View style={[styles.preview, styles.previewUnavailable]} testID="moderation-target-preview-unavailable">
        <AppText style={styles.previewTitle}>התוכן אינו זמין יותר</AppText>
        <AppText style={styles.previewMeta}>אפשר עדיין לעיין בפרטי הדיווח ולקבל החלטה מנהלית.</AppText>
      </View>
    );
  }

  const text = typeof preview.text === 'string' ? preview.text : '';
  const canExpand = text.length > COLLAPSE_THRESHOLD;
  const author = preview.author?.displayName || '';

  return (
    <View style={styles.preview} testID="moderation-target-preview">
      {!preview.available ? (
        <View style={styles.previewMissingNotice} testID="moderation-target-preview-missing-notice">
          <AppText style={styles.previewMissingNoticeText}>התוכן המקורי אינו זמין יותר — מוצגת הגרסה שנשמרה בזמן הדיווח.</AppText>
        </View>
      ) : null}
      {preview.imageUrl ? (
        <Image
          source={{ uri: preview.imageUrl }}
          style={styles.previewImage}
          resizeMode="cover"
          testID="moderation-target-preview-image"
        />
      ) : null}
      <View style={styles.previewContent}>
        <AppText style={styles.previewTitle}>{preview.title || 'תוכן ללא כותרת'}</AppText>
        {author || destination ? (
          <AppText style={styles.previewMeta}>
            {[author, destination].filter(Boolean).join(' · ')}
          </AppText>
        ) : null}
        {text ? (
          <AppText
            style={styles.previewText}
            numberOfLines={expanded ? undefined : 3}
            testID="moderation-target-preview-text"
          >
            {text}
          </AppText>
        ) : null}
        {preview.mediaCount > 1 ? (
          <AppText style={styles.previewMeta}>בפוסט יש {preview.mediaCount} פריטי מדיה</AppText>
        ) : null}
        {canExpand ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'צמצום תצוגת התוכן' : 'הצגת הטקסט המלא'}
            onPress={() => setExpanded((current) => !current)}
            style={styles.previewToggle}
            testID="moderation-target-preview-toggle"
          >
            <AppText style={styles.previewToggleText}>{expanded ? 'צמצום' : 'הצגת הטקסט המלא'}</AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
