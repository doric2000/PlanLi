import React, { useEffect, useState } from 'react';
import {
	ActivityIndicator,
	FlatList,
	Modal,
	TouchableOpacity,
	View,
} from 'react-native';
import AppText from "./AppText";
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { common, colors } from '../styles';
import { Avatar } from './Avatar';

const LikesModal = ({ visible, onClose, collectionName, itemId, likeCount = 0 }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!visible || !collectionName || !itemId) {
      setUsers([]);
      return () => { active = false; };
    }
    setLoading(true);
    getDocs(query(
      collection(db, collectionName, itemId, 'likes'),
      orderBy('createdAt', 'desc'),
      limit(30)
    )).then((snapshot) => {
      if (!active) return;
      setUsers(snapshot.docs.map((entry) => ({
        id: entry.id,
        displayName: entry.data()?.userPreview?.displayName || 'Traveler',
        photoURL: entry.data()?.userPreview?.photoURL || null,
      })));
    }).catch((error) => {
      console.error('Error fetching likes:', error);
      if (active) setUsers([]);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [collectionName, itemId, visible]);

  const renderUser = ({ item }) => (
    <View style={common.userItem}>
      <Avatar photoURL={item.photoURL} displayName={item.displayName} size={44} />
      <AppText style={common.userNameText}>{item.displayName}</AppText>
      <Ionicons name="heart" size={16} color={colors.heart} />
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={common.modalOverlay}>
        <TouchableOpacity style={common.overlayTouchable} activeOpacity={1} onPress={onClose} />
        <View style={common.likesModalContainer}>
          <View style={common.handleBar} />
          <View style={common.likesHeader}>
            <AppText style={common.likesTitle}>{likeCount} לייקים</AppText>
            <TouchableOpacity onPress={onClose} style={common.likesCloseButton}>
              <Ionicons name="close" size={24} color="#374151" />
            </TouchableOpacity>
          </View>
          <View style={common.likesContent}>
            {loading ? (
              <View style={common.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
              </View>
            ) : (
              <FlatList
                data={users}
                renderItem={renderUser}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={<AppText style={common.emptyText}>אין עדיין לייקים</AppText>}
                showsVerticalScrollIndicator={false}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default LikesModal;
