import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

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
    <View style={styles.userItem}>
      {/* תמונת פרופיל */}
      {item.photoURL ? (
        <Image source={{ uri: item.photoURL }} style={styles.userAvatar} />
      ) : (
        <View style={[styles.userAvatar, styles.avatarPlaceholder]}>
          <Text style={styles.avatarInitial}>
            {item.displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}

      {/* שם המשתמש */}
      <Text style={styles.userName}>{item.displayName}</Text>

      {/* אייקון לב קטן */}
      <Ionicons name="heart" size={16} color="#EF4444" />
    </View>
  );

  // מה להציג כשאין לייקים
  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={48} color="#D1D5DB" />
      <Text style={styles.emptyText}>No likes yet</Text>
      <Text style={styles.emptySubtext}>Be the first to like this!</Text>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* לחיצה על הרקע סוגרת את ה-Modal */}
        <TouchableOpacity 
          style={styles.overlayTouchable} 
          activeOpacity={1} 
          onPress={onClose} 
        />
        
        <View style={styles.container}>
          {/* Handle bar */}
          <View style={styles.handleBar} />

          <View style={styles.header}>
            <Text style={styles.title}>
              {likedByUserIds?.length || 0} Likes
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : (
              <FlatList
                data={users}
                renderItem={renderUserItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={renderEmptyList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={users.length === 0 && styles.emptyListContainer}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    minHeight: '40%',
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: '#D1D5DB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    position: 'relative',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  closeButton: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 14,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarPlaceholder: {
    backgroundColor: '#E0E7FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#4F46E5',
    fontWeight: 'bold',
    fontSize: 16,
  },
  userName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyListContainer: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
});

export default LikesModal;