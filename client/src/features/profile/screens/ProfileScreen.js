/**
 * Screen for displaying and editing user profile.
 * Shows user stats, avatar, smart profile badges, credibility, and settings options.
 *
 * @param {Object} navigation - Navigation object.
 */
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

import { auth, db } from '../../../config/firebase';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { signOut, updateProfile } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  serverTimestamp,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage';

import appConfig from '../../../../app.json';
import { colors, common, cards, buttons, typography } from '../../../styles';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';

// ✅ Smart Profile option maps (from your Step 1 file)
import {
  TRAVEL_STYLES,
  TRIP_TYPES,
  INTERESTS,
  CONSTRAINTS,
} from '../constants/smartProfileOptions';

const labelMapFromOptions = (arr) =>
  (arr || []).reduce((acc, it) => {
    acc[it.value] = it.label;
    return acc;
  }, {});

const TRAVEL_STYLE_LABEL = labelMapFromOptions(TRAVEL_STYLES);
const TRIP_TYPE_LABEL = labelMapFromOptions(TRIP_TYPES);
const INTEREST_LABEL = labelMapFromOptions(INTERESTS);
const CONSTRAINT_LABEL = labelMapFromOptions(CONSTRAINTS);

// Credibility helpers (inline to keep it self-contained + modular)
function calculateCredibilityScore({ recommendationsCount, likesReceived }) {
  const rec = Number(recommendationsCount || 0);
  const likes = Number(likesReceived || 0);
  return rec * 10 + likes * 2;
}
function getCredibilityLevelLabel(score) {
  // simple leveling: every 50 points -> +1 level (feel free to adjust)
  const s = Number(score || 0);
  const level = Math.max(1, Math.floor(s / 50) + 1);
  return `Level ${level} Traveler`;
}

function Badge({ text, variant = 'default' }) {
  const bg =
    variant === 'verified'
      ? colors.accent
      : variant === 'muted'
      ? colors.card
      : colors.card;

  const border =
    variant === 'verified' ? colors.accent : colors.border;

  const textColor =
    variant === 'verified' ? colors.white : colors.textPrimary;

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: border,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: textColor, fontSize: 12, fontWeight: '600' }}>
        {text}
      </Text>
    </View>
  );
}

const ProfileScreen = ({ navigation }) => {
  const { user } = useCurrentUser();

  // Image picker with upload hook (SOLID-based composition)
  const { pickImage, uploadImage, uploading } = useImagePickerWithUpload({
    storagePath: 'profilePicture',
    aspect: [1, 1],
    quality: 0.7,
  });

  const uid = user?.uid;

  // state for user data from Firestore
  const [userData, setUserData] = useState({
    displayName: 'Traveler',
    photoURL: null,
    email: user?.email || '',
    isExpert: false,
    smartProfile: null,
  });

  const [stats, setStats] = useState({
    trips: 0,
    reviews: 0,
    photos: 0,
    likesReceived: 0,
    credibilityScore: 0,
    credibilityLabel: 'Level 1 Traveler',
  });

  const [loading, setLoading] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);

  const userDocRef = useMemo(() => (uid ? doc(db, 'users', uid) : null), [uid]);


  // Fetch user + stats (refresh on focus too)
  const fetchAllProfileData = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      // ---------------------------
      // 1) User doc
      // ---------------------------
      let data = null;
      if (userDocRef) {
        const userDoc = await getDoc(userDocRef);
        data = userDoc.exists() ? userDoc.data() : null;
      }

      const resolvedDisplayName =
        data?.displayName ||
        data?.fullName ||
        user?.displayName ||
        'Traveler';

      const resolvedPhotoURL = data?.photoURL || user?.photoURL || null;

      const resolvedEmail = data?.email || user?.email || '';

      const resolvedIsExpert = Boolean(data?.isExpert);

      const resolvedSmartProfile = data?.smartProfile || null;

      setUserData({
        displayName: resolvedDisplayName,
        photoURL: resolvedPhotoURL,
        email: resolvedEmail,
        isExpert: resolvedIsExpert,
        smartProfile: resolvedSmartProfile,
      });

      // ---------------------------
      // 2) Real stats
      // ---------------------------
      // Trips count (routes where userId==uid)
      let tripsCount = 0;
      try {
        const tripsQ = query(
          collection(db, 'routes'),
          where('userId', '==', uid)
        );
        const tripsAgg = await getCountFromServer(tripsQ);
        tripsCount = tripsAgg.data().count || 0;
      } catch (e) {
        console.warn('Trips count failed:', e);
      }

      // Recommendations docs (for reviews + photos + likesReceived)
      let reviewsCount = 0;
      let photosCount = 0;
      let likesReceived = 0;

      try {
        const recQ = query(
          collection(db, 'recommendations'),
          where('userId', '==', uid)
        );
        const recSnap = await getDocs(recQ);

        reviewsCount = recSnap.size;

        recSnap.forEach((d) => {
          const r = d.data();
          const imgs = Array.isArray(r.images) ? r.images : [];
          photosCount += imgs.length;

          const likes = Number(r.likes || 0);
          likesReceived += likes;
        });
      } catch (e) {
        console.warn('Recommendations stats failed:', e);
      }

      const credibilityScore = calculateCredibilityScore({
        recommendationsCount: reviewsCount,
        likesReceived,
      });

      const credibilityLabel = getCredibilityLevelLabel(credibilityScore);

      setStats({
        trips: tripsCount,
        reviews: reviewsCount,
        photos: photosCount,
        likesReceived,
        credibilityScore,
        credibilityLabel,
      });
    } catch (error) {
      console.error('Error fetching profile data:', error);

      // fallback to Auth
      setUserData((prev) => ({
        ...prev,
        displayName: user?.displayName || prev.displayName,
        photoURL: user?.photoURL || prev.photoURL,
        email: user?.email || prev.email,
      }));
    } finally {
      setLoading(false);
    }
  }, [uid, user, userDocRef]);

  useEffect(() => {
    fetchAllProfileData();
  }, [fetchAllProfileData]);

  // refresh when screen focused (after editing profile)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchAllProfileData();
    });
    return unsubscribe;
  }, [navigation, fetchAllProfileData]);

  const handleSignOut = async () => {
    try {
      // Clear local “smart profile” state from memory
      setUserData({
        displayName: 'Traveler',
        photoURL: null,
        email: '',
        isExpert: false,
        smartProfile: null,
      });
      setStats({
        trips: 0,
        reviews: 0,
        photos: 0,
        likesReceived: 0,
        credibilityScore: 0,
        credibilityLabel: 'Level 1 Traveler',
      });

      await signOut(auth);

      navigation.reset({
        index: 0,
        routes: [{ name: 'Login' }],
      });
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out: ' + error.message);
    }
  };

  const handleProfilePictureUpload = async (uri) => {
    if (!uri || !auth.currentUser) return;

    try {
      // Delete old photo if exists
      if (userData.photoURL) {
        try {
          const storage = getStorage();
          const match = decodeURIComponent(userData.photoURL).match(/\/o\/(.+)\?/);
          if (match && match[1]) {
            const oldPath = match[1];
            const oldRef = storageRef(storage, oldPath);
            await deleteObject(oldRef);
          }
        } catch (err) {
          console.warn('Failed to delete old profile photo:', err);
        }
      }

      const downloadURL = await uploadImage(uri);
      if (!downloadURL) return;

      await updateProfile(auth.currentUser, { photoURL: downloadURL });

      const uRef = doc(db, 'users', uid);
      const uDoc = await getDoc(uRef);

      if (uDoc.exists()) {
        await updateDoc(uRef, {
          photoURL: downloadURL,
          updatedAt: serverTimestamp(),
        });
      } else {
        await setDoc(
          uRef,
          {
            uid,
            email: user?.email || '',
            displayName: user?.displayName || userData.displayName,
            photoURL: downloadURL,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      setUserData((prev) => ({ ...prev, photoURL: downloadURL }));

      Alert.alert('Success', 'Profile picture updated!');
    } catch (e) {
      console.error('Upload failed', e);
      Alert.alert('Error', 'Failed to upload profile picture.');
    }
  };

  const handlePickImage = () => {
    pickImage(handleProfilePictureUpload);
  };

  const navigateToStack = (screenName, params) => {
  // אם אנחנו בתוך Tabs, ה-parent הוא ה-Stack הראשי
  const parent = navigation.getParent?.();
  if (parent?.navigate) return parent.navigate(screenName, params);
  return navigation.navigate(screenName, params);
};

const handleMenuPress = (label) => {
  if (label === 'Edit Profile') {
    return navigateToStack('EditProfile');
  }

  if (label === 'Help & Support') {
    setSupportOpen(true);
    return;
  }

  Alert.alert('Coming soon', label);
};


  const menuItems = [
    { icon: 'person-outline', label: 'Edit Profile' },
    { icon: 'settings-outline', label: 'Settings' },
    { icon: 'notifications-outline', label: 'Notifications' },
    { icon: 'help-circle-outline', label: 'Help & Support' },
  ];

  // Render smart profile badges
  const smartBadges = useMemo(() => {
    const sp = userData.smartProfile;
    if (!sp) return [];

    const badges = [];

    if (sp.travelStyle) badges.push(TRAVEL_STYLE_LABEL[sp.travelStyle] || sp.travelStyle);
    if (sp.tripType) badges.push(TRIP_TYPE_LABEL[sp.tripType] || sp.tripType);

    const ints = Array.isArray(sp.interests) ? sp.interests : [];
    ints.forEach((v) => badges.push(INTEREST_LABEL[v] || v));

    const cons = Array.isArray(sp.constraints) ? sp.constraints : [];
    cons.forEach((v) => badges.push(CONSTRAINT_LABEL[v] || v));

    return badges;
  }, [userData.smartProfile]);

  if (loading) {
    return (
      <SafeAreaView style={common.container}>
        <View style={common.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={common.container}>
      <ScrollView contentContainerStyle={common.profileScrollContent}>
        {/* Profile Header */}
        <View style={common.profileHeader}>
          <View style={common.profileAvatarContainer}>
            {userData.photoURL ? (
              <Image source={{ uri: userData.photoURL }} style={common.profileAvatar} />
            ) : (
              <View style={[common.profileAvatar, common.profileAvatarPlaceholder]}>
                <Text style={common.profileAvatarText}>
                  {userData.displayName?.charAt(0)?.toUpperCase() || 'T'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handlePickImage}
              style={buttons.editAvatarBadge}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="camera" size={14} color={colors.white} />
              )}
            </TouchableOpacity>
          </View>

          <Text style={typography.profileName}>{userData.displayName}</Text>
          <Text style={typography.profileEmail}>{userData.email}</Text>

          {/* Credibility + Verified */}
          <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Badge text={stats.credibilityLabel} variant="muted" />
            {userData.isExpert ? <Badge text="Verified" variant="verified" /> : null}
          </View>

          {/* Smart Profile badges */}
          {smartBadges.length > 0 ? (
            <View style={{ flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
              {smartBadges.map((b, idx) => (
                <Badge key={`${b}-${idx}`} text={b} />
              ))}
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => handleMenuPress('Edit Profile')}
              style={{ marginTop: 10 }}
              activeOpacity={0.85}
            >
              <Text style={{ color: colors.accent, fontWeight: '600' }}>
                Set your Smart Profile →
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Stats Section */}
        <View style={cards.profileStats}>
          <View style={cards.profileStatItem}>
            <Text style={typography.profileStatNumber}>{stats.trips}</Text>
            <Text style={typography.profileStatLabel}>Trips</Text>
          </View>

          <View style={cards.profileStatDivider} />

          <View style={cards.profileStatItem}>
            <Text style={typography.profileStatNumber}>{stats.reviews}</Text>
            <Text style={typography.profileStatLabel}>Reviews</Text>
          </View>

          <View style={cards.profileStatDivider} />

          <View style={cards.profileStatItem}>
            <Text style={typography.profileStatNumber}>{stats.photos}</Text>
            <Text style={typography.profileStatLabel}>Photos</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={cards.profileMenu}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={cards.profileMenuItem}
              onPress={() => handleMenuPress(item.label)}
              activeOpacity={0.85}
            >
              <View style={cards.profileMenuItemLeft}>
                <Ionicons name={item.icon} size={22} color={colors.textSecondary} />
                <Text style={typography.profileMenuItemText}>{item.label}</Text>
              </View>

              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={buttons.signOut} onPress={handleSignOut}>
          <MaterialIcons name="logout" size={20} color={colors.error} />
          <Text style={buttons.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={typography.profileVersion}>Version {appConfig.expo.version}</Text>
      </ScrollView>

      {/* Help & Support Modal */}
      <Modal
        visible={supportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSupportOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: colors.background, borderRadius: 16, padding: 16 }}>
            <Text style={[typography.sectionTitle, { marginBottom: 8 }]}>
              Help & Support
            </Text>

            <Text style={{ color: colors.textSecondary, lineHeight: 20 }}>
              PlanLi Team Support{'\n'}
              • Contact: support@planli.app{'\n'}
              • FAQ: Coming soon{'\n'}
              • Report a bug: Coming soon
            </Text>

            <TouchableOpacity
              style={[buttons.primary, { marginTop: 14 }]}
              onPress={() => setSupportOpen(false)}
              activeOpacity={0.85}
            >
              <Text style={buttons.primaryText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

export default ProfileScreen;
