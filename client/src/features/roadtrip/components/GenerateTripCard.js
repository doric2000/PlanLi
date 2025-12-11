import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/**
 * Card component that triggers the trip generation process.
 *
 * @param {Object} props
 * @param {Function} props.onPress - Callback for button press.
 */
export const GenerateTripCard = ({ onPress }) => (
	<TouchableOpacity
		onPress={onPress}
		activeOpacity={0.8}
		style={{ marginBottom: 16 }}
	>
		<LinearGradient
			colors={["#c332d4ff", "#648edbff", "#af8be1ff"]}
			start={{ x: 0, y: 0 }}
			end={{ x: 1, y: 1 }}
			style={styles.card}
		>
			<Ionicons
				name='navigate'
				size={48}
				color='#ffffffff'
				style={styles.icon}
			/>
			<Text style={styles.title}>Trip Generator</Text>
			<Text style={styles.subtitle}>
				Click here to generate your future route
			</Text>
		</LinearGradient>
	</TouchableOpacity>
);

const styles = StyleSheet.create({
	card: {
		width: "100%",
		borderRadius: 20,
		padding: 20,
		alignItems: "center",
		justifyContent: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 5,
		minHeight: 180,
	},
	icon: {
		marginBottom: 16,
		opacity: 0.8,
	},
	title: {
		fontSize: 20,
		fontWeight: "700",
		color: "#ffffffff",
		textAlign: "center",
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 15,
		color: "#f0f0f0ff",
		textAlign: "center",
		fontWeight: "400",
	},
});
