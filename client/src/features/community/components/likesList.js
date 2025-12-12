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
import { db } from '../../../config/firebase';
import { common } from '../../../styles';
import { Avatar } from '../../../components/Avatar';

/**
 * Modal to display a list of users who liked a post.
 *
 * @param {Object} props
 * @param {boolean} props.visible - Controls visibility of the modal.
 * @param {Function} props.onClose - Callback to close the modal.
 * @param {string[]} props.likedByUserIds - Array of user IDs who liked the post.
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

  // פונקציה להצגת כל משתמש ברשימה
  const renderUserItem = ({ item }) => (
    <View style={common.userItem}>
      {/* תמונת פרופיל */}
      <Avatar photoURL={item.photoURL} displayName={item.displayName} size={44} />

      {/* שם המשתמש */}
      <Text style={common.userNameText}>{item.displayName}</Text>

      {/* אייקון לב קטן */}
      <Ionicons name="heart" size={16} color="#EF4444" />
    </View>
  );

  // מה להציג כשאין לייקים
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
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={common.modalOverlay}>
        {/* לחיצה על הרקע סוגרת את ה-Modal */}
        <TouchableOpacity 
          style={common.overlayTouchable} 
          activeOpacity={1} 
          onPress={onClose} 
        />
        
        <View style={common.likesModalContainer}>
          {/* Handle bar */}
          <View style={common.handleBar} />

          <View style={common.likesHeader}>
            <Text style={common.likesTitle}>
              {likedByUserIds?.length || 0} Likes
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