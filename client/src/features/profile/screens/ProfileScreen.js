import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
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
import { colors, spacing, typography, shadows, common } from "../../../styles";

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
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.accent} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Header */}
                <View style={styles.header}>
                    <View style={styles.avatarContainer}>
                        {userData.photoURL ? (
                            <Image
                                source={{ uri: userData.photoURL }}
                                style={styles.avatar}
                            />
                        ) : (
                            <View
                                style={[
                                    styles.avatar,
                                    styles.avatarPlaceholder,
                                ]}
                            >
                                <Text style={styles.avatarText}>
                                    {userData.displayName.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                        <TouchableOpacity
                            onPress={pickImage}
                            style={styles.editAvatarBadge}
                            disabled={uploading}
                        >
                            {uploading ? (
                                <ActivityIndicator size="small" color="#fff" />
                            ) : (
                                <Ionicons name="camera" size={14} color="#fff" />
                            )}
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.name}>
                        {userData.displayName}
                    </Text>
                    <Text style={styles.email}>
                        {userData.email}
                    </Text>
                </View>

                {/* Stats Section */}
                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>0</Text>
                        <Text style={styles.statLabel}>Trips</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>0</Text>
                        <Text style={styles.statLabel}>Reviews</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>0</Text>
                        <Text style={styles.statLabel}>Photos</Text>
                    </View>
                </View>

                {/* Menu Items */}
                <View style={styles.menuContainer}>
                    {menuItems.map((item, index) => (
                        <TouchableOpacity key={index} style={styles.menuItem}>
                            <View style={styles.menuItemLeft}>
                                <Ionicons
                                    name={item.icon}
                                    size={22}
                                    color="#4B5563"
                                />
                                <Text style={styles.menuItemText}>
                                    {item.label}
                                </Text>
                            </View>
                            <Ionicons
                                name="chevron-forward"
                                size={20}
                                color="#9CA3AF"
                            />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Sign Out Button */}
                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                >
                    <MaterialIcons name="logout" size={20} color="#EF4444" />
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>

                <Text style={styles.versionText}>Version {appConfig.expo.version}</Text>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: common.container,
    loadingContainer: common.loadingContainer,
    scrollContent: {
        paddingBottom: 40,
    },
    header: {
        alignItems: "center",
        paddingVertical: spacing.xxxl,
        backgroundColor: colors.white,
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
        ...shadows.medium,
    },
    avatarContainer: {
        position: "relative",
        marginBottom: spacing.lg,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
    },
    avatarPlaceholder: {
        backgroundColor: colors.accentLight,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 2,
        borderColor: colors.white,
    },
    avatarText: {
        fontSize: 36,
        fontWeight: "bold",
        color: colors.accent,
    },
    editAvatarBadge: {
        position: "absolute",
        bottom: 0,
        right: 0,
        backgroundColor: colors.accent,
        padding: 8,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: colors.white,
    },
    name: {
        ...typography.h3,
        marginBottom: spacing.xs,
    },
    email: {
        ...typography.bodySmall,
        color: colors.textLight,
    },
    statsContainer: {
        flexDirection: "row",
        backgroundColor: colors.white,
        marginHorizontal: spacing.screenHorizontal,
        paddingVertical: spacing.xl,
        borderRadius: 15,
        ...shadows.medium,
        justifyContent: "space-between",
        marginBottom: spacing.xl,
        marginTop: spacing.xl,
    },
    statItem: {
        flex: 1,
        alignItems: "center",
    },
    statNumber: {
        ...typography.h4,
    },
    statLabel: {
        ...typography.caption,
        color: colors.textLight,
        marginTop: spacing.xs,
    },
    statDivider: {
        width: 1,
        height: "60%",
        backgroundColor: colors.border,
        alignSelf: "center",
    },
    menuContainer: {
        backgroundColor: colors.white,
        borderRadius: 15,
        marginHorizontal: spacing.screenHorizontal,
        paddingVertical: spacing.md,
    },
    menuItem: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderLight,
    },
    menuItemLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    menuItemText: {
        ...typography.body,
        marginLeft: spacing.lg,
        fontWeight: "500",
    },
    signOutButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: colors.errorLight,
        marginHorizontal: spacing.screenHorizontal,
        marginTop: spacing.xxl,
        paddingVertical: spacing.lg,
        borderRadius: 15,
    },
    signOutText: {
        marginLeft: 8,
        fontSize: 16,
        fontWeight: "600",
        color: colors.error,
    },
    versionText: {
        textAlign: "center",
        marginTop: spacing.xl,
        color: colors.textMuted,
        fontSize: 12,
    },
});