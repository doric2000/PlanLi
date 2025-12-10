import { useEffect } from "react";
import { TouchableOpacity, Text } from "react-native";

export const useBackButton = (navigation, options = {}) => {
	const {
		text = "Back",
		color = "#007AFF",
		fontSize = 18,
		onPress = null,
		style = {},
	} = options;

	useEffect(() => {
		navigation.setOptions({
			headerShown: true,
			headerLeft: () => (
				<TouchableOpacity
					onPress={onPress || (() => navigation.goBack())}
					style={{ paddingLeft: 10, ...style }}
				>
					<Text style={{ fontSize, color }}>{text}</Text>
				</TouchableOpacity>
			),
		});
	}, [navigation, text, color, fontSize, onPress, style]);
};
