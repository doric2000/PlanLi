import { View, Text, TouchableOpacity, Image } from "react-native";
import { dayListStyles as styles } from '../../../styles';


/**
 * Component to list the days of a trip.
 * Allows adding, editing, and deleting days.
 *
 * @param {Object} props
 * @param {Array} props.days - Array of day objects.
 * @param {Function} props.onEdit - Callback to edit a day.
 * @param {Function} props.onAdd - Callback to add a new day.
 * @param {Function} props.onDelete - Callback to delete a day.
 */
export default function DayList({ days, onEdit, onAdd, onDelete }) {
	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<Text style={styles.sectionTitle}>לו״ז המסלול</Text>
				<TouchableOpacity onPress={onAdd} style={styles.addBtn}>
					<Text style={styles.addBtnText}>+ הוסף יום</Text>
				</TouchableOpacity>
			</View>

			{days.map((day, index) => (
				<TouchableOpacity
					key={index}
					style={styles.dayCard}
					onPress={() => onEdit(index)}
				>
					<View style={styles.dayHeader}>
						<Text style={styles.dayTitle}>יום {index + 1}</Text>

						<View style={styles.actionsContainer}>
							{/* Delete Button */}
							<TouchableOpacity
								onPress={(e) => {
									e.stopPropagation(); // Prevent opening the edit modal
									onDelete(index);
								}}
								style={styles.deleteBtn}
							>
								<Text style={styles.deleteIcon}>מחק</Text>
							</TouchableOpacity>

							{/* Edit Hint */}
							<Text style={styles.editHint}>ערוך ›</Text>
						</View>
					</View>

					<View style={styles.contentRow}>
						<View style={styles.textContainer}>
							<Text numberOfLines={2} style={styles.description}>
								{day.description ||
									"לא נוסף תיאור עדיין..."}
							</Text>
						</View>
						{day.image && (
							<Image
								source={{ uri: day.image }}
								style={styles.thumbnail}
							/>
						)}
					</View>
				</TouchableOpacity>
			))}

			{days.length === 0 && (
				<Text style={styles.emptyText}>
					עדיין לא נוספו ימים. התחילו לתכנן את המסלול!
				</Text>
			)}
		</View>
	);
}
