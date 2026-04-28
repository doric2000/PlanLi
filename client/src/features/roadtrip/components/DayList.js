import { Image, Text, TouchableOpacity, View } from "react-native";
import { dayListStyles as styles } from "../../../styles";

export default function DayList({ days, onEdit }) {
	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<Text style={styles.sectionTitle}>לו״ז המסלול</Text>
				<Text style={styles.autoHint}>נבנה לפי מספר הימים</Text>
			</View>

			{days.map((day, index) => (
				<TouchableOpacity
					key={index}
					style={styles.dayCard}
					activeOpacity={0.85}
					onPress={() => onEdit(index)}
				>
					<View style={styles.dayHeader}>
						<Text style={styles.dayTitle}>יום {index + 1}</Text>
						<Text style={styles.editHint}>ערוך ›</Text>
					</View>

					<View style={styles.contentRow}>
						<View style={styles.textContainer}>
							<Text numberOfLines={2} style={styles.description}>
								{day.description || "עדיין אין תיאור ליום הזה."}
							</Text>
						</View>
						{day.image && (
							<Image
								source={{ uri: day.image }}
								style={styles.thumbnail}
							/>
						)}
					</View>

					<Text style={styles.stopsCount}>
						{Array.isArray(day.stops) && day.stops.length > 0
							? `${day.stops.length} תחנות ביום הזה`
							: "אין תחנות עדיין"}
					</Text>
				</TouchableOpacity>
			))}

			{days.length === 0 && (
				<Text style={styles.emptyText}>
					הזן מספר ימים כדי לבנות את לו״ז המסלול.
				</Text>
			)}
		</View>
	);
}
