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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../config/firebase';

// Components
import ScreenHeader from '../../../components/ScreenHeader';
import BackButton from '../../../components/BackButton';
import NotificationCard from '../components/NotificationCard';

// Hooks
import { useNotifications } from '../hooks/useNotifications';
import { useClearNotifications } from '../hooks/useClearNotifications';

// Styles
import { notifications as notificationStyles } from '../../../styles';

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

    // Fetch the full post data from Firestore
    try {
      if (postType === PostType.RECOMMENDATION) {
        const docRef = doc(db, 'recommendations', postId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const item = { id: docSnap.id, ...docSnap.data() };
          navigation.navigate('RecommendationDetail', { item });
        } else {
          Alert.alert('Error', 'This post no longer exists.');
        }
      } else if (postType === PostType.ROUTE) {
        const docRef = doc(db, 'routes', postId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const routeData = { id: docSnap.id, ...docSnap.data() };
          navigation.navigate('RouteDetail', { routeData });
        } else {
          Alert.alert('Error', 'This route no longer exists.');
        }
      }
    } catch (error) {
      console.error('Error fetching post data:', error);
      Alert.alert('Error', 'Failed to load the post. Please try again.');
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
    <View style={notificationStyles.emptyContainer}>
      <Ionicons name="notifications-off-outline" size={80} color="#6C757D" />
      <Text style={notificationStyles.emptyTitle}>No Notifications</Text>
      <Text style={notificationStyles.emptySubtitle}>
        When someone likes or comments on your posts, you'll see it here
      </Text>
    </View>
  );

  // Header right component - Clear all button
  const renderHeaderRight = () => {
    if (notifications.length === 0) return null;

    return (
      <TouchableOpacity
        style={notificationStyles.clearButton}
        onPress={handleClearAll}
        disabled={clearing}
      >
        {clearing ? (
          <ActivityIndicator size="small" color="#1E3A5F" />
        ) : (
          <>
            <Ionicons name="trash-outline" size={18} color="#1E3A5F" />
            <Text style={notificationStyles.clearButtonText}>Clear All</Text>
          </>
        )}
      </TouchableOpacity>
    );
  };

  // Header left component - Back button
  const renderHeaderLeft = () => {
    return <BackButton color="dark" variant="ghost" />;
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
      <SafeAreaView style={notificationStyles.screenContainer}>
        <ScreenHeader title="Notifications" renderLeft={renderHeaderLeft} />
        <View style={notificationStyles.loadingCenter}>
          <ActivityIndicator size="large" color="#1E3A5F" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={notificationStyles.screenContainer}>
      {/* Header */}
      <ScreenHeader
        title="Notifications"
        subtitle={
          notifications.length > 0
            ? `${notifications.length} notification${notifications.length > 1 ? 's' : ''}`
            : 'Stay updated with your posts'
        }
        renderRight={renderHeaderRight}
        renderLeft={renderHeaderLeft}
      />

      {/* Notifications List */}
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={renderNotificationItem}
        contentContainerStyle={
          notifications.length === 0 ? notificationStyles.emptyListContainer : notificationStyles.listContainer
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
