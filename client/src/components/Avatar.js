import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const Avatar = ({ photoURL, displayName, size = 36 }) => {
	if (photoURL) {
		return (
			<Image
				source={{ uri: photoURL }}
				style={[
					styles.avatar,
					{ width: size, height: size, borderRadius: size / 2 },
				]}
			/>
		);
	}

	return (
		<View
			style={[
				styles.avatarPlaceholder,
				{ width: size, height: size, borderRadius: size / 2 },
			]}
		>
			{displayName ? (
				<Text style={styles.avatarInitial}>
					{displayName.charAt(0).toUpperCase()}
				</Text>
			) : (
				<Ionicons name='person' size={size / 2} color='#94A3B8' />
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	avatar: {
		backgroundColor: "#E2E8F0",
		marginRight: 10,
	},
	avatarPlaceholder: {
		backgroundColor: "#E0E7FF",
		justifyContent: "center",
		alignItems: "center",
		marginRight: 10,
	},
	avatarInitial: {
		color: "#4F46E5",
		fontWeight: "bold",
		fontSize: 14,
	},
});
