import { TouchableOpacity, View } from "react-native";
import AppText from "../../../components/AppText";
import CachedImage from "../../../components/CachedImage";
import { dayListStyles as styles } from "../../../styles";
import { getMediaVariantUrl } from "../../../utils/mediaAssets";

export default function DayList({ days, onEdit }) {
	return (
		<View style={styles.container}>
			<View style={styles.headerRow}>
				<AppText style={styles.sectionTitle}>לו״ז המסלול</AppText>
				<AppText style={styles.autoHint}>נבנה לפי מספר הימים</AppText>
			</View>

			{days.map((day, index) => (
				<TouchableOpacity
					key={index}
					style={styles.dayCard}
					activeOpacity={0.85}
					onPress={() => onEdit(index)}
				>
					<View style={styles.dayHeader}>
						<AppText style={styles.dayTitle}>יום {index + 1}</AppText>
						<AppText style={styles.editHint}>ערוך ›</AppText>
					</View>

					<View style={styles.contentRow}>
						<View style={styles.textContainer}>
							<AppText numberOfLines={2} style={styles.description}>
								{day.description || "עדיין אין תיאור ליום הזה."}
							</AppText>
						</View>
						{(day.image || day.media) && (
							<CachedImage
								source={{
									uri: getMediaVariantUrl(
										day.media,
										"thumb",
										day.image
									),
								}}
								style={styles.thumbnail}
								contentFit="cover"
								priority="low"
							/>
						)}
					</View>

					<AppText style={styles.stopsCount}>
						{Array.isArray(day.stops) && day.stops.length > 0
							? `${day.stops.length} תחנות ביום הזה`
							: "אין תחנות עדיין"}
					</AppText>
				</TouchableOpacity>
			))}

			{days.length === 0 && (
				<AppText style={styles.emptyText}>
					הזן מספר ימים כדי לבנות את לו״ז המסלול.
				</AppText>
			)}
		</View>
	);
}
