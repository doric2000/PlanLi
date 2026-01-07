/**
 * NotificationScreen.js
 * 
 * Main notification screen displaying all user notifications.
 * 
 * Features:
 * - FlatList with notification cards
 * - Pull-to-refresh functionality
 * - Clear all notifications button
 * - Empty state when no notifications
 * - Navigation to posts when tapping notifications
 * - Real-time updates via Firestore listener
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

// Components
import ScreenHeader from '../../../components/ScreenHeader';
import NotificationCard from '../components/NotificationCard';

// Hooks
import { useNotifications } from '../hooks/useNotifications';
import { useClearNotifications } from '../hooks/useClearNotifications';

// Models
import { PostType } from '../models/NotificationModel';

export default function NotificationScreen() {
  const navigation = useNavigation();
  const { notifications, loading, refreshing, refresh } = useNotifications();
  const { clearAll, markAsRead, clearing } = useClearNotifications();

  // Handle notification press - navigate to the post
  const handleNotificationPress = async (notification) => {
    const { postType, postId, id } = notification;

    // Mark as read
    try {
      await markAsRead(id);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }

    // Navigate to the appropriate screen
    if (postType === PostType.RECOMMENDATION) {
      // Navigate to RecommendationDetail
      navigation.navigate('RecommendationDetail', { recommendationId: postId });
    } else if (postType === PostType.ROUTE) {
      // Navigate to RouteDetail
      navigation.navigate('RouteDetail', { routeId: postId });
    }
  };

  // Handle clear all notifications
  const handleClearAll = () => {
    Alert.alert(
      'Clear All Notifications',
      'Are you sure you want to clear all notifications? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              const count = await clearAll();
              if (count > 0) {
                Alert.alert('Success', `Cleared ${count} notification${count > 1 ? 's' : ''}`);
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to clear notifications. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Empty state component
  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="notifications-off-outline" size={80} color="#6C757D" />
      <Text style={styles.emptyTitle}>No Notifications</Text>
      <Text style={styles.emptySubtitle}>
        When someone likes or comments on your posts, you'll see it here
      </Text>
    </View>
  );

  // Header right component - Clear all button
  const renderHeaderRight = () => {
    if (notifications.length === 0) return null;

    return (
      <TouchableOpacity
        style={styles.clearButton}
        onPress={handleClearAll}
        disabled={clearing}
      >
        {clearing ? (
          <ActivityIndicator size="small" color="#1E3A5F" />
        ) : (
          <>
            <Ionicons name="trash-outline" size={18} color="#1E3A5F" />
            <Text style={styles.clearButtonText}>Clear All</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  // Render notification item
  const renderNotificationItem = ({ item }) => (
    <NotificationCard
      notification={item}
      onPress={handleNotificationPress}
      onMarkAsRead={markAsRead}
    />
  );

  // Loading state
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ScreenHeader title="Notifications" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1E3A5F" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <ScreenHeader
        title="Notifications"
        subtitle={
          notifications.length > 0
            ? `${notifications.length} notification${notifications.length > 1 ? 's' : ''}`
            : 'Stay updated with your posts'
        }
        renderRight={renderHeaderRight}
      />

      {/* Notifications List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotificationItem}
        contentContainerStyle={
          notifications.length === 0 ? styles.emptyListContainer : styles.listContainer
        }
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={['#1E3A5F']}
            tintColor="#1E3A5F"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  listContainer: {
    paddingVertical: 8,
  },
  emptyListContainer: {
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A5F',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6C757D',
    textAlign: 'center',
    lineHeight: 20,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E3A5F',
  },
});
