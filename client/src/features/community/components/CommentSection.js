import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, 
  addDoc, 
  query,
  getDoc,
  doc,
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../../../config/firebase';
import { common } from '../../../styles';

/**
 * Component representing a single comment item.
 * @param {Object} props
 * @param {Object} props.item - The comment data object.
 */
const CommentItem = ({ item }) => {
    const [userData, setUserData] = useState({ name: 'טוען...', photo: null });

    useEffect(() => {
        const fetchUser = async () => {
            if (!item.userId) return;
            const snap = await getDoc(doc(db, 'users', item.userId));
            if (snap.exists()) setUserData({ 
                name: snap.data().displayName, 
                photo: snap.data().photoURL 
            });
        };
        fetchUser();
    }, [item.userId]);

    return (
        <View style={common.commentItem}>
            <Image source={{ uri: userData.photo || 'https://via.placeholder.com/40' }} style={common.commentAvatar} />
            <View style={common.commentContent}>
                <Text style={common.commentUserName}>{userData.name}</Text>
                <Text style={common.commentText}>{item.text}</Text>
            </View>
        </View>
    );
};

/**
 * Main component for the comments section.
 * Handles fetching, adding, and displaying comments for a specific post.
 *
 * @param {Object} props
 * @param {string} props.collectionName - Name of the Firestore collection (e.g., 'recommendations').
 * @param {string} props.postId - ID of the post to fetch comments for.
 */
const CommentsSection = ({ collectionName, postId }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // 1. הוספנו State לניהול המיון (ברירת מחדל: הכי חדש ראשון)
  const [isNewestFirst, setIsNewestFirst] = useState(true);

  // האזנה לפיירבייס
  useEffect(() => {
    if (!postId || !collectionName) return;

    const commentsRef = collection(db, collectionName, postId, 'comments');
    // אנחנו מושכים הכל, המיון לתצוגה יקרה אצלנו בקוד
    const q = query(commentsRef, orderBy('createdAt', 'desc')); 

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(fetchedComments);
    });

    return () => unsubscribe(); 
  }, [postId, collectionName]);

  // 2. פונקציה למיון הרשימה לפני התצוגה
  const getSortedComments = () => {
    // יוצרים עותק וממיינים
    return [...comments].sort((a, b) => {
        // המרת ה-Timestamp למספרים לצורך השוואה
        // (הגנה מפני null במקרה שהשרת עוד לא עדכן את הזמן)
        const dateA = a.createdAt?.seconds || 0;
        const dateB = b.createdAt?.seconds || 0;

        if (isNewestFirst) {
            return dateB - dateA; // חדש למעלה
        } else {
            return dateA - dateB; // ישן למעלה
        }
    });
  };

  const handleAddComment = async () => {
    if (newComment.trim() === '') return;
    if (!auth.currentUser) {
        Alert.alert("שגיאה", "עליך להתחבר כדי להגיב");
        return;
    }

    setSubmitting(true);
    try {
      const commentsRef = collection(db, collectionName, postId, 'comments');
      
      await addDoc(commentsRef, {
        text: newComment,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });

      setNewComment('');
    } catch (error) {
      console.error("Error adding comment:", error);
      Alert.alert("שגיאה", "לא ניתן היה לשלוח את התגובה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={common.commentSection}>
      
      {/* 3. שינינו את הכותרת שתכלול גם את הכפתור */}
      <View style={common.commentHeaderContainer}>
          <Text style={common.commentHeaderTitle}>תגובות ({comments.length})</Text>
          
          <TouchableOpacity onPress={() => setIsNewestFirst(!isNewestFirst)}>
            <Text style={common.commentSortText}>
                {isNewestFirst ? 'הצג לפי: הכי חדש ⬇' : 'הצג לפי: הכי ישן ⬆'}
            </Text>
          </TouchableOpacity>
      </View>

      {/* רשימת התגובות - משתמשים בפונקציית המיון */}
      <FlatList
        data={getSortedComments()} 
        renderItem={({ item }) => <CommentItem item={item} />}
        keyExtractor={item => item.id}
        style={common.commentList}
        nestedScrollEnabled={true}
      />

      {/* שורת כתיבת תגובה (נשארה זהה) */}
      <View style={common.commentInputContainer}>
        <Image 
          source={{ uri: auth.currentUser?.photoURL || 'https://via.placeholder.com/40' }} 
          style={common.commentInputAvatar} 
        />
        <TextInput
          style={common.commentInput}
          placeholder="כתוב תגובה..."
          value={newComment}
          onChangeText={setNewComment}
          multiline
        />
        <TouchableOpacity 
          style={[common.commentSendButton, (!newComment.trim() || submitting) && common.commentSendDisabled]} 
          onPress={handleAddComment}
          disabled={!newComment.trim() || submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default CommentsSection;
