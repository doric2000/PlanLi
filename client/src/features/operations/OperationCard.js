import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AppText from '../../components/AppText';
import styles from '../../styles/operations';
import { operationCopy, operationLabel, TERMINAL_STATES } from './operationModel';

export function OperationButton({ children, onPress, testID, label }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.button} testID={testID}>
    <AppText style={styles.buttonText}>{children}</AppText>
  </Pressable>;
}

export default function OperationCard({ entry, children, showTime = false }) {
  const failed = ['failed', 'uncertain'].includes(entry.status);
  const running = !TERMINAL_STATES.has(entry.status);
  const progress = entry.stage === 'uploading' && Number.isFinite(entry.progress) ? Math.round(entry.progress * 100) : null;
  return <View testID={`operation-${entry.id}`}>
    <View style={styles.row}>
      {running ? <ActivityIndicator color="#1E3A5F" /> : <Ionicons
        name={failed ? 'alert-circle-outline' : entry.status === 'review' ? 'time-outline' : 'checkmark-circle-outline'}
        size={24} color={failed ? '#B42318' : entry.status === 'review' ? '#9A6700' : '#177245'} />}
      <View style={styles.copy}>
        {running && <AppText style={styles.detail}>{operationLabel(entry)}</AppText>}
        <AppText style={[styles.title, failed && styles.error]}>{operationCopy(entry)}</AppText>
        {entry.message ? <AppText style={styles.detail}>{entry.message}</AppText> : null}
        {entry.refreshNeeded && <AppText style={styles.detail}>השמירה הושלמה. אפשר לרענן את הפרופיל להצגת העדכון.</AppText>}
        {progress != null && <View style={styles.track} accessibilityRole="progressbar"
          accessibilityLabel="התקדמות העלאת התמונות" accessibilityValue={{ min: 0, max: 100, now: progress }}>
          <View style={[styles.fill, { width: `${progress}%` }]} />
        </View>}
        {showTime && <AppText style={styles.detail}>{new Date(entry.updatedAt).toLocaleString('he-IL')}</AppText>}
      </View>
    </View>
    {children}
  </View>;
}
