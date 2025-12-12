import { useEffect } from "react";
import { TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";

/**
 * useBackButton - A hook for adding a consistent back button to screen headers.
 * 
 * This hook automatically configures the navigation header with a back arrow
 * that matches the app's design. Use this in any screen that needs a back button.
 * 
 * The back button appears as a chevron arrow (<) in the header's left side.
 * 
 * HOW TO USE:
 * 1. Import the hook in your screen
 * 2. Call it at the top of your component with the navigation object
 * 3. Optionally pass a title and other options
 * 
 * @param {Object} navigation - The navigation object from React Navigation
 * @param {Object} options - Configuration options:
 *   @param {string} options.title - Header title text (default: '')
 *   @param {string} options.color - Arrow color (default: '#1E3A5F')
 *   @param {function} options.onPress - Custom back action (default: goBack)
 *   @param {Object} options.style - Additional button styles
 * 
 * @example
 * // Basic usage - just adds back button
 * useBackButton(navigation);
 * 
 * // With title
 * useBackButton(navigation, { title: 'Create Route' });
 * 
 * // With custom color (for dark backgrounds)
 * useBackButton(navigation, { color: '#FFFFFF' });
 * 
 * // With custom back action
 * useBackButton(navigation, { 
 *   onPress: () => {
 *     Alert.alert('Are you sure?', '', [
 *       { text: 'Stay' },
 *       { text: 'Leave', onPress: () => navigation.goBack() }
 *     ]);
 *   }
 * });
 */
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
