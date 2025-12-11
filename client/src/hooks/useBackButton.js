import { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export const useBackButton = (navigation, options = {}) => {
	const {
		title = "",
		color = "#1E3A5F",
		onPress = null,
		style = {},
	} = options;

	useEffect(() => {
		navigation.setOptions({
			headerShown: true,
			title: title,
			headerLeft: () => (
				<TouchableOpacity
					onPress={onPress || (() => navigation.goBack())}
					style={{ paddingLeft: 10, ...style }}
				>
					<Ionicons name="chevron-back" size={24} color={color} />
				</TouchableOpacity>
			),
		});
	}, [navigation, title, color, onPress, style]);
};
