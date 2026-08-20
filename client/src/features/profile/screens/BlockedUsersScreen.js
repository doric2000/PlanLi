import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import AppText from '../../../components/AppText';
import { Avatar } from '../../../components/Avatar';
import { useAuth } from '../../auth/AuthContext';
import { useBlockedUsers } from '../../moderation/BlockedUsersContext';
import { setBlockedUser } from '../../../services/SocialService';
import { useUserData } from '../../../hooks/useUserData';
import { settingsScreenStyles as styles } from '../../../styles';

function BlockedUserRow({ userId, blocked, onUnblock }) {
  const { displayName, loading: loadingProfile } = useUserData(userId);
  const isProcessing = blocked.has(userId);

  return (
    <View style={styles.blockedUserRow} testID={`blocked-user-row-${userId}`}>
      <Avatar displayName={displayName} size={40} />
      <View style={styles.blockedUserContent}>
        <AppText style={styles.blockedUserName}>
          {loadingProfile ? 'טוען...' : displayName}
        </AppText>
        <AppText style={styles.blockedUserId} numberOfLines={1}>{userId}</AppText>
      </View>
      <TouchableOpacity
        style={[styles.unblockButton, isProcessing && styles.unblockButtonDisabled]}
        onPress={() => onUnblock(userId)}
        disabled={isProcessing}
        testID={`unblock-user-${userId}`}
      >
        {isProcessing ? (
          <ActivityIndicator size="small" color="#B42318" />
        ) : (
          <AppText style={styles.unblockButtonText}>הסר חסימה</AppText>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function BlockedUsersScreen({ navigation }) {
  const [blocked, setBlocked] = useState(() => new Set());
  const { blockedUserIds } = useBlockedUsers();
  const { handleCallableAuthError } = useAuth();
  const blockedUsers = useMemo(() => Array.from(blockedUserIds).sort(), [blockedUserIds]);

  const updateBlocked = useCallback((userId, value) => {
    setBlocked((current) => {
      const next = new Set(current);
      if (value) {
        next.add(userId);
        return next;
      }
      next.delete(userId);
      return next;
    });
  }, []);

  const removeBlocked = useCallback((blockedUid) => {
    Alert.alert(
      'הסרת חסימה',
      'להסיר את החסימה הזאת? יופיעו שוב הפרסומים שלו.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'הסר חסימה',
          style: 'destructive',
          onPress: async () => {
            updateBlocked(blockedUid, true);
            try {
              await setBlockedUser(blockedUid, false);
            } catch (error) {
              if (!handleCallableAuthError(error)) {
                Alert.alert('לא ניתן להסיר', 'החסימה לא הוסרה כרגע. נסה שוב.');
              }
            } finally {
              updateBlocked(blockedUid, false);
            }
          },
        },
      ],
      { cancelable: false }
    );
  }, [handleCallableAuthError, updateBlocked]);

  return (
    <SafeAreaView style={styles.safe} testID="blocked-users-screen">
      <View style={styles.header}>
        <View style={styles.rightSpacer} />
        <AppText style={styles.headerTitle}>משתמשים שחסמת</AppText>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          activeOpacity={0.8}
          testID="blocked-users-back-button"
        >
          <Ionicons name="arrow-forward" size={22} color="#111" />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        {blockedUsers.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <AppText style={styles.emptyStateTitle}>אין משתמשים חסומים</AppText>
            <AppText style={styles.emptyStateText}>
              כשתחסום משתמש, הוא יופיע כאן כדי שניתן להסיר אותו בעתיד.
            </AppText>
          </View>
        ) : (
          <FlatList
            data={blockedUsers}
            renderItem={({ item }) => <BlockedUserRow userId={item} blocked={blocked} onUnblock={removeBlocked} />}
            keyExtractor={(item) => item}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          />
        )}
      </View>
    </SafeAreaView>
  );
}
