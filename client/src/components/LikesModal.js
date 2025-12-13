import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { common, colors } from '../styles';
import { Avatar } from './Avatar';

/**
 * LikesModal - A reusable modal to display users who liked a post.
 * 
 * This component shows a bottom sheet modal with a list of users who
 * liked any piece of content (recommendations, routes, etc.)
 * 
 * USE THIS COMPONENT anywhere you need to show who liked something.
 * 
 * @param {boolean} visible - Controls visibility of the modal
 * @param {Function} onClose - Callback to close the modal
 * @param {string[]} likedByUserIds - Array of user IDs who liked the post
 * 
 * @example
 * <LikesModal
 *   visible={showLikes}
 *   onClose={() => setShowLikes(false)}
 *   likedByUserIds={likedByList}
 * />
 */
const LikesModal = ({ visible, onClose, likedByUserIds }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!visible || !likedByUserIds || likedByUserIds.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const userPromises = likedByUserIds.map(async (userId) => {
          try {
            const userDocRef = doc(db, 'users', userId);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
              const userData = userDoc.data();
              return {
                id: userId,
                displayName: userData.displayName || userData.fullName || 'Traveler',
                photoURL: userData.photoURL || null,
              };
            } else {
              return {
                id: userId,
                displayName: 'Traveler',
                photoURL: null,
              };
            }
          } catch (error) {
            console.log('Error fetching user:', userId, error);
            return {
              id: userId,
              displayName: 'Traveler',
              photoURL: null,
            };
          }
        });

        const fetchedUsers = await Promise.all(userPromises);
        setUsers(fetchedUsers);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [visible, likedByUserIds]);

  const renderUserItem = ({ item }) => (
    <View style={common.userItem}>
      <Avatar photoURL={item.photoURL} displayName={item.displayName} size={44} />
      <Text style={common.userNameText}>{item.displayName}</Text>
      <Ionicons name="heart" size={16} color={colors.heart} />
    </View>
  );

  const renderEmptyList = () => (
    <View style={common.emptyContainer}>
      <Ionicons name="heart-outline" size={48} color="#D1D5DB" />
      <Text style={common.emptyText}>No likes yet</Text>
      <Text style={common.emptySubtext}>Be the first to like this!</Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={common.modalOverlay}>
        <TouchableOpacity 
          style={common.overlayTouchable} 
          activeOpacity={1} 
          onPress={onClose} 
        />
        
        <View style={common.likesModalContainer}>
          <View style={common.handleBar} />

          <View style={common.likesHeader}>
            <Text style={common.likesTitle}>
              {likedByUserIds?.length || 0} לייקים
            </Text>
            <TouchableOpacity onPress={onClose} style={common.likesCloseButton}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={common.likesContent}>
            {loading ? (
              <View style={common.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={common.loadingText}>Loading...</Text>
              </View>
            ) : (
              <FlatList
                data={users}
                renderItem={renderUserItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={renderEmptyList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={users.length === 0 && common.emptyListContainer}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default LikesModal;
