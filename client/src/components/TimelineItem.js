import React from "react";
import { TouchableOpacity, View } from "react-native";
import AppText from "./AppText";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { colors, common } from "../styles";

const text = {
	day: "\u05d9\u05d5\u05dd",
	openDetails: "\u05dc\u05d7\u05e5 \u05dc\u05e6\u05e4\u05d9\u05d9\u05d4 \u05d1\u05e4\u05e8\u05d8\u05d9\u05dd \u05d5\u05d1\u05ea\u05d7\u05e0\u05d5\u05ea",
	stops: "\u05ea\u05d7\u05e0\u05d5\u05ea",
	noStops: "\u05d0\u05d9\u05df \u05ea\u05d7\u05e0\u05d5\u05ea \u05e2\u05d3\u05d9\u05d9\u05df",
};

export const TimelineItem = ({ day, index, isLast, onPress }) => {
	const stopsCount = Array.isArray(day?.stops) ? day.stops.length : 0;

	return (
		<View style={common.timelineItem}>
			{!isLast && (
				<View style={common.timelineConnector}>
					<Svg height="60" width="2">
						<Path
							d="M 1 0 L 1 60"
							stroke={colors.border}
							strokeWidth="2"
							strokeDasharray="4, 4"
						/>
					</Svg>
				</View>
			)}

			<TouchableOpacity
				style={common.timelinePin}
				onPress={onPress}
				activeOpacity={0.85}
			>
				<Ionicons name="location" size={32} color={colors.info} />
				<AppText style={common.timelineDayNumber}>{index + 1}</AppText>
			</TouchableOpacity>

			<TouchableOpacity
				style={common.timelinePreview}
				onPress={onPress}
				activeOpacity={0.85}
			>
				<AppText style={common.timelineTitle}>{text.day} {index + 1}</AppText>
				<AppText numberOfLines={2} style={common.timelineDescription}>
					{day?.description || text.openDetails}
				</AppText>
				<AppText style={common.timelineMeta}>
					{stopsCount > 0 ? `${stopsCount} ${text.stops}` : text.noStops}
				</AppText>
			</TouchableOpacity>
		</View>
	);
};
