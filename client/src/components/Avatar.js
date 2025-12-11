import React from "react";
import { View, Image, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { common } from "../styles";

/**
 * Avatar - A reusable component for displaying user profile pictures.
 * 
 * This component handles three scenarios:
 * 1. User has a photo → Shows the photo
 * 2. User has no photo but has a name → Shows first letter of name
 * 3. User has neither → Shows a default person icon
 * 
 * USE THIS COMPONENT anywhere you need to display a user's profile picture,
 * such as in comments, posts, user lists, or headers.
 * 
 * @param {string} photoURL - URL of the user's profile photo (optional)
 * @param {string} displayName - User's display name, used for initial fallback (optional)
 * @param {number} size - Size of the avatar in pixels (default: 36)
 * 
 * @example
 * // With photo
 * <Avatar photoURL="https://..." displayName="John" size={40} />
 * 
 * // Without photo (shows "J")
 * <Avatar displayName="John" size={40} />
 * 
 * // No info (shows person icon)
 * <Avatar size={40} />
 */
export const Avatar = ({ photoURL, displayName, size = 36 }) => {
	if (photoURL) {
		return (
			<Image
				source={{ uri: photoURL }}
				style={[
					common.avatar,
					{ width: size, height: size, borderRadius: size / 2 },
				]}
			/>
		);
	}

	return (
		<View
			style={[
				common.avatarWithPlaceholder,
				{ width: size, height: size, borderRadius: size / 2 },
			]}
		>
			{displayName ? (
				<Text style={common.avatarInitial}>
					{displayName.charAt(0).toUpperCase()}
				</Text>
			) : (
				<Ionicons name='person' size={size / 2} color='#94A3B8' />
			)}
		</View>
	);
};
