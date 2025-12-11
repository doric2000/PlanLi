import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommentsSection } from './CommentSection';
import { colors, common } from '../styles';

/**
 * CommentsModal - A reusable modal component for displaying and managing comments.
 * 
 * This component provides a slide-up modal that contains the full comments experience,
 * including viewing existing comments and adding new ones.
 * 
 * USE THIS COMPONENT when you need to show comments for any post/item in the app.
 * Simply manage the visibility state and pass the post ID.
 * 
 * @param {boolean} visible - Controls whether the modal is shown or hidden
 * @param {function} onClose - Function to call when user closes the modal (X button or back)
 * @param {string} postId - The unique ID of the post/recommendation to load comments for
 * @param {string} collectionName - Firebase collection name (default: 'recommendations')
 * 
 * @example
 * // In your screen:
 * const [showComments, setShowComments] = useState(false);
 * const [selectedId, setSelectedId] = useState(null);
 * 
 * <CommentsModal
 *   visible={showComments}
 *   onClose={() => setShowComments(false)}
 *   postId={selectedId}
 * />
 */
export const CommentsModal = ({ 
  visible, 
  onClose, 
  postId, 
  collectionName = 'recommendations' 
}) => {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={common.modalOverlay}>
        <View style={common.modalContentTall}>
          <View style={common.modalHeader}>
            <Text style={common.modalTitle}>Comments</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
          
          {postId && (
            <CommentsSection 
              collectionName={collectionName} 
              postId={postId} 
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

export default CommentsModal;
