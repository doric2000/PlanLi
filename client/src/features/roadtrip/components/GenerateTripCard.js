import { Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { generateTripCardStyles as styles } from '../../../styles';


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
			<Text style={styles.title}>מחולל הטיולים</Text>
			<Text style={styles.subtitle}>
				לחץ כאן ליצירת המסלול העתידי שלך
			</Text>
		</LinearGradient>
	</TouchableOpacity>
);
