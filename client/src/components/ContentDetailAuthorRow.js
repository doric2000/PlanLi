import React from 'react';
import { Pressable, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import AppText from './AppText';
import { Avatar } from './Avatar';
import { colors } from '../styles';
import { formatTimestamp } from '../utils/formatTimestamp';

export default function ContentDetailAuthorRow({
  author,
  ownerId,
  canEdit,
  onEdit,
  navigation,
  styles,
  editTestID,
  fallbackName = 'מטייל/ת PlanLi',
}) {
  const displayName = author?.displayName || fallbackName;
  const dateLabel = formatTimestamp(author?.contentCreatedAt);

  return (
    <View style={styles.authorRow}>
      <Pressable
        style={styles.authorButton}
        onPress={() => ownerId && navigation.navigate('UserProfile', { uid: ownerId })}
        disabled={!ownerId}
        accessibilityRole="button"
        accessibilityLabel={`פתיחת הפרופיל של ${displayName}`}
      >
        <Avatar
          photoURL={author?.photoURL}
          photoMedia={author?.photoMedia}
          displayName={displayName}
          size={48}
        />
        <View style={styles.authorCopy}>
          <AppText style={styles.authorName} numberOfLines={1}>{displayName}</AppText>
          {!!dateLabel && <AppText style={styles.authorDate}>{dateLabel}</AppText>}
        </View>
      </Pressable>

      {canEdit ? (
        <Pressable
          style={styles.editButton}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel="עריכת התוכן"
          testID={editTestID}
        >
          <MaterialIcons name="edit" size={17} color={colors.primary} />
          <AppText style={styles.editText}>עריכה</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
