import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    Image,
    TouchableOpacity,
    ScrollView,
    Alert,
    Platform,
    ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { storage, auth, db } from "../../../config/firebase";
import { signOut, updateProfile } from "firebase/auth";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import appConfig from "../../../../app.json"
import { colors, common, cards, buttons, typography } from "../../../styles";

/**
 * Screen for displaying and editing user profile.
 * Shows user stats, avatar, and settings options.
 *
 * @param {Object} navigation - Navigation object.
 */
export default function ProfileScreen({ navigation }) {
    const user = auth.currentUser;

	// state for user data from Firebase Table
	const [userData, setUserData] = useState({
        displayName: 'Traveler',
        photoURL: null,
        email: user?.email || '',
    });
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

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

    const pickFromGallery = async () => {
        const permissionResult =
            await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert(
                "Permission required",
                "Permission to access gallery is required!"
            );
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        if (!result.canceled) {
            console.log("Picked from gallery:", result.assets[0].uri);
            handleProfilePictureUpload(result.assets[0].uri);
        }
    };

    const pickFromCamera = async () => {
        const permissionResult =
            await ImagePicker.requestCameraPermissionsAsync();
        if (!permissionResult.granted) {
            Alert.alert(
                "Permission required",
                "Permission to access camera is required!"
            );
            return;
        }

        const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.7,
        });

        if (!result.canceled) {
            console.log("Picked from camera:", result.assets[0].uri);
            handleProfilePictureUpload(result.assets[0].uri);
        }
    };

    const pickImage = () => {
        if (Platform.OS === "web") {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = (e) => {
                const file = e.target.files[0];
                if (file) {
                    const uri = URL.createObjectURL(file);
                    handleProfilePictureUpload(uri);
                }
            };
            input.click();
            return;
        }
        Alert.alert("Change profile photo", "Choose an option", [
            { text: "Upload from gallery", onPress: pickFromGallery },
            { text: "Use camera", onPress: pickFromCamera },
            { text: "Cancel", style: "cancel" },
        ]);
    };

    const handleProfilePictureUpload = async (uri) => {
        if (!uri || !user) return null;
        setUploading(true);
        try {
            const response = await fetch(uri);
            const blob = await response.blob();
            const filename = `profilePicture/${user.uid}/${Date.now()}.jpg`;
            const storageRef = ref(storage, filename);

            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);

            // Update in Firebase Auth
            await updateProfile(user, {
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

            // Update local state
            setUserData(prev => ({
                ...prev,
                photoURL: downloadURL,
            }));

            Alert.alert("Success", "Profile picture updated!");
        } catch (e) {
            console.error("Upload failed", e);
            Alert.alert("Error", "Failed to upload profile picture.");
        } finally {
            setUploading(false);
        }
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
                            onPress={pickImage}
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
}