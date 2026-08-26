import React from 'react';
import { View } from 'react-native';

import AppText from '../../../components/AppText';
import { CenteredRefreshState } from '../../../components/CenteredRefresh';
import { adminStyles as styles } from '../../../styles';
import AdminAction from './AdminAction';

export default function AdminAsyncState({ loading, error, empty, onRetry, testID, emptyText = 'אין פריטים להצגה כרגע.' }) {
  if (loading) return <CenteredRefreshState accessibilityLabel="טוען נתוני ניהול" testID={`${testID}-loading`} />;
  if (error) {
    return (
      <View style={styles.error} testID={`${testID}-error`}>
        <AppText style={styles.errorText}>{error}</AppText>
        {onRetry ? <AdminAction label="ניסיון נוסף" onPress={onRetry} testID={`${testID}-retry`} /> : null}
      </View>
    );
  }
  if (empty) return <View style={styles.empty} testID={`${testID}-empty`}><AppText style={styles.emptyText}>{emptyText}</AppText></View>;
  return null;
}
