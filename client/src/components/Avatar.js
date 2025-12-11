import React from "react";
import { View, Image, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { common } from "../styles";

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
