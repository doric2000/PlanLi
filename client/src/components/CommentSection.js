import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { db, auth } from '../config/firebase';

// --- רכיב תגובה (נשאר בדיוק כמו שכתבת) ---
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
        <View style={styles.commentItem}>
            <Image source={{ uri: userData.photo || 'https://via.placeholder.com/40' }} style={styles.avatar} />
            <View style={styles.commentContent}>
                <Text style={styles.userName}>{userData.name}</Text>
                <Text style={styles.commentText}>{item.text}</Text>
            </View>
        </View>
    );
};

// --- הרכיב הראשי ---
export default function CommentsSection({ collectionName, postId }) {
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
    <View style={styles.container}>
      
      {/* 3. שינינו את הכותרת שתכלול גם את הכפתור */}
      <View style={styles.headerContainer}>
          <Text style={styles.headerTitle}>תגובות ({comments.length})</Text>
          
          <TouchableOpacity onPress={() => setIsNewestFirst(!isNewestFirst)}>
            <Text style={styles.sortButtonText}>
                {isNewestFirst ? 'הצג לפי: הכי חדש ⬇' : 'הצג לפי: הכי ישן ⬆'}
            </Text>
          </TouchableOpacity>
      </View>

      {/* רשימת התגובות - משתמשים בפונקציית המיון */}
      <FlatList
        data={getSortedComments()} 
        renderItem={({ item }) => <CommentItem item={item} />}
        keyExtractor={item => item.id}
        style={styles.list}
        nestedScrollEnabled={true}
      />

      {/* שורת כתיבת תגובה (נשארה זהה) */}
      <View style={styles.inputContainer}>
        <Image 
          source={{ uri: auth.currentUser?.photoURL || 'https://via.placeholder.com/40' }} 
          style={styles.inputAvatar} 
        />
        <TextInput
          style={styles.input}
          placeholder="כתוב תגובה..."
          value={newComment}
          onChangeText={setNewComment}
          multiline
        />
        <TouchableOpacity 
          style={[styles.sendButton, (!newComment.trim() || submitting) && styles.disabledButton]} 
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

const styles = StyleSheet.create({
  container: {
    marginTop: 20,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
  },
  // 4. עדכון סטיילים לכותרת החדשה
  headerContainer: {
    flexDirection: 'row-reverse', // כותרת מימין, כפתור משמאל
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333'
  },
  sortButtonText: {
    fontSize: 14,
    color: '#2EC4B6', // צבע תואם לכפתור השליחה
    fontWeight: '600'
  },
  list: {
    maxHeight: 300,
  },
  commentItem: {
    flexDirection: 'row-reverse', // RTL
    marginBottom: 15,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: 10,
    backgroundColor: '#eee'
  },
  commentContent: {
    flex: 1,
    backgroundColor: '#f5f7fa',
    borderRadius: 12,
    padding: 10,
    borderTopRightRadius: 2,
  },
  userName: {
    fontWeight: 'bold',
    fontSize: 13,
    color: '#333',
    textAlign: 'right' // RTL
  },
  commentText: {
    fontSize: 14,
    color: '#444',
    textAlign: 'right', // RTL
    marginTop: 2
  },
  
  // Input Styles
  inputContainer: {
    flexDirection: 'row-reverse', // RTL
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  inputAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginLeft: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#f0f2f5',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    fontSize: 14,
    textAlign: 'right', // RTL
    maxHeight: 80,
    marginLeft: 10,
  },
  sendButton: {
    backgroundColor: '#2EC4B6',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    backgroundColor: '#ccc',
  }
});