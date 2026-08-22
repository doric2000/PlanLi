import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppText from './AppText';
import { CommentsSection } from './CommentSection';
import { colors, commentStyles as styles } from '../styles';

export const CommentsModal = ({
  visible,
  onClose,
  postId,
  collectionName = 'recommendations',
  initialCommentId = null,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
      >
        <Pressable style={styles.overlay} onPress={onClose} testID="comments-backdrop">
          <Pressable
            style={styles.sheet}
            onPress={(event) => event.stopPropagation?.()}
            testID="comments-sheet"
          >
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerSide} />
              <AppText style={styles.headerTitle}>תגובות</AppText>
              <Pressable
                style={styles.headerSide}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="סגירת תגובות"
                testID="comments-close"
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </Pressable>
            </View>
            {visible && postId ? (
              <CommentsSection
                collectionName={collectionName}
                postId={postId}
                initialCommentId={initialCommentId}
                bottomInset={insets.bottom}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default CommentsModal;
