
/**
 * Screen for displaying and editing user profile.
 * Shows user stats, avatar, and settings options.
 *
 * @param {Object} navigation - Navigation object.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, Image, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { auth, db } from '../../../config/firebase';
import { useCurrentUser } from '../../../hooks/useCurrentUser';
import { signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage';
import appConfig from '../../../../app.json';
import { colors, common, cards, buttons, typography } from '../../../styles';
import { useImagePickerWithUpload } from '../../../hooks/useImagePickerWithUpload';

const ProfileScreen = ({ navigation }) => {
    const { user } = useCurrentUser();

    // Image picker with upload hook (SOLID-based composition)
    const { pickImage, uploadImage, uploading } = useImagePickerWithUpload({
        storagePath: 'profilePicture',
        aspect: [1, 1],
        quality: 0.7,
    });

    // state for user data from Firebase Table
    const [userData, setUserData] = useState({
        displayName: 'Traveler',
        photoURL: null,
        email: user?.email || '',
    });
    const [loading, setLoading] = useState(true);

    // Extracting user date from Firestore.
    useEffect(() => {
        const fetchUserData = async () => {
            if (!user) {
                setLoading(false);
                return;
            }

            try {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const data = userDoc.data();
                    setUserData({
                        displayName: data.displayName || data.fullName || 'Traveler',
                        photoURL: data.photoURL || null,
                        email: data.email || user.email || '',
                    });
                } else {
                    // If no document in Firestore, use Auth data as fallback
                    setUserData({
                        displayName: user.displayName || 'Traveler',
                        photoURL: user.photoURL || null,
                        email: user.email || '',
                    });
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
                // Fallback to Auth
                setUserData({
                    displayName: user.displayName || 'Traveler',
                    photoURL: user.photoURL || null,
                    email: user.email || '',
                });
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, [user]);

    const handleSignOut = async () => {
        try {
            await signOut(auth);
            navigation.reset({
                index: 0,
                routes: [{ name: "Login" }],
            });
        } catch (error) {
            Alert.alert("Error", "Failed to sign out: " + error.message);
        }
    };

    const handleProfilePictureUpload = async (uri) => {
        // Validation check
        if (!uri || !auth.currentUser) return;

        try {
            // Delete old photo if exists
            if (userData.photoURL) {
                try {
                    // Extract storage path from photoURL
                    const storage = getStorage();
                    // Assumes photoURL is a Firebase Storage URL
                    // Example: https://firebasestorage.googleapis.com/v0/b/<bucket>/o/profilePicture%2Fuid%2F123456.jpg?alt=media
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

            await updateProfile(auth.currentUser, {
                photoURL: downloadURL,
            });

            // Update in Firestore
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                await updateDoc(userDocRef, {
                    photoURL: downloadURL,
                    updatedAt: new Date(),
                });
            } else {
                await setDoc(userDocRef, {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || userData.displayName,
                    photoURL: downloadURL,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
            }

            // Update local state so the image changes immediately on screen
            setUserData(prev => ({
                ...prev,
                photoURL: downloadURL,
            }));

            Alert.alert("Success", "Profile picture updated!");
        } catch (e) {
            console.error("Upload failed", e);
            Alert.alert("Error", "Failed to upload profile picture.");
        }
    };

    const handlePickImage = () => {
        pickImage(handleProfilePictureUpload);
    };

    const menuItems = [
        { icon: "person-outline", label: "Edit Profile" },
        { icon: "settings-outline", label: "Settings" },
        { icon: "notifications-outline", label: "Notifications" },
        { icon: "help-circle-outline", label: "Help & Support" },
    ];

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
                            <Image
                                source={{ uri: userData.photoURL }}
                                style={common.profileAvatar}
                            />
                        ) : (
                            <View
                                style={[
                                    common.profileAvatar,
                                    common.profileAvatarPlaceholder,
                                ]}
                            >
                                <Text style={common.profileAvatarText}>
                                    {userData.displayName.charAt(0).toUpperCase()}
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
                    <Text style={typography.profileName}>
                        {userData.displayName}
                    </Text>
                    <Text style={typography.profileEmail}>
                        {userData.email}
                    </Text>
                </View>

                {/* Stats Section */}
                <View style={cards.profileStats}>
                    <View style={cards.profileStatItem}>
                        <Text style={typography.profileStatNumber}>0</Text>
                        <Text style={typography.profileStatLabel}>Trips</Text>
                    </View>
                    <View style={cards.profileStatDivider} />
                    <View style={cards.profileStatItem}>
                        <Text style={typography.profileStatNumber}>0</Text>
                        <Text style={typography.profileStatLabel}>Reviews</Text>
                    </View>
                    <View style={cards.profileStatDivider} />
                    <View style={cards.profileStatItem}>
                        <Text style={typography.profileStatNumber}>0</Text>
                        <Text style={typography.profileStatLabel}>Photos</Text>
                    </View>
                </View>

                {/* Menu Items */}
                <View style={cards.profileMenu}>
                    {menuItems.map((item, index) => (
                        <TouchableOpacity key={index} style={cards.profileMenuItem}>
                            <View style={cards.profileMenuItemLeft}>
                                <Ionicons
                                    name={item.icon}
                                    size={22}
                                    color={colors.textSecondary}
                                />
                                <Text style={typography.profileMenuItemText}>
                                    {item.label}
                                </Text>
                            </View>
                            <Ionicons
                                name="chevron-forward"
                                size={20}
                                color={colors.textMuted}
                            />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sign Out Button */}
                <TouchableOpacity
                    style={buttons.signOut}
                    onPress={handleSignOut}
                >
                    <MaterialIcons name="logout" size={20} color={colors.error} />
                    <Text style={buttons.signOutText}>Sign Out</Text>
                </TouchableOpacity>

                <Text style={typography.profileVersion}>Version {appConfig.expo.version}</Text>
            </ScrollView>
        </SafeAreaView>
    );
};

export default ProfileScreen;