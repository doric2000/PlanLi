import React from "react";
import {
	View,
	Text,
	StyleSheet,
	Image,
	TouchableOpacity,
	ScrollView,
	Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { storage, auth } from "../config/firebase";
import { signOut, updateProfile } from "firebase/auth";
import * as ImagePicker from "expo-image-picker";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export default function ProfileScreen({ navigation }) {
	const user = auth.currentUser;

  const [photoURL, setPhotoURL] = React.useState(user?.photoURL ?? null);
	const handleSignOut = async () => {
		try {
			await signOut(auth);
			// Reset navigation stack to Login
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
			aspect: [4, 3],
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
			aspect: [4, 3],
			quality: 0.7,
		});

		if (!result.canceled) {
			console.log("Picked from camera:", result.assets[0].uri);
			handleProfilePictureUpload(result.assets[0].uri);
		}
	};

	// Show options list when pressing the camera icon
	const pickImage = () => {
		Alert.alert("Change profile photo", "Choose an option", [
			{ text: "Upload from gallery", onPress: pickFromGallery },
			{ text: "Use camera", onPress: pickFromCamera },
			{ text: "Cancel", style: "cancel" },
		]);
	};

	const handleProfilePictureUpload = async (uri) => {
		if (!uri) return null;
		try {
			const response = await fetch(uri);
			const blob = await response.blob();
			const filename = `profilePicture/${
				auth.currentUser?.uid
			}/${Date.now()}.jpg`;
			const storageRef = ref(storage, filename);

			await uploadBytes(storageRef, blob);
			const downloadURL = await getDownloadURL(storageRef);

      if (auth.currentUser){
        await updateProfile(auth.currentUser, {photoURL: downloadURL});
      }

			setPhotoURL(downloadURL);
		} catch (e) {
			console.error("Upload failed", e);
			throw e;
		}
	};

	const menuItems = [
		{ icon: "person-outline", label: "Edit Profile" },
		{ icon: "settings-outline", label: "Settings" },
		{ icon: "notifications-outline", label: "Notifications" },
		{ icon: "help-circle-outline", label: "Help & Support" },
	];

	return (
		<SafeAreaView style={styles.container}>
			<ScrollView contentContainerStyle={styles.scrollContent}>
				{/* Profile Header */}
				<View style={styles.header}>
          <View style={styles.avatarContainer}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder]}>
                <Text style={styles.avatarText}>
                  {user?.displayName ? user.displayName.charAt(0).toUpperCase() : "U"}
                </Text>
              </View>
            )}
            <TouchableOpacity onPress={pickImage} style={styles.editAvatarBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
					<Text style={styles.name}>
						{user?.displayName || "Traveler"}
					</Text>
					<Text style={styles.email}>
						{user?.email || "user@example.com"}
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

				<Text style={styles.versionText}>Version 1.0.0</Text>
			</ScrollView>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: "#F9FAFB",
	},
	scrollContent: {
		paddingBottom: 40,
	},
	header: {
		alignItems: "center",
		paddingVertical: 30,
		backgroundColor: "#fff",
		borderBottomLeftRadius: 30,
		borderBottomRightRadius: 30,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 10,
		elevation: 3,
	},
	avatarContainer: {
		position: "relative",
		marginBottom: 16,
	},
	avatar: {
		width: 100,
		height: 100,
		borderRadius: 50,
	},
	avatarPlaceholder: {
		backgroundColor: "#E0E7FF",
		justifyContent: "center",
		alignItems: "center",
		borderWidth: 2,
		borderColor: "#fff",
	},
	avatarText: {
		fontSize: 36,
		fontWeight: "bold",
		color: "#4F46E5",
	},
	editAvatarBadge: {
		position: "absolute",
		bottom: 0,
		right: 0,
		backgroundColor: "#4F46E5",
		padding: 8,
		borderRadius: 20,
		borderWidth: 2,
		borderColor: "#fff",
	},
	name: {
		fontSize: 22,
		fontWeight: "bold",
		color: "#1F2937",
		marginBottom: 4,
	},
	email: {
		fontSize: 14,
		color: "#6B7280",
	},
	statsContainer: {
		flexDirection: "row",
		backgroundColor: "#fff",
		marginHorizontal: 20,
		marginTop: -20, // Overlap header slightly or just below
		paddingVertical: 20,
		borderRadius: 15,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 5,
		elevation: 2,
		justifyContent: "space-between",
		marginBottom: 20,
		marginTop: 20,
	},
	statItem: {
		flex: 1,
		alignItems: "center",
	},
	statNumber: {
		fontSize: 18,
		fontWeight: "bold",
		color: "#1F2937",
	},
	statLabel: {
		fontSize: 12,
		color: "#6B7280",
		marginTop: 4,
	},
	statDivider: {
		width: 1,
		height: "60%",
		backgroundColor: "#E5E7EB",
		alignSelf: "center",
	},
	menuContainer: {
		backgroundColor: "#fff",
		borderRadius: 15,
		marginHorizontal: 20,
		paddingVertical: 10,
	},
	menuItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 16,
		paddingHorizontal: 20,
		borderBottomWidth: 1,
		borderBottomColor: "#F3F4F6",
	},
	menuItemLeft: {
		flexDirection: "row",
		alignItems: "center",
	},
	menuItemText: {
		fontSize: 16,
		marginLeft: 16,
		color: "#374151",
		fontWeight: "500",
	},
	signOutButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#FEE2E2",
		marginHorizontal: 20,
		marginTop: 24,
		paddingVertical: 16,
		borderRadius: 15,
	},
	signOutText: {
		marginLeft: 8,
		fontSize: 16,
		fontWeight: "600",
		color: "#EF4444",
	},
	versionText: {
		textAlign: "center",
		marginTop: 20,
		color: "#9CA3AF",
		fontSize: 12,
	},
});
